import { db } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { addDays, fyStartYear, isoFromParts, todayIst, weekStart } from "../../lib/dates";
import { hrs, pct, resolvePeriod } from "./common";
import { isLate } from "./compliance";

/**
 * Personal dashboard (P5-01): the signed-in person's own work only (analytics.personal = self). Effort is
 * shown as hours logged, never against a target and never next to anyone else's numbers.
 */
const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];

export async function personalDashboard(actor: Actor, opts: { period?: string; today?: string } = {}) {
  if (actor.kind !== "USER") throw forbidden();
  authorize(actor, "analytics.personal");
  const me = actor.userId;
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const fyFrom = isoFromParts(fyStartYear(today), 4, 1);
  const days14 = addDays(today, -13);

  const [entries, last14, myTaskIds, cpe] = await Promise.all([
    db().workEntry.findMany({
      where: { userId: me, deletedAt: null, date: { gte: period.from, lte: period.to } },
      select: { minutes: true, chargeable: true, clientId: true, internalCategoryId: true, client: { select: { name: true } }, internalCategory: { select: { name: true } } },
    }),
    db().workEntry.groupBy({ by: ["date"], where: { userId: me, deletedAt: null, date: { gte: days14, lte: today } }, _sum: { minutes: true } }),
    db().taskAssignment.findMany({ where: { userId: me, role: { in: ["ASSIGNEE", "MAKER"] }, OR: [{ toDate: null }, { toDate: { gte: fyFrom } }] }, select: { taskId: true, toDate: true } }),
    db().cPELog.aggregate({ where: { userId: me, date: { gte: fyFrom, lte: today } }, _sum: { minutes: true } }),
  ]);

  // Effort split by client (top 8) and by internal category.
  const byClient = new Map<string, { name: string; minutes: number }>();
  const byCategory = new Map<string, { name: string; minutes: number }>();
  for (const e of entries) {
    if (e.clientId) {
      const r = byClient.get(e.clientId) ?? { name: e.client?.name ?? "Client", minutes: 0 };
      r.minutes += e.minutes;
      byClient.set(e.clientId, r);
    } else {
      const k = e.internalCategoryId ?? "-";
      const r = byCategory.get(k) ?? { name: e.internalCategory?.name ?? "Other internal", minutes: 0 };
      r.minutes += e.minutes;
      byCategory.set(k, r);
    }
  }
  const clientRows = [...byClient.values()].sort((a, b) => b.minutes - a.minutes);
  const topClients = clientRows.slice(0, 8).map((c) => ({ name: c.name, hours: hrs(c.minutes) }));
  if (clientRows.length > 8) topClients.push({ name: `Other clients (${clientRows.length - 8})`, hours: hrs(clientRows.slice(8).reduce((a, c) => a + c.minutes, 0)) });

  // My tasks (assigned as maker / assignee).
  // Open work counts only current assignments; "filed this FY" counts anything I worked on as maker this FY.
  const ids = [...new Set(myTaskIds.map((t) => t.taskId))];
  const current = new Set(myTaskIds.filter((t) => t.toDate === null).map((t) => t.taskId));
  const tasks = await db().task.findMany({ where: { id: { in: ids }, supersededByTaskId: null }, select: { id: true, status: true, effectiveDueDate: true, filedDate: true, pendingFromClient: true } });
  const open = tasks.filter((t) => !CLOSED.includes(t.status) && current.has(t.id));
  const filedFy = tasks.filter((t) => ["FILED", "FILED_LATE"].includes(t.status) && (t.filedDate ?? "") >= fyFrom);
  const lateFy = filedFy.filter(isLate).length;

  // Review points raised on my work (as maker) in the last 90 days.
  const since90 = new Date(`${addDays(today, -89)}T00:00:00+05:30`);
  const requests = await db().reviewRequest.findMany({ where: { makerId: me, submittedAt: { gte: since90 } }, select: { status: true, points: { select: { status: true } } } });
  const points = requests.flatMap((r) => r.points);

  const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
  const chargeableMinutes = entries.filter((e) => e.chargeable).reduce((a, e) => a + e.minutes, 0);
  const dayMap = new Map(last14.map((d) => [d.date, d._sum.minutes ?? 0]));
  const daily = Array.from({ length: 14 }, (_, i) => addDays(days14, i)).map((d) => ({ date: d, hours: hrs(dayMap.get(d) ?? 0) }));

  return {
    period,
    effort: {
      hours: hrs(totalMinutes),
      clientHours: hrs(totalMinutes - [...byCategory.values()].reduce((a, c) => a + c.minutes, 0)),
      chargeableHours: hrs(chargeableMinutes),
      weekHours: hrs(daily.filter((d) => d.date >= weekStart(today)).reduce((a, d) => a + d.hours * 60, 0)),
      topClients,
      categories: [...byCategory.values()].sort((a, b) => b.minutes - a.minutes).map((c) => ({ name: c.name, hours: hrs(c.minutes) })),
      daily,
    },
    tasks: {
      open: open.length,
      overdue: open.filter((t) => t.effectiveDueDate && t.effectiveDueDate < today).length,
      dueNext7: open.filter((t) => t.effectiveDueDate && t.effectiveDueDate >= today && t.effectiveDueDate <= addDays(today, 7)).length,
      waitingOnClient: open.filter((t) => t.pendingFromClient).length,
      filedThisFy: filedFy.length,
      onTimePctThisFy: pct(filedFy.length - lateFy, filedFy.length),
    },
    reviews: {
      submitted: requests.length,
      returned: requests.filter((r) => r.status === "RETURNED").length,
      pointsRaised: points.length,
      pointsOpen: points.filter((p) => p.status === "OPEN").length,
    },
    cpeHoursThisFy: hrs(cpe._sum.minutes ?? 0),
  };
}
