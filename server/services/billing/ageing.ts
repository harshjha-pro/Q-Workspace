/** Receivables ageing buckets from spec 7.1: 0–30 / 31–60 / 61–90 / 90+ days. */
export const BUCKETS = [
  { key: "0-30", label: "0–30 days", max: 30 },
  { key: "31-60", label: "31–60 days", max: 60 },
  { key: "61-90", label: "61–90 days", max: 90 },
  { key: "90+", label: "90+ days", max: Infinity },
] as const;
export type BucketKey = (typeof BUCKETS)[number]["key"];

export function bucketOf(ageDays: number): BucketKey {
  return BUCKETS.find((b) => Math.max(0, ageDays) <= b.max)!.key;
}
export const bucketIndex = (ageDays: number) => BUCKETS.findIndex((b) => b.key === bucketOf(ageDays));
