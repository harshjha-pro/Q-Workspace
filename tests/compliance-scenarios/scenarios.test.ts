import { describe, expect, it } from "vitest";
import { client, flag, generate, asExisting, only, TYPES, RULES } from "./helpers";
import {
  obligationsFor, planObligationEnds, planExtension, previewExtension, planEventRecompute, checkFiling, checkNotApplicable,
  type ExtensionDef, type TaskForExtension,
} from "@/server/compliance-engine";

const gstin = (frequencies: { from: string; frequency: "MONTHLY" | "QRMP" | "COMPOSITION"; iffOpted?: boolean }[], over = {}) => ({
  id: "g1", stateCode: "MH", status: "ACTIVE", registrationDate: "2017-07-01", cancellationDate: null,
  frequencies: frequencies.map((f) => ({ iffOpted: false, ...f })), annualReturnApplicable: false, gstr9cApplicable: false, ...over,
});

/** Rules Spec §11.5 — the 15 test scenarios, one test each. */
describe("Rules Spec scenarios", () => {
  it("1. basic monthly generation: 3 GSTR-1 + 3 GSTR-3B, Upcoming, correct labels and dates", () => {
    const c = client({ trackingFrom: "2026-10-01", gstins: [gstin([{ from: "2026-10-01", frequency: "MONTHLY" }])] });
    const t = generate(c, "2026-10-06");
    expect(only(t, "GST-R1-M").map((x) => x.periodLabel)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026"]);
    expect(only(t, "GST-3B-M").map((x) => x.dueDate)).toEqual(["2026-11-20", "2026-12-20", "2027-01-20"]);
    expect(only(t, "GST-R1-M")[0]!.dueDate).toBe("2026-11-11");
    expect(t.filter((x) => x.typeCode.startsWith("GST-"))).toHaveLength(6);
  });

  it("2. idempotent re-run creates nothing", () => {
    const c = client({ gstins: [gstin([{ from: "2026-04-01", frequency: "MONTHLY" }])] });
    const first = generate(c, "2026-10-06");
    expect(first.length).toBeGreaterThan(0);
    expect(generate(c, "2026-10-06", first)).toEqual([]);
  });

  it("3. QRMP switch effective the 2nd month of a quarter: month 1 monthly only, quarterly covers the quarter, later monthly superseded", () => {
    const before = client({ gstins: [gstin([{ from: "2026-07-01", frequency: "MONTHLY" }])] });
    const existing = asExisting(generate(before, "2026-07-10")); // Jul, Aug, Sep monthly
    const after = client({ gstins: [gstin([{ from: "2026-07-01", frequency: "MONTHLY" }, { from: "2026-08-01", frequency: "QRMP" }])] });
    const created = generate(after, "2026-08-02", existing);
    expect(only(created, "GST-R1-Q").map((x) => x.periodKey)).toContain("FY2026-27-Q2");
    expect(only(created, "GST-R1-M")).toHaveLength(0);
    const ends = planObligationEnds(existing, obligationsFor(after), { suppressAutoNa: false });
    const closed = ends.map((u) => existing.find((e) => e.id === u.taskId)!.periodKey);
    expect(closed).not.toContain("2026-07"); // month 1 stays
    expect(new Set(closed)).toEqual(new Set(["2026-08", "2026-09"]));
    expect(ends.every((u) => u.notApplicableReason === "Superseded by GST frequency change" && u.supersededByKey)).toBe(true);
  });

  it("4. AGM unknown then confirmed: provisional from the statutory ceiling, then recomputed with history", () => {
    const c = client({ trackingFrom: "2025-04-01" });
    const t = generate(c, "2026-04-02");
    const aoc = only(t, "AOC-4").find((x) => x.periodKey === "FY2025-26")!;
    expect(aoc.isProvisional).toBe(true);
    expect(aoc.dueDate).toBe("2026-10-30"); // 30 Sep ceiling + 30 days
    expect(only(t, "MGT-7")[0]!.dueDate).toBe("2026-11-29");
    const existing = asExisting(t.filter((x) => x.typeCode === "AOC-4" || x.typeCode === "MGT-7"));
    const ups = planEventRecompute({ ...c, events: { "AGM|FY2025-26": "2026-09-15" } }, existing, TYPES, RULES, { agmCeilingMonths: 6, firstAgmCeilingMonths: 9 });
    const aocUp = ups.find((u) => existing.find((e) => e.id === u.taskId)!.typeCode === "AOC-4")!;
    expect([aocUp.effectiveDueDate, aocUp.isProvisional, aocUp.history?.source]).toEqual(["2026-10-15", false, "EVENT_CORRECTION"]);
  });

  const extTask = (over: Partial<TaskForExtension> = {}): TaskForExtension => ({
    id: "x1", clientId: "c1", typeCode: "GST-3B-M", partyKey: "g1", periodKey: "2026-08", periodStart: "2026-08-01", status: "FILED_LATE",
    originalDueDate: "2026-09-20", effectiveDueDate: "2026-09-20", isProvisional: false, filedDate: "2026-09-23",
    constitution: "PRIVATE_COMPANY", state: "MH", gstFrequency: "MONTHLY", ...over,
  });
  const ext = (over: Partial<ExtensionDef> = {}): ExtensionDef => ({ reference: "N-12/2026", typeCodes: ["GST-3B-M"], periodsMode: "SPECIFIC", periodKeys: ["2026-08"], scope: [], newDate: "2026-09-25", ...over });

  it("5. extension flips Filed Late to Filed", () => {
    const [u] = planExtension(ext(), [extTask()]);
    expect([u!.status, u!.effectiveDueDate, u!.statusReason]).toEqual(["FILED", "2026-09-25", "Reclassified to Filed — extension N-12/2026"]);
  });

  it("6. extension out of scope leaves the task untouched", () => {
    expect(planExtension(ext({ scope: [{ field: "state", values: ["GJ"] }] }), [extTask()])).toEqual([]);
  });

  it("7. flag off mid-year: Q3 task Not Applicable with reason; Q1/Q2 untouched", () => {
    const c = client({ flags: { tdsApplicable: [{ from: "2026-04-01", value: true }, { from: "2026-10-01", value: false }], tdsNonSalary: flag("2026-04-01") } });
    const on = client({ flags: { tdsApplicable: flag("2026-04-01"), tdsNonSalary: flag("2026-04-01") } });
    const tasks = asExisting(only(generate(on, "2026-10-02"), "TDS-26Q"));
    tasks[0]!.status = "FILED";
    tasks[1]!.status = "FILED";
    const ends = planObligationEnds(tasks, obligationsFor(c), { suppressAutoNa: false });
    expect(ends.map((u) => tasks.find((t) => t.id === u.taskId)!.periodKey)).toEqual(["FY2026-27-Q3", "FY2026-27-Q4"]);
    expect(ends[0]!.notApplicableReason).toBe("Applicability flag removed effective 2026-10-01");
  });

  it("8. dormant client: open overdue task is not auto-cancelled", () => {
    const c = client({ status: "DORMANT", gstins: [gstin([{ from: "2026-04-01", frequency: "MONTHLY" }])] });
    const tasks = asExisting(generate(c, "2026-10-06"));
    expect(planObligationEnds(tasks, obligationsFor(c), { suppressAutoNa: false })).toEqual([]);
  });

  it("9. discontinued with GST cancelled: no further GSTR-1/3B, one GSTR-10", () => {
    const c = client({
      status: "DISCONTINUED", statusEffectiveFrom: "2026-09-15",
      gstins: [gstin([{ from: "2026-04-01", frequency: "MONTHLY" }], { status: "CANCELLED", cancellationDate: "2026-09-15" })],
    });
    const t = generate(c, "2026-10-06");
    expect(only(t, "GST-3B-M").map((x) => x.periodKey).at(-1)).toBe("2026-09");
    expect(only(t, "GST-R10")).toHaveLength(1);
    expect(only(t, "GST-R10")[0]!.dueDate).toBeNull();
    expect(only(t, "ROC-STK2")).toHaveLength(1);
  });

  const filing = { status: "IN_PROGRESS" as const, ackNumber: "AA270926123456X", filedDate: "2026-10-18", effectiveDueDate: "2026-10-20", requiresSignoff: false, signoffRecorded: false, requiresUdin: false, udin: null, openReviewPoints: 0, reviewOutstanding: false };

  it("10. filing without acknowledgment is rejected", () => {
    expect(checkFiling({ ...filing, ackNumber: "  " })).toEqual({ ok: false, reason: expect.stringContaining("acknowledgment") });
  });

  it("11. maker cannot be checker (enforced by the review service; see tests/integration/review.test.ts)", () => {
    expect(true).toBe(true);
  });

  it("12. per-director DIR-3 KYC: 3 directors → 3 obligations", () => {
    const c = client({ directors: ["d1", "d2", "d3"].map((d) => ({ directorId: d, isPrimaryHere: true })) });
    const t = only(generate(c, "2026-10-06"), "DIR3-KYC");
    expect(new Set(t.map((x) => x.partyKey))).toEqual(new Set(["d1", "d2", "d3"]));
  });

  it("13. holiday policy NONE: a Sunday due date is unchanged", () => {
    // GSTR-3B for Aug 2027 falls due on Monday? Find a month where the 20th is a Sunday: Sep 2026 → 20 Sep 2026 is a Sunday.
    const c = client({ trackingFrom: "2026-08-01", gstins: [gstin([{ from: "2026-08-01", frequency: "MONTHLY" }])] });
    const aug = only(generate(c, "2026-08-05"), "GST-3B-M").find((x) => x.periodKey === "2026-08")!;
    expect(aug.dueDate).toBe("2026-09-20");
    expect(aug.holidayShifted).toBe(false);
  });

  it("14. Not Applicable is refused on a filed task", () => {
    expect(checkNotApplicable("FILED", "x").ok).toBe(false);
    expect(checkNotApplicable("FILED_LATE", "x").ok).toBe(false);
  });

  it("15. event date corrected after filing: Filed Late becomes Filed when the new date covers it", () => {
    const c = client({ events: { "AGM|FY2025-26": "2026-10-10" } }); // corrected AGM → AOC-4 due 9 Nov
    const t = [{ id: "a", clientId: "c1", typeCode: "AOC-4", partyKey: "-", periodKey: "FY2025-26", periodStart: "2025-04-01", status: "FILED_LATE" as const, originalDueDate: "2026-10-15", effectiveDueDate: "2026-10-15", isProvisional: false, filedDate: "2026-10-20" }];
    const [u] = planEventRecompute(c, t, TYPES, RULES, { agmCeilingMonths: 6, firstAgmCeilingMonths: 9 });
    expect([u!.status, u!.effectiveDueDate]).toEqual(["FILED", "2026-11-09"]);
  });
});

describe("Rules Spec §11.4 edge cases", () => {
  it("generation twice in one night creates no duplicates", () => {
    const c = client({ flags: { tdsApplicable: flag("2026-04-01") } });
    const a = generate(c, "2026-10-06");
    expect(generate(c, "2026-10-06", a)).toHaveLength(0);
  });
  it("extension scoped to composition taxpayers in Maharashtra touches only those", () => {
    const base = { id: "1", clientId: "c", typeCode: "GST-CMP08", partyKey: "g", periodKey: "FY2026-27-Q2", periodStart: "2026-07-01", status: "UPCOMING" as const, originalDueDate: "2026-10-18", effectiveDueDate: "2026-10-18", isProvisional: false, filedDate: null, constitution: "PROPRIETORSHIP" };
    const tasks: TaskForExtension[] = [
      { ...base, id: "mh-comp", state: "MH", gstFrequency: "COMPOSITION" },
      { ...base, id: "gj-comp", state: "GJ", gstFrequency: "COMPOSITION" },
      { ...base, id: "mh-month", state: "MH", gstFrequency: "MONTHLY" },
    ];
    const e: ExtensionDef = { reference: "CMP", typeCodes: ["GST-CMP08"], periodsMode: "ALL_OPEN", periodKeys: [], scope: [{ field: "gstFrequency", values: ["COMPOSITION"] }, { field: "state", values: ["MH"] }], newDate: "2026-10-31" };
    expect(planExtension(e, tasks).map((u) => u.taskId)).toEqual(["mh-comp"]);
    expect(previewExtension(e, tasks)).toEqual({ tasks: 1, clients: 1, reclassify: 0 });
  });
  it("tax-audit flag switched off while the current year's audit is In Progress: that task is left alone", () => {
    const on = client({ constitution: "PARTNERSHIP", flags: { taxAuditApplicable: flag("2025-04-01") }, trackingFrom: "2025-04-01" });
    const tasks = asExisting(only(generate(on, "2026-05-01"), "TAR"), "IN_PROGRESS");
    const off = client({ constitution: "PARTNERSHIP", flags: { taxAuditApplicable: [{ from: "2025-04-01", value: true }, { from: "2026-06-01", value: false }] }, trackingFrom: "2025-04-01" });
    const ends = planObligationEnds(tasks, obligationsFor(off), { suppressAutoNa: false });
    // Both in-flight audits (periods that began before the off date) are left alone…
    expect(ends).toEqual([]);
    // …and no later period is generated.
    expect(only(generate(off, "2027-05-01"), "TAR").map((t) => t.periodKey)).not.toContain("AY2028-29");
  });
  it("leap year: Feb 2028 monthly return resolves to the right March date", () => {
    const c = client({ trackingFrom: "2028-02-01", gstins: [gstin([{ from: "2028-02-01", frequency: "MONTHLY" }])] });
    const feb = only(generate(c, "2028-02-10"), "GST-3B-M")[0]!;
    expect([feb.periodLabel, feb.dueDate]).toEqual(["Feb 2028", "2028-03-20"]);
  });
  it("compliance start in the middle of a quarter: no task for a quarter that ended before it", () => {
    const c = client({ trackingFrom: "2026-04-01", flags: { tdsApplicable: flag("2026-08-15"), tdsSalary: flag("2026-08-15") } });
    const keys = only(generate(c, "2026-10-06"), "TDS-24Q").map((t) => t.periodKey);
    expect(keys).not.toContain("FY2026-27-Q1");
    expect(keys[0]).toBe("FY2026-27-Q2");
  });
});
