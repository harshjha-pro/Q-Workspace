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

/**
 * Cost-rate lookup for (user, date) from one read of users and rates; null when the person has no designation or
 * no rate covers the day. Lists of thousands of entries cost in memory instead of a query per person-month.
 */
export async function costLookup() {
  const [users, rates] = await Promise.all([
    db().user.findMany({ select: { id: true, designationId: true } }),
    db().costRate.findMany({ orderBy: { effectiveFrom: "desc" } }),
  ]);
  const desig = new Map(users.map((u) => [u.id, u.designationId]));
  const byDesig = new Map<string, { ratePaisePerHour: number; effectiveFrom: string; effectiveTo: string | null }[]>();
  for (const r of rates) byDesig.set(r.designationId, [...(byDesig.get(r.designationId) ?? []), r]);
  return (userId: string, date: string): number | null => {
    const d = desig.get(userId);
    const r = d ? byDesig.get(d)?.find((x) => x.effectiveFrom <= date && (!x.effectiveTo || x.effectiveTo >= date)) : undefined;
    return r ? r.ratePaisePerHour : null;
  };
}

/** Cost of a set of work entries (minutes × the person's rate on that day). */
export async function costOfEntries(entries: { userId: string; date: string; minutes: number }[]): Promise<number> {
  const rateOf = await costLookup();
  return entries.reduce((total, e) => total + Math.round(((rateOf(e.userId, e.date) ?? 0) * e.minutes) / 60), 0);
}
