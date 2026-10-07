import { db, transaction } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import type { Actor, StaffActor } from "../../permissions/actor";
import { requireStaff } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";
import { loadTask, refreshStatus } from "../tasks/service";
import { notifyUsers } from "../notifications/service";
import { getSettingNumber } from "../settings/service";

const LEVEL_RANK: Record<string, number> = { SENIOR: 1, MANAGER: 2, PARTNER: 3 };

/** Can this person check work at this level? Articles never; plain Staff never (Product Spec 6.1). */
function fitsLevel(user: { role: string; isSenior: boolean }, level: string) {
  const rank = user.role === "PARTNER" ? 3 : user.role === "MANAGER" ? 2 : user.role === "STAFF" && user.isSenior ? 1 : 0;
  return rank >= (LEVEL_RANK[level] ?? 9);
}

/** Maker ≠ checker on the same task (Rules Spec scenario 11): anyone who made the work cannot approve it. */
async function isMakerOf(taskId: string, userId: string) {
  const roles = await db().taskAssignment.count({ where: { taskId, userId, role: { in: ["MAKER", "ASSIGNEE"] }, toDate: null } });
  const submitted = await db().reviewRequest.count({ where: { taskId, makerId: userId } });
  return roles + submitted > 0;
}

export async function submitForReview(actor: Actor, taskId: string, note = "") {
  requireStaff(actor);
  const t = await loadTask(actor, taskId, "task.work");
  if (t.underReview) throw ruleViolation("Already submitted for review.");
  if (!["IN_PROGRESS", "UPCOMING"].includes(t.status)) throw ruleViolation("Only work in progress can be submitted for review.");
  const stage = t.stageTemplateVersionId ? await db().stageDef.findUnique({ where: { versionId_index: { versionId: t.stageTemplateVersionId, index: t.stageIndex } } }) : null;
  if (!stage || stage.reviewLevel === "NONE") throw ruleViolation("The current stage does not need review — move to the next stage instead.");
  const assigned = await db().taskAssignment.findFirst({ where: { taskId, role: "CHECKER", toDate: null }, include: { user: true } });
  let checker = assigned?.user ?? null;
  if (!checker || !fitsLevel(checker, stage.reviewLevel)) {
    // Partner-level stages go to the client's Partner when the assigned checker is not one.
    if (stage.reviewLevel === "PARTNER") {
      const client = await db().client.findUniqueOrThrow({ where: { id: t.clientId }, include: { partner: true } });
      checker = client.partner;
    }
  }
  if (!checker || !fitsLevel(checker, stage.reviewLevel)) throw ruleViolation(`Assign a ${stage.reviewLevel.toLowerCase()}-level checker to this task first.`);
  if (checker.id === actor.userId) throw ruleViolation("You cannot be the checker of your own work.");
  const req = await transaction(async (tx) => {
    const r = await tx.reviewRequest.create({ data: { taskId, stageIndex: stage.index, level: stage.reviewLevel, makerId: actor.userId, checkerId: checker!.id, note, createdById: actor.userId } });
    await tx.task.update({ where: { id: taskId }, data: { underReview: true, underReviewSince: new Date() } });
    await writeAudit(tx, actor, { entityType: "ReviewRequest", entityId: r.id, action: "SUBMIT", after: { taskId, stage: stage.name, checkerId: checker!.id } });
    await refreshStatus(tx, actor, taskId, `Submitted for ${stage.reviewLevel.toLowerCase()} review`);
    return r;
  });
  await notifyUsers([checker.id], { kind: "REVIEW_ASSIGNED", title: `Review requested: ${t.title}`, body: note, link: `/tasks/${taskId}`, entityType: "Task", entityId: taskId, dedupeKey: `REVIEW|${req.id}` });
  return req;
}

async function loadRequest(actor: StaffActor, reviewId: string) {
  const r = await db().reviewRequest.findUnique({ where: { id: reviewId } });
  if (!r) throw notFound("Review");
  if (r.status !== "PENDING") throw ruleViolation("This review is already closed.");
  // The checker, or a Partner/Manager responsible for the task, may act — never the maker, never an Article.
  if (actor.role === "ARTICLE" || !can(actor, "review.check")) throw forbidden("Articles and plain Staff are never checkers.");
  await loadTask(actor, r.taskId, "review.check");
  if (await isMakerOf(r.taskId, actor.userId)) throw forbidden("You made this work, so you cannot check it (maker ≠ checker).");
  const me = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (r.checkerId !== actor.userId && !(actor.role === "PARTNER" || (actor.role === "MANAGER" && LEVEL_RANK[r.level]! <= 2))) throw forbidden("This review is assigned to someone else.");
  if (!fitsLevel(me, r.level)) throw forbidden(`This stage needs ${r.level.toLowerCase()}-level review.`);
  return r;
}

export async function approveReview(actor: Actor, reviewId: string, note = "") {
  requireStaff(actor);
  const r = await loadRequest(actor, reviewId);
  const open = await db().reviewPoint.count({ where: { reviewRequestId: reviewId, status: "OPEN" } });
  if (open) throw ruleViolation(`${open} review point(s) are still open.`);
  const t = await db().task.findUniqueOrThrow({ where: { id: r.taskId } });
  const stages = t.stageTemplateVersionId ? await db().stageDef.findMany({ where: { versionId: t.stageTemplateVersionId }, orderBy: { index: "asc" } }) : [];
  const nextIndex = Math.min(r.stageIndex + 1, Math.max(0, stages.length - 1));
  await transaction(async (tx) => {
    await tx.reviewRequest.update({ where: { id: reviewId }, data: { status: "APPROVED", decidedAt: new Date(), note: note || r.note, checkerId: actor.userId } });
    await tx.taskStage.upsert({
      where: { taskId_stageIndex: { taskId: r.taskId, stageIndex: r.stageIndex } },
      create: { taskId: r.taskId, stageIndex: r.stageIndex, name: stages[r.stageIndex]?.name ?? "", completedAt: new Date(), completedById: actor.userId },
      update: { completedAt: new Date(), completedById: actor.userId },
    });
    await tx.task.update({ where: { id: r.taskId }, data: { underReview: false, underReviewSince: null, stageIndex: nextIndex } });
    await writeAudit(tx, actor, { entityType: "ReviewRequest", entityId: reviewId, action: "APPROVE", reason: note });
    await refreshStatus(tx, actor, r.taskId, "Review approved");
  });
  await notifyUsers([r.makerId], { kind: "REVIEW_APPROVED", title: `Approved: ${t.title}`, link: `/tasks/${r.taskId}`, entityType: "Task", entityId: r.taskId });
}

export async function returnReview(actor: Actor, reviewId: string, points: string[]) {
  requireStaff(actor);
  const r = await loadRequest(actor, reviewId);
  const clean = points.map((p) => p.trim()).filter(Boolean);
  if (clean.length === 0) throw new DomainError("VALIDATION", "Add at least one review point.", { points: "Required" });
  const t = await db().task.findUniqueOrThrow({ where: { id: r.taskId } });
  await transaction(async (tx) => {
    await tx.reviewRequest.update({ where: { id: reviewId }, data: { status: "RETURNED", decidedAt: new Date(), checkerId: actor.userId } });
    for (const text of clean) await tx.reviewPoint.create({ data: { taskId: r.taskId, reviewRequestId: reviewId, text, raisedById: actor.userId, createdById: actor.userId } });
    await tx.task.update({ where: { id: r.taskId }, data: { underReview: false, underReviewSince: null } });
    await writeAudit(tx, actor, { entityType: "ReviewRequest", entityId: reviewId, action: "RETURN", after: { points: clean } });
    await refreshStatus(tx, actor, r.taskId, `Returned with ${clean.length} review point(s)`);
  });
  await notifyUsers([r.makerId], { kind: "REVIEW_RETURNED", title: `Returned with ${clean.length} point(s): ${t.title}`, link: `/tasks/${r.taskId}`, entityType: "Task", entityId: r.taskId });
}

/** Review points are separate items with raised/cleared by and on (P2-12). */
export async function respondToPoint(actor: Actor, pointId: string, response: string) {
  requireStaff(actor);
  const p = await db().reviewPoint.findUnique({ where: { id: pointId } });
  if (!p) throw notFound("Review point");
  await loadTask(actor, p.taskId, "task.work");
  await transaction(async (tx) => {
    await tx.reviewPoint.update({ where: { id: pointId }, data: { response, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "ReviewPoint", entityId: pointId, action: "RESPOND", after: { response } });
  });
}

export async function clearPoint(actor: Actor, pointId: string) {
  requireStaff(actor);
  const p = await db().reviewPoint.findUnique({ where: { id: pointId } });
  if (!p) throw notFound("Review point");
  if (p.status === "CLEARED") return;
  authorize(actor, "review.check");
  if (await isMakerOf(p.taskId, actor.userId)) throw forbidden("Only the checker clears review points.");
  await loadTask(actor, p.taskId);
  await transaction(async (tx) => {
    await tx.reviewPoint.update({ where: { id: pointId }, data: { status: "CLEARED", clearedById: actor.userId, clearedAt: new Date() } });
    await writeAudit(tx, actor, { entityType: "ReviewPoint", entityId: pointId, action: "CLEAR" });
  });
}

export async function raisePoint(actor: Actor, taskId: string, text: string) {
  requireStaff(actor);
  authorize(actor, "review.check");
  await loadTask(actor, taskId);
  if (await isMakerOf(taskId, actor.userId)) throw forbidden("Review points are raised by the checker.");
  if (!text.trim()) throw new DomainError("VALIDATION", "Write the point.");
  return transaction(async (tx) => {
    const pending = await tx.reviewRequest.findFirst({ where: { taskId, status: "PENDING" } });
    const p = await tx.reviewPoint.create({ data: { taskId, reviewRequestId: pending?.id ?? null, text: text.trim(), raisedById: actor.userId, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "ReviewPoint", entityId: p.id, action: "CREATE", after: { text } });
    return p;
  });
}

export async function waitingForMyReview(actor: Actor) {
  if (actor.kind !== "USER") return [];
  return db().reviewRequest.findMany({ where: { checkerId: actor.userId, status: "PENDING" }, include: { points: true }, orderBy: { submittedAt: "asc" } });
}

/**
 * Partner sign-off (and EQR where required) for audit-family tasks (Product Spec 6.1, 13.2).
 * Records who and when; where a UDIN is needed an "Awaiting UDIN" register row is opened (spec 6.4).
 */
export async function signOff(actor: Actor, taskId: string, level: "PARTNER" | "EQR", note = "") {
  requireStaff(actor);
  authorize(actor, level === "PARTNER" ? "signoff.final" : "eqr.perform");
  const t = await loadTask(actor, taskId);
  if (await isMakerOf(taskId, actor.userId)) throw forbidden("You made this work, so you cannot sign it off.");
  const engagement = t.engagementId ? await db().engagement.findUnique({ where: { id: t.engagementId } }) : null;
  const client = await db().client.findUniqueOrThrow({ where: { id: t.clientId } });
  const type = t.complianceTypeCode ? await db().complianceType.findUnique({ where: { code: t.complianceTypeCode } }) : null;
  const family = type ? await db().stageTemplateFamily.findUnique({ where: { code: type.familyCode } }) : null;
  const threshold = await getSettingNumber("eqr.feeThresholdPaise", 50_000_00);
  // One EQR rule for the whole app: the engagement-level test from QC (flag, public interest, audit fee
  // threshold), plus the task-level test for audit-family tasks without an engagement.
  const { eqrRequired } = await import("../qc/service");
  const eqrNeeded = (engagement ? await eqrRequired(engagement.id) : false) || (family?.code === "F4" && (client.publicInterest || (engagement?.feePaise ?? 0) >= threshold));
  const existing = await db().signOff.findMany({ where: { taskId } });
  if (existing.some((s) => s.level === level)) throw ruleViolation("Already signed off at this level.");
  if (level === "EQR" && !eqrNeeded) throw ruleViolation("EQR is not required for this engagement.");
  if (level === "EQR" && existing.some((s) => s.level === "PARTNER" && s.signedById === actor.userId)) throw forbidden("The EQR Partner must differ from the signing Partner.");
  if (level === "PARTNER" && existing.some((s) => s.level === "EQR" && s.signedById === actor.userId)) throw forbidden("The signing Partner must differ from the EQR Partner.");
  if (level === "PARTNER" && eqrNeeded && !existing.some((s) => s.level === "EQR")) throw ruleViolation("Engagement quality review must be completed before Partner sign-off.");
  return transaction(async (tx) => {
    let udinRecordId: string | null = null;
    if (level === "PARTNER" && family?.requiresUdin && !t.udinRecordId) {
      const u = await tx.uDINRecord.create({ data: { clientId: t.clientId, engagementId: t.engagementId, taskId, documentType: type?.name ?? t.title, signingDate: todayIst(), partnerId: actor.userId, status: "AWAITING", createdById: actor.userId } });
      udinRecordId = u.id;
    }
    const s = await tx.signOff.create({ data: { taskId, engagementId: t.engagementId, level, signedById: actor.userId, udinRecordId: udinRecordId ?? t.udinRecordId, note, createdById: actor.userId } });
    if (level === "PARTNER") await tx.task.update({ where: { id: taskId }, data: { signoffRecorded: true, ...(udinRecordId ? { udinRecordId } : {}) } });
    await writeAudit(tx, actor, { entityType: "SignOff", entityId: s.id, action: "SIGN_OFF", after: { taskId, level, udinRecordId } });
    return s;
  });
}
