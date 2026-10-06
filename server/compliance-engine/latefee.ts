import { diffDays } from "../lib/dates";

export type LateFeeRateDef = { perDayPaise: number; maxPaise: number | null; interestBpPerMonth: number; effectiveFrom: string };

/**
 * Exposure estimate (Product Spec 4.3, P2-14): late fee per day since the effective due date (capped),
 * plus simple interest on the tax due per month or part month. Rates come from the master; values are
 * illustrative until verified.
 */
export function lateFeeExposure(
  task: { effectiveDueDate: string | null; filedDate: string | null; taxDuePaise?: number | null },
  rates: LateFeeRateDef[],
  asOf: string,
): { daysLate: number; feePaise: number; interestPaise: number; rate: LateFeeRateDef | null } {
  if (!task.effectiveDueDate) return { daysLate: 0, feePaise: 0, interestPaise: 0, rate: null };
  const end = task.filedDate ?? asOf;
  const daysLate = Math.max(0, diffDays(task.effectiveDueDate, end));
  const rate = [...rates].filter((r) => r.effectiveFrom <= task.effectiveDueDate!).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null;
  if (!rate || daysLate === 0) return { daysLate, feePaise: 0, interestPaise: 0, rate };
  const raw = rate.perDayPaise * daysLate;
  const feePaise = rate.maxPaise !== null ? Math.min(raw, rate.maxPaise) : raw;
  const months = Math.ceil(daysLate / 30);
  const interestPaise = task.taxDuePaise ? Math.round((task.taxDuePaise * rate.interestBpPerMonth * months) / 10_000) : 0;
  return { daysLate, feePaise, interestPaise, rate };
}
