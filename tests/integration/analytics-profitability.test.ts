import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { profitabilityDashboard } from "@/server/services/analytics/profitability";

let w: Awaited<ReturnType<typeof buildWorld>>;
const TODAY = "2026-09-30";
const SEP = "custom:2026-09-01:2026-09-30";
let d1: string, d2: string;

async function invoice(clientId: string, engagementId: string | null, date: string, feePaise: number, status: string, receivedPaise = 0) {
  const total = Math.round(feePaise * 1.18);
  return db().invoice.create({
    data: { clientId, engagementId, date, status, taxablePaise: feePaise, igstPaise: total - feePaise, totalPaise: total, receivedPaise: status === "FULLY_RECEIVED" ? total : receivedPaise, lines: { create: { description: "Professional fees", ratePaise: feePaise, amountPaise: feePaise, engagementId } } },
  });
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  // Cost rates (Q-22): Associate ₹400/h to August, ₹500/h from September; Manager ₹1,200/h. A1 has no designation.
  d1 = (await db().designation.create({ data: { name: "Test Associate", level: 2 } })).id;
  d2 = (await db().designation.create({ data: { name: "Test Manager", level: 5 } })).id;
  await db().costRate.createMany({ data: [
    { designationId: d1, ratePaisePerHour: 40_000, effectiveFrom: "2026-04-01", effectiveTo: "2026-08-31" },
    { designationId: d1, ratePaisePerHour: 50_000, effectiveFrom: "2026-09-01" },
    { designationId: d2, ratePaisePerHour: 120_000, effectiveFrom: "2026-04-01" },
  ] });
  await db().user.update({ where: { id: w.s1.id }, data: { designationId: d1 } });
  await db().user.update({ where: { id: w.m1.id }, data: { designationId: d2 } });
  // E1 billed on time (₹2,000/h); E2 a fixed fee of ₹25,000 never billed.
  await db().engagement.update({ where: { id: w.e1.id }, data: { feeBasis: "TIME", ratePaisePerHour: 200_000 } });
  await db().engagement.update({ where: { id: w.e2.id }, data: { feeBasis: "FIXED", feePaise: 2_500_000 } });
  await db().workEntry.createMany({ data: [
    { userId: w.s1.id, date: "2026-08-20", clientId: w.c1.id, engagementId: w.e1.id, minutes: 120, chargeable: true }, // ₹800, billed by I1
    { userId: w.s1.id, date: "2026-09-10", clientId: w.c1.id, engagementId: w.e1.id, minutes: 180, chargeable: true }, // ₹1,500
    { userId: w.m1.id, date: "2026-09-12", clientId: w.c1.id, engagementId: w.e1.id, minutes: 60, chargeable: true }, // ₹1,200
    { userId: w.a1.id, date: "2026-09-15", clientId: w.c2.id, engagementId: w.e2.id, minutes: 60, chargeable: true }, // no rate
  ] });
  await invoice(w.c1.id, w.e1.id, "2026-08-31", 300_000, "RAISED"); // ₹3,000 fees, open
  const i2 = await invoice(w.c2.id, null, "2026-09-20", 400_000, "FULLY_RECEIVED"); // not linked to an engagement
  const r = await db().receipt.create({ data: { clientId: w.c2.id, date: "2026-09-25", amountPaise: i2.totalPaise, mode: "NEFT" } });
  await db().receiptAllocation.create({ data: { receiptId: r.id, invoiceId: i2.id, amountPaise: i2.totalPaise } });
  await invoice(w.c2.id, null, "2026-09-22", 999_999, "DRAFT"); // drafts never count
});

describe("profitability and cash (P5-03)", () => {
  it("headline: fees billed, effective-dated cost, realization, WIP, receivable, DSO and days to collect", async () => {
    const d = await profitabilityDashboard(actorOf(w.partner), { period: SEP, today: TODAY });
    expect(d.headline).toMatchObject({
      billedPaise: 400_000,
      costPaise: 270_000,
      engagementCostPaise: 270_000,
      realizationPct: 148.1,
      wipCostPaise: 270_000,
      wipValuePaise: 800_000 + 2_500_000,
      receivablePaise: 354_000,
      dsoDays: 39, // 354,000 ÷ (354,000 + 472,000) × 90
      daysToCollect: 5,
      invoicesCollected: 1,
      hoursWithoutRate: 1,
    });
  });

  it("realization by service line, lowest realization to date, WIP rows and ageing", async () => {
    const d = await profitabilityDashboard(actorOf(w.partner), { period: SEP, today: TODAY });
    expect(d.realizationByLine).toEqual([
      { key: "NONE", label: "Not linked to an engagement", billedPaise: 400_000, costPaise: 0, realizationPct: null },
      { key: "GST", label: expect.any(String), billedPaise: 0, costPaise: 270_000, realizationPct: 0 },
    ]);
    expect(d.lowestRealization).toEqual([expect.objectContaining({ id: w.e1.id, billedPaise: 300_000, costPaise: 350_000, realizationPct: 85.7 })]);
    expect(d.wip.top).toEqual([
      expect.objectContaining({ id: w.e1.id, hours: 4, costPaise: 270_000, valuePaise: 800_000, ageDays: 20, lastInvoice: "2026-08-31" }),
      expect.objectContaining({ id: w.e2.id, hours: 1, costPaise: 0, valuePaise: 2_500_000, lastInvoice: null }),
    ]);
    expect(d.wip.buckets[0]).toMatchObject({ minutes: 300, costPaise: 270_000 });
    expect(d.cash.ageing.map((b) => b.amountPaise)).toEqual([354_000, 0, 0, 0]);
  });

  it("concentration over 12 months and cost rate per designation (current rate, hours and cost in period)", async () => {
    const d = await profitabilityDashboard(actorOf(w.partner), { period: SEP, today: TODAY });
    expect(d.concentration).toMatchObject({ yearBilledPaise: 700_000, clients: 2, top1Pct: 57.1, top5Pct: 100 });
    expect(d.concentration.top.map((r) => [r.id, r.cumulativePct])).toEqual([[w.c2.id, 57.1], [w.c1.id, 100]]);
    expect(d.costRates.find((r) => r.id === d1)).toMatchObject({ people: 1, ratePaisePerHour: 50_000, effectiveFrom: "2026-09-01", hours: 3, costPaise: 150_000 });
    expect(d.costRates.find((r) => r.id === d2)).toMatchObject({ ratePaisePerHour: 120_000, hours: 1, costPaise: 120_000 });
  });

  it("is Partner only and every view is logged as sensitive", async () => {
    for (const u of [w.m1, w.pa, w.hr, w.s1]) await expect(profitabilityDashboard(actorOf(u))).rejects.toThrow(/access/);
    await expect(profitabilityDashboard(w.portal)).rejects.toThrow();
    const before = await db().sensitiveViewLog.count({ where: { actorUserId: w.partner.id, kind: "SALARY", entityType: "CostRates" } });
    await profitabilityDashboard(actorOf(w.partner), { today: TODAY });
    expect(await db().sensitiveViewLog.count({ where: { actorUserId: w.partner.id, kind: "SALARY", entityType: "CostRates" } })).toBe(before + 1);
  });
});
