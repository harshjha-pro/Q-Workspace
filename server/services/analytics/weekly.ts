import { db } from "../../lib/db";
import { can } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import type { Actor, StaffActor } from "../../permissions/actor";
import { addDays, diffDays, formatDate, isIsoDate, todayIst, weekStart } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { unbilledAlerts } from "../billing/reports";
import { ISSUED_STATUSES } from "../billing/common";
import { formatInr } from "../../lib/money";
import { hrs, inClients, inUsers, practiceScope } from "./common";
import { isLate } from "./compliance";
import { bandOf } from "./engagements";

/**
 * Weekly summary (P5-08, Q-25): a rule-based, plain-language page for last week (Monday–Sunday) and the week ahead.
 * Managers get their team, Partners the firm (analytics.team). Each line is a fixed rule over source data, with a
 * link to act on it; nothing is generated text. Effort appears only as the team's total hours logged — never per
 * person, never against a target. The WEEKLY_SUMMARY job (Monday 07:00) sends each Partner and team-lead Manager
 * an in-app notice pointing at the page.
 */
export type Tone = "good" | "warn" | "bad" | "info";
export type SummaryItem = { key: string; tone: Tone; text: string; link?: string };

const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summaryWeek(week: string | undefined, today: string) {
  const from = week && isIsoDate(week) ? weekStart(week) : addDays(weekStart(today), -7);
  return { from, to: addDays(from, 6), nextFrom: addDays(from, 7), nextTo: addDays(from, 13) };
}

export async function weeklySummary(actor: Actor, opts: { week?: string; today?: string } = {}) {
  if (actor.kind === "PORTAL" || (actor.kind === "USER" && !can(actor, "analytics.team"))) throw forbidden();
  const scope = await practiceScope(actor);
  const today = opts.today ?? todayIst();
  const w = summaryWeek(opts.week, today);
  const base = { ...inClients(scope), supersededByTaskId: null, client: { isFirm: false } };
  const [pendingDays, reviewSla] = await Promise.all([getSetting<number>("reminders.pendingEscalationDays", 10), getSetting<number>("reminders.reviewSlaDays", 2)]);

  const [dueLast, overdueNow, dueNext, waitingLong, effort, effortPrev, reviews, leave, engagements] = await Promise.all([
    db().task.findMany({ where: { ...base, status: { not: "NOT_APPLICABLE" }, effectiveDueDate: { gte: w.from, lte: w.to } }, select: { status: true, filedDate: true, effectiveDueDate: true } }),
    db().task.count({ where: { ...base, status: { notIn: CLOSED }, effectiveDueDate: { lt: today } } }),
    db().task.findMany({ where: { ...base, status: { notIn: CLOSED }, effectiveDueDate: { gte: w.nextFrom, lte: w.nextTo } }, select: { pendingFromClient: true, assignments: { where: { toDate: null, role: { in: ["ASSIGNEE", "MAKER"] } }, select: { id: true } } } }),
    db().task.count({ where: { ...base, status: { notIn: CLOSED }, pendingFromClient: true, pendingSince: { lte: addDays(today, -pendingDays) } } }),
    db().workEntry.aggregate({ where: { ...inUsers(scope), deletedAt: null, date: { gte: w.from, lte: w.to } }, _sum: { minutes: true } }),
    db().workEntry.aggregate({ where: { ...inUsers(scope), deletedAt: null, date: { gte: addDays(w.from, -7), lte: addDays(w.to, -7) } }, _sum: { minutes: true } }),
    db().task.findMany({ where: { ...base, status: "UNDER_REVIEW" }, select: { id: true } }).then((ts) =>
      db().reviewRequest.count({ where: { status: "PENDING", submittedAt: { lte: new Date(`${addDays(today, -reviewSla)}T23:59:59+05:30`) }, taskId: { in: ts.map((t) => t.id) } } })),
    db().leaveRequest.findMany({ where: { ...inUsers(scope), status: "APPROVED", fromDate: { lte: w.nextTo }, toDate: { gte: w.nextFrom } }, select: { userId: true, fromDate: true, toDate: true } }),
    db().engagement.findMany({ where: { ...inClients(scope), status: { in: ["ACTIVE", "ON_HOLD"] }, budgetMinutes: { gt: 0 }, client: { isFirm: false } }, select: { id: true, code: true, name: true, budgetMinutes: true } }),
  ]);
  const items: SummaryItem[] = [];

  // 1. Filings due last week.
  const filed = dueLast.filter((t) => ["FILED", "FILED_LATE"].includes(t.status));
  const late = filed.filter(isLate).length;
  const open = dueLast.length - filed.length;
  if (dueLast.length) {
    items.push({
      key: "due-last-week",
      tone: open ? "bad" : late ? "warn" : "good",
      text: `${plural(dueLast.length, "filing")} fell due last week: ${filed.length - late} filed on time, ${late} late${open ? `, ${open} still open` : ""}.`,
      link: `/analytics/compliance?period=custom:${w.from}:${w.to}`,
    });
  } else items.push({ key: "due-last-week", tone: "info", text: "No filings fell due last week." });

  // 2. Overdue now.
  items.push(overdueNow
    ? { key: "overdue", tone: "bad", text: `${plural(overdueNow, "task")} ${overdueNow === 1 ? "is" : "are"} overdue today.`, link: "/tasks?overdue=1&mine=0" }
    : { key: "overdue", tone: "good", text: "Nothing is overdue today." });

  // 3. The week ahead.
  const unassigned = dueNext.filter((t) => !t.assignments.length).length;
  const waiting = dueNext.filter((t) => t.pendingFromClient).length;
  items.push({
    key: "due-next-week",
    tone: unassigned ? "warn" : "info",
    text: `${plural(dueNext.length, "task")} due in the week of ${formatDate(w.nextFrom)}${waiting ? `, ${waiting} waiting on the client` : ""}${unassigned ? `, ${unassigned} with nobody assigned` : ""}.`,
    link: `/analytics/timeline?start=${w.nextFrom}`,
  });

  // 4. Long client waits and 5. reviews past the SLA.
  if (waitingLong) items.push({ key: "client-wait", tone: "warn", text: `${plural(waitingLong, "task")} ${waitingLong === 1 ? "has" : "have"} waited on the client for ${pendingDays} days or more.`, link: "/tasks?status=PENDING_FROM_CLIENT&mine=0" });
  if (reviews) items.push({ key: "reviews", tone: "warn", text: `${plural(reviews, "review")} ${reviews === 1 ? "has" : "have"} waited more than ${plural(reviewSla, "day")} for a checker.`, link: "/tasks?status=UNDER_REVIEW&mine=0" });

  // 6. Engagements that crossed a budget band during the week (usage at the start vs the end of the week).
  const ids = engagements.map((e) => e.id);
  const [before, after] = await Promise.all([
    db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: ids }, deletedAt: null, date: { lt: w.from } }, _sum: { minutes: true } }),
    db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: ids }, deletedAt: null, date: { lte: w.to } }, _sum: { minutes: true } }),
  ]);
  const b0 = new Map(before.map((r) => [r.engagementId!, r._sum.minutes ?? 0]));
  const b1 = new Map(after.map((r) => [r.engagementId!, r._sum.minutes ?? 0]));
  const crossed: { code: string; name: string; id: string; signal: string; over: boolean }[] = [];
  for (const e of engagements) {
    const p0 = Math.round(((b0.get(e.id) ?? 0) / e.budgetMinutes) * 100);
    const p1 = Math.round(((b1.get(e.id) ?? 0) / e.budgetMinutes) * 100);
    const [x, y] = await Promise.all([bandOf(p0), bandOf(p1)]);
    if (x.signal !== y.signal && p1 > p0 && y.health !== "OnTrack") crossed.push({ id: e.id, code: e.code, name: e.name, signal: y.signal, over: y.health === "Over" });
  }
  if (crossed.length) {
    const over = crossed.filter((c) => c.over).length;
    items.push({
      key: "budgets",
      tone: over ? "bad" : "warn",
      text: `${plural(crossed.length, "engagement")} moved into a higher budget band: ${crossed.slice(0, 3).map((c) => `${c.code} (${c.signal.toLowerCase()})`).join(", ")}${crossed.length > 3 ? ` and ${crossed.length - 3} more` : ""}.`,
      link: crossed.length === 1 ? `/analytics/engagements/${crossed[0]!.id}` : "/analytics/engagements?health=Over",
    });
  }

  // 7. Effort: the team's total only.
  const h = hrs(effort._sum.minutes ?? 0), hp = hrs(effortPrev._sum.minutes ?? 0);
  items.push({ key: "effort", tone: "info", text: `${h.toLocaleString("en-IN")} hrs logged by the ${scope.level === "firm" ? "firm" : "team"} last week (week before: ${hp.toLocaleString("en-IN")} hrs).` });

  // 8. Leave in the week ahead (Monday–Saturday days inside the week).
  if (leave.length) {
    const names = new Map((await db().user.findMany({ where: { id: { in: [...new Set(leave.map((l) => l.userId))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const days = new Map<string, number>();
    for (const l of leave) {
      for (let d = l.fromDate < w.nextFrom ? w.nextFrom : l.fromDate; d <= l.toDate && d <= w.nextTo; d = addDays(d, 1)) {
        if (diffDays(w.nextFrom, d) === 6) continue; // Sunday
        days.set(l.userId, (days.get(l.userId) ?? 0) + 1);
      }
    }
    const list = [...days.entries()].map(([id, n]) => `${names.get(id) ?? "Someone"} (${plural(n, "day")})`).sort();
    items.push({ key: "leave", tone: "info", text: `On leave in the week ahead: ${list.join(", ")}.`, link: "/leave" });
  }

  // 9. Partners: billing for the week and unbilled work.
  if (scope.level === "firm" && (actor.kind === "SYSTEM" || can(actor as StaffActor, "billing.view"))) {
    const firmIds = (await db().client.findMany({ where: { isFirm: true }, select: { id: true } })).map((c) => c.id);
    const [inv, rec, unbilled] = await Promise.all([
      db().invoice.aggregate({ where: { clientId: { notIn: firmIds }, status: { in: ISSUED_STATUSES }, date: { gte: w.from, lte: w.to } }, _sum: { totalPaise: true }, _count: { _all: true } }),
      db().receipt.aggregate({ where: { clientId: { notIn: firmIds }, reversedAt: null, date: { gte: w.from, lte: w.to } }, _sum: { amountPaise: true } }),
      unbilledAlerts(actor, today),
    ]);
    items.push({ key: "billing", tone: "info", text: `${plural(inv._count._all, "invoice")} raised for ${formatInr(inv._sum.totalPaise ?? 0)}; ${formatInr(rec._sum.amountPaise ?? 0)} collected.`, link: "/billing" });
    if (unbilled.length) items.push({ key: "unbilled", tone: "warn", text: `${plural(unbilled.length, "engagement")} ${unbilled.length === 1 ? "has" : "have"} chargeable work unbilled past the alert period.`, link: "/analytics/profitability" });
  }

  const order: Record<Tone, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  const headline = items.filter((i) => i.tone === "bad").length
    ? `${plural(items.filter((i) => i.tone === "bad").length, "thing")} to act on`
    : items.some((i) => i.tone === "warn") ? "Some things to watch" : "A steady week";
  return { scope: scope.level, week: w, headline, items: [...items].sort((a, b) => order[a.tone] - order[b.tone]) };
}

/** WEEKLY_SUMMARY job: each Partner (firm) and each Manager leading a team gets a notice for last week's summary. */
export async function runWeeklySummaries(today = todayIst()) {
  const w = summaryWeek(undefined, today);
  const leads = new Set((await db().clientTeam.findMany({ select: { leadManagerId: true } })).map((t) => t.leadManagerId).filter(Boolean));
  const users = await db().user.findMany({ where: { active: true, isSystem: false, OR: [{ role: "PARTNER" }, { role: "MANAGER", id: { in: [...leads] as string[] } }] }, select: { id: true, role: true, isSenior: true, displayName: true } });
  let sent = 0;
  for (const u of users) {
    const actor: StaffActor = { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
    const s = await weeklySummary(actor, { today });
    sent += await notifyUsers([u.id], {
      kind: "WEEKLY_SUMMARY",
      title: `Weekly summary, week of ${formatDate(w.from)}: ${s.headline.toLowerCase()}`,
      body: s.items.slice(0, 3).map((i) => i.text).join(" "),
      link: `/analytics/weekly?week=${w.from}`,
      dedupeKey: `WEEKLY|${w.from}`,
    });
  }
  return { week: w.from, recipients: users.length, sent };
}
