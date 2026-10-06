import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { formatDate, todayIst, addDays } from "../../lib/dates";
import { loadTask, refreshStatus } from "../tasks/service";

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];

export async function addChecklistItem(actor: Actor, taskId: string, label: string) {
  const t = await loadTask(actor, taskId, "task.work");
  if (!label.trim()) throw new DomainError("VALIDATION", "Write the item.", { label: "Required" });
  return transaction(async (tx) => {
    const max = await tx.checklistItem.aggregate({ where: { taskId }, _max: { sortOrder: true } });
    const i = await tx.checklistItem.create({ data: { clientId: t.clientId, engagementId: t.engagementId, taskId, label: label.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ChecklistItem", entityId: i.id, action: "CREATE", after: { label } });
    return i;
  });
}

const itemUpdate = z.object({ status: z.enum(["NOT_REQUESTED", "REQUESTED", "RECEIVED", "NOT_APPLICABLE"]).optional(), note: z.string().optional(), confirm: z.boolean().optional() });

/** Requested / Received / Not Applicable with dates, a note per item, staff confirmation of portal uploads (spec 5.4). */
export async function updateChecklistItem(actor: Actor, itemId: string, input: z.input<typeof itemUpdate>) {
  const d = parse(itemUpdate, input);
  const item = await db().checklistItem.findUnique({ where: { id: itemId } });
  if (!item?.taskId) throw notFound("Checklist item");
  await loadTask(actor, item.taskId, "task.work");
  const today = todayIst();
  await transaction(async (tx) => {
    const data: Record<string, unknown> = { updatedById: idOf(actor) };
    if (d.note !== undefined) data.note = d.note;
    if (d.status) {
      data.status = d.status;
      if (d.status === "REQUESTED" && !item.requestedAt) data.requestedAt = today;
      if (d.status === "RECEIVED") {
        data.receivedAt = item.receivedAt ?? today;
        data.receivedPendingConfirm = false;
        data.confirmedById = idOf(actor);
        data.confirmedAt = new Date();
      }
    }
    if (d.confirm && item.receivedPendingConfirm) Object.assign(data, { receivedPendingConfirm: false, confirmedById: idOf(actor), confirmedAt: new Date(), status: "RECEIVED" });
    await tx.checklistItem.update({ where: { id: itemId }, data });
    await writeAudit(tx, actor, { entityType: "ChecklistItem", entityId: itemId, action: "UPDATE", before: { status: item.status, note: item.note }, after: data });
    await autoClearPending(tx, actor, item.taskId!);
  });
}

export async function markAllRequested(actor: Actor, taskId: string) {
  await loadTask(actor, taskId, "task.work");
  const today = todayIst();
  await transaction(async (tx) => {
    const r = await tx.checklistItem.updateMany({ where: { taskId, status: "NOT_REQUESTED" }, data: { status: "REQUESTED", requestedAt: today, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: taskId, action: "CHECKLIST_REQUESTED", after: { items: r.count } });
  });
}

/** When every item a pending record waits on is received (and confirmed) or not applicable, the task resumes (D-08). */
async function autoClearPending(tx: Tx, actor: Actor, taskId: string) {
  const open = await tx.pendingRecord.findFirst({ where: { taskId, clearedAt: null }, include: { items: true } });
  if (!open || open.items.length === 0) return;
  const items = await tx.checklistItem.findMany({ where: { id: { in: open.items.map((i) => i.checklistItemId) } } });
  const done = items.every((i) => (i.status === "RECEIVED" && !i.receivedPendingConfirm) || i.status === "NOT_APPLICABLE");
  if (!done) return;
  await tx.pendingRecord.update({ where: { id: open.id }, data: { clearedAt: new Date(), clearedById: idOf(actor), clearedReason: "All requested items received" } });
  await tx.task.update({ where: { id: taskId }, data: { pendingFromClient: false, pendingSince: null } });
  await refreshStatus(tx, actor, taskId, "All requested items received");
}

const pendingInput = z.object({ what: z.string().trim().min(3, "Say what is pending"), itemIds: z.array(z.string()).default([]) });

/** Any task can move to Pending from Client, recording what and since when (spec 5.4). */
export async function setPending(actor: Actor, taskId: string, input: z.input<typeof pendingInput>) {
  const t = await loadTask(actor, taskId, "task.work");
  const d = parse(pendingInput, input);
  if (CLOSED.includes(t.status)) throw ruleViolation("This task is closed.");
  if (t.underReview) throw ruleViolation("The task is with the checker.");
  if (t.pendingFromClient) throw ruleViolation("Already pending from the client — add items to the existing request or clear it first.");
  const today = todayIst();
  await transaction(async (tx) => {
    const rec = await tx.pendingRecord.create({ data: { taskId, what: d.what, since: today, createdById: idOf(actor), items: { create: d.itemIds.map((checklistItemId) => ({ checklistItemId })) } } });
    if (d.itemIds.length) await tx.checklistItem.updateMany({ where: { id: { in: d.itemIds }, status: "NOT_REQUESTED" }, data: { status: "REQUESTED", requestedAt: today } });
    await tx.task.update({ where: { id: taskId }, data: { pendingFromClient: true, pendingSince: today } });
    await writeAudit(tx, actor, { entityType: "PendingRecord", entityId: rec.id, action: "CREATE", after: d });
    await refreshStatus(tx, actor, taskId, `Pending from client: ${d.what}`);
  });
}

export async function clearPending(actor: Actor, taskId: string, reason: string) {
  const t = await loadTask(actor, taskId, "task.work");
  if (!t.pendingFromClient) throw ruleViolation("The task is not pending from the client.");
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  await transaction(async (tx) => {
    await tx.pendingRecord.updateMany({ where: { taskId, clearedAt: null }, data: { clearedAt: new Date(), clearedById: idOf(actor), clearedReason: reason } });
    await tx.task.update({ where: { id: taskId }, data: { pendingFromClient: false, pendingSince: null } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: taskId, action: "PENDING_CLEARED", reason });
    await refreshStatus(tx, actor, taskId, `Resumed: ${reason}`);
  });
}

/**
 * "Copy pending list" (P2-16): a clean message for WhatsApp / email built from the open checklist
 * items. Nothing is sent from the app; staff copy it and press "Mark as sent" (brief §4).
 */
export async function pendingMessage(actor: Actor, taskId: string) {
  const t = await loadTask(actor, taskId);
  const [client, items, me] = await Promise.all([
    db().client.findUniqueOrThrow({ where: { id: t.clientId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } }),
    db().checklistItem.findMany({ where: { taskId, status: "REQUESTED" }, orderBy: { sortOrder: "asc" } }),
    actor.kind === "USER" ? db().user.findUnique({ where: { id: actor.userId } }) : null,
  ]);
  const contact = client.contacts[0]?.name ?? client.name;
  const by = t.effectiveDueDate ? formatDate(addDays(t.effectiveDueDate, -5) > todayIst() ? addDays(t.effectiveDueDate, -5) : todayIst()) : null;
  const lines = [
    `Dear ${contact},`,
    "",
    `For ${t.title} (${client.name}) we are waiting for the following:`,
    ...(items.length ? items.map((i, n) => `${n + 1}. ${i.label}${i.note ? ` — ${i.note}` : ""}`) : ["(no items marked as requested)"]),
    "",
    by ? `Kindly share these by ${by}${t.effectiveDueDate ? ` so we can file before the due date of ${formatDate(t.effectiveDueDate)}` : ""}.` : "Kindly share these at the earliest.",
    "",
    `Regards,`,
    `${me?.displayName ?? "QEPEX India"}`,
    "QEPEX India",
  ];
  return { text: lines.join("\n"), items: items.length, channel: client.preferredChannel };
}

const reminderInput = z.object({ channel: z.enum(["CALL", "EMAIL", "WHATSAPP", "MEETING"]), messageText: z.string().default(""), note: z.string().default("") });

/** Reminder log of every follow-up with date and person (spec 5.4); also the "Mark as sent" button. */
export async function logReminder(actor: Actor, taskId: string, input: z.input<typeof reminderInput>) {
  const t = await loadTask(actor, taskId, "task.work");
  const d = parse(reminderInput, input);
  const pending = await db().pendingRecord.findFirst({ where: { taskId, clearedAt: null } });
  return transaction(async (tx) => {
    const r = await tx.reminderLog.create({
      data: { clientId: t.clientId, taskId, pendingRecordId: pending?.id ?? null, kind: "CLIENT_DOCS", channel: d.channel, messageText: d.messageText || d.note, sentById: idOf(actor), createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "ReminderLog", entityId: r.id, action: "CREATE", after: { channel: d.channel } });
    return r;
  });
}
