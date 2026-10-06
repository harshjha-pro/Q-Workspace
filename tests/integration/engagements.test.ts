import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { createEngagement, assignToEngagement, listEngagements, getEngagement, updateEngagement } from "@/server/services/engagements/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});

describe("engagements (P1-20)", () => {
  it("Manager creates an engagement for a team client with fee basis and the active stage template", async () => {
    const e = await createEngagement(actorOf(w.m1), {
      clientId: w.c1.id, name: "GST returns FY 2026-27", serviceLine: "GST", engagementType: "GST_RETURN", recurrence: "RECURRING",
      feeBasis: "RETAINER", feePaise: 15_000_00, budgetMinutes: 600,
    });
    expect(e.code).toMatch(/^EN-\d{5}$/);
    expect(e.stageTemplateVersionId).toBeTruthy();
    expect(e.managerId).toBe(w.m1.id);
  });

  it("time-based needs a rate; budget is in 15-minute steps", async () => {
    await expect(createEngagement(actorOf(w.m1), { clientId: w.c1.id, name: "Advisory work", serviceLine: "ADVISORY", engagementType: "OTHER", feeBasis: "TIME" })).rejects.toThrow(/hourly rate/);
    await expect(createEngagement(actorOf(w.m1), { clientId: w.c1.id, name: "Advisory work", serviceLine: "ADVISORY", engagementType: "OTHER", budgetMinutes: 50 })).rejects.toThrow();
  });

  it("Manager cannot create for another team's client; Staff cannot create", async () => {
    await expect(createEngagement(actorOf(w.m2), { clientId: w.c1.id, name: "Not mine", serviceLine: "GST", engagementType: "GST_RETURN" })).rejects.toThrow(/access/);
    await expect(createEngagement(actorOf(w.s1), { clientId: w.c1.id, name: "Not allowed", serviceLine: "GST", engagementType: "GST_RETURN" })).rejects.toThrow(/access/);
  });

  it("assignment rules: articles never check, plain staff never check, EQR only by a Partner", async () => {
    await expect(assignToEngagement(actorOf(w.m1), w.e1.id, { userId: w.a1.id, role: "CHECKER" })).rejects.toThrow(/never checkers/);
    await expect(assignToEngagement(actorOf(w.m1), w.e1.id, { userId: w.s1.id, role: "CHECKER" })).rejects.toThrow(/Seniors/);
    await assignToEngagement(actorOf(w.m1), w.e1.id, { userId: w.senior.id, role: "CHECKER" });
    await expect(assignToEngagement(actorOf(w.m1), w.e1.id, { userId: w.m1.id, role: "EQR" })).rejects.toThrow(/Partner/);
    await expect(assignToEngagement(actorOf(w.m1), w.e1.id, { userId: w.hr.id })).rejects.toThrow(/Admins/);
  });

  it("Staff see only engagements they are assigned to, and never fees", async () => {
    const list = await listEngagements(actorOf(w.s1));
    expect(list.map((e) => e.id)).toEqual([w.e1.id]);
    expect(list[0]!.feePaise).toBe(0);
    expect(list[0]!.canSeeFees).toBe(false);
    await expect(getEngagement(actorOf(w.s1), w.e2.id)).rejects.toThrow(/access/);
    const asPartner = await getEngagement(actorOf(w.partner), w.e1.id);
    expect(asPartner.feePaise).toBe(25_000_00);
  });

  it("Manager sees fees read-only for own clients", async () => {
    const e = await getEngagement(actorOf(w.m1), w.e1.id);
    expect(e.canSeeFees).toBe(true);
  });

  it("only a Partner can change fees after creation", async () => {
    await expect(updateEngagement(actorOf(w.m1), w.e1.id, { feePaise: 1 })).rejects.toThrow(/Only a Partner/);
    await updateEngagement(actorOf(w.m1), w.e1.id, { budgetMinutes: 900 });
    await updateEngagement(actorOf(w.partner), w.e1.id, { feePaise: 30_000_00 });
  });

  it("archived engagements are read-only", async () => {
    await updateEngagement(actorOf(w.partner), w.e2.id, { status: "ARCHIVED" });
    await expect(updateEngagement(actorOf(w.partner), w.e2.id, { name: "Changed name" })).rejects.toThrow(/read-only/);
  });
});
