import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import { assertClientAccess, taskWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, todayIst, weekStart, isIsoDate } from "../../lib/dates";
import { checkFiling, checkNotApplicable, evaluateStatus, displayState, lateFeeExposure, type TaskStatus } from "../../compliance-engine";
import { notifyUsers } from "../notifications/service";
import type { Prisma } from "@/generated/prisma/client";
import type { Capability } from "../../permissions/matrix";

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
const OPEN: TaskStatus[] = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

/** Load a task the actor may see under a capability, or throw. */
export async function loadTask(actor: Actor, taskId: string, cap: Capability = "task.view") {
  const scope = authorize(actor, cap);
  const t = await db().task.findFirst({ where: { AND: [{ id: taskId }, taskWhere(actor, scope)] } });
  if (!t) {
    if (await db().task.count({ where: { id: taskId } })) throw forbidden();
    throw notFound("Task");
  }
  return t;
}

/** Re-evaluate the computed status after any change to stage, work, pending or review (Rules Spec 8). */
export async function refreshStatus(tx: Tx, actor: Actor, taskId: string, reason: string) {
  const t = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
  const workEntryCount = await tx.workEntry.count({ where: { taskId, deletedAt: null } });
  const next = evaluateStatus({ status: t.status as TaskStatus, stageIndex: t.stageIndex, workEntryCount, pendingFromClient: t.pendingFromClient, underReview: t.underReview });
  if (next !== t.status) {
    await tx.task.update({ where: { id: taskId }, data: { status: next } });
    await tx.taskStatusHistory.create({ data: { taskId, fromStatus: t.status, toStatus: next, reason, createdById: idOf(actor) } });
  }
  return next;
}

export type TaskFilter = {
  mine?: boolean;
  status?: string;
  serviceLine?: string;
  assigneeId?: string;
  clientId?: string;
  q?: string;
  includeClosed?: boolean;
  dueTo?: string;
  /** Open tasks past their due date as on this day (dashboard drill-down). */
  overdueOn?: string;
  take?: number;
};

export async function listTasks(actor: Actor, f: TaskFilter = {}) {
  const scope = authorize(actor, "task.view");
  const me = idOf(actor);
  const where: Prisma.TaskWhereInput = {
    AND: [
      taskWhere(actor, scope),
      f.mine && me ? { assignments: { some: { userId: me, toDate: null } } } : {},
      f.assigneeId ? { assignments: { some: { userId: f.assigneeId, toDate: null, role: { in: ["ASSIGNEE", "MAKER"] } } } } : {},
      f.status ? { status: f.status } : f.includeClosed ? {} : { status: { in: OPEN } },
      f.clientId ? { clientId: f.clientId } : {},
      f.serviceLine ? { engagement: { serviceLine: f.serviceLine } } : {},
      f.q ? { OR: [{ title: { contains: f.q } }, { client: { searchName: { contains: f.q.toLowerCase() } } }] } : {},
      f.dueTo ? { OR: [{ effectiveDueDate: { lte: f.dueTo } }, { effectiveDueDate: null }] } : {},
      f.overdueOn ? { status: { in: OPEN }, effectiveDueDate: { lt: f.overdueOn } } : {},
    ],
  };
  return db().task.findMany({
    where,
    include: {
      client: { select: { id: true, code: true, name: true } },
      engagement: { select: { id: true, serviceLine: true } },
      assignments: { where: { toDate: null }, include: { user: { select: { id: true, displayName: true } } } },
    },
    orderBy: [{ effectiveDueDate: "asc" }, { title: "asc" }],
    take: f.take ?? 1000,
  });
}

/** Overdue / This week / Next week / Later grouping (P2-09) — same definition as the Home strip (P2-01). */
export function groupByDue<T extends { effectiveDueDate: string | null }>(tasks: T[], today = todayIst()) {
  const thisWeekEnd = addDays(weekStart(today), 6);
  const nextWeekEnd = addDays(thisWeekEnd, 7);
  const groups = { overdue: [] as T[], thisWeek: [] as T[], nextWeek: [] as T[], later: [] as T[], noDate: [] as T[] };
  for (const t of tasks) {
    const d = t.effectiveDueDate;
    if (!d) groups.noDate.push(t);
    else if (d < today) groups.overdue.push(t);
    else if (d <= thisWeekEnd) groups.thisWeek.push(t);
    else if (d <= nextWeekEnd) groups.nextWeek.push(t);
    else groups.later.push(t);
  }
  return groups;
}

export async function getTask(actor: Actor, taskId: string) {
  await loadTask(actor, taskId);
  const t = await db().task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      client: { select: { id: true, code: true, name: true, partnerId: true, managerId: true, publicInterest: true } },
      engagement: { select: { id: true, code: true, name: true, serviceLine: true, budgetMinutes: true, eqrRequired: true, feePaise: true } },
      gstin: { select: { gstin: true, stateCode: true, frequency: true } },
      director: { select: { name: true, din: true } },
      stageTemplateVersion: { include: { stages: { orderBy: { index: "asc" } } } },
      stages: { orderBy: { stageIndex: "asc" } },
      assignments: { where: { toDate: null }, include: { user: { select: { id: true, displayName: true, role: true, isSenior: true } } } },
      statusHistory: { orderBy: { changedAt: "desc" } },
      dueDateHistory: { orderBy: { changedAt: "desc" } },
      acknowledgments: true,
    },
  });
  const [checklist, pending, reviews, signOffs, minutesByUser, udin, type, rates] = await Promise.all([
    db().checklistItem.findMany({ where: { taskId }, orderBy: { sortOrder: "asc" } }),
    db().pendingRecord.findMany({ where: { taskId }, include: { items: true }, orderBy: { createdAt: "desc" } }),
    db().reviewRequest.findMany({ where: { taskId }, include: { points: { orderBy: { raisedAt: "asc" } } }, orderBy: { submittedAt: "desc" } }),
    db().signOff.findMany({ where: { taskId }, orderBy: { signedAt: "asc" } }),
    db().workEntry.groupBy({ by: ["userId"], where: { taskId, deletedAt: null }, _sum: { minutes: true } }),
    t.udinRecordId ? db().uDINRecord.findUnique({ where: { id: t.udinRecordId } }) : null,
    t.complianceTypeCode ? db().complianceType.findUnique({ where: { code: t.complianceTypeCode } }) : null,
    t.complianceTypeCode ? db().lateFeeRate.findMany({ where: { complianceTypeCode: t.complianceTypeCode } }) : [],
  ]);
  const reminderLogs = await db().reminderLog.findMany({ where: { taskId }, orderBy: { sentAt: "desc" } });
  const users = await db().user.findMany({ where: { id: { in: [...minutesByUser.map((m) => m.userId), ...reviews.flatMap((r) => [r.makerId, r.checkerId ?? ""]), ...signOffs.map((s) => s.signedById)] } }, select: { id: true, displayName: true } });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const family = type ? await db().stageTemplateFamily.findUnique({ where: { code: type.familyCode } }) : null;
  const today = todayIst();
  const dscWarnings = await dscWarningsFor(t.clientId, t.stageTemplateVersion?.stages[t.stageIndex]?.requiresDsc ?? false, today);
  return {
    ...t,
    checklist,
    pending,
    reviews: reviews.map((r) => ({ ...r, makerName: names.get(r.makerId) ?? "", checkerName: r.checkerId ? names.get(r.checkerId) ?? "" : "" })),
    signOffs: signOffs.map((s) => ({ ...s, signedByName: names.get(s.signedById) ?? "" })),
    hours: minutesByUser.map((m) => ({ userId: m.userId, name: names.get(m.userId) ?? "", minutes: m._sum.minutes ?? 0 })),
    reminderLogs,
    udin,
    type,
    family,
    display: displayState(t.status as TaskStatus, t.effectiveDueDate, today),
    exposure: lateFeeExposure({ effectiveDueDate: t.effectiveDueDate, filedDate: t.filedDate, taxDuePaise: t.taxDuePaise }, rates, today),
    dscWarnings,
    clientWaitingDays: waitingDays(pending, today),
  };
}

/** Days the task spent waiting on the client (kept separate from firm-work days, spec 5.4). */
export function waitingDays(records: { since: string; clearedAt: Date | null }[], today: string) {
  let days = 0;
  for (const r of records) {
    const end = r.clearedAt ? r.clearedAt.toISOString().slice(0, 10) : today;
    days += Math.max(0, Math.round((Date.parse(end) - Date.parse(r.since)) / 86_400_000));
  }
  return days;
}

/** DSC needed but not in office, or expiring within 7 days (P2-15). */
export async function dscWarningsFor(clientId: string, stageNeedsDsc: boolean, today: string) {
  if (!stageNeedsDsc) return [];
  const dscs = await db().dSC.findMany({ where: { active: true, clients: { some: { clientId } } } });
  if (dscs.length === 0) return ["No DSC is registered for this client."];
  const out: string[] = [];
  for (const d of dscs) {
    if (d.expiryDate < today) out.push(`DSC of ${d.holderName} expired on ${d.expiryDate}.`);
    else if (d.expiryDate <= addDays(today, 7)) out.push(`DSC of ${d.holderName} expires on ${d.expiryDate}.`);
    if (d.custody !== "OFFICE") out.push(`DSC of ${d.holderName} is not in the office (with ${d.custody.toLowerCase()}).`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
export async function moveStage(actor: Actor, taskId: string, toIndex: number, note = "") {
  const t = await loadTask(actor, taskId, "task.work");
  if (!OPEN.includes(t.status as TaskStatus)) throw ruleViolation("This task is closed.");
  if (t.underReview) throw ruleViolation("The task is with the checker. Wait for approval or ask them to return it.");
  const stages = t.stageTemplateVersionId ? await db().stageDef.findMany({ where: { versionId: t.stageTemplateVersionId }, orderBy: { index: "asc" } }) : [];
  if (toIndex < 0 || toIndex >= stages.length) throw new DomainError("VALIDATION", "Unknown stage.");
  if (toIndex === t.stageIndex) return t;
  if (toIndex > t.stageIndex) {
    const approved = new Set((await db().reviewRequest.findMany({ where: { taskId, status: "APPROVED" } })).map((r) => r.stageIndex));
    for (const s of stages.slice(t.stageIndex, toIndex)) {
      if (s.reviewLevel !== "NONE" && !approved.has(s.index)) throw ruleViolation(`"${s.name}" needs ${s.reviewLevel.toLowerCase()} review before moving on. Submit it for review.`);
      if (s.isFiling) throw ruleViolation(`Use "Record filing" to complete "${s.name}" — it needs the acknowledgment number.`);
      if (s.isClientApproval && !note.trim()) throw new DomainError("VALIDATION", `Say how the client approved (${s.name}).`, { note: "Required" });
    }
  } else if (!note.trim()) {
    throw new DomainError("VALIDATION", "Give a reason for moving back.", { note: "Required" });
  }
  return transaction(async (tx) => {
    for (const s of stages.slice(Math.min(t.stageIndex, toIndex), Math.max(t.stageIndex, toIndex))) {
      await tx.taskStage.upsert({
        where: { taskId_stageIndex: { taskId, stageIndex: s.index } },
        create: { taskId, stageIndex: s.index, name: s.name, completedAt: toIndex > t.stageIndex ? new Date() : null, completedById: toIndex > t.stageIndex ? idOf(actor) : null, createdById: idOf(actor) },
        update: toIndex > t.stageIndex ? { completedAt: new Date(), completedById: idOf(actor) } : { completedAt: null, completedById: null },
      });
    }
    const after = await tx.task.update({ where: { id: taskId }, data: { stageIndex: toIndex, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: taskId, action: "STAGE", before: { stage: stages[t.stageIndex]?.name }, after: { stage: stages[toIndex]?.name }, reason: note });
    await refreshStatus(tx, actor, taskId, `Stage moved to ${stages[toIndex]?.name}`);
    return after;
  });
}

// ---------------------------------------------------------------------------
// Filing, Not Applicable, amendments
// ---------------------------------------------------------------------------
const filingInput = z.object({ ackNumber: z.string().trim(), filedDate: z.string(), ackType: z.string().optional() });

export async function recordFiling(actor: Actor, taskId: string, input: z.input<typeof filingInput>) {
  const t = await loadTask(actor, taskId, "task.recordFiling");
  const d = parse(filingInput, input);
  if (d.filedDate && (!isIsoDate(d.filedDate) || d.filedDate > todayIst())) throw new DomainError("VALIDATION", "Filing date cannot be in the future.", { filedDate: "Check the date" });
  const type = t.complianceTypeCode ? await db().complianceType.findUnique({ where: { code: t.complianceTypeCode } }) : null;
  const family = type ? await db().stageTemplateFamily.findUnique({ where: { code: type.familyCode } }) : null;
  const stages = t.stageTemplateVersionId ? await db().stageDef.findMany({ where: { versionId: t.stageTemplateVersionId }, orderBy: { index: "asc" } }) : [];
  const filingIdx = stages.findIndex((s) => s.isFiling);
  const approved = new Set((await db().reviewRequest.findMany({ where: { taskId, status: "APPROVED" } })).map((r) => r.stageIndex));
  const reviewOutstanding = stages.some((s) => s.reviewLevel !== "NONE" && (filingIdx < 0 || s.index < filingIdx) && !approved.has(s.index));
  const openReviewPoints = await db().reviewPoint.count({ where: { taskId, status: "OPEN" } });
  const udin = t.udinRecordId ? await db().uDINRecord.findUnique({ where: { id: t.udinRecordId } }) : null;
  const check = checkFiling({
    status: t.status as TaskStatus, ackNumber: d.ackNumber, filedDate: d.filedDate || null, effectiveDueDate: t.effectiveDueDate,
    requiresSignoff: Boolean(family?.requiresSignoff), signoffRecorded: t.signoffRecorded, requiresUdin: Boolean(family?.requiresUdin), udin: udin?.udin,
    openReviewPoints, reviewOutstanding,
  });
  if (!check.ok) throw ruleViolation(check.reason);
  const ackType = d.ackType || t.ackType || type?.ackType || "ACK";
  return transaction(async (tx) => {
    const after = await tx.task.update({
      where: { id: taskId },
      data: {
        status: check.status, ackType, ackNumber: d.ackNumber, filedDate: d.filedDate, filedById: idOf(actor), closedAt: new Date(),
        pendingFromClient: false, underReview: false, stageIndex: filingIdx >= 0 ? filingIdx : t.stageIndex, updatedById: idOf(actor),
      },
    });
    await tx.acknowledgment.create({ data: { taskId, ackType, number: d.ackNumber, date: d.filedDate, createdById: idOf(actor) } });
    await tx.pendingRecord.updateMany({ where: { taskId, clearedAt: null }, data: { clearedAt: new Date(), clearedById: idOf(actor), clearedReason: "Filed" } });
    await tx.taskStatusHistory.create({ data: { taskId, fromStatus: t.status, toStatus: check.status, reason: `${ackType} ${d.ackNumber}`, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: taskId, action: "FILED", before: { status: t.status }, after: { status: check.status, ackType, ackNumber: d.ackNumber, filedDate: d.filedDate } });
    return after;
  });
}

export async function markNotApplicable(actor: Actor, taskId: string, reason: string) {
  const t = await loadTask(actor, taskId, "task.notApplicable");
  const check = checkNotApplicable(t.status as TaskStatus, reason);
  if (!check.ok) throw ruleViolation(check.reason);
  return transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: "NOT_APPLICABLE", notApplicableReason: reason, closedAt: new Date(), pendingFromClient: false, underReview: false } });
    await tx.taskStatusHistory.create({ data: { taskId, fromStatus: t.status, toStatus: "NOT_APPLICABLE", reason, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: taskId, action: "STATUS", before: { status: t.status }, after: { status: "NOT_APPLICABLE" }, reason });
  });
}

/** A post-filing amendment is a new linked task, never a reopened one (Rules Spec 8.1). */
export async function createAmendment(actor: Actor, taskId: string, dueDate: string | null) {
  const t = await loadTask(actor, taskId, "task.bulk");
  if (t.status !== "FILED" && t.status !== "FILED_LATE") throw ruleViolation("Only a filed task can be amended.");
  return transaction(async (tx) => {
    const n = await tx.task.create({
      data: {
        clientId: t.clientId, engagementId: t.engagementId, title: `Revised: ${t.title}`, periodKey: t.periodKey, periodLabel: t.periodLabel, periodStart: t.periodStart, periodEnd: t.periodEnd,
        originalDueDate: dueDate, effectiveDueDate: dueDate, stageTemplateVersionId: t.stageTemplateVersionId, gstinId: t.gstinId, directorId: t.directorId,
        amendsTaskId: t.id, isOneOff: true, ackType: t.ackType, createdById: idOf(actor),
      },
    });
    await tx.taskStatusHistory.create({ data: { taskId: n.id, toStatus: "UPCOMING", reason: `Amendment of ${t.title}`, createdById: idOf(actor) } });
    const owners = await tx.taskAssignment.findMany({ where: { taskId, toDate: null } });
    for (const o of owners) await tx.taskAssignment.create({ data: { taskId: n.id, userId: o.userId, role: o.role, fromDate: todayIst(), createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: n.id, action: "CREATE", after: { amends: t.id, title: n.title } });
    return n;
  });
}

const oneOffInput = z.object({ clientId: z.string(), engagementId: z.string().nullable().optional(), title: z.string().trim().min(3), dueDate: z.string().nullable().optional(), assigneeId: z.string().nullable().optional() });

/** Explicit one-off task (catch-up filings, ad-hoc work) — Rules Spec 3.3. */
export async function createOneOffTask(actor: Actor, input: z.input<typeof oneOffInput>) {
  const d = parse(oneOffInput, input);
  await assertClientAccess(actor, "task.bulk", d.clientId);
  if (d.dueDate && !isIsoDate(d.dueDate)) throw new DomainError("VALIDATION", "Invalid due date.", { dueDate: "Check the date" });
  const engagement = d.engagementId ? await db().engagement.findFirst({ where: { id: d.engagementId, clientId: d.clientId } }) : null;
  if (d.engagementId && !engagement) throw notFound("Engagement");
  return transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        clientId: d.clientId, engagementId: engagement?.id ?? null, title: d.title, periodKey: `ONEOFF-${Date.now()}`, originalDueDate: d.dueDate ?? null,
        effectiveDueDate: d.dueDate ?? null, stageTemplateVersionId: engagement?.stageTemplateVersionId ?? null, isOneOff: true, createdById: idOf(actor),
      },
    });
    await tx.taskStatusHistory.create({ data: { taskId: t.id, toStatus: "UPCOMING", reason: "One-off task", createdById: idOf(actor) } });
    if (d.assigneeId) {
      for (const role of ["ASSIGNEE", "MAKER"]) await tx.taskAssignment.create({ data: { taskId: t.id, userId: d.assigneeId, role, fromDate: todayIst(), createdById: idOf(actor) } });
    }
    await writeAudit(tx, actor, { entityType: "Task", entityId: t.id, action: "CREATE", after: d });
    return t;
  });
}

export async function setTaxDue(actor: Actor, taskId: string, rupees: number | null) {
  await loadTask(actor, taskId, "task.work");
  await transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { taxDuePaise: rupees === null ? null : Math.round(rupees * 100) } });
    await writeAudit(tx, actor, { entityType: "Task", entityId: taskId, action: "TAX_DUE", after: { rupees } });
  });
}

// ---------------------------------------------------------------------------
// Bulk actions for Managers (P2-10)
// ---------------------------------------------------------------------------
async function eligiblePerson(userId: string, as: "MAKER" | "CHECKER") {
  const u = await db().user.findUnique({ where: { id: userId } });
  if (!u || !u.active) throw ruleViolation("Choose an active person.");
  if (["HR_ADMIN", "PRACTICE_ADMIN"].includes(u.role)) throw ruleViolation("Admins are not assigned to client work.");
  if (as === "CHECKER" && u.role === "ARTICLE") throw ruleViolation("Article Assistants are never checkers.");
  if (as === "CHECKER" && u.role === "STAFF" && !u.isSenior) throw ruleViolation("Only Seniors, Managers and Partners can be checkers.");
  return u;
}

async function bulkTasks(actor: Actor, taskIds: string[]) {
  const scope = authorize(actor, "task.bulk");
  const tasks = await db().task.findMany({ where: { AND: [{ id: { in: taskIds } }, taskWhere(actor, scope)] } });
  if (tasks.length !== new Set(taskIds).size) throw forbidden("Some of the selected tasks are outside your team.");
  return tasks;
}

export async function bulkReassign(actor: Actor, taskIds: string[], userId: string) {
  const tasks = await bulkTasks(actor, taskIds);
  await eligiblePerson(userId, "MAKER");
  const today = todayIst();
  await transaction(async (tx) => {
    for (const t of tasks) {
      const checker = await tx.taskAssignment.findFirst({ where: { taskId: t.id, role: "CHECKER", toDate: null } });
      if (checker?.userId === userId) throw ruleViolation(`${t.title}: the new maker is its checker (maker and checker must differ).`);
      await tx.taskAssignment.updateMany({ where: { taskId: t.id, role: { in: ["ASSIGNEE", "MAKER"] }, toDate: null }, data: { toDate: today } });
      for (const role of ["ASSIGNEE", "MAKER"]) await tx.taskAssignment.create({ data: { taskId: t.id, userId, role, fromDate: today, createdById: idOf(actor) } });
      await writeAudit(tx, actor, { entityType: "Task", entityId: t.id, action: "REASSIGN", after: { userId } });
    }
  });
  await notifyUsers([userId], { kind: "ASSIGNED", title: `${tasks.length} task(s) assigned to you`, link: "/tasks?mine=1" });
  return tasks.length;
}

export async function bulkChangeChecker(actor: Actor, taskIds: string[], userId: string) {
  const tasks = await bulkTasks(actor, taskIds);
  await eligiblePerson(userId, "CHECKER");
  const today = todayIst();
  await transaction(async (tx) => {
    for (const t of tasks) {
      const maker = await tx.taskAssignment.findFirst({ where: { taskId: t.id, role: "MAKER", toDate: null, userId } });
      if (maker) throw ruleViolation(`${t.title}: this person is its maker (maker and checker must differ).`);
      await tx.taskAssignment.updateMany({ where: { taskId: t.id, role: "CHECKER", toDate: null }, data: { toDate: today } });
      await tx.taskAssignment.create({ data: { taskId: t.id, userId, role: "CHECKER", fromDate: today, createdById: idOf(actor) } });
      await tx.reviewRequest.updateMany({ where: { taskId: t.id, status: "PENDING" }, data: { checkerId: userId } });
      await writeAudit(tx, actor, { entityType: "Task", entityId: t.id, action: "CHANGE_CHECKER", after: { userId } });
    }
  });
  return tasks.length;
}

export async function bulkNotApplicable(actor: Actor, taskIds: string[], reason: string) {
  const tasks = await bulkTasks(actor, taskIds);
  if (!can(actor, "task.notApplicable")) throw forbidden();
  for (const t of tasks) await markNotApplicable(actor, t.id, reason);
  return tasks.length;
}
