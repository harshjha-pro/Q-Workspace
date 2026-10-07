import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can, requireStaff } from "../../permissions/guards";
import type { Actor, StaffActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { readStoredFile, storeFile } from "../../lib/storage";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { createFaqTx } from "../knowledge/service";

/**
 * Helpdesk (spec 9.1, P3-05). Tickets: Open → In Progress → Resolved → Closed, reopen.
 * Queues: HR queries (payslip, leave balance, reimbursement) go to the HR queue, handled by HR Admin (and Partners);
 * every other category goes to the admin queue, handled by the Practice Admin and Partners. Internal notes are
 * never returned to the raiser.
 */
export const CATEGORIES = ["BUG", "HOW_DO_I", "DATA_CORRECTION", "ACCESS", "HR_QUERY", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];
export const HR_TOPICS = ["PAYSLIP", "LEAVE_BALANCE", "REIMBURSEMENT", "OTHER_HR"] as const;
export const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof STATUSES)[number];
const OPEN_STATES: TicketStatus[] = ["OPEN", "IN_PROGRESS"];
const SCREENSHOT_TYPES = ["png", "jpg", "jpeg", "pdf"];
const SCREENSHOT_MAX = 5 * 1024 * 1024;

export const queueFor = (category: string) => (category === "HR_QUERY" ? "HR" : "ADMIN");

/** Queues this actor handles: Partner both, Practice Admin the admin queue, HR Admin the HR queue only. */
export function handledQueues(actor: Actor): ("ADMIN" | "HR")[] {
  if (actor.kind !== "USER" || !can(actor, "helpdesk.queue")) return [];
  if (actor.role === "PARTNER") return ["ADMIN", "HR"];
  if (actor.role === "HR_ADMIN") return ["HR"];
  if (actor.role === "PRACTICE_ADMIN") return ["ADMIN"];
  return [];
}

const ticketInput = z.object({
  category: z.enum(CATEGORIES),
  hrTopic: z.enum(HR_TOPICS).optional(),
  subject: z.string().trim().min(5, "Give a short subject").max(160),
  description: z.string().trim().min(10, "Describe the problem or question").max(5000),
});
export type TicketInput = z.input<typeof ticketInput>;

async function nextNumber(tx: Parameters<Parameters<typeof transaction>[0]>[0]) {
  const last = await tx.helpdeskTicket.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

/** Raise a ticket, optionally with a screenshot (png / jpg / pdf, ≤ 5 MB). */
export async function raiseTicket(actor: Actor, input: TicketInput, screenshot?: { name: string; data: Buffer } | null) {
  requireStaff(actor);
  authorize(actor, "helpdesk.raise");
  const d = parse(ticketInput, input);
  if (d.category === "HR_QUERY" && !d.hrTopic) throw new DomainError("VALIDATION", "Choose what the HR query is about.", { hrTopic: "Required" });
  let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
  if (screenshot && screenshot.data.length) {
    const ext = screenshot.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SCREENSHOT_TYPES.includes(ext)) throw new DomainError("VALIDATION", "A screenshot must be a PNG, JPG or PDF.", { screenshot: "Wrong file type" });
    stored = await storeFile(["_helpdesk", new Date().toISOString().slice(0, 7)], screenshot.name, screenshot.data, SCREENSHOT_MAX);
  }
  const queue = queueFor(d.category);
  const subject = d.category === "HR_QUERY" && d.hrTopic ? `[${d.hrTopic.replace(/_/g, " ").toLowerCase()}] ${d.subject}` : d.subject;
  const t = await transaction(async (tx) => {
    let docId: string | null = null;
    if (stored && screenshot) {
      const doc = await tx.document.create({
        data: {
          name: screenshot.name, kind: "HELPDESK_SCREENSHOT", sourceType: "UPLOAD", createdById: actor.userId,
          versions: { create: { version: 1, storagePath: stored.storagePath, originalName: screenshot.name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: actor.userId } },
        },
      });
      docId = doc.id;
    }
    const row = await tx.helpdeskTicket.create({
      data: { number: await nextNumber(tx), raisedById: actor.userId, category: d.category, queue, subject, description: d.description, screenshotDocId: docId, createdById: actor.userId },
    });
    await writeAudit(tx, actor, { entityType: "HelpdeskTicket", entityId: row.id, action: "CREATE", after: { number: row.number, category: d.category, queue, subject } });
    return row;
  });
  await notifyUsers(await handlersOf(queue, actor.userId), { kind: "HELPDESK", title: `New ticket #${t.number}: ${t.subject}`, link: `/helpdesk/${t.id}`, entityType: "HelpdeskTicket", entityId: t.id });
  return t;
}

/** People who handle a queue (for notifications and the assignee picker). */
export async function handlersOf(queue: string, exceptUserId?: string) {
  const roles = queue === "HR" ? ["PARTNER", "HR_ADMIN"] : ["PARTNER", "PRACTICE_ADMIN"];
  const rows = await db().user.findMany({ where: { active: true, isSystem: false, role: { in: roles }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function handlerOptions(actor: Actor, queue: string) {
  if (!handledQueues(actor).includes(queue as "ADMIN" | "HR")) return [];
  const roles = queue === "HR" ? ["PARTNER", "HR_ADMIN"] : ["PARTNER", "PRACTICE_ADMIN"];
  const rows = await db().user.findMany({ where: { active: true, isSystem: false, role: { in: roles } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.displayName }));
}

type Access = { ticket: NonNullable<Awaited<ReturnType<typeof findTicket>>>; isRaiser: boolean; isHandler: boolean };

async function findTicket(id: string) {
  return db().helpdeskTicket.findUnique({ where: { id }, include: { replies: { orderBy: { createdAt: "asc" } } } });
}

async function access(actor: Actor, id: string): Promise<Access> {
  requireStaff(actor);
  const ticket = await findTicket(id);
  if (!ticket) throw notFound("Ticket");
  const isRaiser = ticket.raisedById === actor.userId;
  const isHandler = handledQueues(actor).includes(ticket.queue as "ADMIN" | "HR");
  if (!isRaiser && !isHandler) throw forbidden();
  return { ticket, isRaiser, isHandler };
}

async function longOpenDays() {
  const v = await getSetting<number>("helpdesk.longOpenDays", 7);
  return typeof v === "number" && v > 0 ? v : 7;
}

const isLongOpen = (t: { status: string; createdAt: Date }, days: number, now = Date.now()) => OPEN_STATES.includes(t.status as TicketStatus) && now - t.createdAt.getTime() > days * 86_400_000;

/** One ticket. Internal notes are stripped unless the viewer handles the ticket's queue. */
export async function getTicket(actor: Actor, id: string) {
  const { ticket, isRaiser, isHandler } = await access(actor, id);
  const replies = isHandler ? ticket.replies : ticket.replies.filter((r) => !r.isInternal);
  const ids = [ticket.raisedById, ticket.assigneeId, ...replies.map((r) => r.authorId)].filter((x): x is string => !!x);
  const names = new Map((await db().user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return {
    ...ticket,
    replies: replies.map((r) => ({ ...r, authorName: names.get(r.authorId) ?? "" })),
    raisedByName: names.get(ticket.raisedById) ?? "",
    assigneeName: ticket.assigneeId ? names.get(ticket.assigneeId) ?? "" : "",
    isRaiser,
    isHandler,
    longOpen: isLongOpen(ticket, await longOpenDays()),
  };
}

export async function myTickets(actor: Actor) {
  requireStaff(actor);
  const days = await longOpenDays();
  const rows = await db().helpdeskTicket.findMany({ where: { raisedById: actor.userId }, orderBy: [{ updatedAt: "desc" }], take: 200 });
  return rows.map((t) => ({ ...t, longOpen: isLongOpen(t, days) }));
}

export type QueueFilter = { status?: string; category?: string; assigneeId?: string; q?: string; longOpenOnly?: boolean };

/** Admin / HR queue with filters (spec 9.1). HR Admin only ever sees the HR-query category. */
export async function listQueue(actor: Actor, f: QueueFilter = {}) {
  requireStaff(actor);
  authorize(actor, "helpdesk.queue");
  const queues = handledQueues(actor);
  if (!queues.length) throw forbidden();
  const days = await longOpenDays();
  const rows = await db().helpdeskTicket.findMany({
    where: {
      AND: [
        { queue: { in: queues } },
        f.status === "ALL" ? {} : f.status ? { status: f.status } : { status: { in: ["OPEN", "IN_PROGRESS", "RESOLVED"] } },
        f.category ? { category: f.category } : {},
        f.assigneeId === "none" ? { assigneeId: null } : f.assigneeId ? { assigneeId: f.assigneeId } : {},
        f.q ? { OR: [{ subject: { contains: f.q } }, { description: { contains: f.q } }] } : {},
      ],
    },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
  });
  const names = new Map((await db().user.findMany({ where: { id: { in: rows.flatMap((r) => [r.raisedById, r.assigneeId ?? ""]) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const out = rows.map((t) => ({ ...t, longOpen: isLongOpen(t, days), raisedByName: names.get(t.raisedById) ?? "", assigneeName: t.assigneeId ? names.get(t.assigneeId) ?? "" : "" }));
  return f.longOpenOnly ? out.filter((t) => t.longOpen) : out;
}

const replyInput = z.object({ body: z.string().trim().min(1, "Write a reply").max(5000), internal: z.boolean().default(false) });

/** Reply on a ticket. Raisers reply publicly; handlers reply or add an internal note (not visible to the raiser). */
export async function replyToTicket(actor: Actor, id: string, input: z.input<typeof replyInput>) {
  const { ticket, isHandler, isRaiser } = await access(actor, id);
  const d = parse(replyInput, input);
  const a = actor as StaffActor;
  if (d.internal && !isHandler) throw forbidden("Only the helpdesk team adds internal notes.");
  if (ticket.status === "CLOSED") throw ruleViolation("The ticket is closed. Reopen it to continue.");
  const moveToProgress = isHandler && !d.internal && ticket.status === "OPEN" && !isRaiser;
  await transaction(async (tx) => {
    const r = await tx.ticketReply.create({ data: { ticketId: id, authorId: a.userId, body: d.body, isInternal: d.internal, createdById: a.userId } });
    await tx.helpdeskTicket.update({ where: { id }, data: { updatedById: a.userId, ...(moveToProgress ? { status: "IN_PROGRESS" } : {}) } });
    await writeAudit(tx, actor, { entityType: "TicketReply", entityId: r.id, action: d.internal ? "INTERNAL_NOTE" : "REPLY", after: { ticketId: id, internal: d.internal } });
  });
  if (!d.internal) {
    const to = isRaiser ? (ticket.assigneeId ? [ticket.assigneeId] : await handlersOf(ticket.queue, a.userId)) : [ticket.raisedById];
    await notifyUsers(to.filter((u) => u !== a.userId), { kind: "HELPDESK", title: `Reply on ticket #${ticket.number}`, body: ticket.subject, link: `/helpdesk/${id}`, entityType: "HelpdeskTicket", entityId: id });
  }
}

/** Assign to a handler of the ticket's queue (or nobody). */
export async function assignTicket(actor: Actor, id: string, assigneeId: string | null) {
  const { ticket, isHandler } = await access(actor, id);
  if (!isHandler) throw forbidden();
  if (assigneeId && !(await handlersOf(ticket.queue)).includes(assigneeId)) throw ruleViolation(ticket.queue === "HR" ? "HR queries are handled by HR Admin or a Partner." : "Assign to the Practice Admin or a Partner.");
  await transaction(async (tx) => {
    await tx.helpdeskTicket.update({ where: { id }, data: { assigneeId, updatedById: (actor as StaffActor).userId, ...(assigneeId && ticket.status === "OPEN" ? { status: "IN_PROGRESS" } : {}) } });
    await writeAudit(tx, actor, { entityType: "HelpdeskTicket", entityId: id, action: "ASSIGN", before: { assigneeId: ticket.assigneeId }, after: { assigneeId } });
  });
  if (assigneeId && assigneeId !== (actor as StaffActor).userId) {
    await notifyUsers([assigneeId], { kind: "HELPDESK", title: `Ticket #${ticket.number} assigned to you`, body: ticket.subject, link: `/helpdesk/${id}`, entityType: "HelpdeskTicket", entityId: id });
  }
}

/** Status moves. Handlers: In Progress / Resolved / Closed. Raiser: close a resolved ticket, or reopen. */
export async function setTicketStatus(actor: Actor, id: string, status: TicketStatus) {
  const { ticket, isHandler, isRaiser } = await access(actor, id);
  if (!STATUSES.includes(status)) throw new DomainError("VALIDATION", "Unknown status.");
  const from = ticket.status as TicketStatus;
  if (from === status) return;
  const reopen = status === "OPEN" && (from === "RESOLVED" || from === "CLOSED");
  if (reopen) {
    if (!isRaiser && !isHandler) throw forbidden();
  } else if (status === "CLOSED" && isRaiser && !isHandler) {
    if (from !== "RESOLVED") throw ruleViolation("You can close your ticket once it is resolved.");
  } else if (!isHandler) {
    throw forbidden("Only the helpdesk team changes the status.");
  } else if (status === "OPEN") {
    throw ruleViolation("Only a resolved or closed ticket can be reopened.");
  } else if (from === "CLOSED") {
    throw ruleViolation("Reopen the ticket first.");
  }
  const now = new Date();
  await transaction(async (tx) => {
    await tx.helpdeskTicket.update({
      where: { id },
      data: {
        status,
        updatedById: (actor as StaffActor).userId,
        ...(status === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(status === "CLOSED" ? { closedAt: now } : {}),
        ...(reopen ? { reopenedCount: { increment: 1 }, resolvedAt: null, closedAt: null } : {}),
      },
    });
    await writeAudit(tx, actor, { entityType: "HelpdeskTicket", entityId: id, action: reopen ? "REOPEN" : "STATUS", before: { status: from }, after: { status } });
  });
  const who = (actor as StaffActor).userId;
  const to = who === ticket.raisedById ? (ticket.assigneeId ? [ticket.assigneeId] : await handlersOf(ticket.queue, who)) : [ticket.raisedById];
  await notifyUsers(to.filter((u) => u !== who), { kind: "HELPDESK", title: `Ticket #${ticket.number} ${reopen ? "reopened" : status.replace("_", " ").toLowerCase()}`, body: ticket.subject, link: `/helpdesk/${id}`, entityType: "HelpdeskTicket", entityId: id });
}

const faqInput = z.object({ title: z.string().trim().min(3), body: z.string().trim().min(10), serviceLine: z.string().nullable().optional() });

/** Turn a ticket's answer into a knowledge-base FAQ (tagged FAQ) and link it to the ticket. */
export async function convertToFaq(actor: Actor, id: string, input: z.input<typeof faqInput>) {
  const { ticket, isHandler } = await access(actor, id);
  if (!isHandler) throw forbidden();
  authorize(actor, "knowledge.write");
  if (ticket.faqArticleId) throw ruleViolation("This ticket is already an FAQ.");
  const d = parse(faqInput, input);
  return transaction(async (tx) => {
    const a = await createFaqTx(tx, actor, { title: d.title, body: d.body, serviceLine: d.serviceLine ?? null });
    await tx.helpdeskTicket.update({ where: { id }, data: { faqArticleId: a.id, updatedById: (actor as StaffActor).userId } });
    await writeAudit(tx, actor, { entityType: "HelpdeskTicket", entityId: id, action: "CONVERT_FAQ", after: { articleId: a.id } });
    return a;
  });
}

/** Authorised screenshot download (raiser or handler only); audited. */
export async function ticketScreenshot(actor: Actor, id: string) {
  const { ticket } = await access(actor, id);
  if (!ticket.screenshotDocId) throw notFound("Screenshot");
  const v = await db().documentVersion.findFirst({ where: { documentId: ticket.screenshotDocId }, orderBy: { version: "desc" } });
  if (!v) throw notFound("Screenshot");
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Document", entityId: ticket.screenshotDocId!, action: "DOWNLOAD", after: { ticketId: id } }));
  return { data: await readStoredFile(v.storagePath), fileName: v.originalName, mimeType: v.mimeType };
}
