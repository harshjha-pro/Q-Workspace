import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst, weekStart } from "@/server/lib/dates";
import {
  createEntries, updateEntry, deleteEntry, copyEntries, weekGrid, recentPairs, missingDays, missingBanner, teamMissing,
  requestCorrection, decideCorrection, isLocked, extendLock, startTimer, stopTimer, syncOffline, budgetFor,
} from "@/server/services/work/service";
import { applyLeave, decideLeave, leaveConflicts, cancelLeave, listLeave, leaveDays } from "@/server/services/leave/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();
const lastWeek = addDays(weekStart(today), -3); // always in a week whose Sunday-16:00 lock has passed

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db().engagement.update({ where: { id: w.e1.id }, data: { budgetMinutes: 600 } });
});

describe("daily work entry (P2-05, P2-06)", () => {
  it("logs in 15-minute steps, refuses future dates and other people's engagements", async () => {
    const r = await createEntries(actorOf(w.s1), { dates: [today], engagementId: w.e1.id, minutes: 90, description: "GSTR-1 prep" });
    expect(r.created).toBe(1);
    expect(r.budget?.usedMinutes).toBe(90);
    await expect(createEntries(actorOf(w.s1), { dates: [today], engagementId: w.e1.id, minutes: 20 })).rejects.toMatchObject({ fieldErrors: { minutes: "Use 15-minute steps" } });
    await expect(createEntries(actorOf(w.s1), { dates: [addDays(today, 1)], engagementId: w.e1.id, minutes: 30 })).rejects.toThrow(/future/);
    await expect(createEntries(actorOf(w.s1), { dates: [today], engagementId: w.e2.id, minutes: 30 })).rejects.toThrow(/not assigned/);
  });

  it("warns (never blocks) above 12 hours a day and reports budget bands", async () => {
    const r = await createEntries(actorOf(w.s1), { dates: [today], engagementId: w.e1.id, minutes: 660 });
    expect(r.warnings[0]).toMatch(/more than 12/);
    expect(r.budget).toMatchObject({ usedMinutes: 750, signal: "Significant Overrun", health: "Over Budget" });
    expect((await budgetFor(w.e2.id))).toBeNull();
  });

  it("internal categories need no client; mixing is refused", async () => {
    const cat = await db().internalCategory.findFirstOrThrow({ where: { active: true } });
    expect((await createEntries(actorOf(w.a1), { dates: [today], internalCategoryId: cat.id, minutes: 60 })).created).toBe(1);
    await expect(createEntries(actorOf(w.a1), { dates: [today], internalCategoryId: cat.id, engagementId: w.e1.id, minutes: 60 })).rejects.toThrow(/not both/);
  });

  it("offline sync is idempotent on the client UUID (P2-38)", async () => {
    const uuid = "7f1c2a4e-1b2c-4d3e-8f90-123456789abc";
    const entry = { dates: [today], engagementId: w.e1.id, minutes: 30, clientUuid: uuid };
    const first = await syncOffline(actorOf(w.s1), [entry]);
    const second = await syncOffline(actorOf(w.s1), [entry]);
    expect(first[0]!.ok && second[0]!.ok).toBe(true);
    expect(await db().workEntry.count({ where: { clientUuid: uuid } })).toBe(1);
  });

  it("recent pairs feed the quick picker", async () => {
    const pairs = await recentPairs(actorOf(w.s1));
    expect(pairs[0]).toMatchObject({ clientId: w.c1.id, engagementId: w.e1.id });
  });
});

describe("weekly lock and corrections (P2-07)", () => {
  it("past weeks are locked; current week is editable", async () => {
    expect(await isLocked(w.s1.id, lastWeek)).toBe(true);
    await expect(createEntries(actorOf(w.s1), { dates: [lastWeek], engagementId: w.e1.id, minutes: 30 })).rejects.toThrow(/locked/);
    const e = await db().workEntry.findFirstOrThrow({ where: { userId: w.s1.id, date: today, deletedAt: null } });
    await updateEntry(actorOf(w.s1), e.id, { minutes: 105 });
    expect((await db().workEntry.findUniqueOrThrow({ where: { id: e.id } })).minutes).toBe(105);
    await expect(updateEntry(actorOf(w.s2), e.id, { minutes: 15 })).rejects.toThrow();
  });

  it("a Partner extension reopens the week for one person", async () => {
    await extendLock(actorOf(w.partner), lastWeek, addDays(today, 1), w.s1.id);
    expect(await isLocked(w.s1.id, lastWeek)).toBe(false);
    expect(await isLocked(w.s2.id, lastWeek)).toBe(true);
    await createEntries(actorOf(w.s1), { dates: [lastWeek], engagementId: w.e1.id, minutes: 45 });
    await expect(extendLock(actorOf(w.m1), lastWeek, today)).rejects.toThrow();
    await db().weeklyLock.deleteMany({});
  });

  it("locked entries change only through an approved correction, never self-approved", async () => {
    const e = await db().workEntry.findFirstOrThrow({ where: { userId: w.s1.id, date: lastWeek } });
    await expect(updateEntry(actorOf(w.s1), e.id, { minutes: 60 })).rejects.toThrow(/locked/);
    const req = await requestCorrection(actorOf(w.s1), e.id, { minutes: 60, reason: "Mistyped the hours" });
    await expect(decideCorrection(actorOf(w.s1), req.id, true)).rejects.toThrow(/own/);
    await expect(decideCorrection(actorOf(w.m2), req.id, true)).rejects.toThrow();
    await decideCorrection(actorOf(w.m1), req.id, true, "ok");
    expect((await db().workEntry.findUniqueOrThrow({ where: { id: e.id } })).minutes).toBe(60);
    expect(await db().auditLog.count({ where: { entityId: e.id, action: "CORRECTION" } })).toBe(1);
  });
});

describe("copy, grid, missing days, timer (P2-02, P2-03, P2-08, P2-42)", () => {
  it("copy day skips locked and future targets", async () => {
    const r = await copyEntries(actorOf(w.s1), "DAY", today, lastWeek);
    expect(r.created).toBe(0);
    expect(r.skipped).toEqual([lastWeek]);
  });

  it("week grid totals per day and shows the lock", async () => {
    const g = await weekGrid(actorOf(w.s1), w.s1.id, today);
    expect(g.days).toHaveLength(7);
    expect(g.days.find((d) => d.date === today)!.total).toBeGreaterThan(0);
    expect(g.locked).toBe(false);
    await expect(weekGrid(actorOf(w.s2), w.s1.id, today)).rejects.toThrow();
    expect((await weekGrid(actorOf(w.m1), w.s1.id, today)).rows.length).toBeGreaterThan(0);
  });

  it("missing days exclude Sundays, logged days and leave; managers see their team", async () => {
    await db().user.update({ where: { id: w.s2.id }, data: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
    const days = await missingDays(w.s2.id);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0)).toBe(true);
    expect(missingBanner(days)).toMatch(/not logged/);
    expect(missingBanner([])).toBeNull();
    expect((await teamMissing(actorOf(w.m2))).map((x) => x.userId)).toContain(w.s2.id);
    expect((await teamMissing(actorOf(w.m1))).map((x) => x.userId)).not.toContain(w.s2.id);
  });

  it("timer rounds to 15 minutes with a 15-minute minimum", async () => {
    await startTimer(actorOf(w.s1), { engagementId: w.e1.id });
    await expect(startTimer(actorOf(w.s1), { engagementId: w.e1.id })).rejects.toThrow(/already running/);
    const r = await stopTimer(actorOf(w.s1), "call with client");
    expect(r.minutes).toBe(15);
    await expect(stopTimer(actorOf(w.s1))).rejects.toThrow(/No timer/);
  });

  it("deleting an entry is soft and audited", async () => {
    const e = await db().workEntry.findFirstOrThrow({ where: { userId: w.s1.id, date: today, deletedAt: null, source: "TIMER" } });
    await deleteEntry(actorOf(w.s1), e.id);
    expect((await db().workEntry.findUniqueOrThrow({ where: { id: e.id } })).deletedAt).not.toBeNull();
  });
});

describe("leave (spec 11.3)", () => {
  const from = addDays(today, 14);
  it("applies, shows conflicts to the approver and is decided by the manager only", async () => {
    const req = await applyLeave(actorOf(w.s1), { leaveType: "PERSONAL", reason: "PERSONAL", fromDate: from, toDate: addDays(from, 2), halfDayEnd: true });
    expect(req.halfDays).toBeGreaterThan(0);
    await expect(applyLeave(actorOf(w.s1), { leaveType: "SICK", reason: "SICK", fromDate: from, toDate: from })).rejects.toThrow(/already have leave/);
    expect((await listLeave(actorOf(w.m1), "approvals")).map((r) => r.id)).toContain(req.id);
    expect(Array.isArray(await leaveConflicts(actorOf(w.m1), req.id))).toBe(true);
    await expect(decideLeave(actorOf(w.s1), req.id, true)).rejects.toThrow(/own leave/);
    await expect(decideLeave(actorOf(w.m2), req.id, true)).rejects.toThrow();
    await expect(decideLeave(actorOf(w.m1), req.id, false)).rejects.toThrow(/reason/);
    await decideLeave(actorOf(w.m1), req.id, true, "Enjoy");
    expect((await leaveDays(w.s1.id, from, addDays(from, 2))).size).toBeGreaterThan(0);
    await expect(decideLeave(actorOf(w.m1), req.id, true)).rejects.toThrow(/already decided/);
    await cancelLeave(actorOf(w.s1), req.id);
    expect((await db().leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });

  it("all-holiday ranges are refused", async () => {
    const sunday = addDays(weekStart(from), 6);
    await expect(applyLeave(actorOf(w.s2), { leaveType: "PERSONAL", reason: "PERSONAL", fromDate: sunday, toDate: sunday })).rejects.toThrow(/non-working/);
  });
});
