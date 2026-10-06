import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { clientWhere, engagementWhere, userWhere, workEntryWhere, taskWhere } from "@/server/permissions/scopes";
import { scopeOf } from "@/server/permissions/guards";
import type { Actor } from "@/server/permissions/actor";

/**
 * Record-level scoping for every role against every Phase 1 module (brief §11).
 * Expectations come straight from the permission matrix + Q-06 (assigned only).
 */
let w: Awaited<ReturnType<typeof buildWorld>>;
let actors: Record<string, Actor>;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const t1 = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "GSTR-3B Sep 2026", periodKey: "2026-09", complianceTypeCode: "GST-3B-M" } });
  await db().task.create({ data: { clientId: w.c2.id, engagementId: w.e2.id, title: "GSTR-3B Sep 2026", periodKey: "2026-09", complianceTypeCode: "GST-3B-M" } });
  await db().taskAssignment.create({ data: { taskId: t1.id, userId: w.s1.id, role: "ASSIGNEE", fromDate: "2026-09-01" } });
  for (const u of [w.s1, w.a1, w.s2, w.m1]) {
    await db().workEntry.create({ data: { userId: u.id, date: "2026-10-05", minutes: 60, clientId: u === w.s2 ? w.c2.id : w.c1.id } });
  }
  actors = {
    PARTNER: actorOf(w.partner), MANAGER: actorOf(w.m1), STAFF: actorOf(w.s1), ARTICLE: actorOf(w.a1),
    PRACTICE_ADMIN: actorOf(w.pa), HR_ADMIN: actorOf(w.hr), PORTAL: w.portal,
  };
});

async function visibleClients(a: Actor) {
  return (await db().client.findMany({ where: { AND: [clientWhere(a, scopeOf(a, "client.view")), { id: { in: [w.c1.id, w.c2.id] } }] } })).map((c) => c.id).sort();
}

describe("client scope (client.view)", () => {
  const cases: [string, ("c1" | "c2")[]][] = [
    ["PARTNER", ["c1", "c2"]], ["MANAGER", ["c1"]], ["STAFF", ["c1"]], ["ARTICLE", ["c1"]],
    ["PRACTICE_ADMIN", ["c1", "c2"]], ["HR_ADMIN", []], ["PORTAL", ["c1"]],
  ];
  for (const [role, expected] of cases) {
    it(`${role} sees ${expected.join(", ") || "nothing"}`, async () => {
      const ids = expected.map((k) => w[k].id).sort();
      expect(await visibleClients(actors[role]!)).toEqual(ids);
    });
  }
  it("a Staff member of team T2 who is not assigned to C2's engagement would not see it (Q-06 assigned-only)", async () => {
    await db().engagementAssignment.updateMany({ where: { userId: w.s2.id }, data: { toDate: "2026-10-01" } });
    expect(await visibleClients(actorOf(w.s2))).toEqual([]);
  });
});

describe("engagement and task scope", () => {
  const cases: [string, ("e1" | "e2")[]][] = [
    ["PARTNER", ["e1", "e2"]], ["MANAGER", ["e1"]], ["STAFF", ["e1"]], ["ARTICLE", ["e1"]],
    ["PRACTICE_ADMIN", ["e1", "e2"]], ["HR_ADMIN", []], ["PORTAL", ["e1"]],
  ];
  for (const [role, expected] of cases) {
    it(`${role} engagements`, async () => {
      const a = actors[role]!;
      const ids = (await db().engagement.findMany({ where: { AND: [engagementWhere(a, scopeOf(a, "engagement.view")), { id: { in: [w.e1.id, w.e2.id] } }] } })).map((e) => e.id).sort();
      expect(ids).toEqual(expected.map((k) => w[k].id).sort());
    });
    it(`${role} tasks`, async () => {
      const a = actors[role]!;
      const n = await db().task.count({ where: { AND: [taskWhere(a, scopeOf(a, "task.view")), { clientId: { in: [w.c1.id, w.c2.id] } }] } });
      expect(n).toBe(expected.length);
    });
  }
});

describe("people and work-entry scope", () => {
  it("work.viewOthers: Partner all, Manager own team, PA read-all, others none", async () => {
    const count = async (a: Actor) => db().workEntry.count({ where: workEntryWhere(a, scopeOf(a, "work.viewOthers")) });
    expect(await count(actors.PARTNER!)).toBe(4);
    expect(await count(actors.MANAGER!)).toBe(3); // s1, a1 (reports) + m1 self; not s2
    expect(await count(actors.PRACTICE_ADMIN!)).toBe(4);
    expect(await count(actors.STAFF!)).toBe(0);
    expect(await count(actors.HR_ADMIN!)).toBe(0);
  });
  it("work.log is self only", async () => {
    const a = actors.STAFF!;
    const rows = await db().workEntry.findMany({ where: workEntryWhere(a, scopeOf(a, "work.log")) });
    expect(rows.every((r) => r.userId === w.s1.id)).toBe(true);
  });
  it("hr.records.view: HR & Partner firm, Manager team, Staff self, PA none", async () => {
    const ids = async (a: Actor) => (await db().user.findMany({ where: userWhere(a, scopeOf(a, "hr.records.view")) })).map((u) => u.id);
    expect((await ids(actors.HR_ADMIN!)).length).toBeGreaterThanOrEqual(9);
    expect(await ids(actors.STAFF!)).toEqual([w.s1.id]);
    expect((await ids(actors.MANAGER!)).sort()).toEqual([w.m1.id, w.s1.id, w.senior.id, w.a1.id].sort());
    expect(await ids(actors.PRACTICE_ADMIN!)).toEqual([]);
  });
});
