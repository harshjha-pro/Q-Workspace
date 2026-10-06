import { db } from "../../lib/db";
import { authorize, can, scopeOf } from "../../permissions/guards";
import { assertUserAccess, clientWhere, taskWhere } from "../../permissions/scopes";
import type { Actor, StaffActor } from "../../permissions/actor";
import { requireStaff } from "../../permissions/guards";
import { addDays, todayIst, weekStart } from "../../lib/dates";
import { listTasks, groupByDue } from "../tasks/service";
import { waitingForMyReview } from "../review/service";
import { missingDays, missingBanner, teamMissing } from "../work/service";
import { listLeave } from "../leave/service";
import { listCorrections } from "../work/service";
import { listDscs } from "../registers/dsc";
import { listNotices } from "../registers/notices";

const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

async function minutesLogged(userId: string, from: string, to: string) {
  return (await db().workEntry.aggregate({ where: { userId, date: { gte: from, lte: to }, deletedAt: null }, _sum: { minutes: true } }))._sum.minutes ?? 0;
}

/** Firm (or team) compliance strip for the current month (P2-04): due, filed on time, filed late, overdue. */
export async function complianceStrip(actor: Actor, today = todayIst()) {
  const scope = authorize(actor, "task.view");
  const from = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number) as [number, number];
  const to = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  const base = { AND: [taskWhere(actor, scope), { complianceTypeCode: { not: null } }, { effectiveDueDate: { gte: from, lte: to } }] };
  const by = await db().task.groupBy({ by: ["status"], where: base, _count: true });
  const n = (s: string[]) => by.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count, 0);
  const overdue = await db().task.count({ where: { AND: [...base.AND, { status: { in: OPEN } }, { effectiveDueDate: { lt: today } }] } });
  return { month: from.slice(0, 7), total: n([...OPEN, "FILED", "FILED_LATE"]), filedOnTime: n(["FILED"]), filedLate: n(["FILED_LATE"]), open: n(OPEN), overdue };
}

/** Home (P2-01..04, P2-41): one call for everything the role's home page shows. Hours are shown as logged, never against a target. */
export async function homeData(actor: Actor) {
  requireStaff(actor);
  const a = actor as StaffActor;
  const today = todayIst();
  const ws = weekStart(today);
  const logsWork = can(a, "work.log");
  const myTasks = can(a, "task.view") ? await listTasks(a, { mine: true }) : [];
  const groups = groupByDue(myTasks, today);
  const manages = scopeOf(a, "work.viewOthers") !== "none" && ["PARTNER", "MANAGER"].includes(a.role);

  const [missing, team, reviews, approvals, corrections, dscs, notices, strip, allocations] = await Promise.all([
    logsWork && ["PARTNER", "MANAGER", "STAFF", "ARTICLE"].includes(a.role) ? missingDays(a.userId, today) : Promise.resolve([] as string[]),
    manages ? teamMissing(a) : Promise.resolve([]),
    can(a, "review.check") || a.role === "PARTNER" ? waitingForMyReview(a) : Promise.resolve([]),
    can(a, "leave.approve") ? listLeave(a, "approvals") : Promise.resolve([]),
    can(a, "work.correction.approve") ? listCorrections(a, "approvals") : Promise.resolve([]),
    scopeOf(a, "dsc.view") !== "none" ? listDscs(a, { expiring: true }) : Promise.resolve([]),
    scopeOf(a, "notice.view") !== "none" ? listNotices(a) : Promise.resolve([]),
    manages || a.role === "PRACTICE_ADMIN" ? complianceStrip(a, today) : Promise.resolve(null),
    manages || a.role === "PRACTICE_ADMIN" ? allocationsPending(a) : Promise.resolve([]),
  ]);

  return {
    today,
    snapshot: {
      todayMinutes: logsWork ? await minutesLogged(a.userId, today, today) : 0,
      weekMinutes: logsWork ? await minutesLogged(a.userId, ws, addDays(ws, 6)) : 0,
      overdue: groups.overdue.length,
      dueThisWeek: groups.thisWeek.length,
      pendingFromClient: myTasks.filter((t) => t.status === "PENDING_FROM_CLIENT").length,
      underReview: myTasks.filter((t) => t.status === "UNDER_REVIEW").length,
    },
    dueThisWeek: [...groups.overdue, ...groups.thisWeek].slice(0, 12),
    missing: { days: missing, banner: missingBanner(missing) },
    teamMissing: team,
    reviews,
    leaveApprovals: approvals,
    corrections,
    dscExpiring: dscs.slice(0, 8),
    noticesDue: notices.filter((n) => n.responseDueDate && n.responseDueDate <= addDays(today, 7)).slice(0, 8),
    complianceStrip: strip,
    allocationsPending: allocations,
  };
}

/** Open tasks in scope with nobody assigned (P2-41 "Allocations pending"). */
export async function allocationsPending(actor: Actor) {
  const scope = authorize(actor, "task.view");
  return db().task.findMany({
    where: { AND: [taskWhere(actor, scope), { status: { in: OPEN } }, { assignments: { none: { toDate: null, role: { in: ["ASSIGNEE", "MAKER"] } } } }] },
    select: { id: true, title: true, effectiveDueDate: true, client: { select: { id: true, name: true } } },
    orderBy: { effectiveDueDate: "asc" },
    take: 50,
  });
}

/** This Week (P2-25): one person's tasks for this or next week plus anything overdue, with hours logged per day. */
export async function thisWeek(actor: Actor, opts: { userId?: string; next?: boolean } = {}) {
  requireStaff(actor);
  const userId = opts.userId ?? actor.userId;
  if (userId !== actor.userId) await assertUserAccess(actor, "work.viewOthers", userId);
  const today = todayIst();
  const ws = addDays(weekStart(today), opts.next ? 7 : 0);
  const we = addDays(ws, 6);
  const tasks = await db().task.findMany({
    where: { status: { in: OPEN }, assignments: { some: { userId, toDate: null } }, OR: [{ effectiveDueDate: { gte: ws, lte: we } }, ...(opts.next ? [] : [{ effectiveDueDate: { lt: ws } }])] },
    include: { client: { select: { id: true, name: true } }, assignments: { where: { toDate: null, userId }, select: { role: true } } },
    orderBy: { effectiveDueDate: "asc" },
  });
  const entries = await db().workEntry.groupBy({ by: ["date"], where: { userId, date: { gte: ws, lte: we }, deletedAt: null }, _sum: { minutes: true } });
  const perDay = new Map(entries.map((e) => [e.date, e._sum.minutes ?? 0]));
  const user = await db().user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, displayName: true } });
  return {
    user,
    weekStart: ws,
    days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => ({ date: d, minutes: perDay.get(d) ?? 0, tasks: tasks.filter((t) => t.effectiveDueDate === d) })),
    overdue: tasks.filter((t) => t.effectiveDueDate && t.effectiveDueDate < ws),
  };
}

/** Group view (P2-18): a client group's clients with open, overdue and filed counts. */
export async function groupView(actor: Actor, groupId: string) {
  const scope = authorize(actor, "client.view");
  const group = await db().clientGroup.findUniqueOrThrow({ where: { id: groupId } });
  const clients = await db().client.findMany({ where: { AND: [{ groupId }, clientWhere(actor, scope)] }, select: { id: true, code: true, name: true, constitution: true }, orderBy: { name: "asc" } });
  const today = todayIst();
  const taskScope = authorize(actor, "task.view");
  const rows = [];
  for (const c of clients) {
    const base = { AND: [taskWhere(actor, taskScope), { clientId: c.id }] };
    const [open, overdue, filed, pending] = await Promise.all([
      db().task.count({ where: { AND: [...base.AND, { status: { in: OPEN } }] } }),
      db().task.count({ where: { AND: [...base.AND, { status: { in: OPEN } }, { effectiveDueDate: { lt: today } }] } }),
      db().task.count({ where: { AND: [...base.AND, { status: { in: ["FILED", "FILED_LATE"] } }, { filedDate: { gte: addDays(today, -30) } }] } }),
      db().task.count({ where: { AND: [...base.AND, { status: "PENDING_FROM_CLIENT" }] } }),
    ]);
    rows.push({ ...c, open, overdue, filedLast30: filed, pendingFromClient: pending });
  }
  return { group, clients: rows };
}
