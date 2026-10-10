import { db } from "../../lib/db";
import { authorize, can } from "../../permissions/guards";
import { clientWhere, userWhere } from "../../permissions/scopes";
import { forbidden } from "../../lib/errors";
import type { Actor, StaffActor } from "../../permissions/actor";
import { addDays, fyStartYear, isoFromParts, parseIso, todayIst } from "../../lib/dates";

/**
 * Shared pieces for the analytics module (P5, D-87). Analytics is read-only: every function only aggregates
 * what the actor could already see, using the analytics capabilities of the matrix:
 *   analytics.personal (self) · analytics.team (Partner firm, Manager team) · analytics.firm (Partner) ·
 *   analytics.operational (Partner, Practice Admin) · analytics.hr (Partner, HR Admin).
 * Hours are effort only ("6 hrs logged"): never a target ratio, never a ranking of people.
 */

export type Period = { key: string; label: string; from: string; to: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Named periods (IST dates, inclusive). `custom:YYYY-MM-DD:YYYY-MM-DD` is accepted too. */
export function resolvePeriod(key: string | undefined, today = todayIst()): Period {
  const { y, m } = parseIso(today);
  const fy = fyStartYear(today);
  const k = key ?? "this-month";
  if (k === "last-month") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { key: k, label: `${MONTHS[pm - 1]} ${py}`, from: isoFromParts(py, pm, 1), to: isoFromParts(py, pm, lastDay(py, pm)) };
  }
  if (k === "fytd") return { key: k, label: `FY ${fy}-${String(fy + 1).slice(2)} to date`, from: isoFromParts(fy, 4, 1), to: today };
  if (k === "last-fy") return { key: k, label: `FY ${fy - 1}-${String(fy).slice(2)}`, from: isoFromParts(fy - 1, 4, 1), to: isoFromParts(fy, 3, 31) };
  if (k === "last-90") return { key: k, label: "Last 90 days", from: addDays(today, -89), to: today };
  const custom = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(k);
  if (custom && custom[1]! <= custom[2]!) return { key: k, label: `${custom[1]} to ${custom[2]}`, from: custom[1]!, to: custom[2]! };
  // The whole month, so filings due later this month count as due (money and hours have no future rows anyway).
  return { key: "this-month", label: `${MONTHS[m - 1]} ${y}`, from: isoFromParts(y, m, 1), to: isoFromParts(y, m, lastDay(y, m)) };
}

export const PERIOD_OPTIONS = [
  ["this-month", "This month"],
  ["last-month", "Last month"],
  ["last-90", "Last 90 days"],
  ["fytd", "FY to date"],
  ["last-fy", "Last FY"],
] as const;

/** The last `n` calendar months ending with the month of `today`, oldest first, as YYYY-MM. */
export function lastMonths(n: number, today = todayIst()): string[] {
  const { y, m } = parseIso(today);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export type AnalyticsScope = { level: "firm" | "team"; clientIds: string[] | null; userIds: string[] | null };

/**
 * Practice scope for team-level analytics: Partners see the firm, Managers their team (clients of their
 * teams, people in their teams); the Practice Admin gets the firm through analytics.operational.
 */
export async function practiceScope(actor: Actor): Promise<AnalyticsScope> {
  if (actor.kind === "PORTAL") throw forbidden();
  if (actor.kind === "SYSTEM") return { level: "firm", clientIds: null, userIds: null };
  if (can(actor, "analytics.team")) {
    const scope = authorize(actor, "analytics.team");
    if (scope === "firm") return { level: "firm", clientIds: null, userIds: null };
    const [clients, users] = await Promise.all([
      db().client.findMany({ where: clientWhere(actor, "team"), select: { id: true } }),
      db().user.findMany({ where: userWhere(actor, "team"), select: { id: true } }),
    ]);
    return { level: "team", clientIds: clients.map((c) => c.id), userIds: [...new Set([actor.userId, ...users.map((u) => u.id)])] };
  }
  if (authorize(actor, "analytics.operational") === "firm") return { level: "firm", clientIds: null, userIds: null };
  throw forbidden();
}

export const inClients = (s: AnalyticsScope) => (s.clientIds === null ? {} : { clientId: { in: s.clientIds } });
export const inUsers = (s: AnalyticsScope) => (s.userIds === null ? {} : { userId: { in: s.userIds } });

/** Partner-only views (firm, profitability, CRM, MIS). */
export function assertFirmAnalytics(actor: Actor): asserts actor is StaffActor {
  if (actor.kind === "PORTAL") throw forbidden();
  if (actor.kind === "SYSTEM") return;
  if (authorize(actor, "analytics.firm") !== "firm") throw forbidden();
}

/** Minutes as "12.5 hrs" (effort only, one decimal). */
export const hrs = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** People analytics (Partner, HR Admin): headcount, leave, hiring, CPE — never client data. */
export function assertHrAnalytics(actor: Actor): asserts actor is StaffActor {
  if (actor.kind === "PORTAL") throw forbidden();
  if (actor.kind === "SYSTEM") return;
  if (authorize(actor, "analytics.hr") !== "firm") throw forbidden();
}
