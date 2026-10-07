import { db } from "@/server/lib/db";
import { makeUser } from "../helpers/factory";
import { monthDates } from "@/server/services/attendance/service";
import { dayOfWeek } from "@/server/lib/dates";

/**
 * Golden-test rate book. Every statutory row the engine reads is wiped and re-seeded here, so the expected
 * figures depend only on this file — never on the reference or demo seeds.
 */
export async function seedGoldenRates() {
  const d = db();
  await d.pfRate.deleteMany();
  await d.esiRate.deleteMany();
  await d.professionalTaxSlab.deleteMany();
  await d.incomeTaxSlab.deleteMany();
  await d.taxParameter.deleteMany();
  await d.stipendMinimum.deleteMany();
  await d.holiday.deleteMany(); // no office holidays: every non-Sunday is a working day
  await d.setting.deleteMany({ where: { key: { startsWith: "payroll." } } });

  // PF: 12 % employee, 3.67 % + 8.33 % employer, ₹15,000 ceilings, admin 0.50 %, EDLI 0.50 %
  await d.pfRate.create({ data: { effectiveFrom: "2014-09-01", employeeBp: 1200, employerEpfBp: 367, employerEpsBp: 833, epsWageCeilingPaise: 15_000_00, pfWageCeilingPaise: 15_000_00, adminBp: 50, edliBp: 50, source: "golden" } });
  // ESI: 0.75 % / 3.25 %, ceiling ₹21,000
  await d.esiRate.create({ data: { effectiveFrom: "2019-07-01", employeeBp: 75, employerBp: 325, wageCeilingPaise: 21_000_00, source: "golden" } });
  // PT (Maharashtra-style): men ≤7,500 nil, ≤10,000 ₹175, above ₹200 (Feb ₹300); women ≤25,000 nil, above ₹200 (Feb ₹300)
  const pt = (gender: string, fromPaise: number, toPaise: number | null, amountPaise: number, feb: number | null) =>
    ({ stateCode: "MH", gender, fromPaise, toPaise, amountPaise, overrideMonth: feb === null ? null : 2, overrideAmountPaise: feb, effectiveFrom: "2023-04-01", source: "golden" });
  await d.professionalTaxSlab.createMany({ data: [
    pt("M", 0, 7_500_00, 0, null), pt("M", 7_500_01, 10_000_00, 175_00, null), pt("M", 10_000_01, null, 200_00, 300_00),
    pt("F", 0, 25_000_00, 0, null), pt("F", 25_000_01, null, 200_00, 300_00),
  ] });
  const fy = "FY2026-27";
  const slab = (regime: string, fromPaise: number, toPaise: number | null, rateBp: number) => ({ fy, regime, fromPaise, toPaise, rateBp, source: "golden" });
  await d.incomeTaxSlab.createMany({ data: [
    slab("NEW", 0, 4_00_000_00, 0), slab("NEW", 4_00_000_00, 8_00_000_00, 500), slab("NEW", 8_00_000_00, 12_00_000_00, 1000),
    slab("NEW", 12_00_000_00, 16_00_000_00, 1500), slab("NEW", 16_00_000_00, 20_00_000_00, 2000), slab("NEW", 20_00_000_00, 24_00_000_00, 2500), slab("NEW", 24_00_000_00, null, 3000),
    slab("OLD", 0, 2_50_000_00, 0), slab("OLD", 2_50_000_00, 5_00_000_00, 500), slab("OLD", 5_00_000_00, 10_00_000_00, 2000), slab("OLD", 10_00_000_00, null, 3000),
  ] });
  const param = (regime: string, key: string, valueInt: number) => ({ fy, regime, key, valueInt, source: "golden" });
  await d.taxParameter.createMany({ data: [
    param("ANY", "CESS_BP", 400), param("ANY", "ROUND_TAXABLE_TO", 10_00), param("ANY", "ROUND_TAX_TO", 10_00),
    param("NEW", "STANDARD_DEDUCTION", 75_000_00), param("NEW", "REBATE_LIMIT", 12_00_000_00), param("NEW", "REBATE_MAX", 60_000_00), param("NEW", "REBATE_MARGINAL_RELIEF", 1),
    param("NEW", "SURCHARGE_1_FROM", 50_00_000_00), param("NEW", "SURCHARGE_1_BP", 1000),
    param("OLD", "STANDARD_DEDUCTION", 50_000_00), param("OLD", "REBATE_LIMIT", 5_00_000_00), param("OLD", "REBATE_MAX", 12_500_00),
    param("OLD", "PT_DEDUCTION_MAX", 2_500_00), param("OLD", "HRA_RENT_EXCESS_BP", 1000), param("OLD", "HRA_METRO_BP", 5000), param("OLD", "HRA_NON_METRO_BP", 4000),
    param("OLD", "LIMIT_80C", 1_50_000_00), param("OLD", "LIMIT_80CCD1B", 50_000_00), param("OLD", "LIMIT_80D_SELF", 25_000_00), param("OLD", "LIMIT_80D_PARENTS", 50_000_00), param("OLD", "LIMIT_24B", 2_00_000_00),
  ] });
  await d.stipendMinimum.create({ data: { institute: "ICAI", locationClass: "POP_20L_PLUS", yearOfTraining: 1, amountPaise: 5_000_00, effectiveFrom: "2023-07-01", source: "golden" } });
}

let n = 0;
export async function makeEmployee(role: "STAFF" | "ARTICLE" | "MANAGER", p: { gender?: string; joiningDate?: string; uan?: boolean; esiNumber?: string; state?: string; reportingManagerId?: string; category?: string }) {
  n += 1;
  const u = await makeUser(role, { reportingManagerId: p.reportingManagerId });
  await db().employeeProfile.create({
    data: {
      userId: u.id, employeeCode: `GT-${String(n).padStart(4, "0")}-${u.id.slice(-4)}`, employeeCategory: p.category ?? (role === "ARTICLE" ? "ARTICLE" : "STAFF"),
      gender: p.gender ?? "M", joiningDate: p.joiningDate ?? "2024-04-01", uan: p.uan === false ? null : `1000000000${n}`, esiNumber: p.esiNumber ?? null, workStateCode: p.state ?? "MH",
    },
  });
  return u;
}

/** One work entry on every non-Sunday of the month (Saturdays are working by default), except `skip`. */
export async function fillMonth(userId: string, month: string, opts: { skip?: string[]; from?: string } = {}) {
  const dates = monthDates(month).filter((d) => dayOfWeek(d) !== 0 && !(opts.skip ?? []).includes(d) && (!opts.from || d >= opts.from));
  await db().workEntry.createMany({ data: dates.map((date) => ({ userId, date, minutes: 480, description: "golden" })) });
  return dates.length;
}
