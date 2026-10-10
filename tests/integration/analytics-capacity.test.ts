import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { workingDays } from "@/server/services/leave/service";
import { capacityForecast } from "@/server/services/analytics/capacity";

let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = "2026-09-07"; // Monday
const ids: Record<string, string> = {};
let seq = 0;

async function task(key: string, clientId: string, d: { due: string; status?: string; type?: string; budget?: number; filed?: string; users?: string[]; logged?: number }) {
  const t = await db().task.create({ data: { clientId, title: `Task ${key}`, periodKey: `P${++seq}`, complianceTypeCode: d.type ?? null, effectiveDueDate: d.due, status: d.status ?? "IN_PROGRESS", filedDate: d.filed ?? null, budgetMinutes: d.budget ?? 0 } });
  for (const userId of d.users ?? []) await db().taskAssignment.create({ data: { taskId: t.id, userId, role: "ASSIGNEE", fromDate: "2026-04-01" } });
  if (d.logged) await db().workEntry.create({ data: { userId: (d.users ?? [w.s1.id])[0]!, date: "2026-07-01", clientId, taskId: t.id, minutes: d.logged } });
  ids[key] = t.id;
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  // History for GST-R1-M: 300, 360 and 600 minutes on filed tasks → median 6 h.
  for (const [i, m] of [300, 360, 600].entries()) await task(`H${i}`, w.c1.id, { due: "2026-06-11", status: "FILED", filed: "2026-06-10", type: "GST-R1-M", users: [w.s1.id], logged: m });
  await task("T1", w.c1.id, { due: "2026-09-11", type: "GST-R1-M", users: [w.s1.id], logged: 60 }); // 5 h left, Mon–Fri
  await task("T2", w.c1.id, { due: "2026-09-08", budget: 600, users: [w.s1.id] }); // 10 h on its budget
  await task("T3", w.c1.id, { due: "2026-09-10" }); // no history, no budget
  await task("T4", w.c1.id, { due: "2026-09-09", type: "GST-R1-M" }); // 6 h, nobody assigned
  await task("T5", w.c2.id, { due: "2026-09-01", budget: 120, users: [w.s2.id] }); // overdue: lands on today
  await db().leaveRequest.create({ data: { userId: w.s1.id, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: "2026-09-07", toDate: "2026-09-11", halfDays: 10, status: "APPROVED" } });
});

describe("capacity forecast (P5-04)", () => {
  it("available hours = 8 h × working days less leave; forecast work from past actuals or the task budget", async () => {
    const d = await capacityForecast(actorOf(w.partner), { today: TODAY });
    expect(d.buckets).toHaveLength(13);
    const wk = (await workingDays("2026-09-07", "2026-09-13")).length;
    const s1 = d.people.find((p) => p.id === w.s1.id)!;
    expect(s1.cells[0]).toMatchObject({ capacityHours: (wk - 5) * 8, demandHours: 15, band: "over" });
    expect(d.people.find((p) => p.id === w.senior.id)!.cells[0]).toMatchObject({ capacityHours: wk * 8, demandHours: 0, band: "ok" });
    expect(d.buckets[0]).toMatchObject({ demandHours: 23, unassignedHours: 6 });
    expect(d.byType).toEqual([
      { code: "ONE_OFF", name: "One-off tasks", hours: 12, tasks: 2, source: "task budget" },
      { code: "GST-R1-M", name: expect.any(String), hours: 11, tasks: 2, source: "median of 3 filed" },
    ]);
    expect(d.noEstimate).toMatchObject({ count: 1, sample: [expect.objectContaining({ id: ids.T3 })] });
    expect(d.people.map((p) => p.name)).toEqual([...d.people.map((p) => p.name)].sort((a, b) => a.localeCompare(b)));
    expect(d.people.map((p) => p.id)).not.toContain(w.pa.id);
  });

  it("suggests moving the largest single-assignee task to a teammate with room, until the person is within capacity", async () => {
    const d = await capacityForecast(actorOf(w.partner), { today: TODAY });
    expect(d.suggestions).toHaveLength(1);
    expect(d.suggestions[0]).toMatchObject({ taskId: ids.T2, fromUser: w.s1.id, hours: 10 });
    expect([w.senior.id, w.a1.id]).toContain(d.suggestions[0]!.toUser); // not the Manager: Staff work goes to Staff or Articles
    // Suggestions change nothing.
    expect(await db().taskAssignment.count({ where: { taskId: ids.T2, userId: w.s1.id, toDate: null } })).toBe(1);
  });

  it("monthly view, settings drive the forecast, and it is Partner only", async () => {
    const m = await capacityForecast(actorOf(w.partner), { today: TODAY, grain: "month" });
    expect(m.buckets.map((b) => b.from)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(m.buckets[0]!.demandHours).toBe(23);
    await db().setting.upsert({ where: { key: "capacity.minSamples" }, update: { valueJson: "4" }, create: { key: "capacity.minSamples", valueJson: "4" } });
    const strict = await capacityForecast(actorOf(w.partner), { today: TODAY });
    expect(strict.noEstimate.count).toBe(3); // GST-R1-M history no longer enough
    for (const u of [w.m1, w.pa, w.hr, w.s1]) await expect(capacityForecast(actorOf(u))).rejects.toThrow(/access/);
    await expect(capacityForecast(w.portal)).rejects.toThrow();
  });
});
