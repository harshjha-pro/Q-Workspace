import { z } from "zod";
import { db, transaction, type Prisma } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { can, scopeOf } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { notifyUsers } from "../notifications/service";
import { idOf, isHrOrPartner, minutesToHoursText, namesOf, seesClientNames, staffId, zIso } from "./common";
import { exposureByServiceLine } from "./articleship";

// ---------------------------------------------------------------------------
// Appraisals and goals (spec 11.8, P3-20)
// ---------------------------------------------------------------------------

export const CYCLE_STATUSES = ["GOAL_SETTING", "SELF_REVIEW", "MANAGER_REVIEW", "MODERATION", "CLOSED"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];
export const CYCLE_LABELS: Record<CycleStatus, string> = { GOAL_SETTING: "Goal setting", SELF_REVIEW: "Self-review", MANAGER_REVIEW: "Manager review", MODERATION: "Partner moderation", CLOSED: "Closed" };
export const REVIEW_LABELS: Record<string, string> = { OPEN: "Open", SELF_SUBMITTED: "Self-review done", MANAGER_SUBMITTED: "Manager review done", FINAL: "Final" };
export const RATING_LABELS: Record<number, string> = { 1: "Needs improvement", 2: "Developing", 3: "Meets expectations", 4: "Exceeds expectations", 5: "Outstanding" };

const APPRAISED_ROLES = ["MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN", "HR_ADMIN"];

const cycleInput = z.object({
  name: z.string().trim().min(2, "Name the cycle").max(120),
  kind: z.enum(["ANNUAL", "HALF_YEARLY"]),
  startDate: zIso,
  endDate: zIso,
  userIds: z.array(z.string()).optional(),
});

/** Start a cycle (HR or Partner): one review per person, Manager = reporting manager, Partner = moderator. */
export async function createCycle(actor: Actor, input: z.input<typeof cycleInput>) {
  if (!isHrOrPartner(actor)) throw forbidden();
  const p = parse(cycleInput, input);
  if (p.endDate <= p.startDate) throw new DomainError("VALIDATION", "End must be after start.", { endDate: "End must be after start" });
  const people = await db().user.findMany({
    where: { active: true, isSystem: false, role: { in: APPRAISED_ROLES }, ...(p.userIds?.length ? { id: { in: p.userIds } } : {}) },
    include: { reportingManager: { select: { id: true, role: true, reportingManagerId: true } } },
  });
  const firstPartner = await db().user.findFirst({ where: { role: "PARTNER", active: true }, orderBy: { createdAt: "asc" } });
  const cycle = await transaction(async (tx) => {
    const c = await tx.appraisalCycle.create({ data: { name: p.name, kind: p.kind, startDate: p.startDate, endDate: p.endDate, createdById: idOf(actor) } });
    for (const u of people) {
      const rm = u.reportingManager;
      const partnerId = rm?.role === "PARTNER" ? rm.id : rm?.reportingManagerId ?? firstPartner?.id ?? null;
      await tx.appraisalReview.create({ data: { cycleId: c.id, userId: u.id, managerId: rm?.id ?? partnerId, partnerId, createdById: idOf(actor) } });
    }
    await writeAudit(tx, actor, { entityType: "AppraisalCycle", entityId: c.id, action: "CREATE", after: { ...c, people: people.length } });
    return c;
  });
  await notifyUsers(people.map((u) => u.id), { kind: "APPRAISAL", title: `${p.name}: set your goals`, link: "/me/growth", dedupeKey: `cycle-${cycle.id}-start` });
  return cycle;
}

/** Move the cycle to its next phase (HR or Partner). */
export async function advanceCycle(actor: Actor, cycleId: string) {
  if (!isHrOrPartner(actor)) throw forbidden();
  const c = await db().appraisalCycle.findUnique({ where: { id: cycleId } });
  if (!c) throw notFound("Appraisal cycle");
  const i = CYCLE_STATUSES.indexOf(c.status as CycleStatus);
  if (i < 0 || i >= CYCLE_STATUSES.length - 1) throw ruleViolation("This cycle is closed.");
  const next = CYCLE_STATUSES[i + 1]!;
  if (next === "CLOSED") {
    const notFinal = await db().appraisalReview.count({ where: { cycleId, status: { not: "FINAL" } } });
    if (notFinal) throw ruleViolation(`${notFinal} review(s) are not moderated yet.`);
  }
  await transaction(async (tx) => {
    await tx.appraisalCycle.update({ where: { id: cycleId }, data: { status: next, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "AppraisalCycle", entityId: cycleId, action: "ADVANCE", before: { status: c.status }, after: { status: next } });
  });
  const reviews = await db().appraisalReview.findMany({ where: { cycleId } });
  const who = next === "SELF_REVIEW" ? reviews.map((r) => r.userId) : next === "MANAGER_REVIEW" ? reviews.map((r) => r.managerId) : next === "MODERATION" ? reviews.map((r) => r.partnerId) : [];
  if (who.length) await notifyUsers(who.filter((x): x is string => !!x), { kind: "APPRAISAL", title: `${c.name}: ${CYCLE_LABELS[next]} has started`, link: "/hr/appraisals", dedupeKey: `cycle-${cycleId}-${next}` });
  return next;
}

export async function listCycles(actor: Actor) {
  staffId(actor);
  return db().appraisalCycle.findMany({ orderBy: { startDate: "desc" } });
}

type Access = { see: boolean; self: boolean; manager: boolean; partner: boolean; hr: boolean };

/** Visibility: the employee (own), their Manager / team Manager, Partners, HR. */
async function accessTo(actor: Actor, review: { userId: string; managerId: string | null }): Promise<Access> {
  if (actor.kind === "SYSTEM") return { see: true, self: false, manager: false, partner: true, hr: true };
  if (actor.kind !== "USER") return { see: false, self: false, manager: false, partner: false, hr: false };
  const self = actor.userId === review.userId;
  const partner = actor.role === "PARTNER";
  const hr = actor.role === "HR_ADMIN";
  let manager = !self && review.managerId === actor.userId;
  if (!manager && !self && actor.role === "MANAGER" && scopeOf(actor, "appraisal.write") === "team") {
    manager = (await db().user.count({ where: { AND: [{ id: review.userId }, userWhere(actor, "team")] } })) > 0;
  }
  return { see: self || partner || hr || manager, self, manager, partner, hr };
}

/** Increment recommendation is salary-class: only the employee, Partners and HR see it (invariant 5). */
function dto<T extends { incrementRecommendationBp: number | null; evidenceSnapshotJson: string }>(r: T, a: Access) {
  return { ...r, incrementRecommendationBp: a.self || a.partner || a.hr ? r.incrementRecommendationBp : null };
}

/** Reviews the actor may see (optionally one cycle). */
export async function listReviews(actor: Actor, opts: { cycleId?: string } = {}) {
  const me = staffId(actor);
  let where: Prisma.AppraisalReviewWhereInput = {};
  if (actor.kind === "USER" && (actor.role === "PARTNER" || actor.role === "HR_ADMIN")) where = {};
  else if (actor.kind === "USER" && actor.role === "MANAGER") where = { OR: [{ userId: me }, { managerId: me }, { userId: { in: (await db().user.findMany({ where: userWhere(actor, "team"), select: { id: true } })).map((u) => u.id) } }] };
  else where = { userId: me };
  const plain = await db().appraisalReview.findMany({ where: { AND: [where, opts.cycleId ? { cycleId: opts.cycleId } : {}] }, include: { cycle: true, goals: { select: { id: true } } }, orderBy: { createdAt: "asc" } });
  const names = await namesOf(plain.flatMap((r) => [r.userId, r.managerId, r.partnerId]));
  const out = [];
  for (const r of plain) {
    const a = await accessTo(actor, r);
    if (!a.see) continue;
    out.push({ ...dto(r, a), name: names.get(r.userId) ?? "", manager: names.get(r.managerId ?? "") ?? "", partner: names.get(r.partnerId ?? "") ?? "", goalCount: r.goals.length });
  }
  return out;
}

/** Review detail with goals, the evidence panel and what the viewer may do next. */
export async function getReview(actor: Actor, reviewId: string) {
  const r = await db().appraisalReview.findUnique({ where: { id: reviewId }, include: { cycle: true, goals: { orderBy: { createdAt: "asc" } } } });
  if (!r) throw notFound("Appraisal");
  const a = await accessTo(actor, r);
  if (!a.see) throw forbidden();
  const names = await namesOf([r.userId, r.managerId, r.partnerId]);
  const evidence = await evidencePanel(actor, r.userId, r.cycle.startDate, r.cycle.endDate);
  const cs = r.cycle.status as CycleStatus;
  return {
    review: dto(r, a), cycle: r.cycle, goals: r.goals, evidence,
    name: names.get(r.userId) ?? "", manager: names.get(r.managerId ?? "") ?? "", partner: names.get(r.partnerId ?? "") ?? "",
    access: a,
    can: {
      editGoals: cs === "GOAL_SETTING" && (a.self || a.manager || a.hr || a.partner),
      selfReview: a.self && cs === "SELF_REVIEW" && r.status === "OPEN",
      managerReview: (a.manager || (a.partner && !a.self)) && !a.self && (r.status === "SELF_SUBMITTED" || (r.status === "OPEN" && ["MANAGER_REVIEW", "MODERATION"].includes(cs))),
      moderate: can(actor, "appraisal.moderate") && !a.self && r.status === "MANAGER_SUBMITTED" && cs !== "CLOSED",
    },
  };
}

const goalInput = z.object({ title: z.string().trim().min(2, "Describe the goal").max(300), description: z.string().max(2000).default(""), weightPct: z.coerce.number().int().min(0).max(100).default(0) });

export async function addGoal(actor: Actor, reviewId: string, input: z.input<typeof goalInput>) {
  const d = await getReview(actor, reviewId);
  if (!d.can.editGoals) throw ruleViolation("Goals are set during the goal-setting phase, by the employee or their Manager.");
  const p = parse(goalInput, input);
  return transaction(async (tx) => {
    const g = await tx.goal.create({ data: { reviewId, ...p, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Goal", entityId: g.id, action: "CREATE", after: g });
    return g;
  });
}

export async function removeGoal(actor: Actor, goalId: string) {
  const g = await db().goal.findUnique({ where: { id: goalId } });
  if (!g) throw notFound("Goal");
  const d = await getReview(actor, g.reviewId);
  if (!d.can.editGoals) throw ruleViolation("Goals can only be changed during goal setting.");
  await transaction(async (tx) => {
    await tx.goal.delete({ where: { id: goalId } });
    await writeAudit(tx, actor, { entityType: "Goal", entityId: goalId, action: "DELETE", before: g });
  });
}

const commentsInput = z.record(z.string(), z.string().max(2000)).default({});

export async function submitSelfReview(actor: Actor, reviewId: string, input: { selfReview: string; goalComments?: Record<string, string>; goalStatus?: Record<string, string> }) {
  const d = await getReview(actor, reviewId);
  if (!d.can.selfReview) throw ruleViolation("Self-review is open only to the employee during the self-review phase.");
  if (!input.selfReview?.trim()) throw new DomainError("VALIDATION", "Write your self-review.", { selfReview: "Required" });
  const comments = parse(commentsInput, input.goalComments ?? {});
  await transaction(async (tx) => {
    for (const g of d.goals) {
      if (comments[g.id] !== undefined || input.goalStatus?.[g.id]) {
        await tx.goal.update({ where: { id: g.id }, data: { selfComment: comments[g.id] ?? g.selfComment, status: input.goalStatus?.[g.id] ?? g.status, updatedById: idOf(actor) } });
      }
    }
    await tx.appraisalReview.update({ where: { id: reviewId }, data: { selfReview: input.selfReview.trim(), selfSubmittedAt: new Date(), status: "SELF_SUBMITTED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "AppraisalReview", entityId: reviewId, action: "SELF_REVIEW", after: { status: "SELF_SUBMITTED" } });
  });
  if (d.review.managerId) await notifyUsers([d.review.managerId], { kind: "APPRAISAL", title: `${d.name} submitted a self-review`, link: `/hr/appraisals/${reviewId}`, dedupeKey: `self-${reviewId}` });
}

const managerInput = z.object({ managerReview: z.string().trim().min(2, "Write the review"), managerRating: z.coerce.number().int().min(1).max(5) });

/** Manager review (never of oneself). The evidence panel is snapshotted with it. */
export async function submitManagerReview(actor: Actor, reviewId: string, input: z.input<typeof managerInput> & { goalComments?: Record<string, string> }) {
  const d = await getReview(actor, reviewId);
  if (d.access.self) throw ruleViolation("You cannot review yourself.");
  if (!d.can.managerReview) throw ruleViolation("The Manager review opens after the self-review (or once the Manager-review phase starts).");
  const p = parse(managerInput, input);
  const comments = parse(commentsInput, input.goalComments ?? {});
  const snapshot = await evidencePanel({ kind: "SYSTEM", role: "SYSTEM", userId: "system", displayName: "System" }, d.review.userId, d.cycle.startDate, d.cycle.endDate);
  await transaction(async (tx) => {
    for (const g of d.goals) if (comments[g.id] !== undefined) await tx.goal.update({ where: { id: g.id }, data: { managerComment: comments[g.id], updatedById: idOf(actor) } });
    await tx.appraisalReview.update({
      where: { id: reviewId },
      data: { managerReview: p.managerReview, managerRating: p.managerRating, managerSubmittedAt: new Date(), status: "MANAGER_SUBMITTED", evidenceSnapshotJson: JSON.stringify({ takenAt: new Date().toISOString(), ...snapshot }), updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "AppraisalReview", entityId: reviewId, action: "MANAGER_REVIEW", after: { managerRating: p.managerRating } });
  });
  if (d.review.partnerId) await notifyUsers([d.review.partnerId], { kind: "APPRAISAL", title: `${d.name}: ready for moderation`, link: `/hr/appraisals/${reviewId}`, dedupeKey: `mgr-${reviewId}` });
}

const moderateInput = z.object({
  moderatedRating: z.coerce.number().int().min(1).max(5),
  finalRating: z.coerce.number().int().min(1).max(5),
  incrementRecommendationBp: z.coerce.number().int().min(0).max(10000).nullish(),
});

/** Partner moderation: final rating and increment recommendation (in basis points, 1000 = 10%). */
export async function moderateReview(actor: Actor, reviewId: string, input: z.input<typeof moderateInput>) {
  if (!can(actor, "appraisal.moderate")) throw forbidden();
  const d = await getReview(actor, reviewId);
  if (d.access.self) throw ruleViolation("You cannot moderate your own appraisal.");
  if (!d.can.moderate) throw ruleViolation("Moderation follows the Manager review.");
  const p = parse(moderateInput, input);
  await transaction(async (tx) => {
    await tx.appraisalReview.update({ where: { id: reviewId }, data: { moderatedRating: p.moderatedRating, finalRating: p.finalRating, incrementRecommendationBp: p.incrementRecommendationBp ?? null, status: "FINAL", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "AppraisalReview", entityId: reviewId, action: "MODERATE", after: { finalRating: p.finalRating, incrementRecommendationBp: p.incrementRecommendationBp ?? null } });
  });
  await notifyUsers([d.review.userId], { kind: "APPRAISAL", title: `${d.cycle.name}: your appraisal is final`, link: `/hr/appraisals/${reviewId}`, dedupeKey: `final-${reviewId}` });
}

// ---- Evidence panel

export type Evidence = {
  period: { from: string; to: string };
  filings: { onTime: number; late: number; items: { title: string; client: string; filedDate: string; late: boolean }[] };
  reviewPoints: { raised: number; tasksReviewed: number; perTask: number; items: { task: string; client: string; text: string; status: string }[] };
  feedback: { count: number; averageRating: number | null; items: { client: string; rating: number | null; comment: string; date: string }[] };
  applause: { count: number; items: { from: string; message: string; date: string }[] };
  cpe: { minutes: number; text: string };
  exposure: { serviceLine: string; sharePct: number }[];
  hoursContext: string;
  clientNamesShown: boolean;
};

/**
 * Evidence from the system for the cycle period (spec 11.8). Hours appear only as context text, never a
 * score. Client names are shown to Partners and Managers; HR (no client data) and the employee get counts
 * and non-client details.
 */
export async function evidencePanel(actor: Actor, userId: string, from: string, to: string): Promise<Evidence> {
  const names = seesClientNames(actor);
  const fromDt = new Date(`${from}T00:00:00+05:30`);
  const toDt = new Date(`${to}T23:59:59+05:30`);
  const [filed, requests, points, engagements, applause, cpe, exposure] = await Promise.all([
    db().task.findMany({
      where: { assignments: { some: { userId, role: "MAKER" } }, status: { in: ["FILED", "FILED_LATE"] }, filedDate: { gte: from, lte: to } },
      select: { title: true, filedDate: true, status: true, client: { select: { name: true } } },
      orderBy: { filedDate: "desc" },
    }),
    db().reviewRequest.findMany({ where: { makerId: userId, submittedAt: { gte: fromDt, lte: toDt } }, select: { taskId: true } }),
    db().reviewPoint.findMany({ where: { reviewRequest: { makerId: userId }, raisedAt: { gte: fromDt, lte: toDt } }, select: { taskId: true, text: true, status: true } }),
    db().engagementAssignment.findMany({ where: { userId }, select: { engagementId: true } }),
    db().applause.findMany({ where: { toUserId: userId, createdAt: { gte: fromDt, lte: toDt } }, orderBy: { createdAt: "desc" } }),
    db().cPELog.aggregate({ where: { userId, date: { gte: from, lte: to } }, _sum: { minutes: true } }),
    exposureByServiceLine(userId, from, to),
  ]);
  const feedback = await db().feedback.findMany({ where: { engagementId: { in: [...new Set(engagements.map((e) => e.engagementId))] }, receivedAt: { gte: fromDt, lte: toDt } }, orderBy: { receivedAt: "desc" } });
  const taskIds = [...new Set(points.map((p) => p.taskId))];
  const [tasks, clients, givers] = await Promise.all([
    names ? db().task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true, client: { select: { name: true } } } }) : Promise.resolve([]),
    names ? db().client.findMany({ where: { id: { in: feedback.map((f) => f.clientId) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    namesOf(applause.map((a) => a.fromUserId)),
  ]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));
  const rated = feedback.filter((f) => f.rating != null);
  const tasksReviewed = new Set(requests.map((r) => r.taskId)).size;
  return {
    period: { from, to },
    filings: {
      onTime: filed.filter((t) => t.status === "FILED").length,
      late: filed.filter((t) => t.status === "FILED_LATE").length,
      items: names ? filed.slice(0, 50).map((t) => ({ title: t.title, client: t.client.name, filedDate: t.filedDate ?? "", late: t.status === "FILED_LATE" })) : [],
    },
    reviewPoints: {
      raised: points.length, tasksReviewed, perTask: tasksReviewed ? Math.round((points.length / tasksReviewed) * 10) / 10 : 0,
      items: names ? points.slice(0, 50).map((p) => ({ task: taskMap.get(p.taskId)?.title ?? "", client: taskMap.get(p.taskId)?.client.name ?? "", text: p.text, status: p.status })) : [],
    },
    feedback: {
      count: feedback.length,
      averageRating: rated.length ? Math.round((rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
      items: names ? feedback.slice(0, 30).map((f) => ({ client: clientMap.get(f.clientId) ?? "", rating: f.rating, comment: f.comment, date: f.receivedAt?.toISOString().slice(0, 10) ?? "" })) : [],
    },
    applause: { count: applause.length, items: applause.slice(0, 30).map((a) => ({ from: givers.get(a.fromUserId) ?? "", message: a.message, date: a.createdAt.toISOString().slice(0, 10) })) },
    cpe: { minutes: cpe._sum.minutes ?? 0, text: minutesToHoursText(cpe._sum.minutes ?? 0).replace("logged", "of CPE") },
    exposure: exposure.lines.map((l) => ({ serviceLine: l.serviceLine, sharePct: l.sharePct })),
    hoursContext: minutesToHoursText(exposure.totalMinutes),
    clientNamesShown: names,
  };
}

/** My current reviews (for /me/growth). */
export async function myReviews(actor: Actor) {
  const me = staffId(actor);
  return db().appraisalReview.findMany({ where: { userId: me }, include: { cycle: true, goals: true }, orderBy: { createdAt: "desc" }, take: 5 });
}
