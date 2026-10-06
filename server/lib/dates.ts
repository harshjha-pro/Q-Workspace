/**
 * Date helpers. Business dates are "YYYY-MM-DD" strings in IST (decisions D-04);
 * the whole firm runs on one timezone (spec 3.9), so no per-user zones exist.
 */
export const IST = "Asia/Kolkata";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(now: Date = new Date()): string {
  return toIstDate(now);
}

export function toIstDate(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  return parts; // en-CA gives YYYY-MM-DD
}

export function parseIso(s: string): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(s);
  if (!match) throw new Error(`Invalid date: ${s}`);
  return { y: +match[1]!, m: +match[2]!, d: +match[3]! };
}

export function isoFromParts(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const { y, m, d } = parseIso(s);
  return isoFromParts(y, m, d + days);
}

/** Days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  const pa = parseIso(a);
  const pb = parseIso(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(s: string): number {
  const { y, m, d } = parseIso(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday of the week containing s. */
export function weekStart(s: string): string {
  const dow = dayOfWeek(s);
  return addDays(s, dow === 0 ? -6 : 1 - dow);
}

/** "06-Oct-2026" (brief §10: DD-MMM-YYYY). */
export function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  const { y, m, d } = parseIso(s.slice(0, 10));
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${y}`;
}

export function formatDateTime(instant: Date | null | undefined): string {
  if (!instant) return "";
  const date = formatDate(toIstDate(instant));
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true }).format(instant);
  return `${date} ${time}`;
}

export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** Start year of the Indian financial year (Apr–Mar) containing s. */
export function fyStartYear(s: string): number {
  const { y, m } = parseIso(s);
  return m >= 4 ? y : y - 1;
}

/** "FY 2025-26" for start year 2025. */
export function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "AY 2026-27" for FY starting 2025 (Q-08: AY labels kept). */
export function ayLabelForFy(fyStart: number): string {
  return `AY ${fyStart + 1}-${String((fyStart + 2) % 100).padStart(2, "0")}`;
}

/** Period key for a financial year, e.g. "FY2025-26". */
export function fyKey(startYear: number): string {
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
