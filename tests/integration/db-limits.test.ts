import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { engagementPortfolio } from "@/server/services/analytics/engagements";
import { auditFilePercents } from "@/server/services/dms/folders";

/**
 * Real-firm scale (D-95): queries with 1,000+ ids must work. Prisma assumed SQLite's old 999-parameter limit and
 * refused them (P2029), which broke the engagement portfolio of a firm with over a thousand engagements.
 */
let w: Awaited<ReturnType<typeof buildWorld>>;
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});

describe("large id lists (D-95)", () => {
  it("an in-list of 5,000 ids runs for find, count and groupBy", async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `missing-${i}`);
    expect(await db().task.count({ where: { id: { in: ids } } })).toBe(0);
    expect(await db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: ids } }, _sum: { minutes: true } })).toEqual([]);
    expect(await db().invoice.findMany({ where: { OR: [{ engagementId: { in: ids } }, { lines: { some: { engagementId: { in: ids } } } }] } })).toEqual([]);
  });

  it("the engagement portfolio works with 1,200 active engagements", async () => {
    await db().engagement.createMany({
      data: Array.from({ length: 1200 }, (_, i) => ({ code: `EN-L${String(i).padStart(5, "0")}`, clientId: w.c1.id, name: `Bulk ${i}`, serviceLine: "GST", engagementType: "GST_RETURN", budgetMinutes: 600 })),
    });
    const p = await engagementPortfolio(actorOf(w.partner));
    expect(p.summary.active).toBeGreaterThanOrEqual(1200);
  });

  it("audit file completeness for many engagements reads defaults without creating rows", async () => {
    const ids = (await db().engagement.findMany({ select: { id: true }, take: 1100 })).map((e) => e.id);
    const before = await db().auditFileSection.count();
    const m = await auditFilePercents(ids);
    expect(m.size).toBe(ids.length);
    expect([...m.values()].every((p) => p === 0)).toBe(true);
    expect(await db().auditFileSection.count()).toBe(before);
  });
});
