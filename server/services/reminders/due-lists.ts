import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import { clientWhere, taskWhere } from "../../permissions/scopes";
import type { Actor, PortalActor } from "../../permissions/actor";
import { systemActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, diffDays, formatDate, isoFromParts, todayIst } from "../../lib/dates";
import { formatInr } from "../../lib/money";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import type { Prisma } from "../../../generated/prisma/client";

/**
 * Reminder-due lists (P4-03, P4-08; D-84). The firm sends reminders itself (WhatsApp, email, call): the system
 * only works out who is due, writes the text, and records what was sent.
 * - Client documents: per schedule (compliance type, day of month, months), one item per open task that still
 *   has requested documents. The Nth reminder past `escalateAfter` is flagged and the Manager/Partner told once.
 * - Payments: overdue invoices at the `billing.reminderDays` points; the last point is flagged to the Partner.
 * - A newer item replaces an unsent older one for the same task / invoice; items that no longer apply (documents
 *   received, task closed, invoice paid) are skipped automatically.
 * - "Mark as sent" writes a ReminderLog row (the same log the task page shows) and makes the text visible in
 *   the client's portal.
 */

const OPEN_TASK = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];
const OPEN_INVOICE = ["RAISED", "PARTLY_RECEIVED"];
const CATCH_UP_DAYS = 3; // a schedule day missed (server off) is still generated within this many days
const FIRM = "QEPEX India";

// ---------------------------------------------------------------------------------------------------------
// Schedules (firm settings: Partner / Practice Admin)
// ---------------------------------------------------------------------------------------------------------

const scheduleInput = z.object({
  name: z.string().trim().min(3).max(120),
  complianceTypeCode: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().default(null)),
  dayOfMonth: z.number().int().min(1, "1 to 28").max(28, "1 to 28 (every month has it)"),
  monthsCsv: z.string().trim().regex(/^$|^(1[0-2]|[1-9])(,(1[0-2]|[1-9]))*$/, "Months as numbers, e.g. 4,7,10,1 — empty for every month").default(""),
  messageText: z.string().max(4000).default(""),
  escalateAfter: z.number().int().min(1).max(20).default(3),
  active: z.boolean().default(true),
});
export type ScheduleInput = z.input<typeof scheduleInput>;

export async function listSchedules(actor: Actor) {
  authorize(actor, "task.view");
  return db().clientReminderSchedule.findMany({ orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }, { name: "asc" }] });
}

export async function saveSchedule(actor: Actor, input: ScheduleInput, id?: string) {
  const scope = authorize(actor, "settings.manage");
  if (scope !== "firm") throw forbidden();
  const d = id ? parsePartial(scheduleInput, input) : parse(scheduleInput, input);
  if (d.complianceTypeCode && !(await db().complianceType.findUnique({ where: { code: d.complianceTypeCode } })))
    throw new DomainError("VALIDATION", "Unknown compliance type.", { complianceTypeCode: "Choose a type" });
  const uid = actor.kind === "USER" ? actor.userId : null;
  return transaction(async (tx) => {
    const before = id ? await tx.clientReminderSchedule.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound("Reminder schedule");
    const row = id
      ? await tx.clientReminderSchedule.update({ where: { id }, data: { ...d, updatedById: uid } })
      : await tx.clientReminderSchedule.create({ data: { ...(d as z.infer<typeof scheduleInput>), createdById: uid, updatedById: uid } });
    await writeAudit(tx, actor, { entityType: "ClientReminderSchedule", entityId: row.id, action: id ? "UPDATE" : "CREATE", before, after: row });
    return row;
  });
}

// ---------------------------------------------------------------------------------------------------------
// Message text
// ---------------------------------------------------------------------------------------------------------

/** Placeholders a schedule's own text may use. Unknown ones are left as typed. */
export const DOC_PLACEHOLDERS = ["contact", "client", "task", "period", "items", "dueDate", "firm"] as const;

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (m, k: string) => (k in values ? values[k]! : m));
}

/** Pure: the default client-documents text. Staff notes on items are internal and never included. */
export function docsReminderText(v: { contact: string; client: string; task: string; period: string; items: string[]; dueDate: string | null; sequenceNo: number; today: string }) {
  const due = v.dueDate ? (v.dueDate < v.today ? `The due date of ${formatDate(v.dueDate)} has passed, so kindly share these at the earliest.` : `Kindly share these so we can file before the due date of ${formatDate(v.dueDate)}.`) : "Kindly share these at the earliest.";
  return [
    `Dear ${v.contact},`,
    "",
    `${v.sequenceNo > 1 ? `Reminder ${v.sequenceNo}: ` : ""}for ${v.task}${v.period ? ` (${v.period})` : ""} of ${v.client}, we are still waiting for:`,
    ...v.items.map((i, n) => `${n + 1}. ${i}`),
    "",
    due,
    "You can also upload them in the client portal under Send documents.",
    "",
    "Regards,",
    FIRM,
  ].join("\n");
}

/** Pure: the payment reminder text. */
export function paymentReminderText(v: { contact: string; client: string; number: string; date: string; dueDate: string | null; balancePaise: number; sequenceNo: number; payTo: { bankName: string; bankAccount: string; bankIfsc: string; upiId: string } | null }) {
  const pay = v.payTo
    ? [
        v.payTo.bankAccount ? `Bank: ${v.payTo.bankName}, A/c ${v.payTo.bankAccount}, IFSC ${v.payTo.bankIfsc}` : null,
        v.payTo.upiId ? `UPI: ${v.payTo.upiId}` : null,
      ].filter((x): x is string => !!x)
    : [];
  return [
    `Dear ${v.contact},`,
    "",
    `${v.sequenceNo > 1 ? `Reminder ${v.sequenceNo}: ` : ""}our invoice ${v.number} dated ${formatDate(v.date)} for ${v.client} has ${formatInr(v.balancePaise)} outstanding${v.dueDate ? `, which was due on ${formatDate(v.dueDate)}` : ""}.`,
    "Kindly arrange the payment and share the UTR / reference once paid. Please ignore this if already paid.",
    ...(pay.length ? ["", ...pay] : []),
    "",
    "Regards,",
    FIRM,
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------
// Generation (scheduled daily)
// ---------------------------------------------------------------------------------------------------------

function matchesMonth(monthsCsv: string, month: number) {
  return !monthsCsv.trim() || monthsCsv.split(",").map(Number).includes(month);
}

/** Skip DUE items that no longer apply; returns how many were skipped. */
export async function expireStaleItems() {
  const due = await db().clientReminderDue.findMany({ where: { status: "DUE" }, select: { id: true, kind: true, taskId: true, invoiceId: true } });
  const stale: string[] = [];
  for (const d of due) {
    if (d.kind === "CLIENT_DOCS" && d.taskId) {
      const t = await db().task.findUnique({ where: { id: d.taskId }, select: { status: true } });
      const open = await db().checklistItem.count({ where: { taskId: d.taskId, status: "REQUESTED" } });
      if (!t || !OPEN_TASK.includes(t.status) || open === 0) stale.push(d.id);
    } else if (d.kind === "PAYMENT" && d.invoiceId) {
      const inv = await db().invoice.findUnique({ where: { id: d.invoiceId }, select: { status: true } });
      if (!inv || !OPEN_INVOICE.includes(inv.status)) stale.push(d.id);
    }
  }
  if (stale.length) {
    await transaction(async (tx) => {
      await tx.clientReminderDue.updateMany({ where: { id: { in: stale } }, data: { status: "SKIPPED" } });
      for (const id of stale) await writeAudit(tx, systemActor(), { entityType: "ClientReminderDue", entityId: id, action: "SKIP", reason: "No longer applies (received, closed or paid)" });
    });
  }
  return stale.length;
}

async function contactName(clientId: string) {
  const c = await db().client.findUniqueOrThrow({ where: { id: clientId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } });
  return { name: c.name, contact: c.contacts[0]?.name ?? c.name, channel: c.preferredChannel === "WHATSAPP" ? "WHATSAPP" : c.preferredChannel === "PHONE" ? "CALL" : "EMAIL", managerId: c.managerId, partnerId: c.partnerId };
}

/** Create the item, replacing an unsent older one for the same task / invoice. */
async function addItem(data: Prisma.ClientReminderDueUncheckedCreateInput, replaceWhere: Prisma.ClientReminderDueWhereInput) {
  return transaction(async (tx) => {
    const older = await tx.clientReminderDue.findMany({ where: { ...replaceWhere, status: "DUE" }, select: { id: true } });
    if (older.length) await tx.clientReminderDue.updateMany({ where: { id: { in: older.map((o) => o.id) } }, data: { status: "SKIPPED" } });
    const row = await tx.clientReminderDue.create({ data });
    await writeAudit(tx, systemActor(), { entityType: "ClientReminderDue", entityId: row.id, action: "CREATE", after: { kind: row.kind, clientId: row.clientId, taskId: row.taskId, invoiceId: row.invoiceId, sequenceNo: row.sequenceNo, replaced: older.length } });
    return row;
  });
}

async function generateDocReminders(today: string) {
  const [y, m, dd] = today.split("-").map(Number) as [number, number, number];
  const schedules = await db().clientReminderSchedule.findMany({ where: { active: true } });
  let created = 0;
  let escalated = 0;
  for (const s of schedules) {
    if (!matchesMonth(s.monthsCsv, m) || dd < s.dayOfMonth) continue;
    const dueOn = isoFromParts(y, m, s.dayOfMonth);
    if (diffDays(dueOn, today) > CATCH_UP_DAYS) continue;
    const tasks = await db().task.findMany({
      where: { status: { in: OPEN_TASK }, ...(s.complianceTypeCode ? { complianceTypeCode: s.complianceTypeCode } : {}), client: { isFirm: false } },
      select: { id: true, clientId: true, title: true, periodLabel: true, effectiveDueDate: true, engagement: { select: { managerId: true, partnerId: true } } },
    });
    for (const t of tasks) {
      // Only items requested before the reminder day: something asked for this morning needs no reminder yet.
      const items = await db().checklistItem.findMany({ where: { taskId: t.id, status: "REQUESTED", requestedAt: { lt: dueOn } }, orderBy: { sortOrder: "asc" }, select: { label: true, requestedAt: true } });
      if (!items.length) continue;
      // One reminder per task per day, even when two schedules fall on the same day.
      if (await db().clientReminderDue.count({ where: { taskId: t.id, kind: "CLIENT_DOCS", dueOn } })) continue;
      const since = items.map((i) => i.requestedAt!).sort()[0]!;
      const earlier = await db().reminderLog.count({ where: { taskId: t.id, kind: "CLIENT_DOCS", sentAt: { gte: new Date(`${since}T00:00:00+05:30`) } } });
      const sequenceNo = earlier + 1;
      const c = await contactName(t.clientId);
      const values = { contact: c.contact, client: c.name, task: t.title, period: t.periodLabel, items: items.map((i, n) => `${n + 1}. ${i.label}`).join("\n"), dueDate: t.effectiveDueDate ? formatDate(t.effectiveDueDate) : "", firm: FIRM };
      const text = s.messageText.trim()
        ? fillTemplate(s.messageText, values)
        : docsReminderText({ contact: c.contact, client: c.name, task: t.title, period: t.periodLabel, items: items.map((i) => i.label), dueDate: t.effectiveDueDate, sequenceNo, today });
      const row = await addItem({ scheduleId: s.id, clientId: t.clientId, taskId: t.id, kind: "CLIENT_DOCS", dueOn, messageText: text, channel: c.channel, sequenceNo }, { taskId: t.id, kind: "CLIENT_DOCS" });
      created += 1;
      if (sequenceNo > s.escalateAfter) {
        const to = [t.engagement?.managerId ?? c.managerId, t.engagement?.partnerId ?? c.partnerId].filter((x): x is string => !!x);
        await notifyUsers(to, {
          kind: "CLIENT_DOCS_ESCALATION", priority: "HIGH", title: `Documents still awaited after ${sequenceNo - 1} reminders: ${c.name}`, body: `${t.title} — call the client`,
          link: "/reminders", entityType: "ClientReminderDue", entityId: row.id, dedupeKey: `docs-escalation:${t.id}:${since}`,
        });
        escalated += 1;
      }
    }
  }
  return { created, escalated };
}

async function generatePaymentReminders(today: string) {
  const points = [...(await getSetting<number[]>("billing.reminderDays", [15, 30, 60]))].sort((a, b) => a - b);
  if (!points.length) return { created: 0, escalated: 0 };
  const firm = await db().firmProfile.findFirst({ select: { bankName: true, bankAccount: true, bankIfsc: true, upiId: true } });
  const payTo = firm && (firm.bankAccount || firm.upiId) ? firm : null;
  const firmClientIds = (await db().client.findMany({ where: { isFirm: true }, select: { id: true } })).map((c) => c.id);
  const invoices = await db().invoice.findMany({ where: { status: { in: OPEN_INVOICE }, number: { not: null }, dueDate: { lt: today }, clientId: { notIn: firmClientIds } }, select: { id: true, clientId: true, number: true, date: true, dueDate: true, totalPaise: true, receivedPaise: true } });
  let created = 0;
  let escalated = 0;
  for (const inv of invoices) {
    const age = diffDays(inv.date, today);
    const reached = points.filter((p) => age >= p);
    if (!reached.length) continue;
    const sequenceNo = reached.length;
    if (await db().clientReminderDue.count({ where: { invoiceId: inv.id, kind: "PAYMENT", sequenceNo } })) continue;
    const c = await contactName(inv.clientId);
    const balancePaise = Math.max(0, inv.totalPaise - inv.receivedPaise);
    const text = paymentReminderText({ contact: c.contact, client: c.name, number: inv.number!, date: inv.date, dueDate: inv.dueDate, balancePaise, sequenceNo, payTo });
    const row = await addItem({ clientId: inv.clientId, invoiceId: inv.id, kind: "PAYMENT", dueOn: addDays(inv.date, points[sequenceNo - 1]!), messageText: text, channel: c.channel, sequenceNo }, { invoiceId: inv.id, kind: "PAYMENT" });
    created += 1;
    if (sequenceNo === points.length) {
      const partners = c.partnerId ? [c.partnerId] : (await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } })).map((u) => u.id);
      await notifyUsers(partners, {
        kind: "PAYMENT_ESCALATION", priority: "HIGH", title: `Invoice ${inv.number} unpaid after ${points[sequenceNo - 1]} days: ${c.name}`, body: `${formatInr(balancePaise)} outstanding`,
        link: "/reminders?kind=PAYMENT", entityType: "ClientReminderDue", entityId: row.id, dedupeKey: `payment-escalation:${inv.id}`,
      });
      escalated += 1;
    }
  }
  return { created, escalated };
}

/** Daily job REMINDER_DUE_LISTS. Idempotent: rerunning on the same day creates nothing new. */
export async function runReminderDueLists(today = todayIst()) {
  const skipped = await expireStaleItems();
  const docs = await generateDocReminders(today);
  const payments = await generatePaymentReminders(today);
  return { skippedStale: skipped, docs: docs.created, docsEscalated: docs.escalated, payments: payments.created, paymentsEscalated: payments.escalated };
}

// ---------------------------------------------------------------------------------------------------------
// The lists and "Mark as sent"
// ---------------------------------------------------------------------------------------------------------

/** Which kinds the actor may see: client documents under task.work scope, payments under billing.view. */
async function visibleWhere(actor: Actor, kind: "CLIENT_DOCS" | "PAYMENT"): Promise<Prisma.ClientReminderDueWhereInput> {
  if (actor.kind === "PORTAL") throw forbidden();
  if (kind === "CLIENT_DOCS") {
    const scope = authorize(actor, "task.work");
    if (scope === "firm") return { kind };
    const tasks = await db().task.findMany({ where: { AND: [{ status: { in: OPEN_TASK } }, taskWhere(actor, scope)] }, select: { id: true } });
    return { kind, taskId: { in: tasks.map((t) => t.id) } };
  }
  if (actor.kind === "USER" && !can(actor, "billing.view")) throw forbidden();
  const scope = authorize(actor, "billing.view");
  if (scope === "firm" || scope === "firm_read") return { kind };
  const clients = await db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } });
  return { kind, clientId: { in: clients.map((c) => c.id) } };
}

export async function listDue(actor: Actor, f: { kind: "CLIENT_DOCS" | "PAYMENT"; status?: "DUE" | "SENT" | "SKIPPED" }) {
  const where = await visibleWhere(actor, f.kind);
  if ((f.status ?? "DUE") === "DUE") await expireStaleItems();
  const rows = await db().clientReminderDue.findMany({ where: { AND: [where, { status: f.status ?? "DUE" }] }, orderBy: [{ dueOn: "asc" }, { sequenceNo: "desc" }], take: 300 });
  const [clients, tasks, invoices, schedules, users] = await Promise.all([
    db().client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true } }),
    db().task.findMany({ where: { id: { in: rows.map((r) => r.taskId).filter((x): x is string => !!x) } }, select: { id: true, title: true, periodLabel: true, effectiveDueDate: true } }),
    db().invoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId).filter((x): x is string => !!x) } }, select: { id: true, number: true, totalPaise: true, receivedPaise: true } }),
    db().clientReminderSchedule.findMany({ where: { id: { in: rows.map((r) => r.scheduleId).filter((x): x is string => !!x) } }, select: { id: true, name: true, escalateAfter: true } }),
    db().user.findMany({ where: { id: { in: rows.map((r) => r.sentById).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } }),
  ]);
  const cn = new Map(clients.map((c) => [c.id, c.name]));
  const tm = new Map(tasks.map((t) => [t.id, t]));
  const im = new Map(invoices.map((i) => [i.id, i]));
  const sm = new Map(schedules.map((s) => [s.id, s]));
  const um = new Map(users.map((u) => [u.id, u.displayName]));
  const points = await getSetting<number[]>("billing.reminderDays", [15, 30, 60]);
  return rows.map((r) => {
    const t = r.taskId ? tm.get(r.taskId) : undefined;
    const inv = r.invoiceId ? im.get(r.invoiceId) : undefined;
    const sch = r.scheduleId ? sm.get(r.scheduleId) : undefined;
    return {
      id: r.id, kind: r.kind, clientId: r.clientId, clientName: cn.get(r.clientId) ?? "", dueOn: r.dueOn, sequenceNo: r.sequenceNo, channel: r.channel, messageText: r.messageText, status: r.status,
      taskId: r.taskId, about: t ? [t.title, t.periodLabel].filter(Boolean).join(" · ") : inv ? `Invoice ${inv.number}` : "",
      invoiceId: r.invoiceId, balancePaise: inv ? Math.max(0, inv.totalPaise - inv.receivedPaise) : null,
      escalate: r.kind === "CLIENT_DOCS" ? !!sch && r.sequenceNo > sch.escalateAfter : r.sequenceNo >= points.length,
      scheduleName: sch?.name ?? null, sentAt: r.sentAt, sentBy: r.sentById ? (um.get(r.sentById) ?? "") : null,
    };
  });
}

const sendInput = z.object({ channel: z.enum(["WHATSAPP", "EMAIL", "CALL", "PORTAL"]), messageText: z.string().trim().min(10, "The message is empty").max(8000) });

/** Record that the reminder went out (with the text as finally sent). Writes the reminder log in the same transaction. */
export async function markReminderSent(actor: Actor, id: string, input: z.input<typeof sendInput>) {
  if (actor.kind !== "USER") throw forbidden();
  const d = parse(sendInput, input);
  const r = await db().clientReminderDue.findUnique({ where: { id } });
  if (!r) throw notFound("Reminder");
  const where = await visibleWhere(actor, r.kind as "CLIENT_DOCS" | "PAYMENT");
  if (!(await db().clientReminderDue.count({ where: { AND: [where, { id }] } }))) throw notFound("Reminder");
  if (r.kind === "PAYMENT") authorize(actor, "billing.receipt.record"); // Managers see payments read-only
  if (r.status !== "DUE") throw ruleViolation("This reminder is already sent or skipped.");
  const pending = r.taskId ? await db().pendingRecord.findFirst({ where: { taskId: r.taskId, clearedAt: null } }) : null;
  return transaction(async (tx) => {
    const done = await tx.clientReminderDue.updateMany({ where: { id, status: "DUE" }, data: { status: "SENT" } });
    if (!done.count) throw ruleViolation("This reminder is already sent or skipped.");
    const log = await tx.reminderLog.create({
      data: { clientId: r.clientId, taskId: r.taskId, invoiceId: r.invoiceId, pendingRecordId: pending?.id ?? null, kind: r.kind, channel: d.channel, messageText: d.messageText, ruleCode: r.scheduleId ? `SCHEDULE:${r.scheduleId}` : r.kind === "PAYMENT" ? `PAYMENT:${r.sequenceNo}` : null, sentById: actor.userId, createdById: actor.userId },
    });
    const row = await tx.clientReminderDue.update({ where: { id }, data: { channel: d.channel, messageText: d.messageText, sentAt: log.sentAt, sentById: actor.userId, reminderLogId: log.id, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "ClientReminderDue", entityId: id, action: "SENT", after: { channel: d.channel, reminderLogId: log.id } });
    return row;
  });
}

export async function skipReminder(actor: Actor, id: string, reason: string) {
  if (actor.kind !== "USER") throw forbidden();
  if (reason.trim().length < 3) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  const r = await db().clientReminderDue.findUnique({ where: { id } });
  if (!r) throw notFound("Reminder");
  const where = await visibleWhere(actor, r.kind as "CLIENT_DOCS" | "PAYMENT");
  if (!(await db().clientReminderDue.count({ where: { AND: [where, { id }] } }))) throw notFound("Reminder");
  if (r.kind === "PAYMENT") authorize(actor, "billing.receipt.record");
  if (r.status !== "DUE") throw ruleViolation("This reminder is already sent or skipped.");
  await transaction(async (tx) => {
    await tx.clientReminderDue.update({ where: { id }, data: { status: "SKIPPED", updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "ClientReminderDue", entityId: id, action: "SKIP", reason: reason.trim() });
  });
}

/** Counts for the nav/home: client-document and payment reminders due now, within what the actor may see. */
export async function dueCounts(actor: Actor) {
  const out = { docs: 0, payments: 0 };
  if (actor.kind !== "USER") return out;
  if (can(actor, "task.work")) out.docs = await db().clientReminderDue.count({ where: { AND: [await visibleWhere(actor, "CLIENT_DOCS"), { status: "DUE" }] } });
  if (can(actor, "billing.view")) out.payments = await db().clientReminderDue.count({ where: { AND: [await visibleWhere(actor, "PAYMENT"), { status: "DUE" }] } });
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Portal: reminders the firm sent (P4-03 "also shown in portal")
// ---------------------------------------------------------------------------------------------------------

export async function portalReminders(actor: PortalActor, opts: { days?: number } = {}) {
  authorize(actor, "portal.use");
  const since = new Date(Date.now() - (opts.days ?? 60) * 86_400_000);
  const rows = await db().clientReminderDue.findMany({
    where: { clientId: { in: actor.clientIds }, status: "SENT", sentAt: { gte: since } },
    select: { id: true, clientId: true, kind: true, messageText: true, sentAt: true, taskId: true, invoiceId: true },
    orderBy: { sentAt: "desc" },
    take: 50,
  });
  // A payment reminder for an invoice paid since then, or documents received since, is shown as done.
  const openInvoices = new Set((await db().invoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId).filter((x): x is string => !!x) }, status: { in: OPEN_INVOICE } }, select: { id: true } })).map((i) => i.id));
  const stillRequested = new Set((await db().checklistItem.findMany({ where: { taskId: { in: rows.map((r) => r.taskId).filter((x): x is string => !!x) }, status: "REQUESTED" }, select: { taskId: true } })).map((i) => i.taskId!));
  return rows.map((r) => ({
    id: r.id, clientId: r.clientId, kind: r.kind, text: r.messageText, sentAt: r.sentAt!,
    open: r.kind === "PAYMENT" ? !!r.invoiceId && openInvoices.has(r.invoiceId) : !!r.taskId && stillRequested.has(r.taskId),
  }));
}

/** Compliance types for the schedule form. */
export async function listComplianceTypeOptions(actor: Actor) {
  authorize(actor, "settings.manage");
  return db().complianceType.findMany({ where: { active: true }, select: { code: true, name: true }, orderBy: { name: "asc" } });
}
