import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { officeHolidayStates } from "../holidays";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, scopeOf } from "../../permissions/guards";
import { assertUserAccess, userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { requireStaff } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { addDays, dayOfWeek, fyStartYear, fyLabel, todayIst, zIso } from "./util";
import { notifyUsers } from "../notifications/service";
import { getSetting } from "../settings/service";

export const LEAVE_TYPES = ["PERSONAL", "SICK", "EXAM_STUDY", "OTHER"] as const;
const leaveInput = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  reason: z.enum(["PERSONAL", "SICK", "HOLIDAY", "EXAM_STUDY", "OTHER"]),
  note: z.string().default(""),
  fromDate: zIso,
  toDate: zIso,
  halfDayStart: z.boolean().default(false),
  halfDayEnd: z.boolean().default(false),
});
export type LeaveInput = z.input<typeof leaveInput>;

/** Working days in a range: Sundays never; Saturdays per setting; firm/national holidays excluded. */
export async function workingDays(from: string, to: string) {
  const sat = await getSetting<boolean>("work.workingSaturdays", true);
  const holidays = new Set((await db().holiday.findMany({ where: { date: { gte: from, lte: to }, stateCode: { in: await officeHolidayStates() } } })).map((h) => h.date));
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = dayOfWeek(d);
    if (dow === 0 || (dow === 6 && !sat) || holidays.has(d)) continue;
    out.push(d);
  }
  return out;
}

/** Approved leave per day for a user: 2 = full day, 1 = half day (spec 11.3; shown in grid and calendar). */
export async function leaveDays(userId: string, from: string, to: string) {
  const reqs = await db().leaveRequest.findMany({ where: { userId, status: "APPROVED", fromDate: { lte: to }, toDate: { gte: from } } });
  const map = new Map<string, number>();
  for (const r of reqs) {
    for (let d = r.fromDate; d <= r.toDate; d = addDays(d, 1)) {
      const half = (d === r.fromDate && r.halfDayStart) || (d === r.toDate && r.halfDayEnd);
      map.set(d, Math.min(2, (map.get(d) ?? 0) + (half ? 1 : 2)));
    }
  }
  return map;
}

async function approverFor(userId: string) {
  const u = await db().user.findUniqueOrThrow({ where: { id: userId }, include: { reportingManager: true } });
  if (u.reportingManager?.active && ["MANAGER", "PARTNER"].includes(u.reportingManager.role)) return u.reportingManager.id;
  const partner = await db().user.findFirst({ where: { role: "PARTNER", active: true, id: { not: userId } }, orderBy: { createdAt: "asc" } });
  return partner?.id ?? null;
}

export async function applyLeave(actor: Actor, input: LeaveInput) {
  requireStaff(actor);
  authorize(actor, "leave.apply");
  const d = parse(leaveInput, input);
  if (d.toDate < d.fromDate) throw new DomainError("VALIDATION", "The end date is before the start date.", { toDate: "Check the dates" });
  if (d.fromDate === d.toDate && d.halfDayStart && d.halfDayEnd) d.halfDayEnd = false;
  const days = await workingDays(d.fromDate, d.toDate);
  if (days.length === 0) throw ruleViolation("Those dates are all holidays or non-working days.");
  const halfDays = days.length * 2 - (d.halfDayStart && days.includes(d.fromDate) ? 1 : 0) - (d.halfDayEnd && days.includes(d.toDate) ? 1 : 0);
  const overlap = await db().leaveRequest.findFirst({ where: { userId: actor.userId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: d.toDate }, toDate: { gte: d.fromDate } } });
  if (overlap) throw ruleViolation(`You already have leave from ${overlap.fromDate} to ${overlap.toDate}.`);
  const approverId = await approverFor(actor.userId);
  const req = await transaction(async (tx) => {
    const r = await tx.leaveRequest.create({ data: { ...d, userId: actor.userId, halfDays, approverId, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "LeaveRequest", entityId: r.id, action: "CREATE", after: r });
    return r;
  });
  if (approverId) await notifyUsers([approverId], { kind: "LEAVE_APPROVAL", title: `Leave request: ${actor.displayName} (${halfDays / 2} day${halfDays === 2 ? "" : "s"})`, link: `/leave/${req.id}`, entityType: "LeaveRequest", entityId: req.id, dedupeKey: `LEAVE|${req.id}` });
  return req;
}

/** Before approval the approver sees the applicant's tasks due during the leave, with a reassign shortcut (spec 11.3). */
export async function leaveConflicts(actor: Actor, requestId: string) {
  const r = await db().leaveRequest.findUnique({ where: { id: requestId } });
  if (!r) throw notFound("Leave request");
  if (!(actor.kind === "USER" && actor.userId === r.userId)) await assertUserAccess(actor, "leave.approve", r.userId);
  return db().task.findMany({
    where: {
      status: { in: ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"] },
      effectiveDueDate: { gte: r.fromDate, lte: addDays(r.toDate, 2) },
      assignments: { some: { userId: r.userId, toDate: null, role: { in: ["ASSIGNEE", "MAKER", "CHECKER"] } } },
    },
    include: { client: { select: { name: true } }, assignments: { where: { toDate: null }, select: { role: true, userId: true } } },
    orderBy: { effectiveDueDate: "asc" },
  });
}

export async function decideLeave(actor: Actor, requestId: string, approve: boolean, note = "") {
  requireStaff(actor);
  const r = await db().leaveRequest.findUnique({ where: { id: requestId } });
  if (!r) throw notFound("Leave request");
  if (r.userId === actor.userId) throw forbidden("You cannot approve your own leave.");
  await assertUserAccess(actor, "leave.approve", r.userId);
  if (r.status !== "PENDING") throw ruleViolation("This request was already decided.");
  if (!approve && !note.trim()) throw new DomainError("VALIDATION", "Give a reason for rejecting.", { note: "Required" });
  await transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id: requestId }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: actor.userId, decidedAt: new Date(), decisionNote: note, conflictsReviewedAt: new Date() } });
    if (approve) {
      const fy = `FY${fyStartYear(r.fromDate)}-${String((fyStartYear(r.fromDate) + 1) % 100).padStart(2, "0")}`;
      await tx.leaveBalance.updateMany({ where: { userId: r.userId, leaveType: r.leaveType, fy }, data: { takenHalfDays: { increment: r.halfDays } } });
    }
    await writeAudit(tx, actor, { entityType: "LeaveRequest", entityId: requestId, action: approve ? "APPROVE" : "REJECT", reason: note });
  });
  await notifyUsers([r.userId], { kind: "LEAVE_DECIDED", title: `Leave ${approve ? "approved" : "rejected"}: ${r.fromDate} to ${r.toDate}`, body: note, link: "/leave", entityType: "LeaveRequest", entityId: requestId });
}

export async function cancelLeave(actor: Actor, requestId: string) {
  requireStaff(actor);
  const r = await db().leaveRequest.findUnique({ where: { id: requestId } });
  if (!r || r.userId !== actor.userId) throw notFound("Leave request");
  if (r.status === "CANCELLED" || r.status === "REJECTED") throw ruleViolation("Already closed.");
  if (r.status === "APPROVED" && r.fromDate <= todayIst()) throw ruleViolation("Leave that has started cannot be cancelled; ask HR.");
  await transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
    if (r.status === "APPROVED") {
      const fy = `FY${fyStartYear(r.fromDate)}-${String((fyStartYear(r.fromDate) + 1) % 100).padStart(2, "0")}`;
      await tx.leaveBalance.updateMany({ where: { userId: r.userId, leaveType: r.leaveType, fy }, data: { takenHalfDays: { decrement: r.halfDays } } });
    }
    await writeAudit(tx, actor, { entityType: "LeaveRequest", entityId: requestId, action: "CANCEL" });
  });
}

export async function listLeave(actor: Actor, view: "mine" | "approvals" | "team") {
  requireStaff(actor);
  if (view === "mine") return db().leaveRequest.findMany({ where: { userId: actor.userId }, orderBy: { fromDate: "desc" }, take: 100 });
  const scope = authorize(actor, "leave.approve");
  const people = await db().user.findMany({ where: userWhere(actor, scope), select: { id: true } });
  const ids = people.map((p) => p.id).filter((id) => id !== actor.userId);
  return db().leaveRequest.findMany({
    where: { userId: { in: ids }, ...(view === "approvals" ? { status: "PENDING" } : {}) },
    orderBy: { fromDate: view === "approvals" ? "asc" : "desc" },
    take: 200,
  });
}

export async function leaveBalances(actor: Actor, userId?: string) {
  requireStaff(actor);
  const target = userId ?? actor.userId;
  if (target !== actor.userId && scopeOf(actor, "hr.records.view") === "none") throw forbidden();
  if (target !== actor.userId) await assertUserAccess(actor, "hr.records.view", target);
  const fy = `FY${fyStartYear(todayIst())}-${String((fyStartYear(todayIst()) + 1) % 100).padStart(2, "0")}`;
  const rows = await db().leaveBalance.findMany({ where: { userId: target, fy } });
  return { fy: fyLabel(fyStartYear(todayIst())), rows: rows.map((r) => ({ ...r, availableHalfDays: r.openingHalfDays + r.accruedHalfDays + r.adjustedHalfDays - r.takenHalfDays - r.encashedHalfDays })) };
}
