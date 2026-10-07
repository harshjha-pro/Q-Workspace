/**
 * Payroll & attendance seed (spec 11.2, 11.3 policy, 11.5; P3-17, P3-18, P3-36).
 *
 * Reference (idempotent, statutory rows Unverified with a source — D-17):
 *  - PF, ESI, Professional Tax (Maharashtra, Karnataka; Rajasthan levies none, so it has no rows),
 *    income-tax slabs and tax parameters for FY 2026-27, ICAI minimum stipend, leave-policy placeholders (Q-20).
 *  The Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026: the FY 2026-27 values below are the
 *  Finance Act 2025 figures and MUST be verified (and section/form labels renumbered) before use.
 *
 * Demo (uses the services; dates relative to today): encrypted salary structures for every salaried person
 * and stipends for the articles (Partners draw profit share, not salary, so they have none), one revision
 * awaiting approval, declarations, regularisations, leave accrual, demo cost rates, and six months of runs
 * (five locked, the current month in Draft) for salary and stipend. Run after the activity seed (work
 * entries and leave drive attendance).
 */
import type { PrismaClient } from "../../../generated/prisma/client";
import { db } from "../../../server/lib/db";
import { todayIst } from "../../../server/lib/dates";
import type { StaffActor } from "../../../server/permissions/actor";

const FY = "FY2026-27";
const SRC_NEW = "Finance Act 2025 (new regime) — verify for FY 2026-27 under the Income-tax Act, 2025";
const SRC_OLD = "Finance Act 2025 (old regime, Income-tax Act 1961 values) — verify for FY 2026-27 under the Income-tax Act, 2025";
const SRC_ANY = "Finance Act 2025 — verify for FY 2026-27 under the Income-tax Act, 2025";
const L = 1_00_000_00; // ₹1 lakh in paise

export async function seedPayrollReference(prisma: PrismaClient) {
  const by = "system";
  if (!(await prisma.pfRate.findFirst({ where: { effectiveFrom: "2014-09-01" } }))) {
    await prisma.pfRate.create({ data: {
      effectiveFrom: "2014-09-01", employeeBp: 1200, employerEpfBp: 367, employerEpsBp: 833, epsWageCeilingPaise: 15_000_00, pfWageCeilingPaise: 15_000_00, adminBp: 50, edliBp: 50,
      source: "EPF Scheme 1952 / EPS 1995 / EDLI 1976: 12 % + 3.67 % / 8.33 %, wage ceiling ₹15,000 from 01-09-2014, admin 0.50 % from 01-06-2018, EDLI 0.50 % — verify (Labour Codes wage definition)", createdById: by,
    } });
  }
  if (!(await prisma.esiRate.findFirst({ where: { effectiveFrom: "2019-07-01" } }))) {
    await prisma.esiRate.create({ data: { effectiveFrom: "2019-07-01", employeeBp: 75, employerBp: 325, wageCeilingPaise: 21_000_00, source: "ESIC: 0.75 % / 3.25 % from 01-07-2019; wage ceiling ₹21,000 from 01-01-2017 — verify", createdById: by } });
  }
  if ((await prisma.professionalTaxSlab.count({ where: { stateCode: "MH" } })) === 0) {
    const src = "Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975 — Schedule I entry 1 (women up to ₹25,000 exempt from 2023) — verify";
    const s = (gender: string, fromPaise: number, toPaise: number | null, amountPaise: number, feb: number | null) => ({ stateCode: "MH", gender, fromPaise, toPaise, amountPaise, overrideMonth: feb === null ? null : 2, overrideAmountPaise: feb, effectiveFrom: "2023-07-01", source: src, createdById: by });
    await prisma.professionalTaxSlab.createMany({ data: [
      s("M", 0, 7_500_00, 0, null), s("M", 7_500_01, 10_000_00, 175_00, null), s("M", 10_000_01, null, 200_00, 300_00),
      s("F", 0, 25_000_00, 0, null), s("F", 25_000_01, null, 200_00, 300_00),
    ] });
  }
  if ((await prisma.professionalTaxSlab.count({ where: { stateCode: "KA" } })) === 0) {
    const src = "Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976 (threshold ₹25,000 from 2023) — verify";
    await prisma.professionalTaxSlab.createMany({ data: [
      { stateCode: "KA", fromPaise: 0, toPaise: 24_999_99, amountPaise: 0, effectiveFrom: "2023-04-01", source: src, createdById: by },
      { stateCode: "KA", fromPaise: 25_000_00, toPaise: null, amountPaise: 200_00, effectiveFrom: "2023-04-01", source: src, createdById: by },
    ] });
  }
  // Rajasthan (the firm's state) levies no Professional Tax: no rows → 0.

  const slab = (regime: string, from: number, to: number | null, rateBp: number) => ({ fy: FY, regime, fromPaise: from, toPaise: to, rateBp, source: regime === "NEW" ? SRC_NEW : SRC_OLD, createdById: by });
  if ((await prisma.incomeTaxSlab.count({ where: { fy: FY, regime: "NEW" } })) === 0) {
    await prisma.incomeTaxSlab.createMany({ data: [
      slab("NEW", 0, 4 * L, 0), slab("NEW", 4 * L, 8 * L, 500), slab("NEW", 8 * L, 12 * L, 1000), slab("NEW", 12 * L, 16 * L, 1500),
      slab("NEW", 16 * L, 20 * L, 2000), slab("NEW", 20 * L, 24 * L, 2500), slab("NEW", 24 * L, null, 3000),
    ] });
  }
  if ((await prisma.incomeTaxSlab.count({ where: { fy: FY, regime: "OLD" } })) === 0) {
    await prisma.incomeTaxSlab.createMany({ data: [slab("OLD", 0, 2.5 * L, 0), slab("OLD", 2.5 * L, 5 * L, 500), slab("OLD", 5 * L, 10 * L, 2000), slab("OLD", 10 * L, null, 3000)] });
  }
  // Surcharge bands stop at ₹2 crore: ₹5 crore (37 %, old regime) is beyond the Int range of valueInt in paise.
  const params: [string, string, number, string][] = [
    ["ANY", "CESS_BP", 400, "BP"], ["ANY", "ROUND_TAXABLE_TO", 10_00, "PAISE"], ["ANY", "ROUND_TAX_TO", 10_00, "PAISE"],
    ["NEW", "STANDARD_DEDUCTION", 75_000_00, "PAISE"], ["NEW", "REBATE_LIMIT", 12 * L, "PAISE"], ["NEW", "REBATE_MAX", 60_000_00, "PAISE"], ["NEW", "REBATE_MARGINAL_RELIEF", 1, "FLAG"],
    ["NEW", "SURCHARGE_1_FROM", 50 * L, "PAISE"], ["NEW", "SURCHARGE_1_BP", 1000, "BP"], ["NEW", "SURCHARGE_2_FROM", 100 * L, "PAISE"], ["NEW", "SURCHARGE_2_BP", 1500, "BP"], ["NEW", "SURCHARGE_3_FROM", 200 * L, "PAISE"], ["NEW", "SURCHARGE_3_BP", 2500, "BP"],
    ["OLD", "STANDARD_DEDUCTION", 50_000_00, "PAISE"], ["OLD", "REBATE_LIMIT", 5 * L, "PAISE"], ["OLD", "REBATE_MAX", 12_500_00, "PAISE"],
    ["OLD", "SURCHARGE_1_FROM", 50 * L, "PAISE"], ["OLD", "SURCHARGE_1_BP", 1000, "BP"], ["OLD", "SURCHARGE_2_FROM", 100 * L, "PAISE"], ["OLD", "SURCHARGE_2_BP", 1500, "BP"], ["OLD", "SURCHARGE_3_FROM", 200 * L, "PAISE"], ["OLD", "SURCHARGE_3_BP", 2500, "BP"],
    ["OLD", "PT_DEDUCTION_MAX", 2_500_00, "PAISE"], ["OLD", "HRA_RENT_EXCESS_BP", 1000, "BP"], ["OLD", "HRA_METRO_BP", 5000, "BP"], ["OLD", "HRA_NON_METRO_BP", 4000, "BP"],
    ["OLD", "LIMIT_80C", 1.5 * L, "PAISE"], ["OLD", "LIMIT_80CCD1B", 50_000_00, "PAISE"], ["OLD", "LIMIT_80D_SELF", 25_000_00, "PAISE"],
    ["OLD", "LIMIT_80D_PARENTS", 50_000_00, "PAISE"], // senior-citizen parents; ₹25,000 otherwise — verify per employee
    ["OLD", "LIMIT_24B", 2 * L, "PAISE"],
  ];
  for (const [regime, key, valueInt, unit] of params) {
    const where = { fy_regime_key: { fy: FY, regime, key } };
    if (!(await prisma.taxParameter.findUnique({ where }))) {
      await prisma.taxParameter.create({ data: { fy: FY, regime, key, valueInt, unit, source: regime === "NEW" ? SRC_NEW : regime === "OLD" ? SRC_OLD : SRC_ANY, createdById: by } });
    }
  }

  // ICAI minimum monthly stipend by city population and year of training (ICSI to be added by the firm).
  const icai: [string, number, number, number][] = [["POP_20L_PLUS", 5_000_00, 6_000_00, 7_000_00], ["POP_5L_20L", 4_000_00, 5_000_00, 6_000_00], ["POP_BELOW_5L", 3_000_00, 4_000_00, 5_000_00]];
  for (const [locationClass, ...amounts] of icai) {
    for (const [i, amountPaise] of amounts.entries()) {
      const exists = await prisma.stipendMinimum.findFirst({ where: { institute: "ICAI", locationClass, yearOfTraining: i + 1 } });
      if (!exists) await prisma.stipendMinimum.create({ data: { institute: "ICAI", locationClass, yearOfTraining: i + 1, amountPaise, effectiveFrom: "2023-07-01", source: "ICAI — Chartered Accountants Regulations, 1988 as amended 2023 (minimum stipend, new scheme of education and training) — verify", createdById: by } });
    }
  }

  // Leave-policy placeholders (Q-20): firm policy, Unverified until a Partner confirms.
  const POL = "Placeholder — firm to confirm (Q-20)";
  const policies: [string, string, string, number, string, number, boolean][] = [
    ["STAFF", "PERSONAL", "Staff — personal leave", 24, "MONTHLY", 20, true], ["STAFF", "SICK", "Staff — sick leave", 14, "ANNUAL", 0, false],
    ["ADMIN", "PERSONAL", "Admin — personal leave", 24, "MONTHLY", 20, true], ["ADMIN", "SICK", "Admin — sick leave", 14, "ANNUAL", 0, false],
    ["ARTICLE", "PERSONAL", "Articles — personal leave", 24, "ANNUAL", 0, false], ["ARTICLE", "SICK", "Articles — sick leave", 10, "ANNUAL", 0, false], ["ARTICLE", "EXAM_STUDY", "Articles — exam / study leave", 40, "ANNUAL", 0, false],
  ];
  for (const [employeeCategory, leaveType, name, quotaHalfDays, accrual, carryForwardMaxHalfDays, encashable] of policies) {
    const exists = await prisma.leavePolicy.findFirst({ where: { employeeCategory, leaveType, effectiveFrom: "2026-04-01" } });
    if (!exists) await prisma.leavePolicy.create({ data: { name, employeeCategory, leaveType, quotaHalfDays, accrual, carryForwardMaxHalfDays, encashable, effectiveFrom: "2026-04-01", source: POL, createdById: by } });
  }
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------
/** Monthly structure in rupees: [basic, hra, special, other]; regime. */
const SALARIES: Record<string, [number, number, number, number, "NEW" | "OLD"]> = {
  "rohan.iyer": [60_000, 24_000, 26_000, 0, "NEW"],
  "sneha.kulkarni": [50_000, 20_000, 20_000, 0, "NEW"],
  "imran.shaikh": [47_000, 18_800, 19_200, 0, "NEW"],
  "priya.nair": [30_000, 12_000, 14_000, 2_000, "NEW"],
  "vikram.singh": [30_000, 12_000, 13_000, 0, "OLD"],
  "ananya.das": [29_000, 11_600, 13_400, 0, "OLD"],
  "rahul.verma": [28_000, 11_200, 12_800, 0, "NEW"],
  "neha.gupta": [17_000, 6_800, 8_200, 0, "NEW"],
  "karthik.reddy": [16_000, 6_400, 7_600, 0, "NEW"],
  "pooja.joshi": [10_000, 4_000, 5_000, 0, "NEW"], // ESI-eligible
  "siddharth.menon": [9_500, 3_800, 4_700, 0, "NEW"], // ESI-eligible
  "suresh.pillai": [24_000, 9_600, 11_400, 0, "NEW"],
  "lakshmi.narayanan": [22_000, 8_800, 9_200, 0, "NEW"],
};
const ARTICLES = ["aditya.kumar", "meera.pillai", "harsh.patel", "divya.krishnan", "faizan.ali", "ishita.banerjee"];
const COST_RATES: Record<string, number> = { "Partner": 3_000, "Senior Manager": 1_800, "Manager": 1_500, "Senior Associate": 900, "Associate": 600, "Article Assistant": 200, "Practice Administrator": 500, "HR Executive": 500 };

function monthsBack(n: number, today: string) {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export async function seedPayrollDemo() {
  const { proposeStructure, decideStructure } = await import("../../../server/services/payroll/structures");
  const runs = await import("../../../server/services/payroll/runs");
  const { saveDeclaration, verifyDeclaration } = await import("../../../server/services/payroll/declarations");
  const { setCostRate } = await import("../../../server/services/payroll/cost-rates");
  const { requestRegularisation, decideRegularisation } = await import("../../../server/services/attendance/service");
  const { runLeaveAccrual } = await import("../../../server/services/attendance/leave-policies");

  if ((await db().payrollRun.count()) > 0) return;
  const users = new Map((await db().user.findMany({ where: { isSystem: false } })).map((u) => [u.username, u]));
  const actor = (username: string): StaffActor => {
    const u = users.get(username)!;
    return { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
  };
  const hr = actor("lakshmi.narayanan");
  const partner = actor("arvind.mehta");
  const partner2 = actor("kavita.rao");
  const today = todayIst();
  const months = monthsBack(6, today);
  const fyStartOf = (m: string) => (Number(m.slice(5)) >= 4 ? Number(m.slice(0, 4)) : Number(m.slice(0, 4)) - 1);
  const structureFrom = `${months[0]}-01`;
  // The reference seed holds FY 2026-27 tax tables only. When the demo spans another FY, copy them for that
  // FY so the demo runs — marked DEMO ONLY and Unverified (never done outside the demo seed).
  for (const fy of new Set(months.map((m) => `FY${fyStartOf(m)}-${String((fyStartOf(m) + 1) % 100).padStart(2, "0")}`))) {
    if (fy === FY || (await db().incomeTaxSlab.count({ where: { fy } })) > 0) continue;
    for (const r of await db().incomeTaxSlab.findMany({ where: { fy: FY } })) await db().incomeTaxSlab.create({ data: { fy, regime: r.regime, fromPaise: r.fromPaise, toPaise: r.toPaise, rateBp: r.rateBp, source: `DEMO ONLY: copied from ${FY} — not valid for ${fy}`, createdById: "system" } });
    for (const r of await db().taxParameter.findMany({ where: { fy: FY } })) {
      if (!(await db().taxParameter.findUnique({ where: { fy_regime_key: { fy, regime: r.regime, key: r.key } } }))) await db().taxParameter.create({ data: { fy, regime: r.regime, key: r.key, valueInt: r.valueInt, unit: r.unit, source: `DEMO ONLY: copied from ${FY} — not valid for ${fy}`, createdById: "system" } });
    }
  }

  // ESI numbers for the two low earners (fake, 10 digits).
  for (const [u, ip] of [["pooja.joshi", "3100456781"], ["siddharth.menon", "3100456782"]] as const) {
    if (users.has(u)) await db().employeeProfile.update({ where: { userId: users.get(u)!.id }, data: { esiNumber: ip } });
  }

  // Structures: proposed by HR, approved by a Partner (HR's own by the other Partner as well — anyone but HR).
  for (const [username, [basic, hra, special, other, regime]] of Object.entries(SALARIES)) {
    if (!users.has(username)) continue;
    const s = await proposeStructure(hr, { userId: users.get(username)!.id, effectiveFrom: structureFrom, regime, basic: basic * 100, hra: hra * 100, special: special * 100, other: other * 100 });
    await decideStructure(partner, s.id, true);
  }
  for (const username of ARTICLES) {
    if (!users.has(username)) continue;
    const s = await proposeStructure(hr, { userId: users.get(username)!.id, effectiveFrom: structureFrom, kind: "STIPEND", basic: 8_000_00 });
    await decideStructure(partner2, s.id, true);
  }
  // An increment that took effect two months ago, and one awaiting a Partner.
  if (users.has("priya.nair")) {
    const s = await proposeStructure(hr, { userId: users.get("priya.nair")!.id, effectiveFrom: `${months[3]}-01`, basic: 33_000_00, hra: 13_200_00, special: 15_800_00, other: 2_000_00 });
    await decideStructure(partner2, s.id, true);
  }
  if (users.has("neha.gupta")) await proposeStructure(hr, { userId: users.get("neha.gupta")!.id, effectiveFrom: `${months[5]}-01`, basic: 19_000_00, hra: 7_600_00, special: 9_400_00 });

  // Declarations (before the runs, so TDS follows the chosen regime).
  const fyStart = fyStartOf(today);
  if (users.has("vikram.singh")) {
    const d = await saveDeclaration(actor("vikram.singh"), { fyStart, regime: "OLD", metro: false, items: { HRA_RENT: 2_40_000_00, "80C": 1_00_000_00, "80D_SELF": 25_000_00 }, submit: true });
    await verifyDeclaration(hr, d.id, { HRA_RENT: 2_40_000_00, "80C": 90_000_00, "80D_SELF": 25_000_00 }, "80C: one LIC receipt missing");
  }
  if (users.has("ananya.das")) await saveDeclaration(actor("ananya.das"), { fyStart, regime: "OLD", items: { "80C": 1_50_000_00, "24B": 1_80_000_00 }, submit: true });
  if (users.has("priya.nair")) await saveDeclaration(actor("priya.nair"), { fyStart, regime: "NEW", items: {}, submit: true });
  if (users.has("rahul.verma")) await saveDeclaration(actor("rahul.verma"), { fyStart, regime: "NEW", items: { "80C": 50_000_00 } }); // draft

  // Regularisations: one approved in an earlier month, two pending this month.
  const regs: [string, string, string, "PRESENT" | "WFH" | "CLIENT_SITE", boolean][] = [
    ["karthik.reddy", "rohan.iyer", `${months[0]}-14`, "CLIENT_SITE", true],
    ["neha.gupta", "rohan.iyer", `${months[5]}-02`, "PRESENT", false],
    ["pooja.joshi", "sneha.kulkarni", `${months[5]}-03`, "WFH", false],
  ];
  for (const [u, approver, date, as, approve] of regs) {
    if (!users.has(u) || date > today) continue;
    try {
      const r = await requestRegularisation(actor(u), { date, requestedStatus: as, reason: as === "CLIENT_SITE" ? "Stock verification at client; could not log entries" : "Power cut, entries not saved" });
      if (approve) await decideRegularisation(actor(approver), r.id, true);
    } catch {
      /* a date that is already pending/locked is skipped */
    }
  }

  // Cost rates per designation (demo values only; the reference seed leaves them unset).
  for (const d of await db().designation.findMany()) {
    const rupees = COST_RATES[d.name];
    if (rupees && (await db().costRate.count({ where: { designationId: d.id } })) === 0) await setCostRate(partner, { designationId: d.id, ratePaisePerHour: rupees * 100, effectiveFrom: structureFrom });
  }

  await runLeaveAccrual(today);

  // The demo activity gives the office administrators no work entries; attendance is derived from entries,
  // so log their practice-administration days (otherwise every day would be loss of pay).
  const { workingDays } = await import("../../../server/services/leave/service");
  const adminCat = await db().internalCategory.findFirst({ where: { code: "PRACTICE_ADMIN" } });
  const days = (await workingDays(structureFrom, today)).filter((d) => d < today);
  for (const username of ["suresh.pillai", "lakshmi.narayanan"]) {
    const u = users.get(username);
    if (!u) continue;
    const have = new Set((await db().workEntry.findMany({ where: { userId: u.id, date: { gte: structureFrom } }, select: { date: true } })).map((e) => e.date));
    const data = days.filter((d) => !have.has(d)).map((date) => ({ userId: u.id, date, minutes: 480, internalCategoryId: adminCat?.id ?? null, description: "Office administration", location: "OFFICE", createdById: u.id }));
    if (data.length) await db().workEntry.createMany({ data });
  }

  // Six months of runs: five locked, the current month in Draft.
  for (const month of months) {
    for (const kind of ["SALARY", "STIPEND"] as const) {
      const run = await runs.createRun(hr, { month, kind });
      if (month === months.at(-1)) continue;
      await runs.reviewRun(hr, run.id);
      await runs.approveRun(partner, run.id);
      await runs.markRunPaid(hr, run.id);
      await runs.lockRun(hr, run.id);
    }
  }
}
