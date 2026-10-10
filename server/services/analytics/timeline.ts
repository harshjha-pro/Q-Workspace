import { db } from "../../lib/db";
import { can } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { addDays, diffDays, isIsoDate, todayIst, weekStart } from "../../lib/dates";
import { displayState, type DisplayState, type TaskStatus } from "../../compliance-engine";
import { inClients, practiceScope } from "./common";
import { bandOf } from "./engagements";

/**
 * Timeline board (P5-02): who and what is due over the next weeks, in three views over the same week columns.
 *   compliance — a row per client, tasks due each week, coloured by the derived display state (D-07);
 *   engagement — a row per active engagement, its start–end span, tasks due each week and budget health;
 *   people     — a row per person (alphabetical, never ranked), current open tasks due each week and leave days.
 * A leading "Earlier" column holds open work already past due before the window. Every cell drills down to the
 * tasks behind it. Compliance and engagement follow the practice scope; people needs analytics.team.
 */
export type TimelineView = "compliance" | "engagement" | "people";
export const TIMELINE_VIEWS: TimelineView[] = ["compliance", "engagement", "people"];

const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];
const MAX_ROWS = 150;

/** Worst first: a cell takes the colour of its most urgent task. */
export const STATE_ORDER: DisplayState[] = ["OVERDUE", "DUE_TODAY", "AT_RISK", "PENDING_FROM_CLIENT", "ON_TRACK", "NO_DATE", "FILED_LATE", "FILED", "NOT_APPLICABLE"];
const worst = (states: DisplayState[]) => (states.length ? states.reduce((a, s) => (STATE_ORDER.indexOf(s) < STATE_ORDER.indexOf(a) ? s : a)) : null);

export type TimelineTask = { id: string; title: string; client: string; due: string | null; state: DisplayState; status: string };
export type TimelineCell = { count: number; open: number; state: DisplayState | null; leaveDays?: number };
export type TimelineRow = { id: string; label: string; sub: string; href: string; cells: TimelineCell[]; span?: { from: number; to: number; health: string; signal: string } };

export function timelineWindow(start: string | undefined, weeks: number | undefined, today: string) {
  const n = Math.min(13, Math.max(2, Math.round(weeks ?? 6)));
  const from = weekStart(start && isIsoDate(start) ? start : today);
  const cols = Array.from({ length: n }, (_, i) => ({ from: addDays(from, i * 7), to: addDays(from, i * 7 + 6) }));
  return { from, to: cols[n - 1]!.to, weeks: n, cols };
}

/** Column index for a due date: 0 = Earlier (open and past due before the window), 1..n = weeks, -1 = outside. */
function colOf(due: string | null, w: ReturnType<typeof timelineWindow>) {
  if (!due) return -1;
  if (due < w.from) return 0;
  if (due > w.to) return -1;
  return Math.floor(diffDays(w.from, due) / 7) + 1;
}

async function boardAccess(actor: Actor, v: string | undefined) {
  const view: TimelineView = TIMELINE_VIEWS.includes(v as TimelineView) ? (v as TimelineView) : "compliance";
  const scope = await practiceScope(actor);
  // Workload by person is a team-planning view (Partner, Manager), not an operational one.
  if (view === "people" && !(actor.kind === "SYSTEM" || (actor.kind === "USER" && can(actor, "analytics.team")))) throw forbidden();
  return { view, scope };
}

type Opts = { view?: string; start?: string; weeks?: number; today?: string; serviceLine?: string };

export async function timelineBoard(actor: Actor, opts: Opts = {}) {
  const { view, scope } = await boardAccess(actor, opts.view);
  const today = opts.today ?? todayIst();
  const w = timelineWindow(opts.start, opts.weeks, today);
  const lineFilter = opts.serviceLine ? { engagement: { serviceLine: opts.serviceLine } } : {};

  // Tasks due in the window, plus open tasks already past due before it (the Earlier column).
  const taskWhere = {
    ...inClients(scope),
    ...lineFilter,
    supersededByTaskId: null,
    client: { isFirm: false },
    // Not Applicable tasks are not work; the compliance dashboard leaves them out too (5.8 reconciles the two).
    NOT: { status: "NOT_APPLICABLE" },
    OR: [{ effectiveDueDate: { gte: w.from, lte: w.to } }, { status: { notIn: CLOSED }, effectiveDueDate: { lt: w.from } }],
  };
  const select = { id: true, title: true, status: true, effectiveDueDate: true, clientId: true, engagementId: true, client: { select: { name: true } } } as const;
  const empty = (): TimelineCell[] => Array.from({ length: w.weeks + 1 }, () => ({ count: 0, open: 0, state: null }));
  const states = new Map<string, DisplayState[]>();
  const add = (cells: TimelineCell[], key: string, t: { status: string; effectiveDueDate: string | null }) => {
    const c = colOf(t.effectiveDueDate, w);
    if (c < 0) return;
    const s = displayState(t.status as TaskStatus, t.effectiveDueDate, today);
    cells[c]!.count += 1;
    if (!CLOSED.includes(t.status)) cells[c]!.open += 1;
    const k = `${key}:${c}`;
    states.set(k, [...(states.get(k) ?? []), s]);
    cells[c]!.state = worst(states.get(k)!);
  };

  let rows: TimelineRow[] = [];
  if (view === "compliance") {
    const tasks = await db().task.findMany({ where: taskWhere, select });
    const byClient = new Map<string, TimelineRow>();
    for (const t of tasks) {
      const r = byClient.get(t.clientId) ?? { id: t.clientId, label: t.client.name, sub: "", href: `/clients/${t.clientId}`, cells: empty() };
      add(r.cells, t.clientId, t);
      byClient.set(t.clientId, r);
    }
    rows = [...byClient.values()];
    for (const r of rows) r.sub = `${r.cells.reduce((a, c) => a + c.open, 0)} open`;
  } else if (view === "engagement") {
    const engagements = await db().engagement.findMany({
      where: { ...inClients(scope), status: { in: ["ACTIVE", "ON_HOLD"] }, client: { isFirm: false }, ...(opts.serviceLine ? { serviceLine: opts.serviceLine } : {}) },
      select: { id: true, code: true, name: true, startDate: true, endDate: true, budgetMinutes: true, client: { select: { name: true } } },
    });
    const ids = engagements.map((e) => e.id);
    const [tasks, sums] = await Promise.all([
      db().task.findMany({ where: { ...taskWhere, engagementId: { in: ids } }, select }),
      db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: ids }, deletedAt: null }, _sum: { minutes: true } }),
    ]);
    const used = new Map(sums.map((s) => [s.engagementId!, s._sum.minutes ?? 0]));
    const byEng = new Map<string, TimelineRow>();
    for (const e of engagements) {
      const percent = e.budgetMinutes ? Math.round(((used.get(e.id) ?? 0) / e.budgetMinutes) * 100) : null;
      const band = await bandOf(percent);
      // The span is clipped to the window; an engagement with no end date runs to the window's end.
      const inWindow = (!e.startDate || e.startDate <= w.to) && (!e.endDate || e.endDate >= w.from);
      const span = inWindow ? { from: Math.max(1, colOf(e.startDate && e.startDate > w.from ? e.startDate : w.from, w)), to: e.endDate && e.endDate < w.to ? colOf(e.endDate, w) : w.weeks, ...band } : undefined;
      byEng.set(e.id, { id: e.id, label: e.name, sub: `${e.code} · ${e.client.name}`, href: `/analytics/engagements/${e.id}`, cells: empty(), span });
    }
    for (const t of tasks) add(byEng.get(t.engagementId!)!.cells, t.engagementId!, t);
    // Only engagements with something happening in the window: a task due, or a start or end date inside it.
    // Ongoing engagements with neither would fill the board with flat bars.
    const event = new Set(engagements.filter((e) => [e.startDate, e.endDate].some((d) => d && d >= w.from && d <= w.to)).map((e) => e.id));
    rows = [...byEng.values()].filter((r) => event.has(r.id) || r.cells.some((c) => c.count));
  } else {
    const users = await db().user.findMany({
      where: { active: true, isSystem: false, ...(scope.userIds === null ? {} : { id: { in: scope.userIds } }) },
      select: { id: true, displayName: true, designation: { select: { name: true } } },
      orderBy: { displayName: "asc" },
    });
    const userIds = users.map((u) => u.id);
    const [assignments, leave] = await Promise.all([
      db().taskAssignment.findMany({
        where: { userId: { in: userIds }, toDate: null, role: { in: ["ASSIGNEE", "MAKER"] }, task: { ...taskWhere, status: { notIn: CLOSED } } },
        select: { userId: true, task: { select } },
      }),
      db().leaveRequest.findMany({ where: { userId: { in: userIds }, status: "APPROVED", fromDate: { lte: w.to }, toDate: { gte: w.from } }, select: { userId: true, fromDate: true, toDate: true } }),
    ]);
    const byUser = new Map<string, TimelineRow>(users.map((u) => [u.id, { id: u.id, label: u.displayName, sub: u.designation?.name ?? "", href: `/tasks?assigneeId=${u.id}&mine=0`, cells: empty() }]));
    const seen = new Set<string>();
    for (const a of assignments) {
      if (seen.has(`${a.userId}:${a.task.id}`)) continue; // assignee and maker on the same task count once
      seen.add(`${a.userId}:${a.task.id}`);
      add(byUser.get(a.userId)!.cells, a.userId, a.task);
    }
    // Leave days (Mon–Sat working days) inside each week column; the leave type is not shown here.
    for (const l of leave) {
      const cells = byUser.get(l.userId)!.cells;
      for (let d = l.fromDate < w.from ? w.from : l.fromDate; d <= l.toDate && d <= w.to; d = addDays(d, 1)) {
        if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) continue;
        const c = colOf(d, w);
        cells[c]!.leaveDays = (cells[c]!.leaveDays ?? 0) + 1;
      }
    }
    rows = [...byUser.values()];
  }

  // Compliance and engagement rows: most urgent first, then by name. People stay alphabetical.
  if (view !== "people") {
    const rank = (r: TimelineRow) => Math.min(...r.cells.map((c) => (c.state ? STATE_ORDER.indexOf(c.state) : 99)));
    rows.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }
  const totals = empty();
  for (const r of rows) r.cells.forEach((c, i) => { totals[i]!.count += c.count; totals[i]!.open += c.open; });

  return {
    view,
    scope: scope.level,
    window: { from: w.from, to: w.to, weeks: w.weeks, today, cols: w.cols, prev: addDays(w.from, -7 * w.weeks), next: addDays(w.from, 7 * w.weeks) },
    rows: rows.slice(0, MAX_ROWS),
    totalRows: rows.length,
    totals,
  };
}

/** Drill-down: the tasks behind one cell (row id + column index), with the same scope checks as the board. */
export async function timelineCell(actor: Actor, opts: Opts & { rowId: string; col: number }): Promise<TimelineTask[]> {
  const { view, scope } = await boardAccess(actor, opts.view);
  const today = opts.today ?? todayIst();
  const w = timelineWindow(opts.start, opts.weeks, today);
  const col = Math.trunc(opts.col);
  if (!(col >= 0 && col <= w.weeks)) return [];
  // People outside the viewer's team return nothing; clients outside scope are filtered by inClients below.
  if (view === "people" && scope.userIds !== null && !scope.userIds.includes(opts.rowId)) return [];
  const base = {
    ...inClients(scope),
    ...(opts.serviceLine ? { engagement: { serviceLine: opts.serviceLine } } : {}),
    supersededByTaskId: null,
    client: { isFirm: false },
    effectiveDueDate: col === 0 ? { lt: w.from } : { gte: w.cols[col - 1]!.from, lte: w.cols[col - 1]!.to },
    status: col === 0 || view === "people" ? { notIn: CLOSED } : { not: "NOT_APPLICABLE" },
  };
  const rowWhere =
    view === "compliance" ? { clientId: opts.rowId }
    : view === "engagement" ? { engagementId: opts.rowId }
    : { assignments: { some: { userId: opts.rowId, toDate: null, role: { in: ["ASSIGNEE", "MAKER"] } } } };
  const tasks = await db().task.findMany({
    where: { AND: [base, rowWhere] },
    select: { id: true, title: true, status: true, effectiveDueDate: true, client: { select: { name: true } } },
    orderBy: [{ effectiveDueDate: "asc" }, { title: "asc" }],
    take: 200,
  });
  return tasks
    .map((t) => ({ id: t.id, title: t.title, client: t.client.name, due: t.effectiveDueDate, status: t.status, state: displayState(t.status as TaskStatus, t.effectiveDueDate, today) }))
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || (a.due ?? "").localeCompare(b.due ?? ""));
}
