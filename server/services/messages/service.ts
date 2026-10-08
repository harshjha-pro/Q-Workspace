import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { clientWhere, engagementWhere } from "../../permissions/scopes";
import type { Actor, StaffActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { getSettingNumber } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { fileGeneratedDocument } from "../dms/service";
import { firmPeopleFor } from "../portal/actions";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * Secure messaging between the client and the firm (P4-04, D-83).
 * - A thread belongs to one client and optionally one engagement. Staff see it under `portal.share` scope
 *   (team / assigned engagement); portal users see their own clients' threads.
 * - Attachments are filed in the DMS (source MESSAGE) and shared with the client.
 * - Response time: `firstUnansweredAt` is set by the first client message after a firm reply and cleared by
 *   the next firm reply. Threads waiting longer than `messages.responseHours` are flagged and the team reminded.
 * - Staff who write in a thread become participants and are notified of client replies; until someone
 *   writes, the task team / client Manager and Partner are told.
 */

type File = { name: string; data: Buffer };
const FIRM_LABEL = "Firm";

function staffScope(actor: StaffActor) {
  return authorize(actor, "portal.share");
}

async function visibleThreadWhere(actor: Actor): Promise<Prisma.MessageThreadWhereInput> {
  if (actor.kind === "PORTAL") {
    authorize(actor, "portal.use");
    return { clientId: { in: actor.clientIds } };
  }
  if (actor.kind === "SYSTEM") return {};
  const scope = staffScope(actor);
  if (scope === "firm" || scope === "firm_read") return {};
  const [clients, engagements] = await Promise.all([
    db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } }),
    db().engagement.findMany({ where: engagementWhere(actor, scope), select: { id: true } }),
  ]);
  const clientIds = clients.map((c) => c.id);
  // An engagement thread needs the engagement too when the scope is "assigned".
  return scope === "assigned"
    ? { clientId: { in: clientIds }, OR: [{ engagementId: null }, { engagementId: { in: engagements.map((e) => e.id) } }] }
    : { clientId: { in: clientIds } };
}

async function loadThread(actor: Actor, threadId: string) {
  const where = await visibleThreadWhere(actor);
  const t = await db().messageThread.findFirst({ where: { AND: [{ id: threadId }, where] } });
  if (!t) throw notFound("Conversation");
  return t;
}

/** May the actor open a thread on this client (and engagement)? Same rule as seeing one. */
async function assertCanStart(actor: Actor, clientId: string, engagementId: string | null) {
  if (actor.kind === "PORTAL") {
    if (!actor.clientIds.includes(clientId)) throw forbidden();
  } else if (actor.kind === "USER") {
    const scope = staffScope(actor);
    if (scope !== "firm") {
      const ok = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere(actor, scope)] } });
      if (!ok) throw forbidden();
      if (engagementId && scope === "assigned" && !(await db().engagement.count({ where: { AND: [{ id: engagementId }, engagementWhere(actor, scope)] } }))) throw forbidden();
    }
  }
  const client = await db().client.findUnique({ where: { id: clientId }, select: { id: true, name: true, isFirm: true } });
  if (!client || client.isFirm) throw notFound("Client");
  if (engagementId) {
    const e = await db().engagement.findUnique({ where: { id: engagementId }, select: { clientId: true } });
    if (!e || e.clientId !== clientId) throw new DomainError("VALIDATION", "That engagement belongs to another client.", { engagementId: "Choose an engagement of this client" });
  }
  return client;
}

const startInput = z.object({
  clientId: z.string().min(1, "Choose the client"),
  engagementId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  subject: z.string().trim().min(3, "Write a subject").max(160),
  body: z.string().trim().min(1, "Write a message").max(10_000),
});

/** Start a conversation. Staff need an active portal user on the client, or the client would never see it. */
export async function startThread(actor: Actor, input: z.input<typeof startInput>, file?: File | null, meta: { ip?: string } = {}) {
  if (actor.kind === "SYSTEM") throw forbidden();
  const d = parse(startInput, input);
  const engagementId = d.engagementId ?? null;
  const client = await assertCanStart(actor, d.clientId, engagementId);
  if (actor.kind === "USER" && !(await db().portalUserClient.count({ where: { clientId: client.id, portalUser: { active: true } } })))
    throw ruleViolation("This client has no active portal user yet. Invite one first.");
  const thread = await transaction(async (tx) => {
    const t = await tx.messageThread.create({
      data: { clientId: client.id, engagementId, subject: d.subject, createdById: actor.kind === "USER" ? actor.userId : null },
    });
    await writeAudit(tx, actor, { entityType: "MessageThread", entityId: t.id, action: "CREATE", after: { clientId: t.clientId, engagementId, subject: t.subject } });
    return t;
  });
  await postMessage(actor, thread.id, { body: d.body }, file, meta);
  return thread;
}

const postInput = z.object({ body: z.string().trim().max(10_000).default("") });

/** Add a message (and optional attachment). A client message reopens a closed thread. */
export async function postMessage(actor: Actor, threadId: string, input: z.input<typeof postInput>, file?: File | null, meta: { ip?: string } = {}) {
  if (actor.kind === "SYSTEM") throw forbidden();
  const t = await loadThread(actor, threadId);
  const d = parse(postInput, input);
  if (!d.body && !file) throw new DomainError("VALIDATION", "Write a message or attach a file.", { body: "Required" });
  const fromClient = actor.kind === "PORTAL";
  if (!fromClient && t.closedAt) throw ruleViolation("This conversation is closed. Reopen it to reply.");
  if (!fromClient) staffScope(actor);
  const doc = file
    ? await fileGeneratedDocument({
        clientId: t.clientId, engagementId: t.engagementId, name: file.name, buffer: file.data, kind: "MESSAGE_ATTACHMENT", sourceType: "MESSAGE",
        tags: ["message"], note: `Attached to "${t.subject}"`, actor,
      })
    : null;
  const now = new Date();
  const msg = await transaction(async (tx) => {
    if (doc) {
      await tx.document.update({ where: { id: doc.id }, data: { sharedWithClient: true } });
      if (fromClient) await tx.documentVersion.updateMany({ where: { documentId: doc.id }, data: { uploadedByPortalUserId: actor.portalUserId } });
    }
    const m = await tx.message.create({
      data: {
        threadId: t.id, body: d.body, documentId: doc?.id ?? null, sentAt: now,
        authorUserId: fromClient ? null : actor.userId, authorPortalUserId: fromClient ? actor.portalUserId : null,
        // The author has obviously read their own side.
        readByClientAt: fromClient ? now : null, readByFirmAt: fromClient ? null : now,
        createdById: fromClient ? null : actor.userId,
      },
    });
    await tx.messageThread.update({
      where: { id: t.id },
      data: fromClient
        ? { lastMessageAt: now, firstUnansweredAt: t.firstUnansweredAt ?? now, closedAt: null }
        : { lastMessageAt: now, firstUnansweredAt: null, updatedById: actor.userId },
    });
    // Replying counts as reading what the other side sent so far.
    if (fromClient) await tx.message.updateMany({ where: { threadId: t.id, readByClientAt: null, authorPortalUserId: null }, data: { readByClientAt: now } });
    if (!fromClient) {
      await tx.messageThreadParticipant.upsert({
        where: { threadId_userId: { threadId: t.id, userId: actor.userId } },
        create: { threadId: t.id, userId: actor.userId, createdById: actor.userId },
        update: { removedAt: null },
      });
      await tx.message.updateMany({ where: { threadId: t.id, readByFirmAt: null }, data: { readByFirmAt: now } });
    }
    await writeAudit(tx, actor, { entityType: "Message", entityId: m.id, action: "CREATE", after: { threadId: t.id, documentId: doc?.id ?? null, chars: d.body.length, ip: meta.ip ?? null } });
    return m;
  });
  await notifyOtherSide(actor, t, d.body);
  return msg;
}

async function notifyOtherSide(actor: Actor, t: { id: string; clientId: string; engagementId: string | null; subject: string }, body: string) {
  if (actor.kind !== "PORTAL") return; // the client sees new replies in the portal (no email service)
  const people = await threadPeople(t.id, t.clientId);
  const client = await db().client.findUniqueOrThrow({ where: { id: t.clientId }, select: { name: true } });
  await notifyUsers(people, {
    kind: "CLIENT_MESSAGE", title: `${client.name}: ${t.subject}`, body: body.slice(0, 200), link: `/messages/${t.id}`, entityType: "MessageThread", entityId: t.id,
  });
}

/** Active participants (offboarding sets removedAt); before anyone has written, the client's team. */
async function threadPeople(threadId: string, clientId: string) {
  const parts = await db().messageThreadParticipant.findMany({ where: { threadId, removedAt: null }, select: { userId: true } });
  const active = parts.length ? await db().user.findMany({ where: { id: { in: parts.map((p) => p.userId) }, active: true }, select: { id: true } }) : [];
  return active.length ? active.map((u) => u.id) : firmPeopleFor(clientId);
}

/** Staff close a conversation when nothing more is needed; the client can still reopen it by writing. */
export async function setThreadClosed(actor: Actor, threadId: string, closed: boolean) {
  if (actor.kind !== "USER") throw forbidden();
  staffScope(actor);
  const t = await loadThread(actor, threadId);
  await transaction(async (tx) => {
    await tx.messageThread.update({ where: { id: t.id }, data: { closedAt: closed ? new Date() : null, firstUnansweredAt: closed ? null : t.firstUnansweredAt, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "MessageThread", entityId: t.id, action: closed ? "CLOSE" : "REOPEN" });
  });
}

// ---------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------

export type ThreadRow = {
  id: string; clientId: string; clientName: string; engagementId: string | null; engagementName: string | null; subject: string;
  lastMessageAt: Date | null; waitingSince: Date | null; overdue: boolean; closed: boolean; unread: number;
};

/** Inbox: waiting-for-reply first (oldest wait first), then by latest message. */
export async function listThreads(actor: Actor, f: { clientId?: string; status?: "waiting" | "open" | "closed" | "all" } = {}): Promise<ThreadRow[]> {
  const where = await visibleThreadWhere(actor);
  const status = f.status ?? "open";
  const and: Prisma.MessageThreadWhereInput[] = [where];
  if (f.clientId) and.push({ clientId: f.clientId });
  if (status === "waiting") and.push({ firstUnansweredAt: { not: null }, closedAt: null });
  if (status === "open") and.push({ closedAt: null });
  if (status === "closed") and.push({ closedAt: { not: null } });
  const threads = await db().messageThread.findMany({ where: { AND: and }, orderBy: { lastMessageAt: "desc" }, take: 300 });
  const ids = threads.map((t) => t.id);
  const unreadWhere: Prisma.MessageWhereInput =
    actor.kind === "PORTAL" ? { threadId: { in: ids }, readByClientAt: null, authorPortalUserId: null } : { threadId: { in: ids }, readByFirmAt: null, authorPortalUserId: { not: null } };
  const [unread, clients, engs, hours] = await Promise.all([
    db().message.groupBy({ by: ["threadId"], where: unreadWhere, _count: { _all: true } }),
    db().client.findMany({ where: { id: { in: [...new Set(threads.map((t) => t.clientId))] } }, select: { id: true, name: true } }),
    db().engagement.findMany({ where: { id: { in: threads.map((t) => t.engagementId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    getSettingNumber("messages.responseHours", 24),
  ]);
  const u = new Map(unread.map((r) => [r.threadId, r._count._all]));
  const cn = new Map(clients.map((c) => [c.id, c.name]));
  const en = new Map(engs.map((e) => [e.id, e.name]));
  const limit = Date.now() - hours * 3600_000;
  const rows = threads.map<ThreadRow>((t) => ({
    id: t.id, clientId: t.clientId, clientName: cn.get(t.clientId) ?? "", engagementId: t.engagementId, engagementName: t.engagementId ? (en.get(t.engagementId) ?? null) : null,
    subject: t.subject, lastMessageAt: t.lastMessageAt, closed: !!t.closedAt, unread: u.get(t.id) ?? 0,
    // The client sees whether they are waiting, but not the firm's internal "overdue" flag.
    waitingSince: t.closedAt ? null : t.firstUnansweredAt,
    overdue: actor.kind !== "PORTAL" && !t.closedAt && !!t.firstUnansweredAt && t.firstUnansweredAt.getTime() < limit,
  }));
  return rows.sort((a, b) => {
    if (!!a.waitingSince !== !!b.waitingSince) return a.waitingSince ? -1 : 1;
    if (a.waitingSince && b.waitingSince) return a.waitingSince.getTime() - b.waitingSince.getTime();
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });
}

/**
 * One conversation, marking the other side's messages read. Portal users see the firm's messages under the
 * author's name (the person they correspond with) but never internal data; staff see who wrote what.
 */
export async function getThread(actor: Actor, threadId: string) {
  const t = await loadThread(actor, threadId);
  const now = new Date();
  const marked =
    actor.kind === "PORTAL"
      ? await db().message.updateMany({ where: { threadId: t.id, readByClientAt: null, authorPortalUserId: null }, data: { readByClientAt: now } })
      : actor.kind === "USER"
        ? await db().message.updateMany({ where: { threadId: t.id, readByFirmAt: null, authorPortalUserId: { not: null } }, data: { readByFirmAt: now } })
        : { count: 0 };
  const messages = await db().message.findMany({ where: { threadId: t.id }, orderBy: { sentAt: "asc" } });
  const [staff, portalUsers, docs, client, engagement] = await Promise.all([
    db().user.findMany({ where: { id: { in: messages.map((m) => m.authorUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } }),
    db().portalUser.findMany({ where: { id: { in: messages.map((m) => m.authorPortalUserId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    db().document.findMany({ where: { id: { in: messages.map((m) => m.documentId).filter((x): x is string => !!x) } }, select: { id: true, name: true, archivedAt: true, sharedWithClient: true } }),
    db().client.findUniqueOrThrow({ where: { id: t.clientId }, select: { id: true, name: true, code: true } }),
    t.engagementId ? db().engagement.findUnique({ where: { id: t.engagementId }, select: { id: true, name: true, code: true } }) : null,
  ]);
  const sn = new Map(staff.map((s) => [s.id, s.displayName]));
  const pn = new Map(portalUsers.map((p) => [p.id, p.name]));
  const dn = new Map(docs.map((d) => [d.id, d]));
  return {
    markedRead: marked.count,
    thread: { id: t.id, subject: t.subject, closed: !!t.closedAt, waitingSince: t.closedAt ? null : t.firstUnansweredAt, createdAt: t.createdAt },
    client: actor.kind === "PORTAL" ? { id: client.id, name: client.name } : client,
    engagement: engagement ? (actor.kind === "PORTAL" ? { id: engagement.id, name: engagement.name } : engagement) : null,
    messages: messages.map((m) => {
      const doc = m.documentId ? dn.get(m.documentId) : undefined;
      // A portal user only gets an attachment link while the document is still shared and not archived.
      const showDoc = doc && !doc.archivedAt && (actor.kind !== "PORTAL" || doc.sharedWithClient);
      return {
        id: m.id, body: m.body, sentAt: m.sentAt, fromClient: !!m.authorPortalUserId,
        author: m.authorPortalUserId ? (pn.get(m.authorPortalUserId) ?? "Client") : m.authorUserId ? (sn.get(m.authorUserId) ?? FIRM_LABEL) : FIRM_LABEL,
        attachment: showDoc ? { id: doc.id, name: doc.name } : null,
        readByOtherSide: m.authorPortalUserId ? !!m.readByFirmAt : !!m.readByClientAt,
      };
    }),
  };
}

/** Unread count for the nav badge (client messages for staff, firm messages for portal users). */
export async function unreadThreads(actor: Actor) {
  if (actor.kind === "USER") {
    try {
      staffScope(actor);
    } catch {
      return 0;
    }
  }
  const where = await visibleThreadWhere(actor);
  const msgWhere: Prisma.MessageWhereInput = actor.kind === "PORTAL" ? { readByClientAt: null, authorPortalUserId: null } : { readByFirmAt: null, authorPortalUserId: { not: null } };
  const rows = await db().message.findMany({ where: { ...msgWhere, thread: where }, select: { threadId: true }, distinct: ["threadId"] });
  return rows.length;
}

// ---------------------------------------------------------------------------------------------------------
// Response time (P4-04)
// ---------------------------------------------------------------------------------------------------------

/** Pure: minutes from each client message run to the firm's next reply, in one thread's messages (sorted). */
export function responseTimes(messages: { sentAt: Date; fromClient: boolean }[]): { waitedFrom: Date; minutes: number }[] {
  const out: { waitedFrom: Date; minutes: number }[] = [];
  let waitingFrom: Date | null = null;
  for (const m of messages) {
    if (m.fromClient) waitingFrom ??= m.sentAt;
    else if (waitingFrom) {
      out.push({ waitedFrom: waitingFrom, minutes: Math.round((m.sentAt.getTime() - waitingFrom.getTime()) / 60_000) });
      waitingFrom = null;
    }
  }
  return out;
}

/**
 * Firm response times for the threads the viewer can see, over the last `days`: replies counted, median and
 * slowest wait, and how many were answered within the target. Staff only.
 */
export async function responseStats(actor: Actor, opts: { days?: number } = {}) {
  if (actor.kind === "PORTAL") throw forbidden();
  const where = await visibleThreadWhere(actor);
  const since = new Date(Date.now() - (opts.days ?? 90) * 86_400_000);
  const msgs = await db().message.findMany({ where: { sentAt: { gte: since }, thread: where }, select: { threadId: true, sentAt: true, authorPortalUserId: true }, orderBy: { sentAt: "asc" } });
  const byThread = new Map<string, { sentAt: Date; fromClient: boolean }[]>();
  for (const m of msgs) {
    const list = byThread.get(m.threadId) ?? [];
    list.push({ sentAt: m.sentAt, fromClient: !!m.authorPortalUserId });
    byThread.set(m.threadId, list);
  }
  const waits = [...byThread.values()].flatMap((l) => responseTimes(l)).map((r) => r.minutes).sort((a, b) => a - b);
  const hours = await getSettingNumber("messages.responseHours", 24);
  const waiting = await db().messageThread.count({ where: { AND: [where, { closedAt: null, firstUnansweredAt: { not: null } }] } });
  const overdue = await db().messageThread.count({ where: { AND: [where, { closedAt: null, firstUnansweredAt: { lt: new Date(Date.now() - hours * 3600_000) } }] } });
  return {
    replies: waits.length,
    medianMinutes: waits.length ? waits[Math.floor((waits.length - 1) / 2)]! : null,
    slowestMinutes: waits.length ? waits[waits.length - 1]! : null,
    withinTarget: waits.filter((m) => m <= hours * 60).length,
    targetHours: hours,
    waitingNow: waiting,
    overdueNow: overdue,
  };
}

/** Scheduled: remind the team once per waiting spell when a client message is unanswered past the target. */
export async function runUnansweredMessageReminders(now = new Date()) {
  const hours = await getSettingNumber("messages.responseHours", 24);
  const threads = await db().messageThread.findMany({ where: { closedAt: null, firstUnansweredAt: { lt: new Date(now.getTime() - hours * 3600_000) } } });
  let reminded = 0;
  for (const t of threads) {
    const people = await threadPeople(t.id, t.clientId);
    const c = await db().client.findUnique({ where: { id: t.clientId }, select: { name: true, managerId: true } });
    const to = [...new Set([...people, ...(c?.managerId ? [c.managerId] : [])])];
    await notifyUsers(to, {
      kind: "MESSAGE_UNANSWERED", priority: "HIGH", title: `Client waiting over ${hours} hours: ${c?.name ?? ""}`, body: t.subject, link: `/messages/${t.id}`,
      entityType: "MessageThread", entityId: t.id, dedupeKey: `msg-unanswered:${t.id}:${t.firstUnansweredAt!.toISOString()}`,
    });
    reminded += 1;
  }
  return { waitingOverTarget: threads.length, reminded };
}

/** Clients a staff member can open a conversation with: in scope and with an active portal user. */
export async function messageableClients(actor: StaffActor) {
  const scope = staffScope(actor);
  const linked = await db().portalUserClient.findMany({ where: { portalUser: { active: true } }, select: { clientId: true }, distinct: ["clientId"] });
  const clients = await db().client.findMany({
    where: { AND: [{ id: { in: linked.map((l) => l.clientId) }, isFirm: false }, clientWhere(actor, scope)] },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const engagements = await db().engagement.findMany({
    where: { AND: [{ clientId: { in: clients.map((c) => c.id) }, status: { notIn: ["ARCHIVED", "CANCELLED"] } }, engagementWhere(actor, scope)] },
    select: { id: true, clientId: true, name: true, code: true },
    orderBy: { code: "asc" },
  });
  return clients.map((c) => ({ ...c, engagements: engagements.filter((e) => e.clientId === c.id).map((e) => ({ id: e.id, name: `${e.code} ${e.name}` })) }));
}
