import { db } from "../../lib/db";
import { forbidden } from "../../lib/errors";
import { can } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { fyStartYear, isoFromParts, todayIst } from "../../lib/dates";
import { hrs } from "./common";

/**
 * Budget estimate from past actuals (P5-08 →). "Similar" engagements are those of the same engagement type that
 * are completed or archived, or that started in an earlier financial year, with hours logged; recurring
 * placeholders are skipped. The estimate is the median (robust to one runaway job) with the 25th–75th percentile
 * range. When the same client had an earlier engagement of the type, its actual hours come first: the firm's own
 * history with that client is the better guide. Also used by CRM proposals (suggestBudgetMinutes).
 */
const q = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo));
};
const quarter = (m: number) => Math.round(m / 15) * 15;

export async function pastActuals(engagementType: string, opts: { excludeEngagementId?: string; today?: string } = {}) {
  const fyStart = isoFromParts(fyStartYear(opts.today ?? todayIst()), 4, 1);
  const similar = await db().engagement.findMany({
    where: {
      engagementType,
      OR: [{ status: { in: ["COMPLETED", "ARCHIVED"] } }, { startDate: { lt: fyStart } }],
      NOT: [{ name: { endsWith: "(recurring)" } }, ...(opts.excludeEngagementId ? [{ id: opts.excludeEngagementId }] : [])],
    },
    select: { id: true, code: true, name: true, clientId: true, budgetMinutes: true, startDate: true, createdAt: true },
    take: 500,
  });
  const sums = await db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: similar.map((s) => s.id) }, deletedAt: null }, _sum: { minutes: true } });
  const logged = new Map(sums.map((s) => [s.engagementId!, s._sum.minutes ?? 0]));
  const rows = similar.map((e) => ({ ...e, minutes: logged.get(e.id) ?? 0 })).filter((e) => e.minutes > 0);
  const sorted = rows.map((r) => r.minutes).sort((a, b) => a - b);
  return { rows, samples: rows.length, median: q(sorted, 0.5), p25: q(sorted, 0.25), p75: q(sorted, 0.75) };
}

export async function budgetEstimate(actor: Actor, opts: { engagementType: string; clientId?: string; excludeEngagementId?: string; today?: string }) {
  // Planning data for whoever sets budgets (Partners, Managers); aggregate hours only, no names outside the client.
  if (actor.kind === "PORTAL" || (actor.kind === "USER" && !can(actor, "engagement.manage"))) throw forbidden();
  const a = await pastActuals(opts.engagementType, opts);
  const same = opts.clientId
    ? a.rows.filter((r) => r.clientId === opts.clientId).sort((x, y) => (y.startDate ?? y.createdAt.toISOString()).localeCompare(x.startDate ?? x.createdAt.toISOString()))[0]
    : undefined;
  // Share of effort by stage across the similar engagements (median share per stage).
  const stageRows = a.samples ? await db().workEntry.groupBy({ by: ["engagementId", "stageName"], where: { engagementId: { in: a.rows.map((r) => r.id) }, deletedAt: null }, _sum: { minutes: true } }) : [];
  const total = new Map(a.rows.map((r) => [r.id, r.minutes]));
  const shares = new Map<string, number[]>();
  for (const s of stageRows) {
    const k = s.stageName || "Not set";
    shares.set(k, [...(shares.get(k) ?? []), (s._sum.minutes ?? 0) / (total.get(s.engagementId!) || 1)]);
  }
  const byStage = [...shares.entries()]
    .map(([stage, xs]) => ({ stage, sharePct: Math.round((xs.reduce((x, y) => x + y, 0) / a.samples) * 1000) / 10 }))
    .sort((x, y) => y.sharePct - x.sharePct)
    .slice(0, 6);
  const suggested = same ? quarter(same.minutes) : a.samples ? quarter(a.median) : null;
  return {
    samples: a.samples,
    medianHours: hrs(a.median),
    rangeHours: a.samples ? [hrs(a.p25), hrs(a.p75)] as [number, number] : null,
    sameClient: same ? { code: same.code, name: same.name, loggedHours: hrs(same.minutes), budgetHours: hrs(same.budgetMinutes) } : null,
    byStage,
    suggestedHours: suggested === null ? null : hrs(suggested),
    basis: same
      ? `Last time for this client (${same.code}): ${hrs(same.minutes)} hrs logged`
      : a.samples
        ? `Median of ${a.samples} past ${a.samples === 1 ? "engagement" : "engagements"} of this type (${hrs(a.p25)}–${hrs(a.p75)} hrs)`
        : "No past actuals for this type yet",
  };
}

/** Type-level estimates for every engagement type (the new-engagement form shows the one picked). */
export async function estimatesByType(actor: Actor, types: string[]) {
  const out: Record<string, { suggestedHours: number | null; basis: string }> = {};
  for (const t of types) {
    const e = await budgetEstimate(actor, { engagementType: t });
    out[t] = { suggestedHours: e.suggestedHours, basis: e.basis };
  }
  return out;
}
