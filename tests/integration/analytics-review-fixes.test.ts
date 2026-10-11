import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeEngagement, keepCurrentWeekOpen } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst, weekStart } from "@/server/lib/dates";
import { complianceDashboard } from "@/server/services/analytics/compliance";
import { personalDashboard } from "@/server/services/analytics/personal";
import { profitabilityDashboard } from "@/server/services/analytics/profitability";
import { budgetEstimate } from "@/server/services/analytics/estimates";
import { capacityForecast } from "@/server/services/analytics/capacity";
import { listTasks } from "@/server/services/tasks/service";

/** Regression tests for the release-readiness review of the analytics code (D-97). */
let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = todayIst();
let seq = 0;
const task = (clientId: string, data: Record<string, unknown>) => db().task.create({ data: { clientId, title: `R${++seq}`, periodKey: `RF${seq}`, ...data } });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await keepCurrentWeekOpen();
});

describe("compliance counts and their drill-down agree", () => {
  it("superseded tasks are not waiting on the client, and the overdue list matches the overdue count", async () => {
    const live = await task(w.c1.id, { status: "PENDING_FROM_CLIENT", pendingFromClient: true, effectiveDueDate: addDays(TODAY, -3) });
    await task(w.c1.id, { status: "PENDING_FROM_CLIENT", pendingFromClient: true, effectiveDueDate: addDays(TODAY, -3), supersededByTaskId: live.id });
    const firm = await db().client.create({ data: { code: "CL-FIRM", name: "Our firm", isFirm: true, constitution: "PARTNERSHIP", searchName: "our firm" } });
    await task(firm.id, { status: "IN_PROGRESS", effectiveDueDate: addDays(TODAY, -2) });
    const d = await complianceDashboard(actorOf(w.partner), { today: TODAY });
    expect(d.headline.waitingOnClient).toBe(1);
    const list = await listTasks(actorOf(w.partner), { overdueOn: TODAY, mine: false });
    expect(list.map((t) => t.id)).toEqual([live.id]);
    expect(d.headline.overdueNow).toBe(list.length);
  });
});

describe("personal hours", () => {
  it("this week's hours add the raw minutes, not rounded days", async () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(TODAY), i)).filter((d) => d <= TODAY);
    await db().workEntry.createMany({ data: days.map((date) => ({ userId: w.s2.id, date, clientId: w.c2.id, engagementId: w.e2.id, minutes: 20 })) });
    const d = await personalDashboard(actorOf(w.s2), { today: TODAY });
    expect(d.effort.weekHours).toBe(Math.round((days.length * 20) / 6) / 10);
  });
});

describe("budget estimate", () => {
  it("the usual split by stage is the median share, robust to one runaway engagement", async () => {
    for (const [i, review] of [60, 60, 540].entries()) {
      const e = await db().engagement.create({ data: { code: `EN-S${i}`, clientId: w.c2.id, name: `ROC ${i}`, serviceLine: "COMPANY_LAW", engagementType: "ROC_ANNUAL", status: "COMPLETED", startDate: `202${3 + i}-05-01` } });
      await db().workEntry.createMany({ data: [
        { userId: w.s2.id, date: `202${3 + i}-05-02`, clientId: w.c2.id, engagementId: e.id, minutes: 540, stageName: "Preparation" },
        { userId: w.s2.id, date: `202${3 + i}-05-03`, clientId: w.c2.id, engagementId: e.id, minutes: review, stageName: "Review" },
      ] });
    }
    const est = await budgetEstimate(actorOf(w.partner), { engagementType: "ROC_ANNUAL" });
    expect(est.byStage).toEqual([{ stage: "Preparation", sharePct: 90 }, { stage: "Review", sharePct: 10 }]);
    expect((await budgetEstimate(actorOf(w.partner), { engagementType: "ROC_ANNUAL", clientId: w.c2.id })).sameClient).toMatchObject({ code: "EN-S2" });
  });
});

describe("unbilled work", () => {
  it("a fixed fee never billed counts at its fee before any hours are logged", async () => {
    const e = await makeEngagement(w.c1.id);
    await db().engagement.update({ where: { id: e.id }, data: { feeBasis: "FIXED", feePaise: 1_000_000, startDate: addDays(TODAY, -40) } });
    const d = await profitabilityDashboard(actorOf(w.partner), { today: TODAY });
    expect(d.wip.top.find((r) => r.id === e.id)).toMatchObject({ hours: 0, costPaise: 0, valuePaise: 1_000_000, ageDays: 40, lastInvoice: null });
  });
});

describe("capacity rebalancing", () => {
  it("does not suggest a teammate who has room this week but not in the next week the task spans", async () => {
    // Fixed weeks (Mon 7 Dec 2026), work spread over the 4 days before each due date.
    await db().setting.upsert({ where: { key: "capacity.leadDays" }, update: { valueJson: "4" }, create: { key: "capacity.leadDays", valueJson: "4" } });
    const today = "2026-12-07";
    const t = await task(w.c1.id, { status: "IN_PROGRESS", effectiveDueDate: "2026-12-15", budgetMinutes: 3600 }); // 15 h/day: Fri 11, Sat 12 | Mon 14, Tue 15
    await db().taskAssignment.create({ data: { taskId: t.id, userId: w.a1.id, role: "ASSIGNEE", fromDate: "2026-04-01" } });
    const x = await task(w.c1.id, { status: "IN_PROGRESS", effectiveDueDate: "2026-12-10", budgetMinutes: 2500 }); // shared, so not movable
    for (const u of [w.a1, w.s1]) await db().taskAssignment.create({ data: { taskId: x.id, userId: u.id, role: "ASSIGNEE", fromDate: "2026-04-01" } });
    const block = await task(w.c1.id, { status: "IN_PROGRESS", effectiveDueDate: "2026-12-18", budgetMinutes: 4000 }); // fills the senior next week
    await db().taskAssignment.create({ data: { taskId: block.id, userId: w.senior.id, role: "ASSIGNEE", fromDate: "2026-04-01" } });
    const cap = await capacityForecast(actorOf(w.partner), { today });
    const a1 = cap.people.find((p) => p.id === w.a1.id)!;
    expect(a1.cells[0]!.band).toBe("over"); // the Article is overloaded this week
    // The senior has room this week but not next week, so taking the whole task would overload them: no suggestion.
    expect(cap.suggestions.find((s) => s.taskId === t.id)).toBeUndefined();
    await db().setting.delete({ where: { key: "capacity.leadDays" } });
  });
});
