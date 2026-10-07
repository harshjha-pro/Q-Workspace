import { computeEsi, computePf, computePt, ZERO_PF, type EsiResult, type PfResult } from "./statutory";
import { computeTds, type TdsResult } from "./tax";
import type { DaysBasis, Declaration, EsiRateRow, Line, PfRateRow, PfWageBasis, PtSlabRow, Regime, SalaryComponents, TaxParams, TaxSlabRow } from "./types";

export const COMPONENT_LABELS: Record<keyof SalaryComponents, string> = {
  basic: "Basic", hra: "House rent allowance", special: "Special allowance", other: "Other allowance", variable: "Variable pay",
};

export function monthlyGross(c: SalaryComponents): number {
  return c.basic + c.hra + c.special + c.other + c.variable;
}

/** Days the month is paid on: calendar days (default), or a fixed 30 / 26 (setting payroll.daysBasis). */
export function basisDays(basis: DaysBasis, calendarDays: number): number {
  return basis === "FIXED_30" ? 30 : basis === "FIXED_26" ? 26 : calendarDays;
}

/** Paid fraction as half-days: basis − loss of pay − days before joining / after exit. */
export function paidHalfDays(basis: number, lopHalfDays: number, notEmployedDays: number): number {
  return Math.max(0, basis * 2 - lopHalfDays - notEmployedDays * 2);
}

/** Fixed components are prorated for unpaid days; variable pay is paid as set for the month. */
export function earnedComponents(c: SalaryComponents, paidHalf: number, basisHalf: number): SalaryComponents {
  const p = (v: number) => (basisHalf === 0 ? 0 : Math.round((v * paidHalf) / basisHalf));
  return { basic: p(c.basic), hra: p(c.hra), special: p(c.special), other: p(c.other), variable: paidHalf === 0 ? 0 : c.variable };
}

export type FutureMonth = { month: number; date: string };

export type PayslipInput = {
  kind: "SALARY" | "STIPEND";
  /** First day of the payroll month (YYYY-MM-01) and its month number. */
  monthStart: string;
  monthNumber: number;
  components: SalaryComponents;
  daysBasis: DaysBasis;
  calendarDays: number;
  lopHalfDays: number;
  notEmployedDays: number;
  adjustments: { earnings: Line[]; deductions: Line[] };
  /** Approved expense claims paid with salary: added to net pay, not to gross (not wages). */
  reimbursements?: Line[];
  pf: { applicable: boolean; rate: PfRateRow | null; basis: PfWageBasis };
  esi: { rate: EsiRateRow | null; roundUp: boolean };
  pt: { slabs: PtSlabRow[]; stateCode: string | null; gender: string | null };
  tax: null | {
    regime: Regime;
    params: TaxParams;
    slabs: TaxSlabRow[];
    declaration: Declaration | null;
    prior: { gross: number; tds: number; basic: number; hra: number; pt: number; employeePf: number };
    /** Remaining months of the FY after this one in which the person is expected to be paid. */
    future: FutureMonth[];
  };
};

export type PayslipResult = {
  basisDays: number;
  paidHalfDays: number;
  earned: SalaryComponents;
  earnings: Line[];
  deductions: Line[];
  gross: number;
  reimbursements: Line[];
  net: number;
  pf: PfResult;
  esi: EsiResult;
  pt: number;
  tds: TdsResult | null;
  tdsAmount: number;
};

/**
 * One month's pay (spec 11.5): attendance and loss of pay → prorated gross → PF, ESI, Professional Tax,
 * TDS → net. Stipend runs pay the stipend with LOP but no statutory deductions.
 */
export function computePayslip(i: PayslipInput): PayslipResult {
  const basis = basisDays(i.daysBasis, i.calendarDays);
  const paid = paidHalfDays(basis, i.lopHalfDays, i.notEmployedDays);
  const earned = earnedComponents(i.components, paid, basis * 2);
  const earnings: Line[] = i.kind === "STIPEND"
    ? [{ code: "STIPEND", label: "Stipend", amount: earned.basic + earned.hra + earned.special + earned.other + earned.variable }]
    : (Object.keys(COMPONENT_LABELS) as (keyof SalaryComponents)[]).filter((k) => earned[k] !== 0).map((k) => ({ code: k.toUpperCase(), label: COMPONENT_LABELS[k], amount: earned[k] }));
  earnings.push(...i.adjustments.earnings);
  const gross = earnings.reduce((a, l) => a + l.amount, 0);
  const reimbursements = i.reimbursements ?? [];
  const reimbursed = reimbursements.reduce((a, l) => a + l.amount, 0);

  if (i.kind === "STIPEND") {
    const deductions = [...i.adjustments.deductions];
    const net = gross + reimbursed - deductions.reduce((a, l) => a + l.amount, 0);
    return { basisDays: basis, paidHalfDays: paid, earned, earnings, deductions, gross, reimbursements, net, pf: ZERO_PF, esi: { eligible: false, wages: 0, employee: 0, employer: 0 }, pt: 0, tds: null, tdsAmount: 0 };
  }

  const pf = i.pf.applicable && i.pf.rate ? computePf(earned.basic, i.pf.rate, i.pf.basis) : ZERO_PF;
  const fullGross = monthlyGross(i.components);
  const esi = computeEsi(fullGross, gross, i.esi.rate, i.esi.roundUp);
  const pt = computePt(i.pt.slabs, i.pt.stateCode, i.pt.gender, gross, i.monthNumber, i.monthStart);

  let tds: TdsResult | null = null;
  if (i.tax) {
    const t = i.tax;
    // Future months are projected on the full structure with PF and PT as they would be computed then.
    const pfFullMonth = i.pf.applicable && i.pf.rate ? computePf(i.components.basic, i.pf.rate, i.pf.basis).employee : 0;
    const futurePf = pfFullMonth * t.future.length;
    const futurePt = t.future.reduce((a, f) => a + computePt(i.pt.slabs, i.pt.stateCode, i.pt.gender, fullGross, f.month, f.date), 0);
    const n = t.future.length;
    tds = computeTds({
      regime: t.regime, params: t.params, slabs: t.slabs, declaration: t.declaration,
      priorGross: t.prior.gross, priorTds: t.prior.tds,
      currentGross: gross, futureGross: fullGross * n, futureMonths: n,
      annualBasic: t.prior.basic + earned.basic + i.components.basic * n,
      annualHra: t.prior.hra + earned.hra + i.components.hra * n,
      annualEmployeePf: t.prior.employeePf + pf.employee + futurePf,
      annualPt: t.prior.pt + pt + futurePt,
    });
  }
  const tdsAmount = tds?.monthly ?? 0;
  const deductions: Line[] = [];
  if (pf.employee) deductions.push({ code: "PF", label: "Provident Fund (employee)", amount: pf.employee });
  if (esi.employee) deductions.push({ code: "ESI", label: "ESI (employee)", amount: esi.employee });
  if (pt) deductions.push({ code: "PT", label: "Professional Tax", amount: pt });
  if (tdsAmount) deductions.push({ code: "TDS", label: "Income tax (TDS)", amount: tdsAmount });
  deductions.push(...i.adjustments.deductions);
  const net = gross + reimbursed - deductions.reduce((a, l) => a + l.amount, 0);
  return { basisDays: basis, paidHalfDays: paid, earned, earnings, deductions, gross, reimbursements, net, pf, esi, pt, tds, tdsAmount };
}

export type StipendCheck = { minimum: number | null; belowMinimum: boolean; message: string | null };

/** Stipend must be at least the ICAI/ICSI minimum for the year of training (spec 11.5). */
export function checkStipend(monthlyStipend: number, minimum: number | null, label: string): StipendCheck {
  if (minimum === null) return { minimum: null, belowMinimum: false, message: `No minimum stipend is configured for ${label}.` };
  if (monthlyStipend < minimum) return { minimum, belowMinimum: true, message: `Stipend is below the minimum for ${label}.` };
  return { minimum, belowMinimum: false, message: null };
}
