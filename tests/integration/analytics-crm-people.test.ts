import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeUser } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { crmDashboard } from "@/server/services/analytics/crm";
import { peopleDashboard } from "@/server/services/analytics/people";

let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = "2026-09-30";
const SEP = "custom:2026-09-01:2026-09-30";
const at = (d: string) => new Date(`${d}T10:00:00+05:30`);

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  // CRM
  await db().lead.create({ data: { name: "Won Lead", stage: "WON", source: "REFERRAL", estFeePaise: 100_000, createdAt: at("2026-09-05"), wonAt: at("2026-09-20"), clientId: w.c1.id } });
  await db().lead.create({ data: { name: "Lost Lead", stage: "LOST", source: "REFERRAL", lostReason: "Fee too high", createdAt: at("2026-09-06"), updatedAt: at("2026-09-25") } });
  await db().lead.create({ data: { name: "New Lead", stage: "NEW", source: "WEBSITE", estFeePaise: 50_000, nextFollowUp: "2026-09-20", createdAt: at("2026-09-08") } });
  await db().lead.create({ data: { name: "Old Lead", stage: "MEETING", source: "EVENT", estFeePaise: 70_000, createdAt: at("2026-08-01") } });
  const p = { clientId: w.c1.id, serviceLine: "GST" };
  await db().proposal.create({ data: { ...p, title: "P1", status: "SENT", feePaise: 200_000, validUntil: "2026-10-03" } });
  await db().proposal.create({ data: { ...p, title: "P2", status: "SENT", serviceLine: "AUDIT", feeBasis: "TIME", ratePaise: 100_000, budgetMinutes: 120 } });
  await db().proposal.create({ data: { ...p, title: "P3", status: "ACCEPTED", feePaise: 300_000, decidedAt: at("2026-09-10") } });
  await db().proposal.create({ data: { ...p, title: "P4", status: "REJECTED", feePaise: 90_000, decidedAt: at("2026-09-12") } });
  for (const [rating, received] of [[5, true], [2, true], [null, false]] as const) {
    await db().feedback.create({ data: { engagementId: w.e1.id, clientId: w.c1.id, rating, requestedAt: at("2026-09-15"), receivedAt: received ? at("2026-09-18") : null } });
  }
  // People
  await db().employeeProfile.create({ data: { userId: w.s1.id, employeeCode: "E-S1", joiningDate: "2026-09-10" } });
  const gone = await makeUser("STAFF");
  await db().user.update({ where: { id: gone.id }, data: { active: false, deactivatedAt: at("2026-09-15") } });
  await db().employeeProfile.create({ data: { userId: gone.id, employeeCode: "E-GONE", joiningDate: "2024-01-01", exitDate: "2026-09-15" } });
  await db().leaveRequest.create({ data: { userId: w.s1.id, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: "2026-09-28", toDate: "2026-10-02", halfDays: 10, status: "APPROVED" } });
  await db().leaveRequest.create({ data: { userId: w.s2.id, leaveType: "SICK", reason: "SICK", fromDate: "2026-10-05", toDate: "2026-10-05", halfDays: 2 } });
});

describe("CRM dashboard (P5-05)", () => {
  it("funnel, conversion, pipeline, acceptance, follow-ups and feedback", async () => {
    const d = await crmDashboard(actorOf(w.partner), { period: SEP, today: TODAY });
    expect(d.headline).toMatchObject({
      leadsCreated: 3, won: 1, lost: 1, conversionPct: 50, avgDaysToWin: 15, wonFeePaise: 100_000,
      openLeads: 2, openLeadFeePaise: 120_000, followUpsOverdue: 1,
      proposalsSent: 2, pipelinePaise: 400_000, acceptancePct: 50, acceptedPaise: 300_000, expiringSoon: 1,
      avgRating: 3.5, feedbackReceived: 2, feedbackRequested: 3, lowRatings: 1,
    });
    expect(d.funnel.find((f) => f.stage === "WON")!.count).toBe(1);
    expect(d.sources[0]).toMatchObject({ source: "REFERRAL", leads: 2, won: 1, wonPct: 50 });
    expect(d.lostReasons).toEqual([{ reason: "Fee too high", count: 1 }]);
    expect(d.pipelineByLine.map((l) => [l.key, l.paise])).toEqual([["GST", 200_000], ["AUDIT", 200_000]]);
    expect(d.clientGrowth).toHaveLength(12);
  });

  it("is Partner only", async () => {
    for (const u of [w.m1, w.pa, w.hr, w.s1]) await expect(crmDashboard(actorOf(u))).rejects.toThrow(/access/);
    await expect(crmDashboard(w.portal)).rejects.toThrow();
  });
});

describe("People dashboard (P5-06)", () => {
  it("headcount, joiners and leavers, attrition, leave by type and pending leave", async () => {
    const d = await peopleDashboard(actorOf(w.hr), { period: SEP, today: TODAY });
    expect(d.headline.headcount).toBe(await db().user.count({ where: { active: true, isSystem: false } }));
    expect(d.headline).toMatchObject({ joiners: 1, leavers: 1, leavers12: 1, pendingLeave: 1 });
    expect(d.headline.attritionPct).not.toBeNull();
    expect(d.leaveByType).toEqual([{ type: "PERSONAL", days: 3 }]); // 28–30 Sep of a 5-day leave
    expect(d.tenure.reduce((a, t) => a + t.count, 0)).toBe(d.headline.headcount);
  });

  it("is for Partners and HR only and carries no client data", async () => {
    const d = await peopleDashboard(actorOf(w.partner), { period: SEP, today: TODAY });
    const text = JSON.stringify(d);
    for (const c of [w.c1, w.c2]) expect(text).not.toContain(c.name);
    expect(text).not.toMatch(/clientId|feePaise|ratePaise|salary/i);
    for (const u of [w.m1, w.pa, w.s1]) await expect(peopleDashboard(actorOf(u))).rejects.toThrow(/access/);
    await expect(peopleDashboard(w.portal)).rejects.toThrow();
  });
});
