import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { complianceDashboard } from "@/server/services/analytics/compliance";
import { personalDashboard } from "@/server/services/analytics/personal";
import { engagementDashboard, engagementPortfolio } from "@/server/services/analytics/engagements";
import { firmDashboard } from "@/server/services/analytics/firm";
import { resolvePeriod } from "@/server/services/analytics/common";

let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = "2026-09-05";
const AUG = "custom:2026-08-01:2026-08-31";

async function task(clientId: string, engagementId: string | null, d: { key: string; due: string; status: string; filed?: string; type?: string; userId?: string }) {
  const t = await db().task.create({
    data: { clientId, engagementId, title: `Task ${d.key}`, complianceTypeCode: d.type ?? null, periodKey: d.key, effectiveDueDate: d.due, status: d.status, filedDate: d.filed ?? null },
  });
  if (d.userId) await db().taskAssignment.create({ data: { taskId: t.id, userId: d.userId, role: "ASSIGNEE", fromDate: "2026-04-01" } });
  return t;
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  // c1 (team 1, Manager m1): on time, late, overdue (with a late-fee rate), not applicable (excluded).
  await task(w.c1.id, w.e1.id, { key: "A1", due: "2026-08-10", status: "FILED", filed: "2026-08-09", userId: w.s1.id });
  await task(w.c1.id, w.e1.id, { key: "A2", due: "2026-08-15", status: "FILED_LATE", filed: "2026-08-20", userId: w.s1.id });
  await task(w.c1.id, w.e1.id, { key: "A3", due: "2026-08-25", status: "IN_PROGRESS", type: "GST-R1-M", userId: w.s1.id });
  await task(w.c1.id, w.e1.id, { key: "A4", due: "2026-08-31", status: "NOT_APPLICABLE" });
  // c2 (team 2): one on time.
  await task(w.c2.id, w.e2.id, { key: "B1", due: "2026-08-12", status: "FILED", filed: "2026-08-12", userId: w.s2.id });
  // Effort: s1 on e1 in August; s2 on e2 (must not appear in s1's dashboard).
  await db().engagement.update({ where: { id: w.e1.id }, data: { budgetMinutes: 600 } });
  await db().workEntry.createMany({
    data: [
      { userId: w.s1.id, date: "2026-08-03", clientId: w.c1.id, engagementId: w.e1.id, minutes: 240, chargeable: true, stageName: "Preparation" },
      { userId: w.s1.id, date: "2026-08-04", clientId: w.c1.id, engagementId: w.e1.id, minutes: 210, chargeable: true, stageName: "Review" },
      { userId: w.s2.id, date: "2026-08-04", clientId: w.c2.id, engagementId: w.e2.id, minutes: 300, chargeable: true },
    ],
  });
});

describe("periods", () => {
  it("resolves named and custom periods in IST dates; this month runs to month end", () => {
    expect(resolvePeriod("this-month", "2026-10-10")).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("last-month", "2026-01-15")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("fytd", "2026-10-10")).toMatchObject({ from: "2026-04-01", to: "2026-10-10" });
    expect(resolvePeriod("last-fy", "2026-10-10")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(resolvePeriod("custom:2026-08-01:2026-08-31")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(resolvePeriod("custom:2026-09-01:2026-08-01").key).toBe("this-month"); // reversed range ignored
    expect(resolvePeriod("nonsense", "2026-02-10")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("compliance dashboard (P5-01)", () => {
  it("Partner sees the firm: on time, late, overdue; not-applicable excluded; exposure from the master rate", async () => {
    const d = await complianceDashboard(actorOf(w.partner), { period: AUG, today: TODAY });
    expect(d.scope).toBe("firm");
    expect(d.headline).toMatchObject({ due: 4, filedOnTime: 2, filedLate: 1, overdue: 1, upcoming: 0, onTimePct: 66.7, overdueNow: 1 });
    // GST-R1-M: ₹50/day, 11 days late on 5 Sep (due 25 Aug).
    expect(d.topExposures[0]).toMatchObject({ daysLate: 11, feePaise: 55_000, interestPaise: 0, hasRate: true, needsTaxDue: false });
    expect(d.headline.exposurePaise).toBe(55_000);
  });

  it("a Manager sees only the team's clients; the Practice Admin sees the firm; Staff, HR and portal are refused", async () => {
    const m = await complianceDashboard(actorOf(w.m1), { period: AUG, today: TODAY });
    expect(m.scope).toBe("team");
    expect(m.headline).toMatchObject({ due: 3, filedOnTime: 1, filedLate: 1, overdue: 1, onTimePct: 50 });
    expect((await complianceDashboard(actorOf(w.m2), { period: AUG, today: TODAY })).headline).toMatchObject({ due: 1, filedOnTime: 1 });
    expect((await complianceDashboard(actorOf(w.pa), { period: AUG, today: TODAY })).headline.due).toBe(4);
    for (const u of [w.s1, w.a1, w.hr]) await expect(complianceDashboard(actorOf(u), { period: AUG })).rejects.toThrow(/access/);
    await expect(complianceDashboard(w.portal, { period: AUG })).rejects.toThrow();
  });
});

describe("personal dashboard (P5-01)", () => {
  it("shows only the person's own effort and tasks", async () => {
    const d = await personalDashboard(actorOf(w.s1), { period: AUG, today: TODAY });
    expect(d.effort).toMatchObject({ hours: 7.5, clientHours: 7.5, chargeableHours: 7.5 });
    expect(d.effort.topClients).toEqual([{ name: w.c1.name, hours: 7.5 }]);
    expect(d.tasks).toMatchObject({ open: 1, overdue: 1, filedThisFy: 2, onTimePctThisFy: 50 });
    expect(JSON.stringify(d)).not.toContain(w.c2.name);
    await expect(personalDashboard(w.portal)).rejects.toThrow();
  });

  it("an ended assignment no longer counts as open work", async () => {
    const t = await task(w.c1.id, null, { key: "A5", due: "2026-09-30", status: "UPCOMING" });
    await db().taskAssignment.create({ data: { taskId: t.id, userId: w.s1.id, role: "ASSIGNEE", fromDate: "2026-04-01", toDate: "2026-09-01" } });
    expect((await personalDashboard(actorOf(w.s1), { period: AUG, today: TODAY })).tasks.open).toBe(1);
  });
});

describe("engagement dashboard (P5-01)", () => {
  it("budget burn and stages for anyone on the engagement; people only for Managers/Partners; billing only with billing.view", async () => {
    const asStaff = await engagementDashboard(actorOf(w.s1), w.e1.id);
    expect(asStaff.budget).toMatchObject({ budgetHours: 10, usedHours: 7.5, percent: 75, health: "OnTrack" });
    expect(asStaff.byStage).toEqual([{ stage: "Preparation", hours: 4 }, { stage: "Review", hours: 3.5 }]);
    expect(asStaff.byPerson).toBeNull();
    expect(asStaff.billing).toBeNull();
    const asManager = await engagementDashboard(actorOf(w.m1), w.e1.id);
    expect(asManager.byPerson).toEqual([{ name: w.s1.displayName, hours: 7.5 }]);
    expect(asManager.billing).not.toBeNull();
    await expect(engagementDashboard(actorOf(w.s2), w.e1.id)).rejects.toThrow();
    await expect(engagementDashboard(actorOf(w.hr), w.e1.id)).rejects.toThrow();
  });

  it("budget bands follow the setting; the portfolio is scoped and sorted by burn", async () => {
    await db().workEntry.create({ data: { userId: w.s1.id, date: "2026-08-05", clientId: w.c1.id, engagementId: w.e1.id, minutes: 120 } });
    expect((await engagementDashboard(actorOf(w.m1), w.e1.id)).budget).toMatchObject({ percent: 95, health: "AtRisk", signal: "Approaching budget" });
    const p = await engagementPortfolio(actorOf(w.m1));
    expect(p.rows.map((r) => r.id)).toEqual([w.e1.id]);
    expect(p.summary).toMatchObject({ active: 1, atRisk: 1, over: 0 });
    expect((await engagementPortfolio(actorOf(w.partner))).rows[0]!.id).toBe(w.e1.id);
    await expect(engagementPortfolio(actorOf(w.s1))).rejects.toThrow(/access/);
  });
});

describe("firm dashboard (P5-01)", () => {
  it("Partners only; compliance headline is the compliance dashboard's", async () => {
    const d = await firmDashboard(actorOf(w.partner), { period: AUG, today: TODAY });
    expect(d.compliance).toMatchObject({ due: 4, filedOnTime: 2, filedLate: 1 });
    expect(d.effort).toMatchObject({ hours: 14.5, clientHours: 14.5 });
    expect(d.trend).toHaveLength(12);
    for (const u of [w.m1, w.pa, w.hr, w.s1]) await expect(firmDashboard(actorOf(u))).rejects.toThrow(/access/);
  });
});
