import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeClient } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst } from "@/server/lib/dates";
import { seedGoldenRates, fillMonth } from "../payroll-golden/helpers";
import { attendanceSheet, checkIn, requestRegularisation, decideRegularisation, listRegularisations } from "@/server/services/attendance/service";
import { createPolicy, runLeaveAccrual, listBalances, verifyPolicy, adjustBalance, entitlementToDate } from "@/server/services/attendance/leave-policies";
import { applyLeave, decideLeave, cancelLeave, leaveBalanceWarningFor } from "@/server/services/leave/service";
import { proposeStructure, decideStructure } from "@/server/services/payroll/structures";
import { createRun, reviewRun, approveRun } from "@/server/services/payroll/runs";

let w: Awaited<ReturnType<typeof buildWorld>>;
const MONTH = "2026-06"; // June 2026: 1 June is a Monday

beforeAll(async () => {
  await resetDb();
  await seedGoldenRates(); // also clears holidays
  await db().leavePolicy.deleteMany({}); // the tests below define their own policies, not the seeded placeholders
  w = await buildWorld();
  let i = 0;
  for (const u of [w.s1, w.senior, w.a1, w.s2, w.m1]) {
    i += 1;
    await db().employeeProfile.create({ data: { userId: u.id, employeeCode: `EMP-A${i}`, employeeCategory: u.role === "ARTICLE" ? "ARTICLE" : "STAFF", joiningDate: "2024-04-01", uan: `20000000${i}`, workStateCode: "RJ" } });
  }
});

describe("attendance derivation (spec 11.2, P3-17)", () => {
  it("derives present (with location), leave, holiday, week-off, half day and absent", async () => {
    const client = await makeClient();
    await db().workEntry.createMany({ data: [
      { userId: w.s1.id, date: "2026-06-01", minutes: 480, location: "OFFICE" },
      { userId: w.s1.id, date: "2026-06-02", minutes: 300, location: "CLIENT_SITE", clientSiteClientId: client.id },
      { userId: w.s1.id, date: "2026-06-02", minutes: 120, location: "OFFICE" },
      { userId: w.s1.id, date: "2026-06-03", minutes: 480, location: "WFH" },
    ] });
    await db().holiday.create({ data: { date: "2026-06-04", name: "Test holiday", kind: "FIRM" } });
    await db().leaveRequest.createMany({ data: [
      { userId: w.s1.id, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: "2026-06-05", toDate: "2026-06-05", halfDays: 2, status: "APPROVED" },
      { userId: w.s1.id, leaveType: "SICK", reason: "SICK", fromDate: "2026-06-08", toDate: "2026-06-08", halfDayStart: true, halfDays: 1, status: "APPROVED" },
    ] });
    const [row] = await attendanceSheet(actorOf(w.s1), MONTH, { me: true });
    const day = (d: string) => row!.days.find((x) => x.date === d)!;
    expect(day("2026-06-01")).toMatchObject({ kind: "PRESENT", location: "OFFICE" });
    expect(day("2026-06-02")).toMatchObject({ kind: "PRESENT", location: "CLIENT_SITE", clientId: client.id });
    expect(day("2026-06-03")).toMatchObject({ kind: "PRESENT", location: "WFH" });
    expect(day("2026-06-04").kind).toBe("HOLIDAY");
    expect(day("2026-06-05")).toMatchObject({ kind: "LEAVE", leaveHalfDays: 2 });
    expect(day("2026-06-07").kind).toBe("WEEK_OFF"); // Sunday
    expect(day("2026-06-08")).toMatchObject({ kind: "HALF_DAY", lopHalfDays: 1, leaveHalfDays: 1 });
    expect(day("2026-06-09")).toMatchObject({ kind: "ABSENT", lopHalfDays: 2 });
    // 30 days: 4 Sundays, 1 holiday → 25 working days; present 3, leave 1, half day 1 → 20 empty days + ½ = 20.5 absent
    expect(row!.summary).toMatchObject({ present: 3, leave: 1.5, holidays: 1, weekOffs: 4 });
    expect(row!.summary.absent).toBe(20.5);
    expect(row!.summary.lopHalfDays).toBe(41);
  });

  it("scopes the sheet: staff see only themselves, managers their team, HR everyone", async () => {
    expect((await attendanceSheet(actorOf(w.s1), MONTH)).map((r) => r.userId)).toEqual([w.s1.id]);
    const team = (await attendanceSheet(actorOf(w.m1), MONTH)).map((r) => r.userId);
    expect(team).toContain(w.s1.id);
    expect(team).not.toContain(w.s2.id);
    await expect(attendanceSheet(actorOf(w.m2), MONTH, { userId: w.s1.id })).rejects.toThrow();
    expect((await attendanceSheet(actorOf(w.hr), MONTH)).length).toBeGreaterThan(5);
  });

  it("client-site check-in marks today present", async () => {
    await checkIn(actorOf(w.a1), { note: "At client, Malviya Nagar" });
    const [row] = await attendanceSheet(actorOf(w.a1), todayIst().slice(0, 7), { me: true });
    expect(row!.days.find((d) => d.date === todayIst())).toMatchObject({ kind: "PRESENT", location: "CLIENT_SITE", source: "CHECK_IN" });
  });
});

describe("regularisation (approved by the Manager, never self)", () => {
  it("request → manager approves → the day becomes present", async () => {
    await expect(requestRegularisation(actorOf(w.s1), { date: addDays(todayIst(), 2), requestedStatus: "PRESENT", reason: "Forgot to log" })).rejects.toThrow(/past/);
    const r = await requestRegularisation(actorOf(w.s1), { date: "2026-06-09", requestedStatus: "CLIENT_SITE", reason: "Stock audit at client, no laptop" });
    await expect(requestRegularisation(actorOf(w.s1), { date: "2026-06-09", requestedStatus: "PRESENT", reason: "Again please" })).rejects.toThrow(/pending/);
    expect((await listRegularisations(actorOf(w.m1), "approvals")).map((x) => x.id)).toContain(r.id);
    await expect(listRegularisations(actorOf(w.hr), "approvals")).rejects.toThrow(); // HR does not approve attendance
    await expect(decideRegularisation(actorOf(w.s1), r.id, true)).rejects.toThrow(/own/);
    await expect(decideRegularisation(actorOf(w.m2), r.id, true)).rejects.toThrow();
    await expect(decideRegularisation(actorOf(w.senior), r.id, true)).rejects.toThrow();
    await decideRegularisation(actorOf(w.m1), r.id, true);
    const [row] = await attendanceSheet(actorOf(w.s1), MONTH, { me: true });
    expect(row!.days.find((d) => d.date === "2026-06-09")).toMatchObject({ kind: "PRESENT", location: "CLIENT_SITE", source: "REGULARISED" });
  });

  it("a month locked by an approved payroll run refuses regularisation", async () => {
    const s = await proposeStructure(actorOf(w.hr), { userId: w.senior.id, effectiveFrom: "2026-04-01", basic: 20_000_00 });
    await decideStructure(actorOf(w.partner), s.id, true);
    await fillMonth(w.senior.id, "2026-05");
    const run = await createRun(actorOf(w.hr), { month: "2026-05" });
    await reviewRun(actorOf(w.hr), run.id);
    await approveRun(actorOf(w.partner), run.id);
    await expect(requestRegularisation(actorOf(w.s1), { date: "2026-05-12", requestedStatus: "PRESENT", reason: "Missed entry" })).rejects.toThrow(/locked/);
    const [row] = await attendanceSheet(actorOf(w.senior), "2026-05", { me: true });
    expect(row!.locked).toBe(true);
    expect(row!.summary.lopHalfDays).toBe(0);
  });
});

describe("leave policies, accrual and balances (P3-36)", () => {
  it("entitlement: annual prorated for joiners, monthly by months elapsed", () => {
    expect(entitlementToDate({ quotaHalfDays: 24, accrual: "ANNUAL" }, 2026, "2020-01-01", "2026-05-01")).toBe(24);
    expect(entitlementToDate({ quotaHalfDays: 24, accrual: "ANNUAL" }, 2026, "2026-10-10", "2026-10-15")).toBe(12); // Oct–Mar = 6 months
    expect(entitlementToDate({ quotaHalfDays: 24, accrual: "MONTHLY" }, 2026, null, "2026-06-15")).toBe(6); // Apr, May, Jun
  });

  it("accrual is idempotent; balances visible; only HR manages, only a Partner verifies", async () => {
    await expect(createPolicy(actorOf(w.m1), { name: "x", employeeCategory: "STAFF", leaveType: "PERSONAL", quotaHalfDays: 10, effectiveFrom: "2020-04-01" })).rejects.toThrow();
    const p = await createPolicy(actorOf(w.hr), { name: "Staff personal leave", employeeCategory: "STAFF", leaveType: "PERSONAL", quotaHalfDays: 10, accrual: "ANNUAL", carryForwardMaxHalfDays: 4, effectiveFrom: "2020-04-01" });
    await expect(verifyPolicy(actorOf(w.hr), p.id)).rejects.toThrow(/Partner/);
    await verifyPolicy(actorOf(w.partner), p.id);
    const today = todayIst();
    const first = await runLeaveAccrual(today);
    expect(first.created).toBe(4); // s1, senior, s2, m1 (STAFF); the article has no policy
    const again = await runLeaveAccrual(today);
    expect(again).toMatchObject({ created: 0, updated: 0 });
    const bal = await listBalances(actorOf(w.hr));
    const mine = bal.find((b) => b.user.id === w.s1.id)!.balances[0]!;
    expect(mine.accruedHalfDays).toBe(10);
    await adjustBalance(actorOf(w.hr), mine.id, 2, "Comp-off for Saturday filing");
    await expect(adjustBalance(actorOf(w.s1), mine.id, 2, "self")).rejects.toThrow();
    expect((await listBalances(actorOf(w.hr))).find((b) => b.user.id === w.s1.id)!.balances[0]!.availableHalfDays).toBe(12 - mine.takenHalfDays);
  });

  it("leave beyond the balance is approved with a warning and the excess becomes loss of pay; cancelling clears it", async () => {
    const from = addDays(todayIst(), 30);
    await runLeaveAccrual(from); // balance row for the leave's FY
    const req = await applyLeave(actorOf(w.s2), { leaveType: "PERSONAL", reason: "PERSONAL", fromDate: from, toDate: addDays(from, 13) });
    const warn = await leaveBalanceWarningFor(actorOf(w.m2), req.id);
    expect(warn!.excessHalfDays).toBe(req.halfDays - warn!.availableHalfDays);
    expect(warn!.message).toMatch(/loss of pay/);
    await expect(leaveBalanceWarningFor(actorOf(w.m1), req.id)).rejects.toThrow();
    const res = await decideLeave(actorOf(w.m2), req.id, true);
    expect(res!.lossOfPayHalfDays).toBe(warn!.excessHalfDays);
    const lop = await db().attendance.findMany({ where: { userId: w.s2.id, source: "LEAVE_EXCESS" } });
    expect(lop.reduce((a, r) => a + (r.status === "ABSENT" ? 2 : 1), 0)).toBe(warn!.excessHalfDays);
    expect(lop.every((r) => r.date <= addDays(from, 13) && r.date >= from)).toBe(true);
    await cancelLeave(actorOf(w.s2), req.id);
    expect(await db().attendance.count({ where: { userId: w.s2.id, source: "LEAVE_EXCESS" } })).toBe(0);
  });
});
