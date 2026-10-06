import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst } from "@/server/lib/dates";
import { homeData, thisWeek, groupView, complianceStrip } from "@/server/services/dashboard/service";
import { calendarItems, toIcs, myIcs } from "@/server/services/calendar/service";
import { runExport } from "@/server/services/exports/service";
import { csvCell } from "@/server/lib/csv";
import { createEntries } from "@/server/services/work/service";
import { listTemplates, createDraft, publishVersion } from "@/server/services/templates/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const group = await db().clientGroup.create({ data: { code: "GR-T1", name: "Test group" } });
  await db().client.update({ where: { id: w.c1.id }, data: { groupId: group.id } });
  const version = await db().stageTemplateVersion.findFirstOrThrow({ where: { template: { code: "GST_RETURN" }, status: "ACTIVE" } });
  for (const [title, due, status] of [["GSTR-3B Aug", addDays(today, 2), "IN_PROGRESS"], ["GSTR-1 Jul", addDays(today, -3), "UPCOMING"], ["Unassigned", addDays(today, 5), "UPCOMING"]] as const) {
    const t = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title, periodKey: title, complianceTypeCode: "GST-3B-M", effectiveDueDate: due, status, stageTemplateVersionId: version.id, stageIndex: 2 } });
    if (title !== "Unassigned") await db().taskAssignment.create({ data: { taskId: t.id, userId: w.s1.id, role: "ASSIGNEE", fromDate: today } });
  }
  await createEntries(actorOf(w.s1), { dates: [today], engagementId: w.e1.id, minutes: 360, description: "=HYPERLINK(\"x\")" });
});

describe("home and This Week (P2-01..04, P2-25, P2-41)", () => {
  it("staff home shows hours logged (not a target), due strip and counts", async () => {
    const h = await homeData(actorOf(w.s1));
    expect(h.snapshot.todayMinutes).toBe(360);
    expect(h.snapshot.overdue).toBe(1);
    expect(h.dueThisWeek.length).toBeGreaterThanOrEqual(1);
    expect(h.complianceStrip).toBeNull();
  });

  it("manager home shows the compliance strip and unallocated tasks", async () => {
    const h = await homeData(actorOf(w.m1));
    expect(h.allocationsPending.map((t) => t.title)).toContain("Unassigned");
    expect(h.complianceStrip!.total).toBeGreaterThanOrEqual(0);
    expect((await homeData(actorOf(w.m2))).allocationsPending).toHaveLength(0);
    const s = await complianceStrip(actorOf(w.partner));
    expect(s.month).toBe(today.slice(0, 7));
  });

  it("This Week lists a person's week; others need scope", async () => {
    const wk = await thisWeek(actorOf(w.s1));
    expect(wk.days).toHaveLength(7);
    expect(wk.overdue.length + wk.days.reduce((n, d) => n + d.tasks.length, 0)).toBeGreaterThan(0);
    await expect(thisWeek(actorOf(w.s2), { userId: w.s1.id })).rejects.toThrow();
    expect((await thisWeek(actorOf(w.m1), { userId: w.s1.id })).user.id).toBe(w.s1.id);
  });

  it("group view is scoped (P2-18)", async () => {
    const g = await db().clientGroup.findFirstOrThrow({ where: { code: "GR-T1" } });
    expect((await groupView(actorOf(w.m1), g.id)).clients).toHaveLength(1);
    expect((await groupView(actorOf(w.m2), g.id)).clients).toHaveLength(0);
  });
});

describe("calendar and .ics (P2-26, P2-43)", () => {
  it("personal layer shows my tasks and holidays; compliance layer is scoped", async () => {
    const items = await calendarItems(actorOf(w.s1), { from: addDays(today, -7), to: addDays(today, 30) });
    expect(items.filter((i) => i.kind === "TASK").length).toBe(2);
    const comp = await calendarItems(actorOf(w.m1), { from: addDays(today, -7), to: addDays(today, 30), layer: "compliance" });
    expect(comp.filter((i) => i.kind === "TASK").length).toBe(3);
    expect((await calendarItems(actorOf(w.m2), { from: addDays(today, -7), to: addDays(today, 30), layer: "compliance" })).filter((i) => i.kind === "TASK")).toHaveLength(0);
  });

  it("produces valid RFC 5545 with escaping and folding", async () => {
    const ics = toIcs([{ date: "2026-10-20", kind: "TASK", title: "GSTR-3B; Sep, 2026", sub: "Sharma & Sons — a very long client name that will certainly need folding at seventy-five octets" }], "Test");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261020");
    expect(ics).toContain("DTEND;VALUE=DATE:20261021");
    expect(ics).toContain("GSTR-3B\\; Sep\\, 2026");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(await myIcs(actorOf(w.s1))).toContain("BEGIN:VEVENT");
  });
});

describe("exports (P2-35)", () => {
  it("are scoped, audited and safe against formula injection", async () => {
    const own = await runExport(actorOf(w.s1), "entries", "csv");
    expect(own.rows).toBe(1);
    expect(own.body.toString()).toContain(`"'=HYPERLINK(""x"")"`);
    expect((await runExport(actorOf(w.s2), "tasks", "csv")).rows).toBe(0);
    expect((await runExport(actorOf(w.m1), "tasks", "xlsx")).rows).toBe(3);
    await expect(runExport(actorOf(w.s1), "udin", "csv")).rejects.toThrow();
    expect(await db().exportJob.count()).toBe(3);
    expect(csvCell("-1+1")).toBe(`"'-1+1"`);
  });
});

describe("stage template versioning (P2-24)", () => {
  it("draft → publish with stage mapping moves open tasks", async () => {
    const t = (await listTemplates(actorOf(w.partner))).find((x) => x.code === "GST_RETURN")!;
    const draft = await createDraft(actorOf(w.pa), t.id, { stages: [{ name: "Data" }, { name: "Prepare", reviewLevel: "SENIOR" }, { name: "File", isFiling: true }] });
    await expect(publishVersion(actorOf(w.pa), draft.id, { moveOpenTasks: true })).rejects.toThrow();
    await expect(publishVersion(actorOf(w.partner), draft.id, { moveOpenTasks: true, mapping: {} })).rejects.toThrow(/old stage 3/);
    const r = await publishVersion(actorOf(w.partner), draft.id, { moveOpenTasks: true, mapping: { 2: 1 } });
    expect(r.moved).toBe(3);
    const moved = await db().task.findFirstOrThrow({ where: { title: "GSTR-3B Aug" } });
    expect([moved.stageTemplateVersionId, moved.stageIndex]).toEqual([draft.id, 1]);
    expect(await db().stageTemplateVersion.count({ where: { templateId: t.id, status: "ACTIVE" } })).toBe(1);
  });
});
