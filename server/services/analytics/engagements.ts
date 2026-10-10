import { db } from "../../lib/db";
import { can } from "../../permissions/guards";
import { assertEngagementAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { todayIst } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { billingStatusFor, billingStatusMap } from "../billing/invoices";
import { hrs, inClients, pct, practiceScope } from "./common";

/**
 * Engagement dashboard (P5-01): budget against effort logged, by stage and (for Managers and Partners) by person,
 * task progress, open review points and — only with billing.view — billing status. The portfolio view lists the
 * engagements in the viewer's practice scope by budget burn.
 */
const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];

export async function bandOf(percent: number | null) {
  if (percent === null) return { signal: "No budget", health: "None" as const };
  const [a, b, c] = await getSetting<number[]>("budget.bands", [85, 100, 110]);
  if (percent >= c!) return { signal: "Significant overrun", health: "Over" as const };
  if (percent >= b!) return { signal: "Budget reached", health: "Over" as const };
  if (percent >= a!) return { signal: "Approaching budget", health: "AtRisk" as const };
  return { signal: "On track", health: "OnTrack" as const };
}

export async function engagementDashboard(actor: Actor, engagementId: string) {
  await assertEngagementAccess(actor, "engagement.view", engagementId);
  const e = await db().engagement.findUniqueOrThrow({ where: { id: engagementId }, include: { client: { select: { id: true, name: true } } } });
  const today = todayIst();
  // Per-person effort is a planning view for Managers and Partners; others see stages and totals only.
  const seesPeople = can(actor, "analytics.team");
  const [entries, tasks, points] = await Promise.all([
    db().workEntry.findMany({ where: { engagementId, deletedAt: null }, select: { minutes: true, stageName: true, userId: true, date: true } }),
    db().task.findMany({ where: { engagementId, supersededByTaskId: null }, select: { id: true, status: true, effectiveDueDate: true, pendingFromClient: true } }),
    db().reviewPoint.count({ where: { status: "OPEN", taskId: { in: (await db().task.findMany({ where: { engagementId }, select: { id: true } })).map((t) => t.id) } } }),
  ]);
  const used = entries.reduce((a, x) => a + x.minutes, 0);
  const percent = e.budgetMinutes ? Math.round((used / e.budgetMinutes) * 100) : null;

  const byStage = new Map<string, number>();
  for (const x of entries) byStage.set(x.stageName || "Not set", (byStage.get(x.stageName || "Not set") ?? 0) + x.minutes);
  let byPerson: { name: string; hours: number }[] | null = null;
  if (seesPeople) {
    const m = new Map<string, number>();
    for (const x of entries) m.set(x.userId, (m.get(x.userId) ?? 0) + x.minutes);
    const names = new Map((await db().user.findMany({ where: { id: { in: [...m.keys()] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    // Alphabetical, not by hours: this is who worked on it, not a ranking.
    byPerson = [...m.entries()].map(([id, min]) => ({ name: names.get(id) ?? "Former staff", hours: hrs(min) })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const months = new Map<string, number>();
  for (const x of entries) months.set(x.date.slice(0, 7), (months.get(x.date.slice(0, 7)) ?? 0) + x.minutes);

  return {
    engagement: { id: e.id, code: e.code, name: e.name, client: e.client, status: e.status, serviceLine: e.serviceLine, startDate: e.startDate },
    budget: { budgetHours: hrs(e.budgetMinutes), usedHours: hrs(used), remainingHours: hrs(e.budgetMinutes - used), percent, ...(await bandOf(percent)) },
    byStage: [...byStage.entries()].map(([stage, min]) => ({ stage, hours: hrs(min) })).sort((a, b) => b.hours - a.hours),
    byPerson,
    byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, min]) => ({ month, hours: hrs(min) })),
    tasks: {
      total: tasks.length,
      closed: tasks.filter((t) => CLOSED.includes(t.status)).length,
      overdue: tasks.filter((t) => !CLOSED.includes(t.status) && t.effectiveDueDate && t.effectiveDueDate < today).length,
      waitingOnClient: tasks.filter((t) => !CLOSED.includes(t.status) && t.pendingFromClient).length,
    },
    openReviewPoints: points,
    billing: can(actor, "billing.view") && actor.kind !== "PORTAL" ? { feePaise: e.feePaise, feeBasis: e.feeBasis, ...(await billingStatusFor(e.id)) } : null,
  };
}

/** Engagements in practice scope with budget burn, sorted by burn (highest first). */
export async function engagementPortfolio(actor: Actor, f: { serviceLine?: string; health?: string } = {}) {
  const scope = await practiceScope(actor);
  const engagements = await db().engagement.findMany({
    where: { ...inClients(scope), status: { in: ["ACTIVE", "ON_HOLD"] }, client: { isFirm: false }, ...(f.serviceLine ? { serviceLine: f.serviceLine } : {}) },
    select: { id: true, code: true, name: true, serviceLine: true, budgetMinutes: true, feePaise: true, client: { select: { name: true } }, managerId: true },
  });
  const ids = engagements.map((e) => e.id);
  const today = todayIst();
  const [sums, overdue] = await Promise.all([
    db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: ids }, deletedAt: null }, _sum: { minutes: true } }),
    db().task.groupBy({ by: ["engagementId"], where: { engagementId: { in: ids }, status: { notIn: CLOSED }, effectiveDueDate: { lt: today }, supersededByTaskId: null }, _count: { _all: true } }),
  ]);
  const used = new Map(sums.map((s) => [s.engagementId!, s._sum.minutes ?? 0]));
  const od = new Map(overdue.map((s) => [s.engagementId!, s._count._all]));
  const billing = can(actor, "billing.view") ? await billingStatusMap(ids) : null;
  const rows = [];
  for (const e of engagements) {
    const u = used.get(e.id) ?? 0;
    const percent = e.budgetMinutes ? Math.round((u / e.budgetMinutes) * 100) : null;
    const band = await bandOf(percent);
    rows.push({
      id: e.id, code: e.code, name: e.name, client: e.client.name, serviceLine: e.serviceLine, budgetHours: hrs(e.budgetMinutes), usedHours: hrs(u), percent, ...band,
      overdueTasks: od.get(e.id) ?? 0, billingLabel: billing ? (billing.get(e.id)?.label ?? null) : null,
    });
  }
  const filtered = f.health ? rows.filter((r) => r.health === f.health) : rows;
  filtered.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
  return {
    scope: scope.level,
    rows: filtered,
    summary: {
      active: rows.length,
      withBudget: rows.filter((r) => r.percent !== null).length,
      atRisk: rows.filter((r) => r.health === "AtRisk").length,
      over: rows.filter((r) => r.health === "Over").length,
      overShare: pct(rows.filter((r) => r.health === "Over").length, rows.filter((r) => r.percent !== null).length),
    },
  };
}
