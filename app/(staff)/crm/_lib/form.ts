/** FormData helpers for the CRM server actions (pure; no server imports). */
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const opt = (f: FormData, k: string) => str(f, k) || null;
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
export const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);
/** "1,25,000.50" → paise; blank → 0; invalid → NaN (the service rejects it). */
export function paise(f: FormData, k: string): number {
  const v = str(f, k).replace(/[₹,\s]/g, "");
  if (!v) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return Number.NaN;
  return Math.round(Number(v) * 100);
}
/** Hours (decimal) → minutes rounded to 15. */
export function hoursToMinutes(f: FormData, k: string): number {
  const v = Number(str(f, k) || "0");
  return Number.isFinite(v) ? Math.round(v * 4) * 15 : Number.NaN;
}
export async function fileOf(f: FormData, k = "file"): Promise<{ name: string; data: Buffer } | null> {
  const file = f.get(k);
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, data: Buffer.from(await file.arrayBuffer()) };
}
