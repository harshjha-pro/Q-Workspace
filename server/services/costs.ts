import { db } from "../lib/db";

/**
 * Internal cost of an hour (Q-22: Partner/HR set ₹/hour per designation, effective-dated). Used for
 * realization and budget suggestions only — never shown to Staff or Articles. 0 when not set.
 */
export async function costRatesFor(userIds: string[], date: string): Promise<Map<string, number>> {
  const users = await db().user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, designationId: true } });
  const rates = await db().costRate.findMany({ where: { designationId: { in: users.map((u) => u.designationId).filter((x): x is string => !!x) }, effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: "desc" } });
  const out = new Map<string, number>();
  for (const u of users) {
    const r = rates.find((x) => x.designationId === u.designationId && (!x.effectiveTo || x.effectiveTo >= date));
    out.set(u.id, r?.ratePaisePerHour ?? 0);
  }
  return out;
}

/** Cost of a set of work entries (minutes × the person's rate on that day). */
export async function costOfEntries(entries: { userId: string; date: string; minutes: number }[]): Promise<number> {
  let total = 0;
  const cache = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (!cache.has(key)) cache.set(key, await costRatesFor([...new Set(entries.map((x) => x.userId))], e.date));
    total += Math.round(((cache.get(key)!.get(e.userId) ?? 0) * e.minutes) / 60);
  }
  return total;
}
