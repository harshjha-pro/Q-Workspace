import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { authorize, requireStaff, scopeOf } from "../../permissions/guards";
import { assertUserAccess, userWhere } from "../../permissions/scopes";
import { writeAudit } from "../../audit";
import { addDays, dayOfWeek, todayIst } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import { getSetting } from "../settings/service";
import { officeHolidayStates } from "../holidays";
import { notifyUsers } from "../notifications/service";
import { deriveAttendance, summarise, LOP_HALF_DAYS, type DerivedDay, type StoredDay } from "../../payroll-engine";

const LOCKED_RUN = ["APPROVED", "PAID", "LOCKED"];
const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** A month's attendance is frozen once a payroll run for it is approved. */
export async function isMonthLocked(month: string, tx?: Tx) {
  return (await (tx ?? db()).payrollRun.count({ where: { month, status: { in: LOCKED_RUN } } })) > 0;
}

/** Approved leave per day (2 = full, 1 = half), the same rule the leave screens use. */
async function leaveMap(userId: string, from: string, to: string) {
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

/** Derive one person's month (no permission check — callers check). Locked months read the stored rows. */
export async function deriveMonth(userId: string, month: string, today = todayIst()): Promise<{ days: DerivedDay[]; locked: boolean }> {
  const dates = monthDates(month);
  const from = dates[0]!;
  const to = dates.at(-1)!;
  const storedRows = await db().attendance.findMany({ where: { userId, date: { gte: from, lte: to } } });
  const locked = await isMonthLocked(month);
  const profile = await db().employeeProfile.findUnique({ where: { userId }, select: { joiningDate: true, exitDate: true } });
  if (locked && storedRows.length) {
    const byDate = new Map(storedRows.map((r) => [r.date, r]));
    return {
      locked,
      days: dates.map((date) => {
        const r = byDate.get(date);
        const outside = (profile?.joiningDate && date < profile.joiningDate) || (profile?.exitDate && date > profile.exitDate);
        if (!r) return { date, kind: outside ? "NOT_EMPLOYED" : "UPCOMING", location: null, clientId: null, source: "DERIVED", note: null, lopHalfDays: 0, leaveHalfDays: 0 };
        const leaveHalf = r.status === "LEAVE" ? (r.location ? 1 : 2) : r.status === "HALF_DAY" && r.source !== "LEAVE_EXCESS" && !r.location ? 1 : 0;
        return { date, kind: r.status as DerivedDay["kind"], location: r.location, clientId: r.clientId, source: r.source, note: r.checkInNote, lopHalfDays: LOP_HALF_DAYS[r.status] ?? 0, leaveHalfDays: leaveHalf };
      }),
    };
  }
  const [entries, leave, holidays, workingSaturdays] = await Promise.all([
    db().workEntry.findMany({ where: { userId, date: { gte: from, lte: to }, deletedAt: null }, select: { date: true, location: true, clientSiteClientId: true } }),
    leaveMap(userId, from, to),
    officeHolidayStates().then((states) => db().holiday.findMany({ where: { date: { gte: from, lte: to }, stateCode: { in: states } }, select: { date: true } })),
    getSetting<boolean>("work.workingSaturdays", true),
  ]);
  const entryMap = new Map<string, { locations: string[]; clientSiteClientId: string | null }>();
  for (const e of entries) {
    const cur = entryMap.get(e.date) ?? { locations: [], clientSiteClientId: null };
    cur.locations.push(e.location);
    if (e.location === "CLIENT_SITE" && e.clientSiteClientId) cur.clientSiteClientId = e.clientSiteClientId;
    entryMap.set(e.date, cur);
  }
  const stored = new Map<string, StoredDay>(storedRows.map((r) => [r.date, { status: r.status, source: r.source, location: r.location, clientId: r.clientId, note: r.checkInNote }]));
  const days = deriveAttendance({
    dates, today, dayOfWeek, workingSaturdays, holidays: new Set(holidays.map((h) => h.date)), entries: entryMap, leave, stored,
    joiningDate: profile?.joiningDate ?? null, exitDate: profile?.exitDate ?? null,
  });
  return { days, locked };
}

/** Write the derived month into Attendance rows (P3-17: locked into rows when the payroll run is created or recalculated). */
export async function storeAttendance(tx: Tx, actor: Actor, userId: string, days: DerivedDay[]) {
  for (const d of days) {
    if (d.kind === "UPCOMING" || d.kind === "NOT_EMPLOYED") continue;
    if (d.source === "REGULARISED" || d.source === "LEAVE_EXCESS") continue; // overrides already stored
    const data = { status: d.kind, location: d.location, clientId: d.clientId, source: d.source === "CHECK_IN" ? "CHECK_IN" : "DERIVED" };
    await tx.attendance.upsert({
      where: { userId_date: { userId, date: d.date } },
      create: { userId, date: d.date, ...data, createdById: idOf(actor) },
      update: { ...data, updatedById: idOf(actor) },
    });
  }
}

export type SheetRow = { userId: string; name: string; summary: ReturnType<typeof summarise>; days: DerivedDay[]; locked: boolean };

/** Monthly sheet: everyone in the actor's HR scope (HR/Partner firm, Manager team), or only the actor (P3-17). */
export async function attendanceSheet(actor: Actor, month: string, opts: { me?: boolean; userId?: string } = {}): Promise<SheetRow[]> {
  requireStaff(actor);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new DomainError("VALIDATION", "Use a month like 2026-04");
  let users: { id: string; displayName: string }[];
  if (opts.me) {
    users = [{ id: actor.userId, displayName: actor.displayName }];
  } else if (opts.userId) {
    if (opts.userId !== actor.userId) await assertUserAccess(actor, "hr.records.view", opts.userId);
    users = await db().user.findMany({ where: { id: opts.userId }, select: { id: true, displayName: true } });
  } else {
    const scope = scopeOf(actor, "hr.records.view");
    if (scope === "none" || scope === "self") {
      users = [{ id: actor.userId, displayName: actor.displayName }];
    } else {
      users = await db().user.findMany({ where: { AND: [userWhere(actor, scope), { isSystem: false, active: true }] }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
    }
  }
  const out: SheetRow[] = [];
  for (const u of users) {
    const { days, locked } = await deriveMonth(u.id, month);
    out.push({ userId: u.id, name: u.displayName, summary: summarise(days), days, locked });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mobile check-in for client-site days (optional, spec 11.2)
// ---------------------------------------------------------------------------
const checkInInput = z.object({ clientId: z.string().optional().nullable(), note: z.string().trim().max(300).default("") });

export async function checkIn(actor: Actor, input: z.input<typeof checkInInput>) {
  requireStaff(actor);
  authorize(actor, "work.log");
  const d = parse(checkInInput, input);
  const date = todayIst();
  if (await isMonthLocked(date.slice(0, 7))) throw ruleViolation("Attendance for this month is locked in payroll.");
  if (d.clientId && !(await db().client.count({ where: { id: d.clientId } }))) throw notFound("Client");
  return transaction(async (tx) => {
    const existing = await tx.attendance.findUnique({ where: { userId_date: { userId: actor.userId, date } } });
    if (existing && existing.source === "REGULARISED") throw ruleViolation("Today is already regularised.");
    const data = { status: "PRESENT", location: "CLIENT_SITE", clientId: d.clientId ?? null, source: "CHECK_IN", checkInAt: new Date(), checkInNote: d.note || null };
    const row = await tx.attendance.upsert({ where: { userId_date: { userId: actor.userId, date } }, create: { userId: actor.userId, date, ...data, createdById: actor.userId }, update: { ...data, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Attendance", entityId: row.id, action: "CHECK_IN", before: existing, after: row });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Regularisation (spec 11.2): requested by the employee, approved by their Manager — never by themself
// ---------------------------------------------------------------------------
export const REGULARISE_AS = ["PRESENT", "WFH", "CLIENT_SITE"] as const;
const regInput = z.object({ date: zIsoDate, requestedStatus: z.enum(REGULARISE_AS), reason: z.string().trim().min(5, "Say briefly why the day was missed") });

async function approverFor(userId: string) {
  const u = await db().user.findUniqueOrThrow({ where: { id: userId }, include: { reportingManager: true } });
  if (u.reportingManager?.active && ["MANAGER", "PARTNER"].includes(u.reportingManager.role)) return u.reportingManager.id;
  const partner = await db().user.findFirst({ where: { role: "PARTNER", active: true, id: { not: userId } }, orderBy: { createdAt: "asc" } });
  return partner?.id ?? null;
}

export async function requestRegularisation(actor: Actor, input: z.input<typeof regInput>) {
  requireStaff(actor);
  const d = parse(regInput, input);
  if (d.date > todayIst()) throw new DomainError("VALIDATION", "You can only regularise a past day or today.", { date: "Not in the future" });
  if (await isMonthLocked(d.date.slice(0, 7))) throw ruleViolation("Attendance for that month is locked in payroll. Ask HR.");
  const pending = await db().regularisation.findFirst({ where: { userId: actor.userId, date: d.date, status: "PENDING" } });
  if (pending) throw ruleViolation("You already have a pending request for that day.");
  const approverId = await approverFor(actor.userId);
  const r = await transaction(async (tx) => {
    const row = await tx.regularisation.create({ data: { userId: actor.userId, date: d.date, requestedStatus: d.requestedStatus, reason: d.reason, approverId, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Regularisation", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
  if (approverId) await notifyUsers([approverId], { kind: "REGULARISATION", title: `Attendance regularisation: ${actor.displayName}, ${d.date}`, body: d.reason, link: "/hr/attendance?tab=approvals", entityType: "Regularisation", entityId: r.id, dedupeKey: `REG|${r.id}` });
  return r;
}

export async function decideRegularisation(actor: Actor, id: string, approve: boolean) {
  requireStaff(actor);
  const r = await db().regularisation.findUnique({ where: { id } });
  if (!r) throw notFound("Regularisation");
  if (r.userId === actor.userId) throw forbidden("You cannot approve your own regularisation.");
  await assertUserAccess(actor, "attendance.regularise.approve", r.userId);
  if (r.status !== "PENDING") throw ruleViolation("This request was already decided.");
  if (approve && (await isMonthLocked(r.date.slice(0, 7)))) throw ruleViolation("Attendance for that month is locked in payroll.");
  await transaction(async (tx) => {
    await tx.regularisation.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: actor.userId, decidedAt: new Date(), updatedById: actor.userId } });
    if (approve) {
      const location = r.requestedStatus === "PRESENT" ? "OFFICE" : r.requestedStatus;
      const data = { status: "PRESENT", location, source: "REGULARISED", checkInNote: r.reason };
      await tx.attendance.upsert({ where: { userId_date: { userId: r.userId, date: r.date } }, create: { userId: r.userId, date: r.date, ...data, createdById: actor.userId }, update: { ...data, updatedById: actor.userId } });
    }
    await writeAudit(tx, actor, { entityType: "Regularisation", entityId: id, action: approve ? "APPROVE" : "REJECT" });
  });
  await notifyUsers([r.userId], { kind: "REGULARISATION_DECIDED", title: `Regularisation for ${r.date} ${approve ? "approved" : "rejected"}`, link: "/hr/attendance?me=1", entityType: "Regularisation", entityId: id });
}

export async function listRegularisations(actor: Actor, view: "mine" | "approvals") {
  requireStaff(actor);
  if (view === "mine") return db().regularisation.findMany({ where: { userId: actor.userId }, orderBy: { date: "desc" }, take: 50 });
  const scope = authorize(actor, "attendance.regularise.approve");
  const people = await db().user.findMany({ where: userWhere(actor, scope), select: { id: true } });
  return db().regularisation.findMany({ where: { userId: { in: people.map((p) => p.id).filter((x) => x !== actor.userId) }, status: "PENDING" }, orderBy: { date: "asc" }, take: 200 });
}

/** Pending regularisations firm-wide (HR dashboard count only — no details). */
export async function pendingRegularisationCount() {
  return db().regularisation.count({ where: { status: "PENDING" } });
}

/**
 * Leave approved beyond the balance becomes loss of pay (P3-36): the last `excessHalfDays` working
 * half-days of the leave are stored as unpaid attendance overrides. Called by the leave service.
 */
export async function recordLeaveExcess(tx: Tx, actor: Actor, userId: string, workingDays: string[], excessHalfDays: number, half: { start: string | null; end: string | null }) {
  let left = excessHalfDays;
  for (let i = workingDays.length - 1; i >= 0 && left > 0; i -= 1) {
    const date = workingDays[i]!;
    const dayHalves = date === half.start || date === half.end ? 1 : 2;
    const take = Math.min(left, dayHalves);
    left -= take;
    const data = { status: take === 2 ? "ABSENT" : "HALF_DAY", location: null, clientId: null, source: "LEAVE_EXCESS", checkInNote: "Approved leave beyond the balance — loss of pay" };
    await tx.attendance.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...data, createdById: idOf(actor) }, update: { ...data, updatedById: idOf(actor) } });
  }
}

/** Remove loss-of-pay overrides when leave is cancelled. */
export async function clearLeaveExcess(tx: Tx, userId: string, from: string, to: string) {
  await tx.attendance.deleteMany({ where: { userId, source: "LEAVE_EXCESS", date: { gte: from, lte: to } } });
}
