import type { Period, PeriodBasis } from "./types";
import { addDays, isoFromParts, parseIso, formatDate } from "../lib/dates";

/**
 * Indian statutory periods. FY = 1 Apr – 31 Mar; quarters and halves are fiscal (Rules Spec 0.1).
 * Period keys: MONTH "2026-08", FY_QUARTER "FY2026-27-Q2", FY_HALF "FY2026-27-H1", FY "FY2025-26",
 * AY "AY2026-27" (covers the FY before it). All statutory periods use the Apr–Mar year, so a
 * client's non-standard first financial year affects only the AGM ceiling (events.ts).
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const yy = (y: number) => String(y % 100).padStart(2, "0");
export const fyKeyOf = (startYear: number) => `FY${startYear}-${yy(startYear + 1)}`;
const fyLabelOf = (startYear: number) => `FY ${startYear}-${yy(startYear + 1)}`;

export function lastDayOfMonth(y: number, m: number): string {
  return isoFromParts(y, m + 1, 0);
}

/** Start year of the FY containing the date. */
export function fyStart(date: string): number {
  const { y, m } = parseIso(date);
  return m >= 4 ? y : y - 1;
}

function monthPeriod(y: number, m: number): Period {
  return { key: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}`, start: isoFromParts(y, m, 1), end: lastDayOfMonth(y, m), index: `M${String(m).padStart(2, "0")}` };
}

function quarterPeriod(fy: number, q: number): Period {
  const startMonth = 4 + (q - 1) * 3; // 4, 7, 10, 13
  const y = startMonth > 12 ? fy + 1 : fy;
  const m = startMonth > 12 ? startMonth - 12 : startMonth;
  return { key: `${fyKeyOf(fy)}-Q${q}`, label: `Q${q} ${fyLabelOf(fy)}`, start: isoFromParts(y, m, 1), end: lastDayOfMonth(y, m + 2), index: `Q${q}` };
}

function halfPeriod(fy: number, h: number): Period {
  return h === 1
    ? { key: `${fyKeyOf(fy)}-H1`, label: `H1 ${fyLabelOf(fy)}`, start: isoFromParts(fy, 4, 1), end: isoFromParts(fy, 9, 30), index: "H1" }
    : { key: `${fyKeyOf(fy)}-H2`, label: `H2 ${fyLabelOf(fy)}`, start: isoFromParts(fy, 10, 1), end: isoFromParts(fy + 1, 3, 31), index: "H2" };
}

function fyPeriod(fy: number): Period {
  return { key: fyKeyOf(fy), label: fyLabelOf(fy), start: isoFromParts(fy, 4, 1), end: isoFromParts(fy + 1, 3, 31), index: "FY" };
}

/** AY X covers the FY that ends just before it; its dates are that FY's dates. */
function ayPeriod(fy: number): Period {
  return { key: `AY${fy + 1}-${yy(fy + 2)}`, label: `AY ${fy + 1}-${yy(fy + 2)}`, start: isoFromParts(fy, 4, 1), end: isoFromParts(fy + 1, 3, 31), index: "AY" };
}

/** The period of this basis that contains the date. EVENT types use the FY. */
export function periodContaining(basis: PeriodBasis, date: string): Period {
  const { y, m } = parseIso(date);
  const fy = fyStart(date);
  switch (basis) {
    case "MONTH":
      return monthPeriod(y, m);
    case "FY_QUARTER":
      return quarterPeriod(fy, Math.floor(((m + 8) % 12) / 3) + 1);
    case "FY_HALF":
      return halfPeriod(fy, m >= 4 && m <= 9 ? 1 : 2);
    case "AY":
      return ayPeriod(fy);
    case "FY":
    case "EVENT":
      return fyPeriod(fy);
  }
}

/** The period immediately after `p`. */
export function nextPeriod(basis: PeriodBasis, p: Period): Period {
  return periodContaining(basis, addDays(p.end, 1));
}

/** Every period that overlaps [from, to] (inclusive), oldest first. */
export function periodsOverlapping(basis: PeriodBasis, from: string, to: string): Period[] {
  if (to < from) return [];
  const out: Period[] = [];
  for (let p = periodContaining(basis, from); p.start <= to; p = nextPeriod(basis, p)) out.push(p);
  return out;
}

/** Rebuild a period from its key (used for existing tasks). */
/** The single period of a one-time (closure) filing, e.g. GSTR-10 from the cancellation date. */
export function closurePeriod(start: string): Period {
  return { key: `CLOSE-${start}`, label: `final (from ${formatDate(start)})`, start, end: start, index: "EVT" };
}

export function periodFromKey(key: string): Period {
  let m = /^CLOSE-(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) return closurePeriod(m[1]!);
  m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) return monthPeriod(+m[1]!, +m[2]!);
  m = /^FY(\d{4})-\d{2}-Q([1-4])$/.exec(key);
  if (m) return quarterPeriod(+m[1]!, +m[2]!);
  m = /^FY(\d{4})-\d{2}-H([12])$/.exec(key);
  if (m) return halfPeriod(+m[1]!, +m[2]!);
  m = /^FY(\d{4})-\d{2}$/.exec(key);
  if (m) return fyPeriod(+m[1]!);
  m = /^AY(\d{4})-\d{2}$/.exec(key);
  if (m) return ayPeriod(+m[1]! - 1);
  throw new Error(`Unknown period key ${key}`);
}
