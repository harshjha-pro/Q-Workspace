import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound } from "../../lib/errors";
import { systemActor, type Actor } from "../../permissions/actor";
import { authorize, requireStaff, scopeOf } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import { writeAudit } from "../../audit";
import { fyKey, fyStartYear, todayIst } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";

/**
 * Leave policy per employee category (spec 11.3, P3-36, Q-20): annual quota, accrual, carry-forward cap,
 * encashment. Firm policy, not statute — but seeded as placeholders marked Unverified until a Partner confirms.
 */
export const POLICY_CATEGORIES = ["STAFF", "ARTICLE", "PARTNER", "ADMIN", "SUPPORT"] as const;
export const POLICY_LEAVE_TYPES = ["PERSONAL", "SICK", "EXAM_STUDY", "OTHER"] as const;

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
const halfDays = z.coerce.number().int().min(0).max(730);
const policyInput = z.object({
  name: z.string().trim().min(2),
  employeeCategory: z.enum(POLICY_CATEGORIES),
  leaveType: z.enum(POLICY_LEAVE_TYPES),
  quotaHalfDays: halfDays,
  accrual: z.enum(["ANNUAL", "MONTHLY"]).default("ANNUAL"),
  carryForwardMaxHalfDays: halfDays.default(0),
  encashable: z.boolean().default(false),
  effectiveFrom: zIsoDate,
  source: z.string().default(""),
});
export type PolicyInput = z.input<typeof policyInput>;

export async function listPolicies(actor: Actor) {
  requireStaff(actor);
  return db().leavePolicy.findMany({ orderBy: [{ employeeCategory: "asc" }, { leaveType: "asc" }, { effectiveFrom: "desc" }] });
}

export async function createPolicy(actor: Actor, input: PolicyInput) {
  authorize(actor, "hr.records.manage");
  const d = parse(policyInput, input);
  return transaction(async (tx) => {
    const row = await tx.leavePolicy.create({ data: { ...d, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "LeavePolicy", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
}

/** Editing a policy clears its verification. */
export async function updatePolicy(actor: Actor, id: string, input: Partial<PolicyInput>) {
  authorize(actor, "hr.records.manage");
  const before = await db().leavePolicy.findUnique({ where: { id } });
  if (!before) throw notFound("Leave policy");
  const d = parsePartial(policyInput, input);
  return transaction(async (tx) => {
    const row = await tx.leavePolicy.update({ where: { id }, data: { ...d, verifiedById: null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "LeavePolicy", entityId: id, action: "UPDATE", before, after: row });
    return row;
  });
}

/** A Partner confirms a policy (Q-20 placeholders are Unverified until then). */
export async function verifyPolicy(actor: Actor, id: string) {
  requireStaff(actor);
  if (actor.role !== "PARTNER") throw forbidden("Only a Partner confirms leave policies.");
  await transaction(async (tx) => {
    await tx.leavePolicy.update({ where: { id }, data: { verifiedById: actor.userId, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "LeavePolicy", entityId: id, action: "VERIFY" });
  });
}

/** Months from `fromMonth` to `toMonth` inclusive ("YYYY-MM"). */
function monthsBetween(fromMonth: string, toMonth: string) {
  const [fy, fm] = fromMonth.split("-").map(Number) as [number, number];
  const [ty, tm] = toMonth.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Entitlement to date in half-days: ANNUAL credits the (prorated) year at once; MONTHLY credits 1/12 at each month start. */
export function entitlementToDate(policy: { quotaHalfDays: number; accrual: string }, fyStart: number, joiningDate: string | null, today: string) {
  const fyFirst = `${fyStart}-04`;
  const start = joiningDate && joiningDate.slice(0, 7) > fyFirst ? joiningDate.slice(0, 7) : fyFirst;
  const fyLast = `${fyStart + 1}-03`;
  if (start > fyLast) return 0;
  if (policy.accrual === "MONTHLY") {
    const elapsed = Math.max(0, Math.min(12, monthsBetween(start, today.slice(0, 7))));
    return Math.floor((policy.quotaHalfDays * elapsed) / 12);
  }
  return Math.floor((policy.quotaHalfDays * monthsBetween(start, fyLast)) / 12);
}

/**
 * Scheduled job (yearly/monthly accrual, P3-36): creates this FY's balances with the carry-forward from
 * last year (capped), and sets accrued half-days to the entitlement to date. Idempotent: running it twice
 * on the same day changes nothing; imported opening balances are never overwritten.
 */
export async function runLeaveAccrual(today = todayIst(), actor: Actor = systemActor()) {
  const fyStart = fyStartYear(today);
  const fy = fyKey(fyStart);
  const prevFy = fyKey(fyStart - 1);
  const policies = await db().leavePolicy.findMany({ where: { effectiveFrom: { lte: today } }, orderBy: { effectiveFrom: "desc" } });
  const users = await db().user.findMany({ where: { isSystem: false, active: true }, select: { id: true, employeeProfile: { select: { employeeCategory: true, joiningDate: true, exitDate: true } } } });
  let created = 0;
  let updated = 0;
  await transaction(async (tx) => {
    for (const u of users) {
      const p = u.employeeProfile;
      if (!p || (p.joiningDate && p.joiningDate > today) || (p.exitDate && p.exitDate < today)) continue;
      const types = new Set<string>();
      for (const pol of policies) {
        if (pol.employeeCategory !== p.employeeCategory || types.has(pol.leaveType)) continue;
        types.add(pol.leaveType); // newest effective policy per type wins (sorted desc)
        const accrued = entitlementToDate(pol, fyStart, p.joiningDate, today);
        const existing = await tx.leaveBalance.findUnique({ where: { userId_leaveType_fy: { userId: u.id, leaveType: pol.leaveType, fy } } });
        if (!existing) {
          const prev = await tx.leaveBalance.findUnique({ where: { userId_leaveType_fy: { userId: u.id, leaveType: pol.leaveType, fy: prevFy } } });
          const prevAvail = prev ? prev.openingHalfDays + prev.accruedHalfDays + prev.adjustedHalfDays - prev.takenHalfDays - prev.encashedHalfDays : 0;
          const opening = Math.max(0, Math.min(prevAvail, pol.carryForwardMaxHalfDays));
          const taken = await takenHalfDaysInFy(tx, u.id, pol.leaveType, fyStart);
          const row = await tx.leaveBalance.create({ data: { userId: u.id, leaveType: pol.leaveType, fy, openingHalfDays: opening, accruedHalfDays: accrued, takenHalfDays: taken, createdById: idOf(actor) } });
          await writeAudit(tx, actor, { entityType: "LeaveBalance", entityId: row.id, action: "ACCRUE", after: { fy, leaveType: pol.leaveType, opening, accrued, taken } });
          created += 1;
        } else if (existing.accruedHalfDays !== accrued) {
          await tx.leaveBalance.update({ where: { id: existing.id }, data: { accruedHalfDays: accrued, updatedById: idOf(actor) } });
          await writeAudit(tx, actor, { entityType: "LeaveBalance", entityId: existing.id, action: "ACCRUE", before: { accruedHalfDays: existing.accruedHalfDays }, after: { accruedHalfDays: accrued } });
          updated += 1;
        }
      }
    }
  });
  return { fy, created, updated };
}

/** Approved leave already taken this FY (so a balance created mid-year starts with the right "taken"). */
async function takenHalfDaysInFy(tx: Tx, userId: string, leaveType: string, fyStart: number) {
  const rows = await tx.leaveRequest.findMany({ where: { userId, leaveType, status: "APPROVED", fromDate: { gte: `${fyStart}-04-01`, lte: `${fyStart + 1}-03-31` } }, select: { halfDays: true } });
  return rows.reduce((a, r) => a + r.halfDays, 0);
}

/** Balances of everyone in the actor's HR scope for a FY (HR/Partner firm, Manager team). */
export async function listBalances(actor: Actor, fy = fyKey(fyStartYear(todayIst()))) {
  requireStaff(actor);
  const scope = scopeOf(actor, "hr.records.view");
  if (scope === "none") throw forbidden();
  const users = await db().user.findMany({ where: { AND: [userWhere(actor, scope), { isSystem: false, active: true }] }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
  const rows = await db().leaveBalance.findMany({ where: { fy, userId: { in: users.map((u) => u.id) } } });
  return users.map((u) => ({
    user: u,
    balances: rows.filter((r) => r.userId === u.id).map((r) => ({ ...r, availableHalfDays: r.openingHalfDays + r.accruedHalfDays + r.adjustedHalfDays - r.takenHalfDays - r.encashedHalfDays })),
  }));
}

/** HR corrects a balance (± half-days) with a reason. */
export async function adjustBalance(actor: Actor, balanceId: string, deltaHalfDays: number, reason: string) {
  authorize(actor, "hr.records.manage");
  if (!Number.isInteger(deltaHalfDays) || deltaHalfDays === 0) throw new DomainError("VALIDATION", "Enter a non-zero number of half-days.", { delta: "Non-zero whole number" });
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  const b = await db().leaveBalance.findUnique({ where: { id: balanceId } });
  if (!b) throw notFound("Leave balance");
  await transaction(async (tx) => {
    await tx.leaveBalance.update({ where: { id: balanceId }, data: { adjustedHalfDays: { increment: deltaHalfDays }, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "LeaveBalance", entityId: balanceId, action: "ADJUST", before: { adjustedHalfDays: b.adjustedHalfDays }, after: { adjustedHalfDays: b.adjustedHalfDays + deltaHalfDays }, reason });
  });
}

/** "Run accrual now" from the leave-policies page (HR, or a Partner). */
export async function runLeaveAccrualNow(actor: Actor) {
  requireStaff(actor);
  if (actor.role !== "PARTNER") authorize(actor, "hr.records.manage");
  return runLeaveAccrual(todayIst(), actor);
}
