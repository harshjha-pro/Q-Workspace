import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { timelineBoard, timelineCell, timelineWindow } from "@/server/services/analytics/timeline";

let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = "2026-09-09"; // Wednesday; the window starts Monday 7 Sep
const O = { today: TODAY, weeks: 4 };
const ids: Record<string, string> = {};

async function task(key: string, clientId: string, engagementId: string, due: string, status: string, users: [string, string][] = []) {
  const t = await db().task.create({ data: { clientId, engagementId, title: `Task ${key}`, periodKey: key, effectiveDueDate: due, status, filedDate: status === "FILED" ? "2026-09-05" : null } });
  for (const [userId, role] of users) await db().taskAssignment.create({ data: { taskId: t.id, userId, role, fromDate: "2026-04-01" } });
  ids[key] = t.id;
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const s1 = w.s1.id;
  await task("X1", w.c1.id, w.e1.id, "2026-09-01", "IN_PROGRESS", [[s1, "ASSIGNEE"]]); // Earlier, overdue
  await task("X2", w.c1.id, w.e1.id, "2026-09-08", "IN_PROGRESS", [[s1, "ASSIGNEE"]]); // week 1, overdue
  await task("X3", w.c1.id, w.e1.id, "2026-09-10", "IN_PROGRESS", [[s1, "ASSIGNEE"], [s1, "MAKER"]]); // week 1, at risk; counted once
  await task("X4", w.c1.id, w.e1.id, "2026-09-15", "FILED", [[s1, "ASSIGNEE"]]); // week 2, filed
  await task("X5", w.c1.id, w.e1.id, "2026-09-01", "FILED"); // closed before the window: not shown
  await task("X6", w.c1.id, w.e1.id, "2026-10-20", "UPCOMING"); // after the window
  await task("Y1", w.c2.id, w.e2.id, "2026-09-22", "UPCOMING", [[w.s2.id, "ASSIGNEE"]]); // week 3, on track
  await db().engagement.update({ where: { id: w.e1.id }, data: { startDate: "2026-09-14", endDate: "2026-09-30", budgetMinutes: 600 } });
  await db().leaveRequest.create({ data: { userId: s1, leaveType: "PERSONAL", reason: "PERSONAL", fromDate: "2026-09-17", toDate: "2026-09-21", halfDays: 8, status: "APPROVED" } });
});

describe("timeline window", () => {
  it("starts on the Monday of the given week and clamps the number of weeks", () => {
    expect(timelineWindow(undefined, 4, TODAY)).toMatchObject({ from: "2026-09-07", to: "2026-10-04", weeks: 4 });
    expect(timelineWindow("2026-09-20", 1, TODAY)).toMatchObject({ from: "2026-09-14", weeks: 2 });
    expect(timelineWindow("bad", 40, TODAY)).toMatchObject({ from: "2026-09-07", weeks: 13 });
  });
});

describe("timeline board (P5-02)", () => {
  it("compliance view: tasks by client and week, the cell takes its most urgent state, urgent rows first", async () => {
    const d = await timelineBoard(actorOf(w.partner), { ...O, view: "compliance" });
    expect(d.rows.map((r) => r.id)).toEqual([w.c1.id, w.c2.id]);
    const [earlier, wk1, wk2, wk3, wk4] = d.rows[0]!.cells;
    expect(earlier).toMatchObject({ count: 1, open: 1, state: "OVERDUE" });
    expect(wk1).toMatchObject({ count: 2, open: 2, state: "OVERDUE" });
    expect(wk2).toMatchObject({ count: 1, open: 0, state: "FILED" });
    expect([wk3!.count, wk4!.count]).toEqual([0, 0]);
    expect(d.rows[1]!.cells[3]).toMatchObject({ count: 1, state: "ON_TRACK" });
    expect(d.totals.map((t) => t.count)).toEqual([1, 2, 1, 1, 0]);
  });

  it("scope: a Manager sees the team's clients, the Practice Admin the firm; Staff, HR and portal are refused", async () => {
    expect((await timelineBoard(actorOf(w.m1), O)).rows.map((r) => r.id)).toEqual([w.c1.id]);
    expect((await timelineBoard(actorOf(w.pa), O)).rows).toHaveLength(2);
    for (const u of [w.s1, w.hr]) await expect(timelineBoard(actorOf(u), O)).rejects.toThrow(/access/);
    await expect(timelineBoard(w.portal, O)).rejects.toThrow();
  });

  it("engagement view: span clipped to the window with budget health, plus tasks per week", async () => {
    const d = await timelineBoard(actorOf(w.m1), { ...O, view: "engagement" });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ id: w.e1.id, span: { from: 2, to: 4, health: "OnTrack" } });
    // e2 has tasks but no dates: shown, its span runs across the window; an engagement with neither is left out.
    expect((await timelineBoard(actorOf(w.m2), { ...O, view: "engagement" })).rows[0]).toMatchObject({ id: w.e2.id, span: { from: 1, to: 4 } });
    expect(d.rows[0]!.cells[1]).toMatchObject({ count: 2, state: "OVERDUE" });
  });

  it("people view: alphabetical team members, current open tasks once per person, leave days; Partner/Manager only", async () => {
    const d = await timelineBoard(actorOf(w.m1), { ...O, view: "people" });
    const names = d.rows.map((r) => r.label);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(d.rows.map((r) => r.id)).not.toContain(w.s2.id);
    const s1 = d.rows.find((r) => r.id === w.s1.id)!;
    expect(s1.cells.map((c) => c.open)).toEqual([1, 2, 0, 0, 0]);
    expect(s1.cells.map((c) => c.leaveDays ?? 0)).toEqual([0, 0, 3, 1, 0]); // Thu–Sat, then Monday (Sunday skipped)
    expect((await timelineBoard(actorOf(w.partner), { ...O, view: "people" })).rows.map((r) => r.id)).toContain(w.s2.id);
    await expect(timelineBoard(actorOf(w.pa), { ...O, view: "people" })).rejects.toThrow(/access/);
  });
});

describe("timeline drill-down (P5-02)", () => {
  it("lists the tasks behind a cell, most urgent first, and nothing outside scope", async () => {
    expect((await timelineCell(actorOf(w.m1), { ...O, rowId: w.c1.id, col: 1 })).map((t) => [t.id, t.state])).toEqual([[ids.X2, "OVERDUE"], [ids.X3, "AT_RISK"]]);
    expect((await timelineCell(actorOf(w.partner), { ...O, rowId: w.c1.id, col: 0 })).map((t) => t.id)).toEqual([ids.X1]);
    expect(await timelineCell(actorOf(w.m1), { ...O, rowId: w.c2.id, col: 3 })).toEqual([]);
    expect((await timelineCell(actorOf(w.m1), { ...O, view: "engagement", rowId: w.e1.id, col: 2 })).map((t) => t.id)).toEqual([ids.X4]);
    expect((await timelineCell(actorOf(w.m1), { ...O, view: "people", rowId: w.s1.id, col: 1 })).map((t) => t.id)).toEqual([ids.X2, ids.X3]);
    expect(await timelineCell(actorOf(w.m1), { ...O, view: "people", rowId: w.s2.id, col: 3 })).toEqual([]);
    expect(await timelineCell(actorOf(w.m1), { ...O, rowId: w.c1.id, col: 9 })).toEqual([]);
    await expect(timelineCell(actorOf(w.s1), { ...O, rowId: w.c1.id, col: 1 })).rejects.toThrow(/access/);
  });
});

describe("timeline engagement rows", () => {
  it("leaves out engagements with no task due and no start or end inside the window", async () => {
    const quiet = await db().engagement.create({ data: { code: "EN-QUIET", clientId: w.c1.id, name: "Quiet retainer", serviceLine: "ACCOUNTING", engagementType: "BOOKS", startDate: "2026-04-01" } });
    const ending = await db().engagement.create({ data: { code: "EN-END", clientId: w.c1.id, name: "Ends soon", serviceLine: "ACCOUNTING", engagementType: "BOOKS", startDate: "2026-04-01", endDate: "2026-09-16" } });
    const rows = (await timelineBoard(actorOf(w.m1), { ...O, view: "engagement" })).rows;
    expect(rows.map((r) => r.id)).not.toContain(quiet.id);
    expect(rows.find((r) => r.id === ending.id)).toMatchObject({ span: { from: 1, to: 2, health: "None" } });
  });
});
