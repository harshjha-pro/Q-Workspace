import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { runWeeklySummaries, summaryWeek, weeklySummary } from "@/server/services/analytics/weekly";
import { budgetEstimate } from "@/server/services/analytics/estimates";

let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = "2026-10-12"; // Monday: last week is 5–11 Oct
let seq = 0;
const task = (clientId: string, due: string, status: string, extra: Record<string, unknown> = {}) =>
  db().task.create({ data: { clientId, title: `T${++seq}`, periodKey: `W${seq}`, effectiveDueDate: due, status, ...extra } });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await task(w.c1.id, "2026-10-06", "FILED", { filedDate: "2026-10-05" });
  await task(w.c1.id, "2026-10-07", "FILED_LATE", { filedDate: "2026-10-09" });
  await task(w.c1.id, "2026-10-08", "IN_PROGRESS");
  await task(w.c1.id, "2026-10-14", "PENDING_FROM_CLIENT", { pendingFromClient: true, pendingSince: "2026-10-10" });
  await task(w.c2.id, "2026-10-01", "IN_PROGRESS");
  await db().engagement.update({ where: { id: w.e1.id }, data: { budgetMinutes: 600 } });
  await db().workEntry.createMany({ data: [
    { userId: w.s1.id, date: "2026-09-30", clientId: w.c1.id, engagementId: w.e1.id, minutes: 400 },
    { userId: w.s1.id, date: "2026-10-06", clientId: w.c1.id, engagementId: w.e1.id, minutes: 200 },
  ] });
  await db().leaveRequest.create({ data: { userId: w.s1.id, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: "2026-10-13", toDate: "2026-10-14", halfDays: 4, status: "APPROVED" } });
});

describe("weekly summary (P5-08)", () => {
  it("defaults to last Monday–Sunday and the week ahead", () => {
    expect(summaryWeek(undefined, TODAY)).toEqual({ from: "2026-10-05", to: "2026-10-11", nextFrom: "2026-10-12", nextTo: "2026-10-18" });
    expect(summaryWeek("2026-09-17", TODAY).from).toBe("2026-09-14");
  });

  it("a Manager gets fixed-rule lines for the team, most urgent first", async () => {
    const d = await weeklySummary(actorOf(w.m1), { today: TODAY });
    const by = Object.fromEntries(d.items.map((i) => [i.key, i]));
    expect(d.scope).toBe("team");
    expect(by["due-last-week"]).toMatchObject({ tone: "bad", text: "3 filings fell due last week: 1 filed on time, 1 late, 1 still open." });
    expect(by.overdue).toMatchObject({ tone: "bad", text: "1 task is overdue today." });
    expect(by["due-next-week"]!.text).toBe("1 task due in the week of 12-Oct-2026, 1 waiting on the client, 1 with nobody assigned.");
    expect(by.budgets).toMatchObject({ tone: "bad" });
    expect(by.budgets!.text).toContain("budget reached");
    expect(by.effort!.text).toBe("3.3 hrs logged by the team last week (week before: 6.7 hrs).");
    expect(by.leave!.text).toBe(`On leave in the week ahead: ${w.s1.displayName} (2 days).`);
    expect(by.billing).toBeUndefined();
    expect(d.items[0]!.tone).toBe("bad");
    expect(d.headline).toBe("3 things to act on");
  });

  it("Partners see the firm and billing; Staff, Practice Admin, HR and portal are refused", async () => {
    const d = await weeklySummary(actorOf(w.partner), { today: TODAY });
    expect(d.items.find((i) => i.key === "overdue")!.text).toBe("2 tasks are overdue today.");
    expect(d.items.find((i) => i.key === "billing")).toBeTruthy();
    for (const u of [w.s1, w.pa, w.hr]) await expect(weeklySummary(actorOf(u))).rejects.toThrow(/access/);
    await expect(weeklySummary(w.portal)).rejects.toThrow();
  });

  it("the Monday job notifies each Partner and team-lead Manager once", async () => {
    const r = await runWeeklySummaries(TODAY);
    expect(r).toMatchObject({ week: "2026-10-05", recipients: 3, sent: 3 });
    expect(await db().notification.findFirst({ where: { userId: w.m1.id, kind: "WEEKLY_SUMMARY" } })).toMatchObject({ link: "/analytics/weekly?week=2026-10-05" });
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "WEEKLY_SUMMARY" } })).toBe(0);
    expect((await runWeeklySummaries(TODAY)).sent).toBe(0);
  });
});

describe("budget estimate from past actuals (P5-08)", () => {
  it("median and range of similar engagements; the same client's last actuals come first", async () => {
    const mk = async (clientId: string, code: string, start: string, parts: [string, number][]) => {
      const e = await db().engagement.create({ data: { code, clientId, name: `ROC ${code}`, serviceLine: "COMPANY_LAW", engagementType: "ROC_ANNUAL", status: "COMPLETED", startDate: start, budgetMinutes: 480 } });
      for (const [stageName, minutes] of parts) await db().workEntry.create({ data: { userId: w.s1.id, date: start, clientId, engagementId: e.id, minutes, stageName } });
      return e;
    };
    await mk(w.c1.id, "EN-R1", "2025-05-01", [["Preparation", 400], ["Review", 200]]);
    await mk(w.c2.id, "EN-R2", "2025-05-01", [["Preparation", 900], ["Review", 300]]);
    await mk(w.c2.id, "EN-R3", "2024-05-01", [["Preparation", 600], ["Review", 300]]);
    const any = await budgetEstimate(actorOf(w.partner), { engagementType: "ROC_ANNUAL", today: TODAY });
    expect(any).toMatchObject({ samples: 3, medianHours: 15, rangeHours: [12.5, 17.5], sameClient: null, suggestedHours: 15 });
    expect(any.byStage.map((s) => s.stage)).toEqual(["Preparation", "Review"]);
    const c1 = await budgetEstimate(actorOf(w.m1), { engagementType: "ROC_ANNUAL", clientId: w.c1.id, today: TODAY });
    expect(c1).toMatchObject({ suggestedHours: 10, sameClient: { code: "EN-R1", loggedHours: 10, budgetHours: 8 } });
    expect(c1.basis).toContain("Last time for this client");
    expect((await budgetEstimate(actorOf(w.partner), { engagementType: "NOTHING_LIKE_IT" })).suggestedHours).toBeNull();
    for (const u of [w.s1, w.a1, w.hr]) await expect(budgetEstimate(actorOf(u), { engagementType: "ROC_ANNUAL" })).rejects.toThrow(/access/);
  });
});
