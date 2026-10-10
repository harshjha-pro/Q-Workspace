import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { addDays, parseIso, isoFromParts, todayIst, weekStart, formatDate } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { workingDays } from "../leave/service";
import { assertFirmAnalytics, hrs, monthName, pct } from "./common";

/**
 * Capacity and peak-season forecast (P5-04), Partner only (Q-24: "used only in Partner analytics, never shown
 * to staff"). Available hours = capacity.hoursPerDay × working days (Sundays, non-working Saturdays and office
 * holidays excluded) less approved leave. Forecast work = each open task's remaining effort, estimated from past
 * actuals: the median hours logged on filed tasks of the same compliance type (at least
 * capacity.minSamples of them in the last capacity.historyMonths), else the task's own budget; tasks with
 * neither are counted, never guessed. Remaining effort is spread over the working days from
 * capacity.leadDays before the due date to the due date (overdue work lands on today) and split between the
 * task's current assignees/makers. Load bands come from capacity.bands. Rebalancing is a suggestion only:
 * nothing is reassigned until someone does it on the task.
 */
const WORK_ROLES = ["PARTNER", "MANAGER", "STAFF", "ARTICLE"];
const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

export type Grain = "week" | "month";
type Bucket = { label: string; from: string; to: string };

function buckets(grain: Grain, today: string): Bucket[] {
  if (grain === "month") {
    const { y, m } = parseIso(today);
    return Array.from({ length: 6 }, (_, i) => {
      const t = y * 12 + (m - 1) + i;
      const yy = Math.floor(t / 12), mm = (t % 12) + 1;
      const from = isoFromParts(yy, mm, 1);
      const to = addDays(isoFromParts(mm === 12 ? yy + 1 : yy, mm === 12 ? 1 : mm + 1, 1), -1);
      return { label: monthName(from.slice(0, 7)), from, to };
    });
  }
  const start = weekStart(today);
  return Array.from({ length: 13 }, (_, i) => ({ label: formatDate(addDays(start, i * 7)).slice(0, 6), from: addDays(start, i * 7), to: addDays(start, i * 7 + 6) }));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

export async function capacityForecast(actor: Actor, opts: { grain?: string; today?: string } = {}) {
  assertFirmAnalytics(actor);
  const today = opts.today ?? todayIst();
  const grain: Grain = opts.grain === "month" ? "month" : "week";
  const [hoursPerDay, leadDays, bands, historyMonths, minSamples] = await Promise.all([
    getSetting<number>("capacity.hoursPerDay", 8),
    getSetting<number>("capacity.leadDays", 14),
    getSetting<number[]>("capacity.bands", [85, 100]),
    getSetting<number>("capacity.historyMonths", 24),
    getSetting<number>("capacity.minSamples", 3),
  ]);
  const [near, over] = bands as [number, number];
  const bs = buckets(grain, today);
  const end = bs[bs.length - 1]!.to;
  const bucketOf = (d: string) => bs.findIndex((b) => d >= b.from && d <= b.to);
  const work = (await workingDays(today, end)).filter((d) => d >= bs[0]!.from);
  const workSet = new Set(work);
  const band = (p: number | null) => (p === null ? "none" : p > over ? "over" : p >= near ? "near" : "ok");

  // --- People and available hours --------------------------------------------------------------------
  const people = await db().user.findMany({
    where: { active: true, isSystem: false, role: { in: WORK_ROLES } },
    select: { id: true, displayName: true, role: true, designation: { select: { name: true } } },
    orderBy: { displayName: "asc" },
  });
  const ids = people.map((p) => p.id);
  const leave = await db().leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", fromDate: { lte: end }, toDate: { gte: today } }, select: { userId: true, fromDate: true, toDate: true, halfDayStart: true, halfDayEnd: true } });
  const leaveHalf = new Map<string, number>(); // `${user}|${day}` → half-days off (2 = full day)
  for (const l of leave) {
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) {
      const half = (d === l.fromDate && l.halfDayStart) || (d === l.toDate && l.halfDayEnd);
      const k = `${l.userId}|${d}`;
      leaveHalf.set(k, Math.min(2, (leaveHalf.get(k) ?? 0) + (half ? 1 : 2)));
    }
  }
  const dayMinutes = hoursPerDay * 60;
  const capacity = new Map<string, number[]>(ids.map((id) => [id, bs.map(() => 0)]));
  for (const id of ids) {
    const row = capacity.get(id)!;
    for (const d of work) row[bucketOf(d)]! += Math.round(dayMinutes * (1 - (leaveHalf.get(`${id}|${d}`) ?? 0) / 2));
  }

  // --- Estimates from past actuals --------------------------------------------------------------------
  const since = addDays(today, -Math.round(historyMonths * 30.4));
  const history = await db().task.findMany({
    where: { status: { in: ["FILED", "FILED_LATE"] }, complianceTypeCode: { not: null }, filedDate: { gte: since }, supersededByTaskId: null },
    select: { id: true, complianceTypeCode: true },
  });
  const histMinutes = new Map((await db().workEntry.groupBy({ by: ["taskId"], where: { taskId: { in: history.map((t) => t.id) }, deletedAt: null }, _sum: { minutes: true } })).map((g) => [g.taskId!, g._sum.minutes ?? 0]));
  const samples = new Map<string, number[]>();
  for (const t of history) {
    const m = histMinutes.get(t.id) ?? 0;
    if (m > 0) samples.set(t.complianceTypeCode!, [...(samples.get(t.complianceTypeCode!) ?? []), m]);
  }
  const perType = new Map([...samples.entries()].filter(([, xs]) => xs.length >= minSamples).map(([k, xs]) => [k, { minutes: median(xs), samples: xs.length }]));

  // --- Open work and its remaining effort -------------------------------------------------------------
  const tasks = await db().task.findMany({
    where: { status: { in: OPEN }, supersededByTaskId: null, client: { isFirm: false }, effectiveDueDate: { not: null, lte: end } },
    select: {
      id: true, title: true, status: true, effectiveDueDate: true, complianceTypeCode: true, budgetMinutes: true, clientId: true,
      client: { select: { name: true, teamId: true, managerId: true } },
      assignments: { where: { toDate: null, role: { in: ["ASSIGNEE", "MAKER"] } }, select: { userId: true, role: true } },
    },
  });
  const logged = new Map((await db().workEntry.groupBy({ by: ["taskId"], where: { taskId: { in: tasks.map((t) => t.id) }, deletedAt: null }, _sum: { minutes: true } })).map((g) => [g.taskId!, g._sum.minutes ?? 0]));
  const types = new Map((await db().complianceType.findMany({ select: { code: true, shortName: true, name: true } })).map((t) => [t.code, t.shortName || t.name]));

  const demand = new Map<string, number[]>(ids.map((id) => [id, bs.map(() => 0)]));
  const unassigned = bs.map(() => 0);
  const byType = new Map<string, { minutes: number; tasks: number }>();
  const noEstimate: { id: string; title: string; client: string; due: string }[] = [];
  type Load = { taskId: string; title: string; client: string; clientId: string; teamId: string | null; status: string; per: number[]; users: string[] };
  const loads: Load[] = [];
  const peopleSet = new Set(ids);
  for (const t of tasks) {
    const est = t.complianceTypeCode && perType.has(t.complianceTypeCode) ? perType.get(t.complianceTypeCode)!.minutes : t.budgetMinutes > 0 ? t.budgetMinutes : null;
    if (est === null) { noEstimate.push({ id: t.id, title: t.title, client: t.client.name, due: t.effectiveDueDate! }); continue; }
    const remaining = Math.max(0, est - (logged.get(t.id) ?? 0));
    if (!remaining) continue;
    const due = t.effectiveDueDate!;
    const from = due < today ? today : addDays(due, -leadDays) < today ? today : addDays(due, -leadDays);
    const to = due < today ? today : due;
    let days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (workSet.has(d)) days.push(d);
    if (!days.length) days = [work.find((d) => d >= to) ?? work[work.length - 1] ?? today];
    const per = bs.map(() => 0);
    for (const d of days) { const b = bucketOf(d); if (b >= 0) per[b]! += remaining / days.length; }
    const users = [...new Set(t.assignments.map((a) => a.userId))].filter((u) => peopleSet.has(u));
    if (users.length) for (const u of users) demand.get(u)!.forEach((_, i, row) => (row[i]! += per[i]! / users.length));
    else per.forEach((m, i) => (unassigned[i]! += m));
    const k = t.complianceTypeCode ?? "ONE_OFF";
    const r = byType.get(k) ?? { minutes: 0, tasks: 0 };
    r.minutes += remaining;
    r.tasks += 1;
    byType.set(k, r);
    loads.push({ taskId: t.id, title: t.title, client: t.client.name, clientId: t.clientId, teamId: t.client.teamId, status: t.status, per, users });
  }

  // --- Suggested rebalancing (greedy; never applied automatically) ------------------------------------
  const members = await db().clientTeamMember.findMany({ where: { OR: [{ toDate: null }, { toDate: { gte: today } }], fromDate: { lte: today } }, select: { teamId: true, userId: true } });
  const leads = await db().clientTeam.findMany({ select: { id: true, leadManagerId: true } });
  const teamOf = new Map<string, Set<string>>();
  for (const m of members) teamOf.set(m.teamId, (teamOf.get(m.teamId) ?? new Set()).add(m.userId));
  for (const l of leads) if (l.leadManagerId) teamOf.set(l.id, (teamOf.get(l.id) ?? new Set()).add(l.leadManagerId));
  const name = new Map(people.map((p) => [p.id, p.displayName]));
  const role = new Map(people.map((p) => [p.id, p.role]));
  const work2 = new Map([...demand.entries()].map(([k, v]) => [k, [...v]]));
  const loadOf = (u: string, b: number) => { const c = capacity.get(u)![b]!; return c > 0 ? (work2.get(u)![b]! / c) * 100 : work2.get(u)![b]! > 0 ? Infinity : 0; };
  const suggestions: { taskId: string; title: string; client: string; bucket: string; hours: number; fromUser: string; fromName: string; toUser: string; toName: string }[] = [];
  for (let b = 0; b < bs.length && suggestions.length < 25; b++) {
    for (const u of ids) {
      if (loadOf(u, b) <= over) continue;
      // Movable: tasks where this person is the only assignee and that are not already with a reviewer.
      const mine = loads.filter((l) => l.users.length === 1 && l.users[0] === u && l.per[b]! > 0 && l.status !== "UNDER_REVIEW").sort((x, y) => y.per[b]! - x.per[b]!);
      for (const l of mine) {
        if (loadOf(u, b) <= over || suggestions.length >= 25) break;
        // Candidates: people on the client's team (or its lead Manager) with room under the "near" band after the move.
        // Work of Staff and Articles goes to Staff and Articles; Managers and Partners only take each other's.
        const senior = (x: string) => ["PARTNER", "MANAGER"].includes(role.get(x)!);
        const pool = [...(l.teamId ? (teamOf.get(l.teamId) ?? new Set<string>()) : new Set<string>())].filter((c) => c !== u && capacity.has(c) && senior(c) === senior(u));
        const fits = pool
          .map((c) => ({ c, spare: (capacity.get(c)![b]! * near) / 100 - work2.get(c)![b]! }))
          .filter((x) => x.spare >= l.per[b]!)
          .sort((x, y) => y.spare - x.spare);
        if (!fits.length) continue;
        const to = fits[0]!.c;
        l.per.forEach((m, i) => { work2.get(u)![i]! -= m; work2.get(to)![i]! += m; });
        l.users = [to];
        suggestions.push({ taskId: l.taskId, title: l.title, client: l.client, bucket: bs[b]!.label, hours: hrs(l.per.reduce((a, m) => a + m, 0)), fromUser: u, fromName: name.get(u)!, toUser: to, toName: name.get(to)! });
      }
    }
  }

  // --- Shape -----------------------------------------------------------------------------------------
  const cap = bs.map((_, i) => ids.reduce((a, id) => a + capacity.get(id)![i]!, 0));
  const dem = bs.map((_, i) => ids.reduce((a, id) => a + demand.get(id)![i]!, 0) + unassigned[i]!);
  const firm = bs.map((b, i) => {
    const loadPct = cap[i]! > 0 ? pct(dem[i]!, cap[i]!) : null;
    return { ...b, capacityHours: hrs(cap[i]!), demandHours: hrs(dem[i]!), unassignedHours: hrs(unassigned[i]!), loadPct, band: band(loadPct) };
  });
  const rows = people.map((p) => {
    const cells = bs.map((_, i) => {
      const c = capacity.get(p.id)![i]!, d = demand.get(p.id)![i]!;
      const loadPct = c > 0 ? pct(d, c) : d > 0 ? null : 0;
      return { capacityHours: hrs(c), demandHours: hrs(d), loadPct, band: c === 0 && d > 0 ? "over" : band(loadPct) };
    });
    return { id: p.id, name: p.displayName, designation: p.designation?.name ?? "", cells, overloaded: cells.filter((c) => c.band === "over").length };
  });
  // Monthly and quarterly forms share a short name (GSTR-1); add the code when names clash.
  const nameCount = new Map<string, number>();
  for (const c of byType.keys()) nameCount.set(types.get(c) ?? c, (nameCount.get(types.get(c) ?? c) ?? 0) + 1);
  const typeLabel = (c: string) => { const n = types.get(c) ?? c; return (nameCount.get(n) ?? 0) > 1 ? `${n} (${c})` : n; };
  const peak = firm.reduce((a, b) => ((b.loadPct ?? 0) > (a.loadPct ?? 0) ? b : a), firm[0]!);

  return {
    grain,
    today,
    settings: { hoursPerDay, leadDays, bands: [near, over], historyMonths, minSamples },
    buckets: firm,
    peak: peak.loadPct ? { label: peak.label, loadPct: peak.loadPct } : null,
    people: rows,
    overloadedPeople: rows.filter((r) => r.overloaded > 0).length,
    byType: [...byType.entries()].map(([code, r]) => ({ code, name: code === "ONE_OFF" ? "One-off tasks" : typeLabel(code), hours: hrs(r.minutes), tasks: r.tasks, source: perType.has(code) ? `median of ${perType.get(code)!.samples} filed` : "task budget" })).sort((a, b) => b.hours - a.hours).slice(0, 12),
    noEstimate: { count: noEstimate.length, sample: noEstimate.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 10) },
    suggestions,
  };
}
