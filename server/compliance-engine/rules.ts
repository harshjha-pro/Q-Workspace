import type { DueRuleDef, DueRuleParams, HolidayCalendar, HolidayPolicy, Period } from "./types";
import { addDays, dayOfWeek, isoFromParts, parseIso } from "../lib/dates";
import { lastDayOfMonth } from "./periods";

export type DueContext = {
  /** State group of the GSTIN (QRMP GSTR-3B 22nd / 24th), when relevant. */
  stateGroup?: string | null;
  /** Client flags that are on for this period (for `ifFlag` rules, e.g. ITR-A with 3CEB). */
  flagsOn: Set<string>;
  /** Event dates keyed `${eventType}|${periodKey}`. */
  events: Record<string, string>;
  /** Company incorporation date: a company's first AGM has a longer ceiling. */
  incorporationDate?: string | null;
  /** AGM ceiling rule (open-questions Q-10): months after FY end; first AGM months after first FY end. */
  agmCeilingMonths: number;
  firstAgmCeilingMonths: number;
};

export type DueResult = { date: string | null; isProvisional: boolean; basis: string; skip?: boolean };

const ORD = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mmddLabel = (mmdd: string) => `${Number(mmdd.slice(3))} ${MON[Number(mmdd.slice(0, 2)) - 1]}`;

/** Add whole months to the month of `date`, returning the last day of the resulting month. */
export function endOfMonthAfter(date: string, months: number): string {
  const { y, m } = parseIso(date);
  const total = m - 1 + months;
  return lastDayOfMonth(y + Math.floor(total / 12), (total % 12) + 1);
}

/** `day` of the month `monthsAfter` after the month of `date`, clamped to that month's length. */
function dayOfMonthAfter(date: string, monthsAfter: number, day: number): string {
  const last = endOfMonthAfter(date, monthsAfter);
  const { y, m, d } = parseIso(last);
  return isoFromParts(y, m, Math.min(day, d));
}

/** First occurrence of MM-DD on or after `from`. */
function mmddOnOrAfter(from: string, mmdd: string): string {
  const { y } = parseIso(from);
  const [mm, dd] = mmdd.split("-").map(Number) as [number, number];
  const same = isoFromParts(y, mm, dd);
  return same >= from ? same : isoFromParts(y + 1, mm, dd);
}

/** Pick the rule version in force for a period: latest effectiveFrom on/before the period start, else the oldest. */
export function pickRule(rules: DueRuleDef[], period: Period): DueRuleDef | null {
  if (rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.version - a.version));
  return sorted.find((r) => r.effectiveFrom <= period.start) ?? sorted[sorted.length - 1]!;
}

/** Statutory ceiling for the AGM of the FY that ends with this period (Rules Spec 4.2). */
export function agmCeiling(period: Period, ctx: DueContext): string {
  const isFirstFy = Boolean(ctx.incorporationDate && ctx.incorporationDate >= period.start && ctx.incorporationDate <= period.end);
  return endOfMonthAfter(period.end, isFirstFy ? ctx.firstAgmCeilingMonths : ctx.agmCeilingMonths);
}

export function computeDueDate(params: DueRuleParams, period: Period, ctx: DueContext): DueResult {
  switch (params.kind) {
    case "DAY_AFTER_PERIOD": {
      const monthsAfter = params.monthsAfter ?? 1;
      const endMonth = period.end.slice(5, 7);
      const day = params.byEndMonth?.[endMonth] ?? params.day;
      const special = params.byEndMonth?.[endMonth] !== undefined;
      return { date: dayOfMonthAfter(period.end, monthsAfter, day), isProvisional: false, basis: `${ORD(day)} of the ${monthsAfter === 1 ? "following month" : `${monthsAfter}th month after the period`}${special ? " (special rule for this month)" : ""}` };
    }
    case "STATE_GROUP_DAY_AFTER_PERIOD": {
      const day = ctx.stateGroup ? params.days[ctx.stateGroup] : undefined;
      if (day === undefined) return { date: null, isProvisional: false, basis: "State group not set for this GSTIN's state — enter the due date" };
      return { date: dayOfMonthAfter(period.end, params.monthsAfter ?? 1, day), isProvisional: false, basis: `${ORD(day)} of the month after the quarter (state group ${ctx.stateGroup})` };
    }
    case "MMDD_ON_OR_AFTER_START": {
      const mmdd = params.byIndex?.[period.index] ?? params.mmdd;
      if (!mmdd) return { date: null, isProvisional: false, basis: "No date configured for this period" };
      return { date: mmddOnOrAfter(period.start, mmdd), isProvisional: false, basis: mmddLabel(mmdd) };
    }
    case "MMDD_AFTER_END": {
      const flagged = Object.entries(params.ifFlag ?? {}).find(([flag]) => ctx.flagsOn.has(flag));
      const mmdd = flagged?.[1] ?? params.byIndex?.[period.index] ?? params.mmdd;
      if (!mmdd) return { date: null, isProvisional: false, basis: "No date configured for this period" };
      return { date: mmddOnOrAfter(addDays(period.end, 1), mmdd), isProvisional: false, basis: `${mmddLabel(mmdd)} after the period${flagged ? ` (because ${flagged[0]})` : ""}` };
    }
    case "EVENT_OFFSET": {
      const event = ctx.events[`${params.eventType}|${period.key}`] ?? (params.fallbackEventType ? ctx.events[`${params.fallbackEventType}|${period.key}`] : undefined);
      if (event) return { date: addDays(event, params.days), isProvisional: false, basis: `${params.eventType.replace(/_/g, " ").toLowerCase()} date + ${params.days} days` };
      if (!params.provisional) return { date: null, isProvisional: false, basis: "Created when the event is recorded", skip: true };
      return { date: addDays(agmCeiling(period, ctx), params.days), isProvisional: true, basis: `Provisional — pending AGM date (statutory AGM deadline + ${params.days} days)` };
    }
    case "MANUAL":
      return { date: null, isProvisional: false, basis: "Due date is entered manually" };
  }
}

/** Saturday counts as working only if the firm works Saturdays; Sundays and listed holidays never. */
export function isNonWorkingDay(date: string, cal: HolidayCalendar): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || (dow === 6 && !cal.workingSaturdays) || cal.dates.has(date);
}

/**
 * Weekend/holiday policy (Rules Spec 6). Default NONE: the date stands even on a Sunday — relief
 * comes only from a notified extension, which is a different code path (extensions.ts).
 */
export function applyHolidayPolicy(policy: HolidayPolicy, date: string, cal: HolidayCalendar): { date: string; shifted: boolean } {
  if (policy === "NONE" || !isNonWorkingDay(date, cal)) return { date, shifted: false };
  const step = policy === "NEXT_WORKING_DAY" ? 1 : -1;
  let d = date;
  while (isNonWorkingDay(d, cal)) d = addDays(d, step);
  return { date: d, shifted: true };
}
