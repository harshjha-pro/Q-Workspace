/**
 * Payroll golden tests (brief: fixed inputs → exact outputs). Rates are seeded by seedGoldenRates() in
 * this folder; every expected figure below is worked by hand from those rows. All amounts are paise.
 * Months used: April 2026 (first month of FY 2026-27, 30 days, 11 months left after it) and
 * September 2026 for the mid-year joiner (6 months left after it). Days basis: calendar days (default).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { actorOf, makeUser } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { seedGoldenRates, makeEmployee, fillMonth } from "./helpers";
import { proposeStructure, decideStructure } from "@/server/services/payroll/structures";
import { saveDeclaration } from "@/server/services/payroll/declarations";
import { createRun, getRun, reviewRun, approveRun, sendBackRun, recalculateRun } from "@/server/services/payroll/runs";

type W = Record<string, Awaited<ReturnType<typeof makeUser>>>;
const w: W = {};

async function structure(userId: string, c: { basic: number; hra?: number; special?: number; kind?: "SALARY" | "STIPEND"; regime?: "NEW" | "OLD"; effectiveFrom?: string }) {
  const s = await proposeStructure(actorOf(w.hr!), { userId, effectiveFrom: c.effectiveFrom ?? "2026-04-01", kind: c.kind ?? "SALARY", regime: c.regime ?? "NEW", basic: c.basic, hra: c.hra ?? 0, special: c.special ?? 0 });
  await decideStructure(actorOf(w.partner!), s.id, true);
}

async function slipFor(runId: string, userId: string) {
  const run = await getRun(actorOf(w.hr!), runId);
  const s = run.payslips.find((p) => p.userId === userId);
  if (!s) throw new Error("payslip missing");
  return s.lines;
}

let april: string;

beforeAll(async () => {
  await resetDb();
  await seedGoldenRates();
  w.hr = await makeUser("HR_ADMIN");
  w.partner = await makeUser("PARTNER");
  w.a = await makeEmployee("STAFF", {});
  w.b = await makeEmployee("STAFF", { gender: "F" });
  w.c = await makeEmployee("STAFF", { esiNumber: "3100000001" });
  w.e = await makeEmployee("STAFF", {});
  w.d = await makeEmployee("STAFF", { joiningDate: "2026-09-16" });

  await structure(w.a.id, { basic: 60_000_00, hra: 24_000_00, special: 26_000_00 }); // ₹1,10,000 / month
  await structure(w.b.id, { basic: 50_000_00, hra: 20_000_00, special: 15_000_00, regime: "OLD" }); // ₹85,000
  await structure(w.c.id, { basic: 10_000_00, hra: 4_000_00, special: 3_850_00 }); // ₹17,850
  await structure(w.e.id, { basic: 40_000_00, hra: 10_000_00 }); // ₹50,000
  await structure(w.d.id, { basic: 1_00_000_00, hra: 40_000_00, special: 60_000_00, effectiveFrom: "2026-09-16" }); // ₹2,00,000

  // (b) declares under the old regime: rent ₹3,00,000 a year (non-metro), 80C ₹1,00,000, 80D ₹30,000 (cap ₹25,000)
  await saveDeclaration(actorOf(w.b), { fyStart: 2026, regime: "OLD", metro: false, items: { HRA_RENT: 3_00_000_00, "80C": 1_00_000_00, "80D_SELF": 30_000_00 }, submit: true });

  await fillMonth(w.a.id, "2026-04", { skip: ["2026-04-07", "2026-04-08"] }); // two working days without entries → 2 days LOP
  for (const u of [w.b, w.c, w.e]) await fillMonth(u!.id, "2026-04");
  april = (await createRun(actorOf(w.hr!), { month: "2026-04" })).id;
});

describe("payroll golden values", () => {
  it("(a) staff, new regime, 2 days loss of pay", async () => {
    const l = await slipFor(april, w.a!.id);
    // Paid half-days = 30 × 2 − 4 LOP half-days = 56 of 60.
    expect(l.attendance.usedLopHalfDays).toBe(4);
    expect(l.result.paidHalfDays).toBe(56);
    // Basic 60,00,000 × 56/60 = 56,00,000; HRA 24,00,000 × 56/60 = 22,40,000; special 26,00,000 × 56/60 = 24,26,666.67 → 24,26,667
    expect(l.result.earned).toMatchObject({ basic: 56_00_000, hra: 22_40_000, special: 24_26_667 });
    expect(l.result.gross).toBe(1_02_66_667); // 56,00,000 + 22,40,000 + 24,26,667
    // PF capped: wages min(56,00,000, 15,00,000) = 15,00,000 → EE 12 % = 1,80,000; EPS 8.33 % = 1,24,950; ER EPF 1,80,000 − 1,24,950 = 55,050
    expect(l.result.pf).toMatchObject({ pfWages: 15_00_000, employee: 1_80_000, employerEps: 1_24_950, employerEpf: 55_050, edli: 7_500, admin: 7_500 });
    expect(l.result.esi.eligible).toBe(false); // full gross 1,10,00,000 > 21,00,000
    expect(l.result.pt).toBe(200_00); // male, gross above ₹10,000, not February
    // TDS: projected = 1,02,66,667 + 1,10,00,000 × 11 = 13,12,66,667; − standard deduction 75,00,000 = 12,37,66,667
    // → rounded to ₹10: 12,37,67,000. Slabs: 5 % × 4,00,00,000 = 20,00,000; 10 % × 4,00,00,000 = 40,00,000;
    // 15 % × (12,37,67,000 − 12,00,00,000 = 37,67,000) = 5,65,050 → 65,65,050.
    // Above the rebate limit: marginal relief caps tax at income above ₹12 lakh = 37,67,000.
    // Cess 4 % = 1,50,680 → 39,17,680 → rounded to ₹10: 39,18,000. Spread over 12 months = 3,26,500.
    expect(l.result.tds!.projectedGross).toBe(13_12_66_667);
    expect(l.result.tds!.tax).toMatchObject({ taxable: 12_37_67_000, slabTax: 65_65_050, rebate: 27_98_050, surcharge: 0, cess: 1_50_680, total: 39_18_000 });
    expect(l.result.tdsAmount).toBe(3_26_500);
    // Net = 1,02,66,667 − (1,80,000 + 20,000 + 3,26,500) = 97,40,167
    expect(l.result.net).toBe(97_40_167);
  });

  it("(b) staff, old regime with 80C, 80D and HRA", async () => {
    const l = await slipFor(april, w.b!.id);
    expect(l.regime).toBe("OLD");
    expect(l.result.gross).toBe(85_00_000);
    expect(l.result.pf.employee).toBe(1_80_000);
    expect(l.result.pt).toBe(200_00); // female, above ₹25,000
    const t = l.result.tds!;
    // Projected gross 85,00,000 × 12 = 10,20,00,000. Annual basic 6,00,00,000; HRA 2,40,00,000.
    expect(t.projectedGross).toBe(10_20_00_000);
    // HRA exemption = min(HRA 2,40,00,000; rent 3,00,00,000 − 10 % basic 60,00,000 = 2,40,00,000; 40 % basic 2,40,00,000) = 2,40,00,000
    expect(t.hraExempt).toBe(2_40_00_000);
    // PT for the year: April 20,000 + 10 months × 20,000 + February 30,000 = 2,50,000 (cap 2,50,000)
    expect(t.ptDeduction).toBe(2_50_000);
    // 80C: declared 1,00,00,000 + own PF 1,80,000 × 12 = 1,21,60,000 (cap 1,50,00,000); 80D: 30,00,000 capped at 25,00,000
    expect(t.chapterVIA.map((x) => [x.code, x.allowed])).toEqual([["80C", 1_21_60_000], ["80D_SELF", 25_00_000]]);
    // Taxable = 10,20,00,000 − 50,00,000 − 2,40,00,000 − 2,50,000 − 1,46,60,000 = 5,80,90,000
    // Old slabs: 5 % × 2,50,00,000 = 12,50,000; 20 % × 80,90,000 = 16,18,000 → 28,68,000; no rebate (> ₹5 lakh)
    // Cess 1,14,720 → 29,82,720 → rounded 29,83,000; ÷ 12 = 2,48,583.33 → rounded to the rupee 2,48,600
    expect(t.tax).toMatchObject({ taxable: 5_80_90_000, slabTax: 28_68_000, rebate: 0, cess: 1_14_720, total: 29_83_000 });
    expect(l.result.tdsAmount).toBe(2_48_600);
    expect(l.result.net).toBe(80_51_400); // 85,00,000 − 1,80,000 − 20,000 − 2,48,600
  });

  it("(c) ESI-eligible low earner", async () => {
    const l = await slipFor(april, w.c!.id);
    expect(l.result.gross).toBe(17_85_000);
    // PF on basic 10,00,000 (below the ceiling): EE 1,20,000; EPS 83,300; ER EPF 36,700
    expect(l.result.pf).toMatchObject({ pfWages: 10_00_000, employee: 1_20_000, employerEps: 83_300, employerEpf: 36_700 });
    // ESI (gross 17,85,000 ≤ 21,00,000): EE 0.75 % = 13,387.5 → next rupee 13,400; ER 3.25 % = 58,012.5 → 58,100
    expect(l.result.esi).toEqual({ eligible: true, wages: 17_85_000, employee: 13_400, employer: 58_100 });
    expect(l.result.pt).toBe(200_00);
    expect(l.result.tdsAmount).toBe(0); // 2,14,20,000 − 75,00,000 is below ₹4 lakh
    expect(l.result.net).toBe(16_31_600); // 17,85,000 − 1,20,000 − 13,400 − 20,000
  });

  it("(d) mid-year joiner (joined 16 September)", async () => {
    await fillMonth(w.d!.id, "2026-09", { from: "2026-09-16" });
    const sep = (await createRun(actorOf(w.hr!), { month: "2026-09" })).id;
    const l = await slipFor(sep, w.d!.id);
    // 15 days before joining are unpaid: paid half-days 60 − 30 = 30 → half of every component
    expect(l.attendance.notEmployed).toBe(15);
    expect(l.attendance.usedLopHalfDays).toBe(0);
    expect(l.result.gross).toBe(1_00_00_000);
    expect(l.result.pf.employee).toBe(1_80_000);
    // Projected = 1,00,00,000 + 2,00,00,000 × 6 (Oct–Mar) = 13,00,00,000; − 75,00,000 = 12,25,00,000
    // Slabs 20,00,000 + 40,00,000 + 15 % × 25,00,000 = 63,75,000 → marginal relief 25,00,000; cess 1,00,000 → 26,00,000
    // Spread over 7 months (Sep–Mar): 3,71,428.57 → 3,71,400
    expect(l.result.tds!.projectedGross).toBe(13_00_00_000);
    expect(l.result.tds!.remainingMonths).toBe(7);
    expect(l.result.tds!.tax.total).toBe(26_00_000);
    expect(l.result.tdsAmount).toBe(3_71_400);
    expect(l.result.net).toBe(94_28_600); // 1,00,00,000 − 1,80,000 − 20,000 − 3,71,400
  });

  it("(e) PF wage ceiling: CAPPED vs FULL", async () => {
    const capped = await slipFor(april, w.e!.id);
    // CAPPED: PF wages 15,00,000 → EE 1,80,000, EPS 1,24,950, ER EPF 55,050, admin 0.5 % = 7,500
    expect(capped.result.pf).toMatchObject({ pfWages: 15_00_000, epsWages: 15_00_000, employee: 1_80_000, employerEps: 1_24_950, employerEpf: 55_050, admin: 7_500 });
    await db().setting.create({ data: { key: "payroll.pfWageBasis", valueJson: JSON.stringify("FULL"), description: "" } });
    await fillMonth(w.e!.id, "2026-05");
    const may = (await createRun(actorOf(w.hr!), { month: "2026-05" })).id;
    const full = await slipFor(may, w.e!.id);
    // FULL: PF wages = basic 40,00,000 → EE 4,80,000; EPS stays on 15,00,000 = 1,24,950; ER EPF 4,80,000 − 1,24,950 = 3,55,050;
    // EDLI on 15,00,000 = 7,500; admin 0.5 % × 40,00,000 = 20,000
    expect(full.result.pf).toEqual({ pfWages: 40_00_000, epsWages: 15_00_000, edliWages: 15_00_000, employee: 4_80_000, employerEps: 1_24_950, employerEpf: 3_55_050, edli: 7_500, admin: 20_000 });
    await db().setting.delete({ where: { key: "payroll.pfWageBasis" } });
  });

  it("(f) article stipend below the minimum blocks approval", async () => {
    const art = await makeEmployee("ARTICLE", { uan: false });
    await db().articleshipRecord.create({ data: { userId: art.id, registrationNo: "WRO0123456", principalId: w.partner!.id, startDate: "2026-01-01", expectedEndDate: "2028-12-31", stipendYear: 1 } });
    await structure(art.id, { basic: 4_500_00, kind: "STIPEND" }); // ₹4,500 against the ICAI year-1 minimum of ₹5,000
    await fillMonth(art.id, "2026-04");
    const run = await createRun(actorOf(w.hr!), { month: "2026-04", kind: "STIPEND" });
    const l = await slipFor(run.id, art.id);
    expect(l.result.gross).toBe(4_500_00);
    expect(l.result.deductions).toEqual([]);
    expect(l.stipend).toMatchObject({ institute: "ICAI", year: 1, minimum: 5_000_00, belowMinimum: true });
    await reviewRun(actorOf(w.hr!), run.id);
    await expect(approveRun(actorOf(w.partner!), run.id)).rejects.toThrow(/below the ICAI\/ICSI minimum/);
    // Revise to ₹5,000, send back, recalculate: approval goes through.
    await structure(art.id, { basic: 5_000_00, kind: "STIPEND" });
    await sendBackRun(actorOf(w.partner!), run.id, "Stipend below minimum");
    await recalculateRun(actorOf(w.hr!), run.id);
    await reviewRun(actorOf(w.hr!), run.id);
    await approveRun(actorOf(w.partner!), run.id);
    expect((await db().payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("APPROVED");
  });
});
