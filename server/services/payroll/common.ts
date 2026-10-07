import type { Actor } from "../../permissions/actor";
import { can, scopeOf } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import { getSetting } from "../settings/service";
import type { DaysBasis, PfWageBasis, Regime } from "../../payroll-engine";
import { fyStartYear } from "../../lib/dates";

/** Partner and HR Admin see everyone's salary; everyone else only their own (permissions.md invariant 5). */
export function isSalaryAdmin(actor: Actor): boolean {
  return actor.kind === "SYSTEM" || scopeOf(actor, "salary.view") === "firm";
}

export function assertSalaryAccess(actor: Actor, userId: string) {
  if (isSalaryAdmin(actor)) return;
  if (actor.kind === "USER" && actor.userId === userId && can(actor, "salary.view")) return;
  throw forbidden();
}

/** HR prepares, Partner approves; both may open runs and outputs. */
export function assertPayrollRole(actor: Actor) {
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve")) throw forbidden();
}

export const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

/** Settings this module reads (listed for the registry in the phase report). */
export async function payrollSettings() {
  const [daysBasis, pfWageBasis, defaultRegime, esiRoundUp, stipendLocationClass, form16Label] = await Promise.all([
    getSetting<DaysBasis>("payroll.daysBasis", "CALENDAR"),
    getSetting<PfWageBasis>("payroll.pfWageBasis", "CAPPED"),
    getSetting<Regime>("payroll.defaultRegime", "NEW"),
    getSetting<boolean>("payroll.esiRoundUpToRupee", true),
    getSetting<string>("payroll.stipendLocationClass", "POP_20L_PLUS"),
    getSetting<string>("payroll.form16Label", "Form 16"),
  ]);
  return {
    daysBasis: (["CALENDAR", "FIXED_30", "FIXED_26"].includes(daysBasis) ? daysBasis : "CALENDAR") as DaysBasis,
    pfWageBasis: (pfWageBasis === "FULL" ? "FULL" : "CAPPED") as PfWageBasis,
    defaultRegime: (defaultRegime === "OLD" ? "OLD" : "NEW") as Regime,
    esiRoundUp: esiRoundUp !== false,
    stipendLocationClass,
    form16Label: form16Label || "Form 16",
  };
}

/** "2026-04" → { start, end, days, month, fy } */
export function monthInfo(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month ${month}`);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(days).padStart(2, "0")}`;
  return { year: y, month: m, start, end, days, fyStart: fyStartYear(start) };
}

/** The 12 months of a FY starting in April of fyStart. */
export function fyMonths(fyStart: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? fyStart : fyStart + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

export const fyCode = (fyStart: number) => `FY${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;

export const rupees = (paise: number) => Math.round(paise) / 100;
