import type { EsiRateRow, PfRateRow, PfWageBasis, PtSlabRow } from "./types";

/** Latest row whose effectiveFrom is on or before the date (rows in any order). */
export function pickEffective<T extends { effectiveFrom: string }>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  return best;
}

const bp = (amount: number, rateBp: number) => Math.round((amount * rateBp) / 10_000);

export type PfResult = {
  pfWages: number;
  epsWages: number;
  edliWages: number;
  employee: number;
  employerEpf: number;
  employerEps: number;
  edli: number;
  admin: number;
};

export const ZERO_PF: PfResult = { pfWages: 0, epsWages: 0, edliWages: 0, employee: 0, employerEpf: 0, employerEps: 0, edli: 0, admin: 0 };

/**
 * PF on earned basic (spec 11.5). CAPPED: PF wages = min(basic, PF wage ceiling); FULL: the whole basic
 * (Q-09(c), setting payroll.pfWageBasis). EPS and EDLI wages are always capped at the EPS ceiling.
 * Employer EPF share = employer total − EPS, as the ECR reports it.
 */
export function computePf(earnedBasic: number, rate: PfRateRow, basis: PfWageBasis): PfResult {
  const pfWages = basis === "CAPPED" ? Math.min(earnedBasic, rate.pfWageCeilingPaise) : earnedBasic;
  const epsWages = Math.min(earnedBasic, rate.epsWageCeilingPaise);
  const edliWages = epsWages;
  const employee = bp(pfWages, rate.employeeBp);
  const employerEps = bp(epsWages, rate.employerEpsBp);
  const employerTotal = bp(pfWages, rate.employerEpfBp + rate.employerEpsBp);
  return {
    pfWages, epsWages, edliWages, employee, employerEps,
    employerEpf: Math.max(0, employerTotal - employerEps),
    edli: bp(edliWages, rate.edliBp),
    admin: bp(pfWages, rate.adminBp),
  };
}

export type EsiResult = { eligible: boolean; wages: number; employee: number; employer: number };

/**
 * ESI when the monthly (full) gross is within the wage ceiling. Contributions are on the gross
 * actually earned; with `roundUp` each share is rounded up to the next rupee (setting payroll.esiRoundUpToRupee).
 */
export function computeEsi(fullMonthlyGross: number, earnedGross: number, rate: EsiRateRow | null, roundUp: boolean): EsiResult {
  if (!rate || fullMonthlyGross > rate.wageCeilingPaise) return { eligible: false, wages: 0, employee: 0, employer: 0 };
  const share = (r: number) => {
    const exact = (earnedGross * r) / 10_000;
    return roundUp ? Math.ceil(exact / 100) * 100 : Math.round(exact);
  };
  return { eligible: true, wages: earnedGross, employee: share(rate.employeeBp), employer: share(rate.employerBp) };
}

/**
 * Professional Tax from the state's slab table. No rows for the state (e.g. Rajasthan levies none) → 0.
 * Gender-specific rows replace the ANY rows when the state has them for that gender.
 * `month` is 1–12 (some states charge a different amount in one month, e.g. February).
 */
export function computePt(slabs: PtSlabRow[], stateCode: string | null, gender: string | null, earnedGross: number, month: number, date: string): number {
  if (!stateCode) return 0;
  const forState = slabs.filter((s) => s.stateCode === stateCode && s.effectiveFrom <= date);
  if (forState.length === 0) return 0;
  const latest = forState.reduce((m, s) => (s.effectiveFrom > m ? s.effectiveFrom : m), "");
  const current = forState.filter((s) => s.effectiveFrom === latest);
  const g = gender === "F" || gender === "M" ? gender : null;
  const specific = g ? current.filter((s) => s.gender === g) : [];
  const table = specific.length ? specific : current.filter((s) => s.gender === "ANY");
  const slab = table.find((s) => earnedGross >= s.fromPaise && (s.toPaise === null || earnedGross <= s.toPaise));
  if (!slab) return 0;
  return slab.overrideMonth === month && slab.overrideAmountPaise !== null ? slab.overrideAmountPaise : slab.amountPaise;
}
