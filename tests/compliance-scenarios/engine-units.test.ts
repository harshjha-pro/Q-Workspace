import { describe, expect, it } from "vitest";
import {
  periodContaining, periodsOverlapping, periodFromKey, nextPeriod, fyStart,
  computeDueDate, pickRule, applyHolidayPolicy, isNonWorkingDay, agmCeiling, endOfMonthAfter,
  valueAt, windowsWhere, obligationsFor, planGeneration, horizonEnd,
  evaluateStatus, checkFiling, checkNotApplicable, displayState,
  lateFeeExposure, remindersDue, DEFAULT_REMINDERS,
  matchExtension, planExtension, planObligationEnds, planEventRecompute,
  type DueContext, type ReminderTask, type TaskForExtension, type ExistingTask,
} from "@/server/compliance-engine";
import { client, flag, generate, only, TYPES, RULES, GROUPS, NO_HOLIDAYS } from "./helpers";

const ctx = (over: Partial<DueContext> = {}): DueContext => ({ flagsOn: new Set(), events: {}, agmCeilingMonths: 6, firstAgmCeilingMonths: 9, ...over });

describe("periods", () => {
  it("builds every basis", () => {
    expect(periodContaining("MONTH", "2026-02-10")).toMatchObject({ key: "2026-02", end: "2026-02-28", index: "M02" });
    expect(periodContaining("FY_QUARTER", "2027-02-01")).toMatchObject({ key: "FY2026-27-Q4", start: "2027-01-01", end: "2027-03-31" });
    expect(periodContaining("FY_QUARTER", "2026-12-31").key).toBe("FY2026-27-Q3");
    expect(periodContaining("FY_HALF", "2026-05-01")).toMatchObject({ key: "FY2026-27-H1", end: "2026-09-30" });
    expect(periodContaining("FY_HALF", "2027-01-01")).toMatchObject({ key: "FY2026-27-H2", end: "2027-03-31" });
    expect(periodContaining("FY", "2027-03-31").key).toBe("FY2026-27");
    expect(periodContaining("EVENT", "2026-04-01").key).toBe("FY2026-27");
    expect(periodContaining("AY", "2026-04-01")).toMatchObject({ key: "AY2027-28", label: "AY 2027-28", start: "2026-04-01" });
    expect(fyStart("2026-03-31")).toBe(2025);
  });
  it("round-trips keys", () => {
    for (const k of ["2026-08", "FY2026-27-Q2", "FY2026-27-H2", "FY2025-26", "AY2026-27"]) expect(periodFromKey(k).key).toBe(k);
    expect(() => periodFromKey("nonsense")).toThrow(/Unknown period key/);
    // Closure filings (GSTR-10, STK-2, Form 24) round-trip, so an event-date recompute on a discontinued client works.
    expect(periodFromKey("CLOSE-2026-10-01")).toMatchObject({ key: "CLOSE-2026-10-01", start: "2026-10-01", end: "2026-10-01", index: "EVT" });
  });
  it("lists overlapping periods and handles empty ranges", () => {
    expect(periodsOverlapping("FY_QUARTER", "2026-05-15", "2026-10-01").map((p) => p.index)).toEqual(["Q1", "Q2", "Q3"]);
    expect(periodsOverlapping("MONTH", "2026-05-01", "2026-04-01")).toEqual([]);
    expect(nextPeriod("MONTH", periodContaining("MONTH", "2026-12-05")).key).toBe("2027-01");
  });
});

describe("due-date rules", () => {
  const m = (key: string) => periodFromKey(key);
  it("DAY_AFTER_PERIOD incl. month override and short months", () => {
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 7, byEndMonth: { "03": 30 } }, m("2027-03"), ctx())).toMatchObject({ date: "2027-04-30", basis: expect.stringContaining("special") });
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 31 }, m("2027-01"), ctx()).date).toBe("2027-02-28");
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 15, monthsAfter: 2 }, m("2026-11"), ctx())).toMatchObject({ date: "2027-01-15", basis: expect.stringContaining("2th month") });
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 1 }, m("2026-11"), ctx()).basis).toContain("1st");
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 22 }, m("2026-11"), ctx()).basis).toContain("22nd");
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 23 }, m("2026-11"), ctx()).basis).toContain("23rd");
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 11 }, m("2026-11"), ctx()).basis).toContain("11th");
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 12 }, m("2026-11"), ctx()).basis).toContain("12th");
    expect(computeDueDate({ kind: "DAY_AFTER_PERIOD", day: 13 }, m("2026-11"), ctx()).basis).toContain("13th");
  });
  it("STATE_GROUP picks 22nd / 24th, and asks for a manual date without a group", () => {
    const p = { kind: "STATE_GROUP_DAY_AFTER_PERIOD" as const, days: { A: 22, B: 24 } };
    expect(computeDueDate(p, m("FY2026-27-Q2"), ctx({ stateGroup: "A" })).date).toBe("2026-10-22");
    expect(computeDueDate({ ...p, monthsAfter: 1 }, m("FY2026-27-Q2"), ctx({ stateGroup: "B" })).date).toBe("2026-10-24");
    expect(computeDueDate(p, m("FY2026-27-Q2"), ctx({ stateGroup: null })).date).toBeNull();
  });
  it("MMDD rules with index tables, flags and missing config", () => {
    expect(computeDueDate({ kind: "MMDD_ON_OR_AFTER_START", byIndex: { Q3: "01-31" } }, m("FY2026-27-Q3"), ctx()).date).toBe("2027-01-31");
    expect(computeDueDate({ kind: "MMDD_ON_OR_AFTER_START", mmdd: "04-10" }, m("FY2026-27-Q1"), ctx()).date).toBe("2026-04-10");
    expect(computeDueDate({ kind: "MMDD_ON_OR_AFTER_START", byIndex: {} }, m("FY2026-27-Q1"), ctx()).date).toBeNull();
    expect(computeDueDate({ kind: "MMDD_AFTER_END", mmdd: "10-31", ifFlag: { transferPricingApplicable: "11-30" } }, m("AY2026-27"), ctx({ flagsOn: new Set(["transferPricingApplicable"]) })).date).toBe("2026-11-30");
    expect(computeDueDate({ kind: "MMDD_AFTER_END", mmdd: "10-31", ifFlag: { transferPricingApplicable: "11-30" } }, m("AY2026-27"), ctx()).date).toBe("2026-10-31");
    expect(computeDueDate({ kind: "MMDD_AFTER_END", byIndex: { H2: "04-30" } }, m("FY2026-27-H2"), ctx()).date).toBe("2027-04-30");
    expect(computeDueDate({ kind: "MMDD_AFTER_END" }, m("FY2026-27"), ctx()).date).toBeNull();
  });
  it("EVENT_OFFSET: actual, fallback, provisional (incl. first AGM) and skip", () => {
    const p = { kind: "EVENT_OFFSET" as const, eventType: "AUDITOR_APPOINTMENT", days: 15, provisional: false, fallbackEventType: "AGM" };
    expect(computeDueDate(p, m("FY2025-26"), ctx({ events: { "AUDITOR_APPOINTMENT|FY2025-26": "2026-09-01" } })).date).toBe("2026-09-16");
    expect(computeDueDate(p, m("FY2025-26"), ctx({ events: { "AGM|FY2025-26": "2026-09-10" } })).date).toBe("2026-09-25");
    expect(computeDueDate({ ...p, fallbackEventType: undefined }, m("FY2025-26"), ctx()).skip).toBe(true);
    expect(computeDueDate({ kind: "EVENT_OFFSET", eventType: "AGM", days: 30, provisional: true }, m("FY2025-26"), ctx({ incorporationDate: "2025-06-01" }))).toMatchObject({ date: "2027-01-30", isProvisional: true });
    expect(agmCeiling(m("FY2025-26"), ctx({ incorporationDate: null }))).toBe("2026-09-30");
    expect(endOfMonthAfter("2026-03-31", 9)).toBe("2026-12-31");
  });
  it("MANUAL and rule versions", () => {
    expect(computeDueDate({ kind: "MANUAL" }, m("2026-08"), ctx()).date).toBeNull();
    const r = (v: number, from: string) => ({ complianceTypeCode: "X", version: v, effectiveFrom: from, params: { kind: "MANUAL" as const } });
    expect(pickRule([], m("2026-08"))).toBeNull();
    expect(pickRule([r(1, "2017-04-01"), r(2, "2026-07-01")], m("2026-08"))!.version).toBe(2);
    expect(pickRule([r(1, "2017-04-01"), r(2, "2026-09-01")], m("2026-08"))!.version).toBe(1);
    expect(pickRule([r(2, "2027-01-01"), r(1, "2027-04-01")], m("2026-08"))!.version).toBe(2); // none in force → oldest
    expect(pickRule([r(1, "2026-01-01"), r(2, "2026-01-01")], m("2026-08"))!.version).toBe(2); // same date → higher version
    expect(pickRule([r(2, "2026-01-01"), r(1, "2026-01-01")], m("2026-08"))!.version).toBe(2);
    expect(pickRule([r(3, "2026-05-01"), r(1, "2017-04-01"), r(2, "2020-01-01")], m("2026-08"))!.version).toBe(3);
    expect(pickRule([r(1, "2017-04-01"), r(3, "2026-05-01"), r(2, "2020-01-01")], m("2026-08"))!.version).toBe(3);
  });
  it("holiday policies (Rules Spec 6)", () => {
    const cal = { dates: new Set(["2026-10-02"]), workingSaturdays: false };
    expect(isNonWorkingDay("2026-10-03", cal)).toBe(true); // Saturday off
    expect(isNonWorkingDay("2026-10-03", { ...cal, workingSaturdays: true })).toBe(false);
    expect(applyHolidayPolicy("NONE", "2026-10-04", cal)).toEqual({ date: "2026-10-04", shifted: false });
    expect(applyHolidayPolicy("NEXT_WORKING_DAY", "2026-10-02", cal)).toEqual({ date: "2026-10-05", shifted: true });
    expect(applyHolidayPolicy("PREV_WORKING_DAY", "2026-10-04", cal)).toEqual({ date: "2026-10-01", shifted: true });
    expect(applyHolidayPolicy("NEXT_WORKING_DAY", "2026-10-06", cal)).toEqual({ date: "2026-10-06", shifted: false });
  });
});

describe("applicability", () => {
  it("timelines and windows", () => {
    expect(valueAt(undefined, "2026-01-01")).toBe(false);
    const tl = [{ from: "2026-04-01", value: true }, { from: "2026-07-01", value: false }, { from: "2026-09-01", value: true }];
    expect(valueAt(tl, "2026-08-01")).toBe(false);
    expect(windowsWhere([tl], "2026-01-01", (d) => valueAt(tl, d))).toEqual([{ start: "2026-04-01", end: "2026-07-01" }, { start: "2026-09-01", end: null }]);
  });
  it("constitution tracks: individual, LLP, trust", () => {
    const ind = obligationsFor(client({ constitution: "INDIVIDUAL" })).map((o) => o.typeCode);
    expect(ind).toEqual(["ITR-NA"]);
    const llp = obligationsFor(client({ constitution: "LLP", directors: [{ directorId: "d", isPrimaryHere: true, appointedOn: "2026-06-01", ceasedOn: "2027-01-01" }] }));
    expect(llp.map((o) => o.typeCode)).toEqual(expect.arrayContaining(["LLP-F11", "LLP-F8", "DIR3-KYC"]));
    expect(llp.find((o) => o.typeCode === "DIR3-KYC")).toMatchObject({ start: "2026-06-01", end: "2027-01-01", endReason: "Director ceased" });
    const trust = obligationsFor(client({ constitution: "TRUST", flags: { statutoryAuditApplicable: flag("2026-04-01") } })).map((o) => o.typeCode);
    expect(trust).toContain("STAT-AUDIT");
    const dirNotPrimary = obligationsFor(client({ directors: [{ directorId: "x", isPrimaryHere: false }] }));
    expect(dirNotPrimary.some((o) => o.typeCode === "DIR3-KYC")).toBe(false);
  });
  it("GST composition, QRMP with IFF, annual returns, registration window and cancellation", () => {
    const g = { id: "g", stateCode: "MH", status: "CANCELLED", registrationDate: "2026-06-01", cancellationDate: "2027-01-15", annualReturnApplicable: true, gstr9cApplicable: true,
      frequencies: [{ from: "2017-07-01", frequency: "COMPOSITION" as const, iffOpted: false }, { from: "2026-10-01", frequency: "QRMP" as const, iffOpted: true }] };
    const ob = obligationsFor(client({ gstins: [g] }));
    const codes = ob.map((o) => o.typeCode);
    expect(codes).toEqual(expect.arrayContaining(["GST-CMP08", "GST-R4", "GST-R1-Q", "GST-3B-Q", "GST-IFF", "GST-R9", "GST-R9C", "GST-R10"]));
    expect(ob.find((o) => o.typeCode === "GST-CMP08")).toMatchObject({ start: "2026-06-01", end: "2026-10-01", endReason: "GST frequency changed" });
    expect(ob.find((o) => o.typeCode === "GST-R1-Q")).toMatchObject({ end: "2027-01-15", endReason: "GST registration cancelled" });
    const later = obligationsFor(client({ gstins: [{ ...g, status: "ACTIVE", cancellationDate: null, registrationDate: null, frequencies: [{ from: "2020-01-01", frequency: "MONTHLY", iffOpted: false }, { from: "2020-02-01", frequency: "QRMP", iffOpted: false }] }] }));
    expect(later.some((o) => o.typeCode === "GST-R1-M")).toBe(false); // ended before tracking began
  });
  it("PT frequencies and end, payroll flags, LLP discontinued", () => {
    const pt = (frequency: string) => ({ stateCode: "MH", kind: "EMPLOYER", frequency, effectiveFrom: "2025-01-01", effectiveTo: frequency === "ANNUAL" ? "2027-01-01" : null });
    const ob = obligationsFor(client({ ptRegistrations: ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"].map(pt).concat([{ stateCode: "KA", kind: "ENROLMENT", frequency: "ANNUAL", effectiveFrom: "2027-01-01", effectiveTo: null }]) }));
    expect(ob.filter((o) => o.typeCode === "PT-RET").map((o) => o.basisOverride)).toEqual(["MONTH", "FY_QUARTER", "FY_HALF", "FY"]);
    expect(ob.filter((o) => o.typeCode === "PT-RET").at(-1)).toMatchObject({ end: "2027-01-01", endReason: "PT registration ended" });
    const ptLate = obligationsFor(client({ ptRegistrations: [{ stateCode: "MH", kind: "EMPLOYER", frequency: "MONTHLY", effectiveFrom: "2026-09-01" }] }));
    expect(ptLate.find((o) => o.typeCode === "PT-RET")!.start).toBe("2026-09-01");
    const llp = obligationsFor(client({ constitution: "LLP", status: "DISCONTINUED", statusEffectiveFrom: "2026-11-01", flags: { pfApplicable: [{ from: "2026-04-01", value: true }, { from: "2026-10-01", value: false }], esiApplicable: flag("2026-04-01") } }));
    expect(llp.map((o) => o.typeCode)).toContain("LLP-F24");
    expect(llp.find((o) => o.typeCode === "PF-ECR")!.end).toBe("2026-10-01"); // already ended before discontinuation
    expect(llp.find((o) => o.typeCode === "ESI-RET")).toMatchObject({ end: "2026-11-01", endReason: "Client discontinued" });
    const noDate = obligationsFor(client({ status: "DISCONTINUED", statusEffectiveFrom: null }));
    expect(noDate.some((o) => o.typeCode === "ROC-STK2")).toBe(false);
    const sameDay = obligationsFor(client({ status: "DISCONTINUED", statusEffectiveFrom: "2026-04-01" }));
    expect(sameDay.some((o) => o.typeCode === "AOC-4")).toBe(false); // window collapsed
  });
});

describe("generation details", () => {
  it("horizon, unknown types, missing rules, holiday shift, party labels, IFF months", () => {
    expect(horizonEnd("MONTH", "2026-10-06").key).toBe("2026-12");
    const c = client({ constitution: "INDIVIDUAL", gstins: [{ id: "g", stateCode: "ZZ", status: "ACTIVE", frequencies: [{ from: "2026-04-01", frequency: "QRMP", iffOpted: true }], annualReturnApplicable: false, gstr9cApplicable: false }] });
    const t = generate(c, "2026-10-06", [], {
      partyLabels: new Map([["g", "27AAA"]]),
      types: new Map([...TYPES].filter(([k]) => k !== "ITR-NA").map(([k, v]) => [k, k === "GST-R1-Q" ? { ...v, weekendHolidayPolicy: "NEXT_WORKING_DAY" as const } : v])),
      rules: new Map([...RULES].filter(([k]) => k !== "GST-IFF")),
      holidays: { dates: new Set(["2026-10-13"]), workingSaturdays: true },
    });
    expect(t.some((x) => x.typeCode === "ITR-NA")).toBe(false); // type not in master
    expect(only(t, "GST-IFF").map((x) => x.periodKey)).toEqual(["2026-04", "2026-05", "2026-07", "2026-08", "2026-10", "2026-11"]);
    expect(only(t, "GST-IFF")[0]).toMatchObject({ dueDate: null, dueBasis: "No due-date rule in the master" });
    const q2 = only(t, "GST-R1-Q").find((x) => x.periodKey === "FY2026-27-Q2")!;
    expect([q2.dueDate, q2.holidayShifted, q2.title]).toEqual(["2026-10-14", true, "GSTR-1 Q2 FY 2026-27 — 27AAA"]);
    expect(only(t, "GST-3B-Q")[0]!.dueDate).toBeNull(); // state not in any group
    expect(only(t, "GST-R10")).toEqual([]);
    const noState = generate(c, "2026-10-06", [], { gstinStates: new Map() });
    expect(only(noState, "GST-3B-Q")[0]!.dueDate).toBeNull();
  });
  it("PT tasks follow the registration frequency and have no due date", () => {
    const c = client({ constitution: "INDIVIDUAL", ptRegistrations: [{ stateCode: "MH", kind: "EMPLOYER", frequency: "QUARTERLY", effectiveFrom: "2026-04-01" }] });
    const pt = only(generate(c, "2026-10-06", [], { partyLabels: new Map() }), "PT-RET");
    expect(pt.map((x) => x.periodKey)).toEqual(["FY2026-27-Q1", "FY2026-27-Q2", "FY2026-27-Q3", "FY2026-27-Q4"]);
    expect(pt[0]!.dueDate).toBeNull();
    expect(pt[0]!.title).toBe("PT Q1 FY 2026-27");
  });
  it("events: ADT-1 only with an appointment date; AGM-linked only after FY close", () => {
    const c = client({ events: { "AUDITOR_APPOINTMENT|FY2025-26": "2026-09-20" }, trackingFrom: "2025-04-01" });
    const t = generate(c, "2026-10-06");
    expect(only(t, "ADT-1").map((x) => [x.periodKey, x.dueDate])).toEqual([["FY2025-26", "2026-10-05"]]);
    expect(only(t, "AOC-4").map((x) => x.periodKey)).toEqual(["FY2025-26"]);
    expect(planGeneration({ client: c, obligations: [], types: TYPES, rules: RULES, existingKeys: new Set(), today: "2026-10-06", holidays: NO_HOLIDAYS, stateGroups: GROUPS, gstinStates: new Map(), partyLabels: new Map(), agmCeilingMonths: 6, firstAgmCeilingMonths: 9, horizon: { MONTH: 0 } })).toEqual([]);
  });
});

describe("status rules", () => {
  it("evaluateStatus follows Rules Spec 11.3", () => {
    const f = { status: "UPCOMING" as const, stageIndex: 0, workEntryCount: 0, pendingFromClient: false, underReview: false };
    expect(evaluateStatus({ ...f, status: "FILED" })).toBe("FILED");
    expect(evaluateStatus({ ...f, pendingFromClient: true })).toBe("PENDING_FROM_CLIENT");
    expect(evaluateStatus({ ...f, underReview: true })).toBe("UNDER_REVIEW");
    expect(evaluateStatus({ ...f, workEntryCount: 1 })).toBe("IN_PROGRESS");
    expect(evaluateStatus({ ...f, stageIndex: 2 })).toBe("IN_PROGRESS");
    expect(evaluateStatus(f)).toBe("UPCOMING");
    expect(evaluateStatus({ ...f, status: "IN_PROGRESS" })).toBe("UPCOMING");
  });
  it("checkFiling blocks every missing requirement and classifies Filed / Filed Late", () => {
    const f = { status: "IN_PROGRESS" as const, ackNumber: "ACK1", filedDate: "2026-10-18", effectiveDueDate: "2026-10-20", requiresSignoff: true, signoffRecorded: true, requiresUdin: true, udin: "U", openReviewPoints: 0, reviewOutstanding: false };
    expect(checkFiling(f)).toEqual({ ok: true, status: "FILED" });
    expect(checkFiling({ ...f, filedDate: "2026-10-21" })).toEqual({ ok: true, status: "FILED_LATE" });
    expect(checkFiling({ ...f, effectiveDueDate: null })).toEqual({ ok: true, status: "FILED" });
    for (const [over, re] of [
      [{ status: "FILED" }, /Already filed/], [{ status: "FILED_LATE" }, /Already filed/], [{ status: "NOT_APPLICABLE" }, /Not Applicable/],
      [{ ackNumber: null }, /acknowledgment/], [{ filedDate: null }, /filing date/], [{ openReviewPoints: 2 }, /2 review point/],
      [{ reviewOutstanding: true }, /checker/], [{ signoffRecorded: false }, /sign-off/], [{ udin: null }, /UDIN/],
    ] as const) {
      const r = checkFiling({ ...f, ...(over as object) } as typeof f);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(re);
    }
  });
  it("Not Applicable and display states", () => {
    expect(checkNotApplicable("NOT_APPLICABLE", "x").ok).toBe(false);
    expect(checkNotApplicable("UPCOMING", " ").ok).toBe(false);
    expect(checkNotApplicable("UPCOMING", "Turnover below threshold")).toEqual({ ok: true, status: "NOT_APPLICABLE" });
    expect(displayState("FILED", null, "2026-10-06")).toBe("FILED");
    expect(displayState("UPCOMING", null, "2026-10-06")).toBe("NO_DATE");
    expect(displayState("UPCOMING", "2026-10-05", "2026-10-06")).toBe("OVERDUE");
    expect(displayState("UPCOMING", "2026-10-06", "2026-10-06")).toBe("DUE_TODAY");
    expect(displayState("PENDING_FROM_CLIENT", "2026-10-08", "2026-10-06")).toBe("PENDING_FROM_CLIENT");
    expect(displayState("IN_PROGRESS", "2026-10-08", "2026-10-06")).toBe("AT_RISK");
    expect(displayState("UNDER_REVIEW", "2026-10-08", "2026-10-06")).toBe("ON_TRACK");
    expect(displayState("UPCOMING", "2026-11-08", "2026-10-06")).toBe("ON_TRACK");
  });
});

describe("late fees and reminders", () => {
  const rate = { perDayPaise: 5000, maxPaise: 1_000_000, interestBpPerMonth: 150, effectiveFrom: "2017-07-01" };
  it("late fee exposure", () => {
    expect(lateFeeExposure({ effectiveDueDate: null, filedDate: null }, [rate], "2026-10-06").daysLate).toBe(0);
    expect(lateFeeExposure({ effectiveDueDate: "2026-10-10", filedDate: null }, [rate], "2026-10-06")).toMatchObject({ daysLate: 0, feePaise: 0 });
    expect(lateFeeExposure({ effectiveDueDate: "2026-09-20", filedDate: null, taxDuePaise: 1_000_000 }, [rate], "2026-10-06")).toMatchObject({ daysLate: 16, feePaise: 80_000, interestPaise: 15_000 });
    expect(lateFeeExposure({ effectiveDueDate: "2025-01-20", filedDate: "2026-01-20" }, [rate], "2026-10-06").feePaise).toBe(1_000_000);
    expect(lateFeeExposure({ effectiveDueDate: "2026-09-20", filedDate: "2026-09-25" }, [{ ...rate, maxPaise: null }], "x").feePaise).toBe(25_000);
    expect(lateFeeExposure({ effectiveDueDate: "2010-01-01", filedDate: "2010-02-01" }, [rate], "x").rate).toBeNull();
    expect(lateFeeExposure({ effectiveDueDate: "2026-09-20", filedDate: "2026-09-25" }, [rate, { ...rate, effectiveFrom: "2020-01-01", perDayPaise: 1 }], "x").feePaise).toBe(5);
    expect(lateFeeExposure({ effectiveDueDate: "2026-09-20", filedDate: "2026-09-25" }, [{ ...rate, effectiveFrom: "2020-01-01", perDayPaise: 1 }, rate, { ...rate, effectiveFrom: "2018-01-01", perDayPaise: 2 }], "x").feePaise).toBe(5);
  });
  it("reminders and escalations with dedupe keys", () => {
    const t = (over: Partial<ReminderTask>): ReminderTask => ({ id: "t", title: "GSTR-3B Sep 2026", status: "UPCOMING", effectiveDueDate: "2026-10-20", pendingSince: null, underReviewSince: null, assigneeIds: ["s"], checkerId: "c", managerId: "m", partnerId: "p", ...over });
    expect(remindersDue([t({})], "2026-10-13").map((e) => e.kind)).toEqual(["DUE_SOON"]);
    expect(remindersDue([t({})], "2026-10-19")[0]!.title).toContain("1 day");
    expect(remindersDue([t({})], "2026-10-20").map((e) => e.kind)).toEqual(["DUE_TODAY"]);
    expect(remindersDue([t({})], "2026-10-21").map((e) => e.kind)).toEqual(["OVERDUE", "ESCALATE_MANAGER"]);
    expect(remindersDue([t({})], "2026-10-25").map((e) => e.kind)).toEqual(["OVERDUE", "ESCALATE_MANAGER", "ESCALATE_PARTNER"]);
    expect(remindersDue([t({ status: "FILED" })], "2026-10-25")).toEqual([]);
    expect(remindersDue([t({ effectiveDueDate: null })], "2026-10-25")).toEqual([]);
    expect(remindersDue([t({ assigneeIds: [], managerId: null })], "2026-10-21")).toEqual([]);
    const p = remindersDue([t({ status: "PENDING_FROM_CLIENT", pendingSince: "2026-10-05", effectiveDueDate: "2026-10-18" })], "2026-10-17");
    expect(p.map((e) => e.kind)).toEqual(["DUE_SOON", "PENDING_FOLLOW_UP", "PENDING_ESCALATION"]);
    expect(remindersDue([t({ status: "PENDING_FROM_CLIENT", pendingSince: "2026-10-05", effectiveDueDate: null })], "2026-10-16")).toEqual([]);
    const r = remindersDue([t({ status: "UNDER_REVIEW", underReviewSince: "2026-10-01", effectiveDueDate: "2026-12-31" })], "2026-10-05");
    expect(r.map((e) => e.kind)).toEqual(["REVIEW_SLA", "REVIEW_SLA_ESCALATION"]);
    expect(remindersDue([t({ status: "UNDER_REVIEW", underReviewSince: "2026-10-04", effectiveDueDate: "2026-12-31" })], "2026-10-05")).toEqual([]);
    expect(remindersDue([t({ status: "UNDER_REVIEW", underReviewSince: null, effectiveDueDate: "2026-12-31" })], "2026-10-05")).toEqual([]);
    expect(DEFAULT_REMINDERS.upcomingDays).toEqual([7, 3, 1]);
    expect(remindersDue([t({})], "2026-10-21", { ...DEFAULT_REMINDERS, managerEscalationDays: 2 }).map((e) => e.kind)).toEqual(["OVERDUE"]);
  });
});

describe("extensions and changes — remaining branches", () => {
  const base: TaskForExtension = { id: "1", clientId: "c", typeCode: "GST-3B-M", partyKey: "g", periodKey: "2026-08", periodStart: "2026-08-01", status: "UPCOMING", originalDueDate: "2026-09-20", effectiveDueDate: "2026-09-20", isProvisional: false, filedDate: null, constitution: "LLP", state: null, gstFrequency: null };
  const e = { reference: "R", typeCodes: ["GST-3B-M"], periodsMode: "ALL_OPEN" as const, periodKeys: [], scope: [], newDate: "2026-09-30" };
  it("matching rules", async () => {
    expect(matchExtension(e, [{ ...base, typeCode: "X" }, { ...base, status: "NOT_APPLICABLE" }, { ...base, status: "FILED" }, { ...base, status: "FILED_LATE", filedDate: "2026-10-05" }, { ...base, status: "FILED_LATE", filedDate: null }])).toEqual([]);
    expect(matchExtension({ ...e, periodsMode: "SPECIFIC", periodKeys: ["2026-07"] }, [base])).toEqual([]);
    expect(matchExtension({ ...e, scope: [{ field: "constitution", values: ["LLP"] }, { field: "clientId", values: ["c"] }] }, [base])).toHaveLength(1);
    expect(matchExtension({ ...e, scope: [{ field: "state", values: ["MH"] }] }, [base])).toEqual([]); // null state never matches
    const [u] = planExtension({ ...e, periodsMode: "SPECIFIC", periodKeys: ["2026-08"] }, [{ ...base, status: "FILED", filedDate: "2026-09-15" }]);
    expect(u!.status).toBeUndefined(); // Filed stays Filed
    const [late] = planExtension({ ...e, periodsMode: "SPECIFIC", periodKeys: ["2026-08"] }, [{ ...base, status: "FILED_LATE", filedDate: "2026-10-03" }]);
    expect(late!.status).toBeUndefined(); // still late after the extension
    const { previewExtension } = await import("@/server/compliance-engine");
    expect(previewExtension({ ...e, periodsMode: "SPECIFIC", periodKeys: ["2026-08"] }, [{ ...base, status: "FILED_LATE", filedDate: "2026-09-25" }, { ...base, id: "2", clientId: "d" }])).toEqual({ tasks: 2, clients: 2, reclassify: 1 });
  });
  it("obligation ends: ignores closures and covered tasks; suppressed for discontinued", () => {
    const ex = (over: Partial<ExistingTask>): ExistingTask => ({ id: "t", clientId: "c", typeCode: "TDS-26Q", partyKey: "-", periodKey: "FY2026-27-Q3", periodStart: "2026-10-01", status: "UPCOMING", originalDueDate: null, effectiveDueDate: null, isProvisional: false, filedDate: null, ...over });
    expect(planObligationEnds([ex({})], [], { suppressAutoNa: true })).toEqual([]);
    expect(planObligationEnds([ex({ status: "UNDER_REVIEW" }), ex({ periodKey: "CLOSE-2026-10-01" })], [], { suppressAutoNa: false })).toEqual([]);
    expect(planObligationEnds([ex({})], [{ typeCode: "TDS-26Q", partyKey: "-", start: "2026-04-01" }], { suppressAutoNa: false })).toEqual([]);
    const [na] = planObligationEnds([ex({})], [], { suppressAutoNa: false });
    expect(na!.notApplicableReason).toBe("No longer applicable");
    const [gst] = planObligationEnds([ex({ typeCode: "GST-3B-M", partyKey: "g", periodKey: "2026-10" })], [{ typeCode: "GST-IFF", partyKey: "g", start: "2026-10-01" }], { suppressAutoNa: false });
    expect(gst!.notApplicableReason).toBe("No longer applicable"); // IFF alone is not a replacement
    const two = planObligationEnds([ex({})], [
      { typeCode: "TDS-26Q", partyKey: "-", start: "2025-04-01", end: "2025-10-01", endReason: "older" },
      { typeCode: "TDS-26Q", partyKey: "-", start: "2026-04-01", end: "2026-07-01", endReason: "newer" },
      { typeCode: "TDS-26Q", partyKey: "-", start: "2024-04-01", end: "2024-10-01", endReason: "oldest" },
    ], { suppressAutoNa: false });
    expect(two[0]!.notApplicableReason).toBe("newer");
  });
  it("event recompute skips NA, non-event types, unchanged and dateless results", () => {
    const c = client({ events: { "AGM|FY2025-26": "2026-09-15" }, flags: { pfApplicable: flag("2025-04-01") } });
    const tk = (over: Partial<ExistingTask>): ExistingTask => ({ id: "a", clientId: "c1", typeCode: "AOC-4", partyKey: "-", periodKey: "FY2025-26", periodStart: "2025-04-01", status: "UPCOMING", originalDueDate: "2026-10-15", effectiveDueDate: "2026-10-15", isProvisional: false, filedDate: null, ...over });
    const cfg = { agmCeilingMonths: 6, firstAgmCeilingMonths: 9 };
    expect(planEventRecompute(c, [tk({ status: "NOT_APPLICABLE" }), tk({ typeCode: "UNKNOWN" }), tk({ typeCode: "DPT-3" }), tk({ typeCode: "DPT-3", periodKey: "CLOSE-2026-10-01" }), tk({})], TYPES, RULES, cfg)).toEqual([]);
    expect(planEventRecompute(client(), [tk({ typeCode: "ADT-1" })], TYPES, RULES, cfg)).toEqual([]);
    const [still] = planEventRecompute(c, [tk({ status: "FILED_LATE", filedDate: "2026-10-20", effectiveDueDate: "2026-10-01" })], TYPES, RULES, cfg);
    expect(still!.status).toBeUndefined();
    const [p] = planEventRecompute(c, [tk({ isProvisional: true })], TYPES, RULES, cfg);
    expect(p!.isProvisional).toBe(false);
    expect(planEventRecompute(c, [tk({ typeCode: "AOC-4", periodKey: "2026-08" })], TYPES, new Map(), cfg)).toEqual([]);
  });
});
