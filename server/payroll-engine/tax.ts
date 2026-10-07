import type { Declaration, Regime, TaxParams, TaxSlabRow } from "./types";

/**
 * Income-tax on salary (TDS under the chosen regime, spec 11.5). Every number comes from IncomeTaxSlab and
 * TaxParameter rows for the FY; the keys below are the contract between the seed and the engine.
 */
export const TAX_KEYS = {
  STANDARD_DEDUCTION: "STANDARD_DEDUCTION",
  REBATE_LIMIT: "REBATE_LIMIT",
  REBATE_MAX: "REBATE_MAX",
  /** 1 = tax may not exceed the income above the rebate limit (new-regime marginal relief). */
  REBATE_MARGINAL_RELIEF: "REBATE_MARGINAL_RELIEF",
  CESS_BP: "CESS_BP",
  /** Rounding of total income and of tax (multiples, in paise; 1000 = ₹10). 0 or missing = no rounding. */
  ROUND_TAXABLE_TO: "ROUND_TAXABLE_TO",
  ROUND_TAX_TO: "ROUND_TAX_TO",
  /** Old regime: Professional Tax deduction cap and HRA exemption percentages. */
  PT_DEDUCTION_MAX: "PT_DEDUCTION_MAX",
  HRA_RENT_EXCESS_BP: "HRA_RENT_EXCESS_BP",
  HRA_METRO_BP: "HRA_METRO_BP",
  HRA_NON_METRO_BP: "HRA_NON_METRO_BP",
} as const;

/** Surcharge bands: SURCHARGE_<n>_FROM (paise) and SURCHARGE_<n>_BP, n = 1, 2, … */
export const surchargeKeys = (n: number) => ({ from: `SURCHARGE_${n}_FROM`, bp: `SURCHARGE_${n}_BP` });

/** Keys that must exist for the engine to compute a regime's tax (checked before a run is created). */
export function requiredTaxKeys(regime: Regime): string[] {
  const base = [TAX_KEYS.STANDARD_DEDUCTION, TAX_KEYS.REBATE_LIMIT, TAX_KEYS.REBATE_MAX, TAX_KEYS.CESS_BP];
  if (regime === "NEW") return base;
  return [...base, TAX_KEYS.PT_DEDUCTION_MAX, TAX_KEYS.HRA_RENT_EXCESS_BP, TAX_KEYS.HRA_METRO_BP, TAX_KEYS.HRA_NON_METRO_BP,
    ...DECLARATION_SECTIONS.flatMap((s) => (s.limitKey ? [s.limitKey] : []))];
}

/**
 * Declaration sections (data-driven list; the limits live in TaxParameter, regime OLD).
 * PRIOR_* apply to both regimes: salary and TDS earlier this FY that this app did not pay
 * (previous employer, or months before go-live).
 */
export const DECLARATION_SECTIONS: { code: string; label: string; limitKey: string | null; oldOnly: boolean }[] = [
  { code: "HRA_RENT", label: "Rent paid in the year (for HRA exemption)", limitKey: null, oldOnly: true },
  { code: "80C", label: "Section 80C — PPF, ELSS, LIC, tuition fees, home-loan principal (your PF is added automatically)", limitKey: "LIMIT_80C", oldOnly: true },
  { code: "80CCD1B", label: "Section 80CCD(1B) — own NPS contribution", limitKey: "LIMIT_80CCD1B", oldOnly: true },
  { code: "80D_SELF", label: "Section 80D — health insurance for self, spouse, children", limitKey: "LIMIT_80D_SELF", oldOnly: true },
  { code: "80D_PARENTS", label: "Section 80D — health insurance for parents", limitKey: "LIMIT_80D_PARENTS", oldOnly: true },
  { code: "24B", label: "Interest on housing loan, self-occupied — section 24(b)", limitKey: "LIMIT_24B", oldOnly: true },
  { code: "80E", label: "Section 80E — interest on education loan", limitKey: null, oldOnly: true },
  { code: "PRIOR_INCOME", label: "Salary received earlier this FY not paid through this app (previous employer / before go-live)", limitKey: null, oldOnly: false },
  { code: "PRIOR_TDS", label: "TDS already deducted on that salary", limitKey: null, oldOnly: false },
];

const roundTo = (v: number, m: number | undefined) => (m && m > 0 ? Math.round(v / m) * m : Math.round(v));

/** Tax on income from the slab table (rate applies to the part of income inside each slab). */
export function slabTax(income: number, slabs: TaxSlabRow[]): number {
  let tax = 0;
  for (const s of [...slabs].sort((a, b) => a.fromPaise - b.fromPaise)) {
    if (income <= s.fromPaise) continue;
    const top = s.toPaise === null ? income : Math.min(income, s.toPaise);
    tax += ((top - s.fromPaise) * s.rateBp) / 10_000;
  }
  return Math.round(tax);
}

function surchargeBands(p: TaxParams) {
  const out: { from: number; bp: number }[] = [];
  for (let n = 1; n <= 10; n += 1) {
    const k = surchargeKeys(n);
    if (p[k.from] === undefined || p[k.bp] === undefined) break;
    out.push({ from: p[k.from]!, bp: p[k.bp]! });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Surcharge with marginal relief: tax + surcharge never exceeds the amount at the band start plus the income above it. */
export function surchargeOn(taxable: number, tax: number, slabs: TaxSlabRow[], p: TaxParams): number {
  const bands = surchargeBands(p);
  const i = bands.findLastIndex((b) => taxable > b.from);
  if (i < 0) return 0;
  const band = bands[i]!;
  const surcharge = Math.round((tax * band.bp) / 10_000);
  const atStart = slabTax(band.from, slabs);
  const prevBp = i > 0 ? bands[i - 1]!.bp : 0;
  const cap = atStart + Math.round((atStart * prevBp) / 10_000) + (taxable - band.from);
  return Math.max(0, Math.min(surcharge, cap - tax));
}

export type AnnualTax = {
  taxable: number;
  slabTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
};

/** Tax for the year on a total income (after deductions). */
export function annualTax(taxableRaw: number, regime: Regime, slabs: TaxSlabRow[], p: TaxParams): AnnualTax {
  void regime;
  const taxable = Math.max(0, roundTo(taxableRaw, p[TAX_KEYS.ROUND_TAXABLE_TO]));
  const gross = slabTax(taxable, slabs);
  let afterRebate = gross;
  const limit = p[TAX_KEYS.REBATE_LIMIT] ?? 0;
  if (taxable <= limit) afterRebate = Math.max(0, gross - Math.min(gross, p[TAX_KEYS.REBATE_MAX] ?? 0));
  else if (p[TAX_KEYS.REBATE_MARGINAL_RELIEF] === 1) afterRebate = Math.min(gross, taxable - limit);
  const rebate = gross - afterRebate;
  const surcharge = surchargeOn(taxable, afterRebate, slabs, p);
  const cess = Math.round(((afterRebate + surcharge) * (p[TAX_KEYS.CESS_BP] ?? 0)) / 10_000);
  const total = roundTo(afterRebate + surcharge + cess, p[TAX_KEYS.ROUND_TAX_TO]);
  return { taxable, slabTax: gross, rebate, surcharge, cess, total };
}

export type DeductionLine = { code: string; label: string; claimed: number; allowed: number };

/** Old-regime exemptions and deductions from the declaration (annual amounts). */
export function oldRegimeDeductions(
  decl: Declaration | null,
  p: TaxParams,
  annual: { basic: number; hra: number; employeePf: number; pt: number },
): { hraExempt: number; ptDeduction: number; lines: DeductionLine[]; total: number } {
  const items = decl?.items ?? {};
  const rent = items.HRA_RENT ?? 0;
  const pctOfBasic = (key: string) => Math.round((annual.basic * (p[key] ?? 0)) / 10_000);
  const hraExempt = rent > 0
    ? Math.max(0, Math.min(annual.hra, rent - pctOfBasic(TAX_KEYS.HRA_RENT_EXCESS_BP), pctOfBasic(decl?.metro ? TAX_KEYS.HRA_METRO_BP : TAX_KEYS.HRA_NON_METRO_BP)))
    : 0;
  const ptDeduction = Math.min(annual.pt, p[TAX_KEYS.PT_DEDUCTION_MAX] ?? 0);
  const lines: DeductionLine[] = [];
  for (const s of DECLARATION_SECTIONS) {
    if (!s.oldOnly || s.code === "HRA_RENT") continue;
    const claimed = (items[s.code] ?? 0) + (s.code === "80C" ? annual.employeePf : 0);
    if (claimed <= 0) continue;
    const allowed = s.limitKey ? Math.min(claimed, p[s.limitKey] ?? 0) : claimed;
    lines.push({ code: s.code, label: s.label, claimed, allowed });
  }
  return { hraExempt, ptDeduction, lines, total: lines.reduce((a, l) => a + l.allowed, 0) };
}

export type TdsInput = {
  regime: Regime;
  params: TaxParams;
  slabs: TaxSlabRow[];
  declaration: Declaration | null;
  /** Gross and TDS of earlier months of this FY (payslips in the app, plus PRIOR_* declared amounts are added here). */
  priorGross: number;
  priorTds: number;
  currentGross: number;
  /** Projected gross for the rest of the FY after this month. */
  futureGross: number;
  futureMonths: number;
  annualBasic: number;
  annualHra: number;
  annualEmployeePf: number;
  annualPt: number;
};

export type TdsResult = {
  regime: Regime;
  projectedGross: number;
  standardDeduction: number;
  hraExempt: number;
  ptDeduction: number;
  chapterVIA: DeductionLine[];
  tax: AnnualTax;
  priorTds: number;
  remainingMonths: number;
  monthly: number;
};

/**
 * Projected annual tax less TDS already deducted, spread evenly over this and the remaining months
 * (rounded to the rupee). Never negative: excess deducted earlier is not refunded through payroll.
 */
export function computeTds(i: TdsInput): TdsResult {
  const priorIncome = i.declaration?.items.PRIOR_INCOME ?? 0;
  const priorTds = i.priorTds + (i.declaration?.items.PRIOR_TDS ?? 0);
  const projectedGross = i.priorGross + priorIncome + i.currentGross + i.futureGross;
  const standardDeduction = Math.min(projectedGross, i.params[TAX_KEYS.STANDARD_DEDUCTION] ?? 0);
  let hraExempt = 0;
  let ptDeduction = 0;
  let chapterVIA: DeductionLine[] = [];
  let other = 0;
  if (i.regime === "OLD") {
    const d = oldRegimeDeductions(i.declaration, i.params, { basic: i.annualBasic, hra: i.annualHra, employeePf: i.annualEmployeePf, pt: i.annualPt });
    hraExempt = d.hraExempt;
    ptDeduction = d.ptDeduction;
    chapterVIA = d.lines;
    other = d.total;
  }
  const tax = annualTax(projectedGross - standardDeduction - hraExempt - ptDeduction - other, i.regime, i.slabs, i.params);
  const remainingMonths = 1 + i.futureMonths;
  const due = Math.max(0, tax.total - priorTds);
  const monthly = Math.round(due / remainingMonths / 100) * 100;
  return { regime: i.regime, projectedGross, standardDeduction, hraExempt, ptDeduction, chapterVIA, tax, priorTds, remainingMonths, monthly };
}
