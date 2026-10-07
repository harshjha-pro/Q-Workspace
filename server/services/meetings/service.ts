import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, requireStaff } from "../../permissions/guards";
import { assertClientAccess, clientWhere } from "../../permissions/scopes";
import type { Actor, StaffActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { isIsoDate, todayIst } from "../../lib/dates";
import { notifyUsers } from "../notifications/service";

/**
 * Client meetings and minutes (spec 13.8, P3-33): schedule with internal and client attendees, agenda, minutes,
 * and action items that become one-off tasks with an owner and a due date. "Calendar sync" is an .ics download
 * (brief §4: no external services).
 */
export const MEETING_STATUSES = ["SCHEDULED", "HELD", "CANCELLED"] as const;
const DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const ids = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []).map(String).filter(Boolean);

const meetingInput = z.object({
  clientId: z.string().min(1, "Choose a client"),
  engagementId: z.preprocess(blank, z.string().nullable().optional()),
  title: z.string().trim().min(3, "Give the meeting a title").max(160),
  scheduledAt: z.string().regex(DATETIME, "Use a date and time"),
  durationMinutes: z.coerce.number().int().min(15).max(600).default(60),
  location: z.string().trim().max(200).default(""),
  agenda: z.string().max(5000).default(""),
  userIds: z.preprocess(ids, z.array(z.string())).default([]),
  contactIds: z.preprocess(ids, z.array(z.string())).default([]),
});
export type MeetingInput = z.input<typeof meetingInput>;

function staff(actor: Actor): StaffActor {
  requireStaff(actor);
  return actor;
}

async function checkAttendees(clientId: string, userIds: string[], contactIds: string[]) {
  if (userIds.length) {
    const n = await db().user.count({ where: { id: { in: userIds }, active: true, isSystem: false } });
    if (n !== new Set(userIds).size) throw new DomainError("VALIDATION", "Choose active colleagues as attendees.", { userIds: "Check the attendees" });
  }
  if (contactIds.length) {
    const n = await db().contact.count({ where: { id: { in: contactIds }, clientId } });
    if (n !== new Set(contactIds).size) throw new DomainError("VALIDATION", "Client attendees must be contacts of this client.", { contactIds: "Check the contacts" });
  }
}

export async function scheduleMeeting(actor: Actor, input: MeetingInput) {
  const a = staff(actor);
  const d = parse(meetingInput, input);
  await assertClientAccess(actor, "meetings.manage", d.clientId);
  if (d.engagementId && !(await db().engagement.count({ where: { id: d.engagementId, clientId: d.clientId } }))) throw notFound("Engagement");
  const userIds = [...new Set([a.userId, ...d.userIds])];
  await checkAttendees(d.clientId, userIds, d.contactIds);
  const m = await transaction(async (tx) => {
    const row = await tx.meeting.create({
      data: {
        clientId: d.clientId, engagementId: d.engagementId ?? null, title: d.title, scheduledAt: d.scheduledAt, durationMinutes: d.durationMinutes,
        location: d.location, agenda: d.agenda, organizerId: a.userId, createdById: a.userId,
        attendees: { create: [...userIds.map((userId) => ({ userId, createdById: a.userId })), ...[...new Set(d.contactIds)].map((contactId) => ({ contactId, createdById: a.userId }))] },
      },
    });
    await writeAudit(tx, actor, { entityType: "Meeting", entityId: row.id, action: "CREATE", after: { ...d, userIds } });
    return row;
  });
  const client = await db().client.findUnique({ where: { id: d.clientId }, select: { name: true } });
  await notifyUsers(userIds.filter((u) => u !== a.userId), { kind: "MEETING", title: `Meeting: ${d.title}`, body: `${client?.name ?? ""} · ${d.scheduledAt.replace("T", " ")}`, link: `/meetings/${m.id}`, entityType: "Meeting", entityId: m.id });
  return m;
}

async function loadMeeting(actor: Actor, id: string) {
  const m = await db().meeting.findUnique({ where: { id }, include: { attendees: true, actionItems: { orderBy: { createdAt: "asc" } } } });
  if (!m) throw notFound("Meeting");
  await assertClientAccess(actor, "meetings.manage", m.clientId);
  return m;
}

const meetingUpdate = meetingInput.omit({ clientId: true }).extend({ notes: z.string().max(20000), status: z.enum(MEETING_STATUSES) });

/** Edit details, record minutes (notes), mark held or cancelled, change attendees. */
export async function updateMeeting(actor: Actor, id: string, input: Partial<z.input<typeof meetingUpdate>>) {
  const a = staff(actor);
  const before = await loadMeeting(actor, id);
  const d = parsePartial(meetingUpdate, input);
  if (d.engagementId && !(await db().engagement.count({ where: { id: d.engagementId, clientId: before.clientId } }))) throw notFound("Engagement");
  const { userIds, contactIds, ...rest } = d;
  if (userIds || contactIds) await checkAttendees(before.clientId, userIds ?? [], contactIds ?? []);
  return transaction(async (tx) => {
    const after = await tx.meeting.update({ where: { id }, data: { ...rest, updatedById: a.userId } });
    if (userIds) {
      await tx.meetingAttendee.deleteMany({ where: { meetingId: id, userId: { not: null } } });
      for (const userId of new Set([before.organizerId, ...userIds])) await tx.meetingAttendee.create({ data: { meetingId: id, userId, createdById: a.userId } });
    }
    if (contactIds) {
      await tx.meetingAttendee.deleteMany({ where: { meetingId: id, contactId: { not: null } } });
      for (const contactId of new Set(contactIds)) await tx.meetingAttendee.create({ data: { meetingId: id, contactId, createdById: a.userId } });
    }
    await writeAudit(tx, actor, { entityType: "Meeting", entityId: id, action: "UPDATE", before: { ...before, attendees: undefined, actionItems: undefined }, after: { ...after, userIds, contactIds } });
    return after;
  });
}

const actionInput = z.object({
  title: z.string().trim().min(3, "Describe the action").max(200),
  ownerId: z.string().min(1, "Choose an owner"),
  dueDate: z.string().refine(isIsoDate, "Choose a due date"),
});

/**
 * Add an action item. It becomes a one-off task for the meeting's client (and engagement, if any), assigned to the
 * owner, in the same transaction — the equivalent of tasks/createOneOffTask, done inline so the item and its task
 * are created together and Staff organisers (who cannot bulk-create tasks) can still record action items.
 */
export async function addActionItem(actor: Actor, meetingId: string, input: z.input<typeof actionInput>) {
  const a = staff(actor);
  const m = await loadMeeting(actor, meetingId);
  if (m.status === "CANCELLED") throw ruleViolation("The meeting was cancelled.");
  const d = parse(actionInput, input);
  const owner = await db().user.findUnique({ where: { id: d.ownerId } });
  if (!owner || !owner.active || owner.isSystem) throw ruleViolation("Choose an active owner.");
  if (owner.role === "HR_ADMIN" || owner.role === "PRACTICE_ADMIN" || owner.role === "PORTAL") throw ruleViolation("Action items go to people who do client work.");
  const engagement = m.engagementId ? await db().engagement.findUnique({ where: { id: m.engagementId } }) : null;
  const today = todayIst();
  const item = await transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        clientId: m.clientId, engagementId: engagement?.id ?? null, title: d.title, periodKey: `MEETING-${meetingId}-${Date.now()}`, periodLabel: `Meeting ${m.scheduledAt.slice(0, 10)}`,
        originalDueDate: d.dueDate, effectiveDueDate: d.dueDate, stageTemplateVersionId: engagement?.stageTemplateVersionId ?? null, isOneOff: true,
        dueBasis: `Action item from meeting "${m.title}"`, createdById: a.userId,
      },
    });
    await tx.taskStatusHistory.create({ data: { taskId: t.id, toStatus: "UPCOMING", reason: `Action item from meeting ${m.title}`, createdById: a.userId } });
    for (const role of ["ASSIGNEE", "MAKER"]) await tx.taskAssignment.create({ data: { taskId: t.id, userId: d.ownerId, role, fromDate: today, createdById: a.userId } });
    const row = await tx.actionItem.create({ data: { meetingId, title: d.title, ownerId: d.ownerId, dueDate: d.dueDate, taskId: t.id, createdById: a.userId } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: t.id, action: "CREATE", after: { title: d.title, clientId: m.clientId, dueDate: d.dueDate, assigneeId: d.ownerId, fromMeeting: meetingId } });
    await writeAudit(tx, actor, { entityType: "ActionItem", entityId: row.id, action: "CREATE", after: { meetingId, ...d, taskId: t.id } });
    return row;
  });
  if (d.ownerId !== a.userId) await notifyUsers([d.ownerId], { kind: "ASSIGNED", title: `Action item: ${d.title}`, body: `Due ${d.dueDate} · from meeting "${m.title}"`, link: `/tasks/${item.taskId}`, entityType: "Task", entityId: item.taskId ?? undefined });
  return item;
}

export type MeetingFilter = { clientId?: string; when?: "upcoming" | "past" | "all"; q?: string };

export async function listMeetings(actor: Actor, f: MeetingFilter = {}) {
  staff(actor);
  const scope = authorize(actor, "meetings.manage");
  const now = nowIstLocal();
  const rows = await db().meeting.findMany({
    where: {
      AND: [
        f.clientId ? { clientId: f.clientId } : {},
        f.when === "past" ? { scheduledAt: { lt: now.slice(0, 10) } } : f.when === "all" ? {} : { scheduledAt: { gte: now.slice(0, 10) } },
        f.q ? { title: { contains: f.q } } : {},
      ],
    },
    include: { attendees: true, actionItems: true },
    orderBy: { scheduledAt: f.when === "past" ? "desc" : "asc" },
    take: 300,
  });
  const visible = new Set((await db().client.findMany({ where: { AND: [{ id: { in: [...new Set(rows.map((r) => r.clientId))] } }, clientWhere(actor, scope)] }, select: { id: true } })).map((c) => c.id));
  const mine = rows.filter((r) => visible.has(r.clientId));
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...visible] } }, select: { id: true, name: true, code: true } })).map((c) => [c.id, c]));
  return mine.map((r) => ({
    id: r.id, title: r.title, scheduledAt: r.scheduledAt, durationMinutes: r.durationMinutes, status: r.status, location: r.location, clientId: r.clientId,
    clientName: clients.get(r.clientId)?.name ?? "", clientCode: clients.get(r.clientId)?.code ?? "", attendees: r.attendees.length, actionItems: r.actionItems.length,
    hasMinutes: r.notes.trim().length > 0,
  }));
}

export async function getMeeting(actor: Actor, id: string) {
  staff(actor);
  const m = await loadMeeting(actor, id);
  const userIds = m.attendees.map((x) => x.userId).filter((x): x is string => !!x);
  const contactIds = m.attendees.map((x) => x.contactId).filter((x): x is string => !!x);
  const [users, contacts, client, engagement, tasks] = await Promise.all([
    db().user.findMany({ where: { id: { in: [...userIds, m.organizerId, ...m.actionItems.map((x) => x.ownerId)] } }, select: { id: true, displayName: true } }),
    db().contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, role: true, email: true } }),
    db().client.findUniqueOrThrow({ where: { id: m.clientId }, select: { id: true, name: true, code: true } }),
    m.engagementId ? db().engagement.findUnique({ where: { id: m.engagementId }, select: { id: true, code: true, name: true } }) : null,
    db().task.findMany({ where: { id: { in: m.actionItems.map((x) => x.taskId).filter((x): x is string => !!x) } }, select: { id: true, status: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const taskStatus = new Map(tasks.map((t) => [t.id, t.status]));
  return {
    ...m,
    client,
    engagement,
    organizerName: names.get(m.organizerId) ?? "",
    people: userIds.map((u) => ({ id: u, name: names.get(u) ?? "" })),
    contacts,
    actionItems: m.actionItems.map((x) => ({ ...x, ownerName: names.get(x.ownerId) ?? "", taskStatus: x.taskId ? taskStatus.get(x.taskId) ?? null : null })),
  };
}

/** Current IST wall-clock time as YYYY-MM-DDTHH:mm (meetings store IST local times). */
export function nowIstLocal(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// .ics for one meeting — a timed event (the calendar module's toIcs is all-day only).
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

/** IST local "YYYY-MM-DDTHH:mm" → UTC "YYYYMMDDTHHMMSSZ" (IST is UTC+05:30 all year). */
export function istToUtcStamp(local: string, plusMinutes = 0) {
  const ms = Date.parse(`${local}:00+05:30`) + plusMinutes * 60_000;
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

export function meetingToIcs(m: { id: string; title: string; scheduledAt: string; durationMinutes: number; location: string; agenda: string; status: string; clientName: string; attendees: { name: string; email?: string | null }[] }, baseUrl = "") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const desc = [m.agenda ? `Agenda:\n${m.agenda}` : "", m.attendees.length ? `Attendees: ${m.attendees.map((x) => x.name).join(", ")}` : ""].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QEPEX India//Work Tracker//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:meeting-${m.id}@qepex.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${istToUtcStamp(m.scheduledAt)}`,
    `DTEND:${istToUtcStamp(m.scheduledAt, m.durationMinutes)}`,
    `SUMMARY:${esc(`${m.title} — ${m.clientName}`)}`,
    ...(m.location ? [`LOCATION:${esc(m.location)}`] : []),
    ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
    ...m.attendees.filter((x) => x.email).map((x) => `ATTENDEE;CN=${esc(x.name)}:mailto:${x.email}`),
    ...(baseUrl ? [`URL:${baseUrl}/meetings/${m.id}`] : []),
    `STATUS:${m.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export async function meetingIcs(actor: Actor, id: string, baseUrl = "") {
  const m = await getMeeting(actor, id);
  const attendees = [...m.people.map((p) => ({ name: p.name })), ...m.contacts.map((c) => ({ name: c.name, email: c.email }))];
  return { body: meetingToIcs({ ...m, clientName: m.client.name, attendees }, baseUrl), fileName: `meeting-${m.scheduledAt.slice(0, 10)}.ics` };
}

/** Pickers for the schedule form. */
export async function meetingFormOptions(actor: Actor, clientId?: string) {
  staff(actor);
  const scope = authorize(actor, "meetings.manage");
  const [clients, people] = await Promise.all([
    db().client.findMany({ where: { AND: [clientWhere(actor, scope), { status: { not: "DISCONTINUED_CLOSED" } }] }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db().user.findMany({ where: { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);
  let contacts: { id: string; name: string }[] = [];
  let engagements: { id: string; name: string }[] = [];
  if (clientId) {
    if (!clients.some((c) => c.id === clientId)) throw forbidden();
    contacts = (await db().contact.findMany({ where: { clientId }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } })).map((c) => ({ id: c.id, name: c.role ? `${c.name} (${c.role})` : c.name }));
    engagements = (await db().engagement.findMany({ where: { clientId, archivedAt: null, status: { in: ["ACTIVE", "ON_HOLD"] } }, select: { id: true, code: true, name: true }, orderBy: { code: "desc" } })).map((e) => ({ id: e.id, name: `${e.name} (${e.code})` }));
  }
  return { clients: clients.map((c) => ({ id: c.id, name: `${c.name} (${c.code})` })), people: people.map((p) => ({ id: p.id, name: p.displayName })), contacts, engagements };
}
