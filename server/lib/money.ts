/** Money is integer paise everywhere (decisions D-04). */

/** Indian digit grouping: 12,34,56,789. */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** ₹12,34,567.50 (paise shown only when non-zero unless forcePaise). */
export function formatInr(paise: number, opts: { forcePaise?: boolean; symbol?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100).toString();
  const p = abs % 100;
  const frac = p !== 0 || opts.forcePaise ? `.${String(p).padStart(2, "0")}` : "";
  const sym = opts.symbol === false ? "" : "₹";
  return `${negative ? "-" : ""}${sym}${groupIndian(rupees)}${frac}`;
}

/** Compact lakh / crore form for dashboards: ₹12.5 L, ₹3.2 Cr. */
export function formatInrCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  if (abs >= 1e7) return `₹${(rupees / 1e7).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (abs >= 1e5) return `₹${(rupees / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
  return formatInr(Math.round(paise));
}

/** Parse "12,34,567.5" / "1234567" into paise; returns null for invalid input. */
export function parseInrToPaise(input: string): number | null {
  const clean = input.replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [r, f = ""] = clean.split(".");
  const sign = r!.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(r)) * 100 + Number(f.padEnd(2, "0")));
}

/** "6 hrs 15 min" — hours are an effort indicator only, never "6/8" (spec 5.5). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h === 1 ? "" : "s"}`;
  return `${h} hr${h === 1 ? "" : "s"} ${m} min`;
}
