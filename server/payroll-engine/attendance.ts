/**
 * Attendance derivation (spec 11.2, P3-17): no punch-in. A working day with work entries is present;
 * approved leave, office holidays, Sundays and non-working Saturdays come from their own records;
 * stored overrides (regularised days, client-site check-ins, leave beyond balance) win. Pure function.
 */
export type AttendanceStatus = "PRESENT" | "HALF_DAY" | "ABSENT" | "LEAVE" | "HOLIDAY" | "WEEK_OFF";
export type DayKind = AttendanceStatus | "UPCOMING" | "NOT_EMPLOYED";

/** Loss-of-pay half-days a stored status carries: HALF_DAY means one half of the day is unpaid. */
export const LOP_HALF_DAYS: Record<string, number> = { ABSENT: 2, HALF_DAY: 1 };

export type StoredDay = { status: string; source: string; location: string | null; clientId: string | null; note: string | null };

export type DeriveInput = {
  dates: string[];
  today: string;
  /** 0 = Sunday … 6 = Saturday for each date (callers pass a function to stay clock-free). */
  dayOfWeek: (d: string) => number;
  workingSaturdays: boolean;
  holidays: Set<string>;
  /** Locations of the day's work entries (OFFICE / CLIENT_SITE / WFH) and the client-site client. */
  entries: Map<string, { locations: string[]; clientSiteClientId: string | null }>;
  /** Approved leave per day: 2 = full, 1 = half. */
  leave: Map<string, number>;
  stored: Map<string, StoredDay>;
  joiningDate: string | null;
  exitDate: string | null;
};

export type DerivedDay = {
  date: string;
  kind: DayKind;
  location: string | null;
  clientId: string | null;
  source: string;
  note: string | null;
  lopHalfDays: number;
  leaveHalfDays: number;
};

export const OVERRIDE_SOURCES = new Set(["REGULARISED", "LEAVE_EXCESS"]);

function locationOf(locations: string[]): string {
  if (locations.includes("CLIENT_SITE")) return "CLIENT_SITE";
  if (locations.length > 0 && locations.every((l) => l === "WFH")) return "WFH";
  return "OFFICE";
}

export function deriveAttendance(i: DeriveInput): DerivedDay[] {
  return i.dates.map((date): DerivedDay => {
    const base = { date, location: null, clientId: null, source: "DERIVED", note: null, lopHalfDays: 0, leaveHalfDays: 0 };
    if ((i.joiningDate && date < i.joiningDate) || (i.exitDate && date > i.exitDate)) return { ...base, kind: "NOT_EMPLOYED" };
    const stored = i.stored.get(date);
    const leave = i.leave.get(date) ?? 0;
    if (stored && OVERRIDE_SOURCES.has(stored.source)) {
      const kind = stored.status as AttendanceStatus;
      return { ...base, kind, location: stored.location, clientId: stored.clientId, source: stored.source, note: stored.note, lopHalfDays: LOP_HALF_DAYS[kind] ?? 0, leaveHalfDays: stored.source === "LEAVE_EXCESS" ? 0 : leave };
    }
    const dow = i.dayOfWeek(date);
    const entry = i.entries.get(date);
    const checkIn = stored?.source === "CHECK_IN" ? stored : null;
    const worked = Boolean(entry && entry.locations.length) || Boolean(checkIn);
    const location = checkIn ? "CLIENT_SITE" : entry && entry.locations.length ? locationOf(entry.locations) : null;
    const clientId = checkIn?.clientId ?? entry?.clientSiteClientId ?? null;
    const extra = { location, clientId: location === "CLIENT_SITE" ? clientId : null, note: checkIn?.note ?? null, source: checkIn ? "CHECK_IN" : "DERIVED" };
    if (dow === 0 || (dow === 6 && !i.workingSaturdays)) return { ...base, ...extra, kind: "WEEK_OFF" };
    if (i.holidays.has(date)) return { ...base, ...extra, kind: "HOLIDAY" };
    if (leave >= 2) return { ...base, ...extra, kind: "LEAVE", leaveHalfDays: 2 };
    if (leave === 1) {
      // Half-day leave: the other half is present if work was logged, otherwise unpaid once the day is over.
      if (worked || date >= i.today) return { ...base, ...extra, kind: "LEAVE", leaveHalfDays: 1 };
      return { ...base, kind: "HALF_DAY", leaveHalfDays: 1, lopHalfDays: 1 };
    }
    if (worked) return { ...base, ...extra, kind: "PRESENT" };
    // Today and later are not absences yet.
    if (date >= i.today) return { ...base, kind: "UPCOMING" };
    return { ...base, kind: "ABSENT", lopHalfDays: 2 };
  });
}

export type AttendanceSummary = {
  present: number;
  leave: number;
  holidays: number;
  weekOffs: number;
  absent: number;
  upcoming: number;
  notEmployed: number;
  lopHalfDays: number;
};

/** Monthly sheet totals (present/leave/absent in days, halves allowed). */
export function summarise(days: DerivedDay[]): AttendanceSummary {
  const s: AttendanceSummary = { present: 0, leave: 0, holidays: 0, weekOffs: 0, absent: 0, upcoming: 0, notEmployed: 0, lopHalfDays: 0 };
  for (const d of days) {
    s.lopHalfDays += d.lopHalfDays;
    s.leave += d.leaveHalfDays / 2;
    s.absent += d.lopHalfDays / 2;
    if (d.kind === "PRESENT") s.present += 1;
    else if (d.kind === "LEAVE" || d.kind === "HALF_DAY") s.present += Math.max(0, 2 - d.leaveHalfDays - d.lopHalfDays) / 2;
    else if (d.kind === "HOLIDAY") s.holidays += 1;
    else if (d.kind === "WEEK_OFF") s.weekOffs += 1;
    else if (d.kind === "UPCOMING") s.upcoming += 1;
    else if (d.kind === "NOT_EMPLOYED") s.notEmployed += 1;
  }
  return s;
}
