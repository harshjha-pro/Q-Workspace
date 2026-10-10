import { db } from "../../lib/db";
import { systemActor, type StaffActor } from "../../permissions/actor";
import { addDays, todayIst, weekStart } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { receivablesAgeing } from "../billing/reports";
import { hrs, lastMonths, resolvePeriod } from "./common";
import { complianceDashboard } from "./compliance";
import { firmDashboard } from "./firm";
import { profitabilityDashboard } from "./profitability";
import { engagementPortfolio } from "./engagements";
import { personalDashboard } from "./personal";
import { timelineBoard } from "./timeline";
import { crmDashboard } from "./crm";
import { peopleDashboard } from "./people";
import { capacityForecast } from "./capacity";

/**
 * Reconciliation (5.8): every dashboard number checked against a direct SQL query on the source tables, written
 * independently of the service code (no shared helpers, no Prisma filters). Run by the test suite on generated
 * data and by `npm run analytics:reconcile` against the live database (it changes no data; the profitability view
 * is logged as a sensitive view by System, as every view of it is). A mismatch means a dashboard
 * and the books disagree, so it is a bug, never a rounding note: hours compare at one decimal as displayed.
 */
export type Check = { area: string; name: string; expected: number | string; actual: number | string; ok: boolean };

const CLOSED = "('FILED','FILED_LATE','NOT_APPLICABLE')";
const ISSUED = "('RAISED','PARTLY_RECEIVED','FULLY_RECEIVED','WRITTEN_OFF')";
const OPEN_INV = "('RAISED','PARTLY_RECEIVED')";

async function rows(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> {
  return db().$queryRawUnsafe(sql, ...params);
}
async function one(sql: string, ...params: unknown[]): Promise<number> {
  const r = await rows(sql, ...params);
  return Number(Object.values(r[0] ?? {})[0] ?? 0);
}

export async function reconcileAnalytics(opts: { period?: string; today?: string } = {}): Promise<Check[]> {
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const { from, to } = period;
  const actor = systemActor();
  const out: Check[] = [];
  const check = (area: string, name: string, expected: number | string, actual: number | string) => out.push({ area, name, expected, actual, ok: expected === actual });

  // --- Compliance ------------------------------------------------------------------------------------------
  const dueBase = `FROM "Task" t JOIN "Client" c ON c.id = t.clientId WHERE c.isFirm = 0 AND t.supersededByTaskId IS NULL AND t.status <> 'NOT_APPLICABLE'`;
  const lateExpr = `(t.status = 'FILED_LATE' OR (t.filedDate IS NOT NULL AND t.filedDate > t.effectiveDueDate))`;
  const comp = await complianceDashboard(actor, { period: period.key, today });
  const h = comp.headline;
  const due = await one(`SELECT COUNT(*) ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ?`, from, to);
  const filed = await one(`SELECT COUNT(*) ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ? AND t.status IN ('FILED','FILED_LATE')`, from, to);
  const late = await one(`SELECT COUNT(*) ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ? AND t.status IN ('FILED','FILED_LATE') AND ${lateExpr}`, from, to);
  check("Compliance", "Due in period", due, h.due);
  check("Compliance", "Filed on time", filed - late, h.filedOnTime);
  check("Compliance", "Filed late", late, h.filedLate);
  check("Compliance", "Overdue in period", await one(`SELECT COUNT(*) ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ? AND t.status NOT IN ${CLOSED} AND t.effectiveDueDate < ?`, from, to, today), h.overdue);
  check("Compliance", "Not yet due in period", await one(`SELECT COUNT(*) ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ? AND t.status NOT IN ${CLOSED} AND t.effectiveDueDate >= ?`, from, to, today), h.upcoming);
  check("Compliance", "Overdue now", await one(`SELECT COUNT(*) ${dueBase} AND t.status NOT IN ${CLOSED} AND t.effectiveDueDate < ?`, today), h.overdueNow);
  check("Compliance", "Waiting on client", await one(`SELECT COUNT(*) FROM "Task" t JOIN "Client" c ON c.id = t.clientId WHERE c.isFirm = 0 AND t.status NOT IN ${CLOSED} AND t.pendingFromClient = 1`), h.waitingOnClient);
  const byType = await rows(`SELECT COALESCE(t.complianceTypeCode, 'ONE_OFF') AS k, COUNT(*) AS n ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ? GROUP BY k`, from, to);
  check("Compliance", "By type adds up to due", due, comp.byType.reduce((a, r) => a + r.due, 0));
  for (const r of comp.byType.filter((x) => x.code !== "OTHER")) check("Compliance", `Due, ${r.code}`, Number(byType.find((x) => x.k === r.code)?.n ?? 0), r.due);
  const months = lastMonths(12, today);
  const trend = await rows(`SELECT substr(t.effectiveDueDate, 1, 7) AS m, COUNT(*) AS n ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ? GROUP BY m`, `${months[0]}-01`, today);
  for (const t of comp.trend) check("Compliance", `Trend due ${t.month}`, Number(trend.find((x) => x.m === t.month)?.n ?? 0), t.due);

  // --- Firm: effort and billing ----------------------------------------------------------------------------
  const firm = await firmDashboard(actor, { period: period.key, today });
  const minutes = await one(`SELECT COALESCE(SUM(minutes), 0) FROM "WorkEntry" WHERE deletedAt IS NULL AND date BETWEEN ? AND ?`, from, to);
  check("Firm", "Hours logged", hrs(minutes), firm.effort.hours);
  check("Firm", "Client hours", hrs(await one(`SELECT COALESCE(SUM(w.minutes), 0) FROM "WorkEntry" w JOIN "Client" c ON c.id = w.clientId WHERE w.deletedAt IS NULL AND c.isFirm = 0 AND w.date BETWEEN ? AND ?`, from, to)), firm.effort.clientHours);
  check("Firm", "Chargeable hours", hrs(await one(`SELECT COALESCE(SUM(minutes), 0) FROM "WorkEntry" WHERE deletedAt IS NULL AND chargeable = 1 AND date BETWEEN ? AND ?`, from, to)), firm.effort.chargeableHours);
  const invBase = `FROM "Invoice" i JOIN "Client" c ON c.id = i.clientId WHERE c.isFirm = 0`;
  check("Firm", "Invoiced", await one(`SELECT COALESCE(SUM(i.totalPaise), 0) ${invBase} AND i.status IN ${ISSUED} AND i.date BETWEEN ? AND ?`, from, to), firm.billing.invoicedPaise);
  check("Firm", "Invoices", await one(`SELECT COUNT(*) ${invBase} AND i.status IN ${ISSUED} AND i.date BETWEEN ? AND ?`, from, to), firm.billing.invoiceCount);
  check("Firm", "Collected", await one(`SELECT COALESCE(SUM(r.amountPaise), 0) FROM "Receipt" r JOIN "Client" c ON c.id = r.clientId WHERE c.isFirm = 0 AND r.reversedAt IS NULL AND r.date BETWEEN ? AND ?`, from, to), firm.billing.collectedPaise);
  const receivable = await one(`SELECT COALESCE(SUM(MAX(0, i.totalPaise - i.receivedPaise - i.writtenOffPaise)), 0) ${invBase} AND i.status IN ${OPEN_INV}`);
  check("Firm", "Receivable", receivable, firm.billing.receivablePaise);
  check("Firm", "Receivable over 90 days", await one(`SELECT COALESCE(SUM(MAX(0, i.totalPaise - i.receivedPaise - i.writtenOffPaise)), 0) ${invBase} AND i.status IN ${OPEN_INV} AND i.date < ?`, addDays(today, -90)), firm.billing.over90Paise);
  check("Firm", "Active clients", await one(`SELECT COUNT(*) FROM "Client" WHERE isFirm = 0 AND status = 'ACTIVE'`), firm.clients.active);
  // Across modules: the Billing module's ageing (all clients) against the same SQL without the firm filter.
  check("Billing", "Receivables ageing total", await one(`SELECT COALESCE(SUM(MAX(0, totalPaise - receivedPaise - writtenOffPaise)), 0) FROM "Invoice" WHERE status IN ${OPEN_INV}`), (await receivablesAgeing(actor, today)).totalPaise);

  // --- Profitability ---------------------------------------------------------------------------------------
  const prof = await profitabilityDashboard(actor, { period: period.key, today });
  check("Profitability", "Fees billed", await one(`SELECT COALESCE(SUM(l.amountPaise), 0) FROM "InvoiceLine" l JOIN "Invoice" i ON i.id = l.invoiceId JOIN "Client" c ON c.id = i.clientId WHERE l.kind = 'FEE' AND c.isFirm = 0 AND i.status IN ${ISSUED} AND i.date BETWEEN ? AND ?`, from, to), prof.headline.billedPaise);
  const rated = `FROM "WorkEntry" w JOIN "User" u ON u.id = w.userId JOIN "CostRate" r ON r.designationId = u.designationId AND r.effectiveFrom <= w.date AND (r.effectiveTo IS NULL OR r.effectiveTo >= w.date) WHERE w.deletedAt IS NULL AND w.date BETWEEN ? AND ?`;
  check("Profitability", "Cost of hours", await one(`SELECT COALESCE(SUM(ROUND(w.minutes * r.ratePaisePerHour / 60.0)), 0) ${rated}`, from, to), prof.headline.costPaise);
  const ratedMinutes = await one(`SELECT COALESCE(SUM(w.minutes), 0) ${rated}`, from, to);
  check("Profitability", "Hours without a cost rate", hrs(minutes - ratedMinutes), prof.headline.hoursWithoutRate);
  check("Profitability", "Receivable", receivable, prof.headline.receivablePaise);
  check("Profitability", "Ageing adds up to receivable", receivable, prof.cash.ageing.reduce((a, b) => a + b.amountPaise, 0));

  // --- Engagement portfolio --------------------------------------------------------------------------------
  const port = await engagementPortfolio(actor);
  const engs = await rows(`SELECT e.id, e.budgetMinutes AS b, COALESCE((SELECT SUM(minutes) FROM "WorkEntry" w WHERE w.engagementId = e.id AND w.deletedAt IS NULL), 0) AS u FROM "Engagement" e JOIN "Client" c ON c.id = e.clientId WHERE c.isFirm = 0 AND e.status IN ('ACTIVE','ON_HOLD')`);
  const bands = await getSetting<number[]>("budget.bands", [85, 100, 110]);
  const pctOf = (e: Record<string, unknown>) => (Number(e.b) ? Math.round((Number(e.u) / Number(e.b)) * 100) : null);
  check("Engagements", "Active engagements", engs.length, port.summary.active);
  check("Engagements", "Over budget", engs.filter((e) => (pctOf(e) ?? -1) >= bands[1]!).length, port.summary.over);
  check("Engagements", "Approaching budget", engs.filter((e) => { const p = pctOf(e); return p !== null && p >= bands[0]! && p < bands[1]!; }).length, port.summary.atRisk);
  const usedById = new Map(engs.map((e) => [String(e.id), hrs(Number(e.u))]));
  check("Engagements", "Hours per engagement", "all match", port.rows.every((r) => usedById.get(r.id) === r.usedHours) ? "all match" : "differ");

  // --- Personal: the three people with most hours in the period ----------------------------------------------
  const people = await rows(`SELECT w.userId AS id, SUM(w.minutes) AS m, u.role AS role, u.isSenior AS s, u.displayName AS n FROM "WorkEntry" w JOIN "User" u ON u.id = w.userId WHERE w.deletedAt IS NULL AND w.date BETWEEN ? AND ? AND u.active = 1 AND u.isSystem = 0 GROUP BY w.userId ORDER BY m DESC LIMIT 3`, from, to);
  for (const p of people) {
    const me: StaffActor = { kind: "USER", userId: String(p.id), role: String(p.role) as StaffActor["role"], isSenior: Boolean(Number(p.s)), displayName: String(p.n) };
    check("Personal", `Hours, ${p.n}`, hrs(Number(p.m)), (await personalDashboard(me, { period: period.key, today })).effort.hours);
  }

  // --- Timeline: tasks per week column ---------------------------------------------------------------------
  const tl = await timelineBoard(actor, { view: "compliance", weeks: 6, today });
  const wf = weekStart(today);
  check("Timeline", "Earlier (open, past due)", await one(`SELECT COUNT(*) ${dueBase} AND t.status NOT IN ${CLOSED} AND t.effectiveDueDate < ?`, wf), tl.totals[0]!.count);
  for (let i = 1; i <= 6; i++) {
    const a = addDays(wf, (i - 1) * 7);
    check("Timeline", `Week of ${a}`, await one(`SELECT COUNT(*) ${dueBase} AND t.effectiveDueDate BETWEEN ? AND ?`, a, addDays(a, 6)), tl.totals[i]!.count);
  }

  // --- CRM and People --------------------------------------------------------------------------------------
  const crm = await crmDashboard(actor, { period: period.key, today });
  check("CRM", "Open leads", await one(`SELECT COUNT(*) FROM "Lead" WHERE stage IN ('NEW','CONTACTED','MEETING','PROPOSAL_SENT','ON_HOLD')`), crm.headline.openLeads);
  check("CRM", "Proposal pipeline", await one(`SELECT COALESCE(SUM(CASE WHEN feePaise > 0 THEN feePaise ELSE ROUND(ratePaise * budgetMinutes / 60.0) END), 0) FROM "Proposal" WHERE status = 'SENT'`), crm.headline.pipelinePaise);
  const ppl = await peopleDashboard(actor, { period: period.key, today });
  check("People", "Headcount", await one(`SELECT COUNT(*) FROM "User" WHERE active = 1 AND isSystem = 0`), ppl.headline.headcount);
  check("People", "Pending leave requests", await one(`SELECT COUNT(*) FROM "LeaveRequest" WHERE status = 'PENDING'`), ppl.headline.pendingLeave);

  // --- Capacity: people add up to the firm line --------------------------------------------------------------
  const cap = await capacityForecast(actor, { today });
  check("Capacity", "People add up to available hours", "all match", cap.buckets.every((b, i) => Math.abs(cap.people.reduce((a, p) => a + p.cells[i]!.capacityHours, 0) - b.capacityHours) < 0.05 * cap.people.length + 0.05) ? "all match" : "differ");

  return out;
}
