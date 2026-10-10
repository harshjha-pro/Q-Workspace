import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { addDays, diffDays, todayIst } from "../../lib/dates";
import { lateFeeExposure, type LateFeeRateDef } from "../../compliance-engine";
import { inClients, lastMonths, monthName, pct, practiceScope, resolvePeriod, type AnalyticsScope } from "./common";

/**
 * Compliance dashboard (P5-01): filings due, on time, late and overdue in the period, by compliance type and
 * by month, client-delay ageing, and the late-fee exposure estimate (Rules Spec / P2-14 rates, Unverified until
 * the Practice Admin verifies them — Q-29). Partner: firm; Manager: team clients; Practice Admin: firm.
 */
const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];
const FILED = ["FILED", "FILED_LATE"];

export const isLate = (t: { status: string; filedDate: string | null; effectiveDueDate: string | null }) =>
  t.status === "FILED_LATE" || (!!t.filedDate && !!t.effectiveDueDate && t.filedDate > t.effectiveDueDate);

/** Task filter for "due in [from, to]" that every compliance number shares (5.8 reconciles against it). */
export function dueInWhere(scope: AnalyticsScope, from: string, to: string) {
  return { ...inClients(scope), supersededByTaskId: null, status: { not: "NOT_APPLICABLE" }, effectiveDueDate: { gte: from, lte: to }, client: { isFirm: false } };
}

async function ratesByType(): Promise<Map<string, LateFeeRateDef[]>> {
  const rows = await db().lateFeeRate.findMany();
  const m = new Map<string, LateFeeRateDef[]>();
  for (const r of rows) {
    const list = m.get(r.complianceTypeCode) ?? [];
    list.push({ perDayPaise: r.perDayPaise, maxPaise: r.maxPaise, interestBpPerMonth: r.interestBpPerMonth, effectiveFrom: r.effectiveFrom });
    m.set(r.complianceTypeCode, list);
  }
  return m;
}

export async function complianceDashboard(actor: Actor, opts: { period?: string; today?: string } = {}) {
  const scope = await practiceScope(actor);
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const months = lastMonths(12, today);
  const trendFrom = `${months[0]}-01`;

  const [due, openOverdue, pending, types, rates, trendRows] = await Promise.all([
    db().task.findMany({ where: dueInWhere(scope, period.from, period.to), select: { id: true, status: true, filedDate: true, effectiveDueDate: true, complianceTypeCode: true } }),
    db().task.findMany({
      where: { ...inClients(scope), supersededByTaskId: null, status: { notIn: CLOSED }, effectiveDueDate: { lt: today }, client: { isFirm: false } },
      select: { id: true, title: true, periodLabel: true, effectiveDueDate: true, filedDate: true, taxDuePaise: true, complianceTypeCode: true, clientId: true, client: { select: { name: true } } },
    }),
    db().task.findMany({ where: { ...inClients(scope), status: { notIn: CLOSED }, pendingFromClient: true, client: { isFirm: false } }, select: { pendingSince: true } }),
    db().complianceType.findMany({ select: { code: true, shortName: true, name: true } }),
    ratesByType(),
    db().task.findMany({ where: dueInWhere(scope, trendFrom, today), select: { status: true, filedDate: true, effectiveDueDate: true } }),
  ]);
  const typeName = new Map(types.map((t) => [t.code, t.shortName || t.name]));

  // Headline counts for tasks due in the period.
  const filed = due.filter((t) => FILED.includes(t.status));
  const late = filed.filter(isLate);
  const onTime = filed.length - late.length;
  const overdueInPeriod = due.filter((t) => !CLOSED.includes(t.status) && t.effectiveDueDate! < today).length;
  const upcoming = due.filter((t) => !CLOSED.includes(t.status) && t.effectiveDueDate! >= today).length;

  // By compliance type (top 12 by volume; the rest folded into "Other types").
  const byTypeMap = new Map<string, { due: number; onTime: number; late: number; overdue: number }>();
  for (const t of due) {
    const k = t.complianceTypeCode ?? "ONE_OFF";
    const r = byTypeMap.get(k) ?? { due: 0, onTime: 0, late: 0, overdue: 0 };
    r.due += 1;
    if (FILED.includes(t.status)) (isLate(t) ? r.late++ : r.onTime++);
    else if (t.effectiveDueDate! < today) r.overdue += 1;
    byTypeMap.set(k, r);
  }
  const byTypeAll = [...byTypeMap.entries()].map(([code, r]) => ({ code, name: code === "ONE_OFF" ? "One-off tasks" : (typeName.get(code) ?? code), ...r, onTimePct: pct(r.onTime, r.onTime + r.late) })).sort((a, b) => b.due - a.due);
  const byType = byTypeAll.slice(0, 12);
  if (byTypeAll.length > 12) {
    const rest = byTypeAll.slice(12).reduce((a, r) => ({ due: a.due + r.due, onTime: a.onTime + r.onTime, late: a.late + r.late, overdue: a.overdue + r.overdue }), { due: 0, onTime: 0, late: 0, overdue: 0 });
    byType.push({ code: "OTHER", name: `Other types (${byTypeAll.length - 12})`, ...rest, onTimePct: pct(rest.onTime, rest.onTime + rest.late) });
  }

  // 12-month trend: filings due per month and the on-time share of those filed.
  const trend = months.map((ym) => {
    const rows = trendRows.filter((t) => t.effectiveDueDate!.startsWith(ym));
    const f = rows.filter((t) => FILED.includes(t.status));
    const l = f.filter(isLate).length;
    return { month: ym, label: monthName(ym), due: rows.length, filed: f.length, late: l, onTimePct: pct(f.length - l, f.length) };
  });

  // Client delay: how long open tasks have waited on the client.
  const buckets = [
    { label: "Up to 7 days", min: 0, max: 7, count: 0 },
    { label: "8–15 days", min: 8, max: 15, count: 0 },
    { label: "16–30 days", min: 16, max: 30, count: 0 },
    { label: "Over 30 days", min: 31, max: Infinity, count: 0 },
  ];
  for (const p of pending) {
    const d = p.pendingSince ? Math.max(0, diffDays(p.pendingSince, today)) : 0;
    buckets.find((b) => d >= b.min && d <= b.max)!.count += 1;
  }

  // Late-fee exposure on what is overdue today (fee per day, capped, plus interest on tax due where known).
  const exposures = openOverdue
    .map((t) => {
      const e = lateFeeExposure({ effectiveDueDate: t.effectiveDueDate, filedDate: null, taxDuePaise: t.taxDuePaise }, rates.get(t.complianceTypeCode ?? "") ?? [], today);
      // A rate with no per-day fee is interest-only; without the tax due on the task the amount is unknown, not zero.
      const needsTaxDue = !!e.rate && e.rate.perDayPaise === 0 && e.rate.interestBpPerMonth > 0 && !t.taxDuePaise;
      return { taskId: t.id, title: t.title, period: t.periodLabel, client: t.client.name, clientId: t.clientId, daysLate: e.daysLate, feePaise: e.feePaise, interestPaise: e.interestPaise, totalPaise: e.feePaise + e.interestPaise, hasRate: !!e.rate, needsTaxDue };
    })
    .sort((a, b) => b.totalPaise - a.totalPaise || b.daysLate - a.daysLate);

  return {
    scope: scope.level,
    period,
    headline: {
      due: due.length,
      filedOnTime: onTime,
      filedLate: late.length,
      overdue: overdueInPeriod,
      upcoming,
      onTimePct: pct(onTime, filed.length),
      overdueNow: openOverdue.length,
      waitingOnClient: pending.length,
      exposurePaise: exposures.reduce((a, e) => a + e.totalPaise, 0),
      exposureWithoutRate: exposures.filter((e) => !e.hasRate).length,
      exposureNeedsTaxDue: exposures.filter((e) => e.needsTaxDue).length,
    },
    byType,
    trend,
    clientDelay: buckets.map(({ label, count }) => ({ label, count })),
    topExposures: exposures.slice(0, 15),
    dueNext7: (await db().task.count({ where: { ...inClients(scope), supersededByTaskId: null, status: { notIn: CLOSED }, effectiveDueDate: { gte: today, lte: addDays(today, 7) }, client: { isFirm: false } } })),
  };
}
