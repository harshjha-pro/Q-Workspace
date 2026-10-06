/**
 * Compliance engine types. The engine is pure: plain data in, plain data out, `today` injected
 * (decisions D-06). Nothing here touches the database, the clock or the network.
 */

export type Frequency = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL" | "EVENT" | "ONE_TIME";
export type PeriodBasis = "MONTH" | "FY_QUARTER" | "FY_HALF" | "FY" | "AY" | "EVENT";
export type PartyBasis = "CLIENT" | "GSTIN" | "DIRECTOR" | "PT_STATE";
export type HolidayPolicy = "NONE" | "NEXT_WORKING_DAY" | "PREV_WORKING_DAY";

export const TASK_STATUS = {
  UPCOMING: "UPCOMING",
  IN_PROGRESS: "IN_PROGRESS",
  PENDING_FROM_CLIENT: "PENDING_FROM_CLIENT",
  UNDER_REVIEW: "UNDER_REVIEW",
  FILED: "FILED",
  FILED_LATE: "FILED_LATE",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
export const TERMINAL_STATUSES: readonly TaskStatus[] = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];
export const OPEN_STATUSES: readonly TaskStatus[] = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

export type Period = {
  key: string; // 2026-08 | FY2026-27-Q2 | FY2026-27-H1 | FY2025-26 | AY2026-27 | EVT:...
  label: string; // Aug 2026 | Q2 FY 2026-27 | H1 FY 2026-27 | FY 2025-26 | AY 2026-27
  start: string; // YYYY-MM-DD
  end: string;
  index: string; // M01..M12 | Q1..Q4 | H1 | H2 | FY | AY
};

/** One Due-Date Master row as the engine needs it. */
export type ComplianceTypeDef = {
  code: string;
  name: string;
  shortName: string;
  frequency: Frequency;
  periodBasis: PeriodBasis;
  partyBasis: PartyBasis;
  familyCode: string;
  weekendHolidayPolicy: HolidayPolicy;
  isClosure?: boolean;
};

/** Due-date rule kinds (stored in DueDateRule.paramsJson, validated in rules.ts). */
export type DueRuleParams =
  | { kind: "DAY_AFTER_PERIOD"; day: number; monthsAfter?: number; byEndMonth?: Record<string, number> }
  | { kind: "STATE_GROUP_DAY_AFTER_PERIOD"; days: Record<string, number>; monthsAfter?: number }
  | { kind: "MMDD_ON_OR_AFTER_START"; mmdd?: string; byIndex?: Record<string, string> }
  | { kind: "MMDD_AFTER_END"; mmdd?: string; byIndex?: Record<string, string>; ifFlag?: Record<string, string> }
  | { kind: "EVENT_OFFSET"; eventType: string; days: number; fallbackEventType?: string; provisional: boolean }
  | { kind: "MANUAL" };

export type DueRuleDef = { complianceTypeCode: string; version: number; effectiveFrom: string; effectiveTo?: string | null; params: DueRuleParams };

export type GstinSnapshot = {
  id: string;
  stateCode: string;
  status: string; // ACTIVE | CANCELLED | SUSPENDED
  registrationDate?: string | null;
  cancellationDate?: string | null;
  /** Frequency timeline, oldest first: each segment applies from `from` until the next one. */
  frequencies: { from: string; frequency: "MONTHLY" | "QRMP" | "COMPOSITION"; iffOpted: boolean }[];
  annualReturnApplicable: boolean;
  gstr9cApplicable: boolean;
};

/** A boolean flag's timeline, oldest first (from ClientFlagHistory). */
export type FlagTimeline = { from: string; value: boolean }[];

export type ClientSnapshot = {
  id: string;
  constitution: string;
  status: string;
  statusEffectiveFrom?: string | null;
  stateCode?: string | null;
  fyEnd: string; // MM-DD, normally 03-31
  incorporationDate?: string | null;
  /** Earliest date the firm tracks this client (onboarding); generation never starts before it. */
  trackingFrom: string;
  flags: Record<string, FlagTimeline>;
  gstins: GstinSnapshot[];
  directors: { directorId: string; isPrimaryHere: boolean; appointedOn?: string | null; ceasedOn?: string | null }[];
  ptRegistrations: { stateCode: string; kind: string; frequency: string; effectiveFrom: string; effectiveTo?: string | null }[];
  /** Event dates, keyed `${eventType}|${periodKey}` → YYYY-MM-DD. */
  events: Record<string, string>;
};

/** An obligation = (type, party) applying over a date window. */
export type Obligation = {
  typeCode: string;
  partyKey: string; // "-" | gstin id | director id | state code
  start: string;
  end?: string | null; // exclusive cut-off: periods starting on/after this are not generated
  endReason?: string;
  gstinId?: string;
  directorId?: string;
  /** Period basis override (PT registrations carry their own frequency). */
  basisOverride?: PeriodBasis;
};

export type ExistingTask = {
  id: string;
  clientId: string;
  typeCode: string;
  partyKey: string;
  periodKey: string;
  periodStart: string;
  status: TaskStatus;
  originalDueDate: string | null;
  effectiveDueDate: string | null;
  isProvisional: boolean;
  filedDate: string | null;
};

export type TaskCreate = {
  clientId: string;
  typeCode: string;
  partyKey: string;
  periodKey: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  dueDate: string | null;
  isProvisional: boolean;
  dueBasis: string; // plain explanation, e.g. "20th of the following month"
  holidayShifted: boolean;
  gstinId?: string;
  directorId?: string;
};

export type TaskUpdate = {
  taskId: string;
  status?: TaskStatus;
  effectiveDueDate?: string | null;
  originalDueDate?: string | null;
  isProvisional?: boolean;
  notApplicableReason?: string;
  supersededByKey?: { typeCode: string; partyKey: string; periodKey: string };
  history?: { oldValue: string | null; newValue: string | null; source: DueDateSource; reference: string };
  statusReason?: string;
};

export type DueDateSource = "GENERATION" | "EXTENSION" | "EVENT_CORRECTION" | "HOLIDAY_SHIFT" | "MASTER_UPDATE" | "MANUAL_ENTRY";

export type HolidayCalendar = { dates: Set<string>; workingSaturdays: boolean };
