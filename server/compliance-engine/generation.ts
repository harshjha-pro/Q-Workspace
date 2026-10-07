import type { ClientSnapshot, ComplianceTypeDef, DueRuleDef, HolidayCalendar, Obligation, Period, PeriodBasis, TaskCreate } from "./types";
import { closurePeriod as closureOf, nextPeriod, periodContaining, periodsOverlapping } from "./periods";
import { applyHolidayPolicy, computeDueDate, pickRule, type DueContext } from "./rules";
import { valueAt } from "./applicability";

export type GenerationInput = {
  client: ClientSnapshot;
  obligations: Obligation[];
  types: Map<string, ComplianceTypeDef>;
  rules: Map<string, DueRuleDef[]>;
  /** Natural keys that already exist: `${typeCode}|${partyKey}|${periodKey}` (Rules Spec 3.3). */
  existingKeys: Set<string>;
  today: string;
  holidays: HolidayCalendar;
  stateGroups: Map<string, string>;
  gstinStates: Map<string, string>;
  /** Human labels for parties (GSTIN number, director name, state). */
  partyLabels: Map<string, string>;
  agmCeilingMonths: number;
  firstAgmCeilingMonths: number;
  /** Generation horizon (Rules Spec 3.1): extra future periods kept for each basis. */
  horizon?: Partial<Record<PeriodBasis, number>>;
};

const DEFAULT_HORIZON: Record<PeriodBasis, number> = { MONTH: 2, FY_QUARTER: 1, FY_HALF: 1, FY: 0, AY: 0, EVENT: 0 };
const IFF_MONTHS = new Set(["M04", "M05", "M07", "M08", "M10", "M11", "M01", "M02"]);

export const naturalKey = (typeCode: string, partyKey: string, periodKey: string) => `${typeCode}|${partyKey}|${periodKey}`;

/** Last period kept for a basis: the period containing today plus the horizon. */
export function horizonEnd(basis: PeriodBasis, today: string, horizon = DEFAULT_HORIZON): Period {
  let p = periodContaining(basis, today);
  for (let i = 0; i < horizon[basis]; i++) p = nextPeriod(basis, p);
  return p;
}


/**
 * Plan the tasks to create (Rules Spec 11.1). Idempotent: natural keys that already exist are skipped,
 * so running it twice creates nothing the second time. Periods before an obligation's start are never
 * created (no back-filling); periods starting on/after its end are never created.
 */
export function planGeneration(input: GenerationInput): TaskCreate[] {
  const horizon = { ...DEFAULT_HORIZON, ...input.horizon };
  const out: TaskCreate[] = [];
  const seen = new Set(input.existingKeys);
  for (const o of input.obligations) {
    const type = input.types.get(o.typeCode);
    if (!type) continue; // type inactive or not in the master
    const rule = input.rules.get(o.typeCode) ?? [];
    let periods: Period[];
    if (type.frequency === "ONE_TIME") {
      periods = [closureOf(o.start)];
    } else {
      const basis = o.basisOverride ?? type.periodBasis;
      const last = horizonEnd(basis, input.today, horizon);
      periods = periodsOverlapping(basis, o.start, last.end).filter((p) => !o.end || p.start < o.end);
      if (o.typeCode === "GST-IFF") periods = periods.filter((p) => IFF_MONTHS.has(p.index));
    }
    for (const period of periods) {
      const key = naturalKey(o.typeCode, o.partyKey, period.key);
      if (seen.has(key)) continue;
      const def = pickRule(rule, period);
      // Event-linked filings (AOC-4, MGT-7, ADT-1) are created once the financial year has closed.
      if (def?.params.kind === "EVENT_OFFSET" && period.end >= input.today) continue;
      const flagsOn = new Set(Object.keys(input.client.flags).filter((f) => valueAt(input.client.flags[f], period.end)));
      const ctx: DueContext = {
        stateGroup: o.gstinId ? input.stateGroups.get(input.gstinStates.get(o.gstinId) ?? "") ?? null : null,
        flagsOn,
        events: input.client.events,
        incorporationDate: input.client.incorporationDate,
        agmCeilingMonths: input.agmCeilingMonths,
        firstAgmCeilingMonths: input.firstAgmCeilingMonths,
      };
      const due = def ? computeDueDate(def.params, period, ctx) : { date: null, isProvisional: false, basis: "No due-date rule in the master" };
      if (due.skip) continue;
      const shifted = due.date ? applyHolidayPolicy(type.weekendHolidayPolicy, due.date, input.holidays) : { date: null, shifted: false };
      const party = o.partyKey !== "-" ? input.partyLabels.get(o.partyKey) : undefined;
      seen.add(key);
      out.push({
        clientId: input.client.id,
        typeCode: o.typeCode,
        partyKey: o.partyKey,
        periodKey: period.key,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        title: `${type.shortName} ${period.label}${party ? ` — ${party}` : ""}`,
        dueDate: shifted.date,
        isProvisional: due.isProvisional,
        dueBasis: due.basis,
        holidayShifted: shifted.shifted,
        gstinId: o.gstinId,
        directorId: o.directorId,
      });
    }
  }
  return out;
}
