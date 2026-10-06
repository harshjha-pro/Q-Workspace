import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { createClient, addGstin, addDirector, setClientFlags, updateGstin } from "@/server/services/clients/service";
import { createEngagement, assignToEngagement } from "@/server/services/engagements/service";
import { syncClientCompliance } from "@/server/services/compliance/sync";
import { setEventDate, createExtension, previewExtension, publishExtension, addRuleVersion, setManualDueDate, regenerate, verifyRule } from "@/server/services/compliance/admin";
import { gstinCheckChar } from "@/server/domain/gstin";

const g = (state: string, pan: string) => `${state}${pan}1Z` + gstinCheckChar(`${state}${pan}1Z`);
let pa: Awaited<ReturnType<typeof makeUser>>, partner: Awaited<ReturnType<typeof makeUser>>, staff: Awaited<ReturnType<typeof makeUser>>, senior: Awaited<ReturnType<typeof makeUser>>;
let clientId = "";

beforeAll(async () => {
  await resetDb();
  pa = await makeUser("PRACTICE_ADMIN");
  partner = await makeUser("PARTNER");
  staff = await makeUser("STAFF");
  senior = await makeUser("STAFF", { isSenior: true });
});

describe("compliance service (generation from master data)", () => {
  it("creating a company with a GSTIN, flags and a director generates its tasks, linked to engagements", async () => {
    const c = await createClient(actorOf(pa), { name: "Engine Test Pvt Ltd", constitution: "PRIVATE_COMPANY", pan: "AABCE1234F", stateCode: "MH", partnerId: partner.id, onboardingDate: "2026-04-01", flags: { tdsApplicable: true, tdsNonSalary: true } });
    clientId = c.id;
    const e = await createEngagement(actorOf(partner), { clientId, name: "GST returns", serviceLine: "GST", engagementType: "GST_RETURN", recurrence: "RECURRING" });
    await assignToEngagement(actorOf(partner), e.id, { userId: staff.id, role: "MAKER" });
    await assignToEngagement(actorOf(partner), e.id, { userId: senior.id, role: "CHECKER" });
    await addGstin(actorOf(pa), clientId, { gstin: g("27", "AABCE1234F"), frequency: "MONTHLY", frequencyEffectiveFrom: "2026-04-01", annualReturnApplicable: true });
    await addDirector(actorOf(pa), clientId, { din: "07777777", name: "Ravi Engine" });
    const tasks = await db().task.findMany({ where: { clientId }, include: { assignments: true } });
    const april = tasks.find((t) => t.complianceTypeCode === "GST-3B-M" && t.periodKey === "2026-04")!;
    expect(april.effectiveDueDate).toBe("2026-05-20");
    expect(april.engagementId).toBe(e.id);
    expect(april.assignments.map((a) => `${a.role}:${a.userId}`).sort()).toEqual([`ASSIGNEE:${staff.id}`, `CHECKER:${senior.id}`, `MAKER:${staff.id}`].sort());
    expect(await db().checklistItem.count({ where: { taskId: april.id } })).toBeGreaterThan(0);
    expect(tasks.some((t) => t.complianceTypeCode === "DIR3-KYC")).toBe(true);
    expect(tasks.some((t) => t.complianceTypeCode === "TDS-26Q" && t.periodKey === "FY2026-27-Q1" && t.effectiveDueDate === "2026-07-31")).toBe(true);
    // Types without a recurring engagement get one created by the calendar.
    expect(await db().engagement.count({ where: { clientId, name: { contains: "(recurring)" } } })).toBeGreaterThan(0);
    // Idempotent.
    expect((await syncClientCompliance(clientId)).created).toBe(0);
  });

  it("switching a flag off closes later open periods with a reason", async () => {
    await expect(setClientFlags(actorOf(pa), clientId, { flags: { tdsNonSalary: false }, effectiveDate: "2026-03-01", reason: "Too early" })).rejects.toThrow(/before the last change/);
    await setClientFlags(actorOf(pa), clientId, { flags: { tdsNonSalary: false }, effectiveDate: "2026-10-01", reason: "No more contractor payments" });
    const q3 = await db().task.findFirstOrThrow({ where: { clientId, complianceTypeCode: "TDS-26Q", periodKey: "FY2026-27-Q3" } });
    expect([q3.status, q3.notApplicableReason]).toEqual(["NOT_APPLICABLE", "Applicability flag removed effective 2026-10-01"]);
    const q2 = await db().task.findFirstOrThrow({ where: { clientId, complianceTypeCode: "TDS-26Q", periodKey: "FY2026-27-Q2" } });
    expect(q2.status).toBe("UPCOMING");
    expect(await db().auditLog.count({ where: { entityId: q3.id, action: "STATUS" } })).toBe(1);
  });

  it("GST frequency change supersedes later monthly tasks and links them", async () => {
    const gstin = await db().gSTIN.findFirstOrThrow({ where: { clientId } });
    await updateGstin(actorOf(pa), gstin.id, { frequency: "QRMP", frequencyEffectiveFrom: "2027-01-01", reason: "Opted QRMP from Q4" });
    const jan = await db().task.findFirst({ where: { clientId, complianceTypeCode: "GST-3B-M", periodKey: "2027-01" } });
    if (jan) {
      expect(jan.status).toBe("NOT_APPLICABLE");
      expect(jan.supersededByTaskId).toBeTruthy();
    }
    const dec = await db().task.findFirst({ where: { clientId, complianceTypeCode: "GST-3B-M", periodKey: "2026-12" } });
    if (dec) expect(dec.status).toBe("UPCOMING");
  });

  it("AGM date turns provisional AOC-4 / MGT-7 dates into confirmed ones", async () => {
    // FY 2025-26 closed before tracking began, so create the FY tasks by tracking from 2025.
    await db().setting.upsert({ where: { key: "compliance.trackingFrom" }, create: { key: "compliance.trackingFrom", valueJson: JSON.stringify("2025-04-01") }, update: { valueJson: JSON.stringify("2025-04-01") } });
    await db().client.update({ where: { id: clientId }, data: { onboardingDate: "2025-04-01" } });
    await syncClientCompliance(clientId);
    const aoc = await db().task.findFirstOrThrow({ where: { clientId, complianceTypeCode: "AOC-4", periodKey: "FY2025-26" } });
    expect([aoc.isProvisional, aoc.effectiveDueDate]).toEqual([true, "2026-10-30"]);
    await setEventDate(actorOf(pa), clientId, { eventTypeCode: "AGM", periodKey: "FY2025-26", dateValue: "2026-09-12", auditorAppointedAtAgm: true });
    const after = await db().task.findUniqueOrThrow({ where: { id: aoc.id }, include: { dueDateHistory: true } });
    expect([after.isProvisional, after.effectiveDueDate]).toEqual([false, "2026-10-12"]);
    expect(after.dueDateHistory.some((h) => h.source === "EVENT_CORRECTION")).toBe(true);
    expect(await db().task.count({ where: { clientId, complianceTypeCode: "ADT-1", periodKey: "FY2025-26" } })).toBe(1);
  });

  it("extension: preview count is required, then dates move and Filed Late becomes Filed", async () => {
    const t = await db().task.findFirstOrThrow({ where: { clientId, complianceTypeCode: "GST-3B-M", periodKey: "2026-05" } });
    await db().task.update({ where: { id: t.id }, data: { status: "FILED_LATE", filedDate: "2026-06-22", ackNumber: "AA2706220001", effectiveDueDate: "2026-06-20" } });
    const ext = await createExtension(actorOf(pa), { typeCodes: ["GST-3B-M"], periodsMode: "SPECIFIC", periodKeys: ["2026-05"], scope: [{ field: "state", values: ["MH"] }], newEffectiveDueDate: "2026-06-24", reason: "Portal outage", notificationRef: "N-08/2026" });
    const p = await previewExtension(actorOf(pa), ext.id);
    expect(p).toMatchObject({ tasks: 1, clients: 1, reclassify: 1 });
    expect(p.sample).toHaveLength(1);
    await expect(publishExtension(actorOf(pa), ext.id, 5)).rejects.toThrow(/changed/);
    await publishExtension(actorOf(pa), ext.id, 1);
    const after = await db().task.findUniqueOrThrow({ where: { id: t.id } });
    expect([after.status, after.effectiveDueDate]).toEqual(["FILED", "2026-06-24"]);
    await expect(publishExtension(actorOf(pa), ext.id, 1)).rejects.toThrow(/draft/);
    await expect(createExtension(actorOf(staff), { typeCodes: ["GST-3B-M"], periodsMode: "ALL_OPEN", newEffectiveDueDate: "2026-06-24", reason: "x x x", notificationRef: "n" })).rejects.toThrow(/access/);
  });

  it("new rule version moves open tasks (master update) and keeps extended dates", async () => {
    const r = await addRuleVersion(actorOf(pa), "GST-3B-M", { paramsJson: JSON.stringify({ kind: "DAY_AFTER_PERIOD", day: 21 }), effectiveFrom: "2026-11-01", source: "Test notification" });
    expect(r.moved).toBeGreaterThan(0);
    const nov = await db().task.findFirst({ where: { clientId, complianceTypeCode: "GST-3B-M", periodKey: "2026-11" }, include: { dueDateHistory: true } });
    if (nov && nov.status !== "NOT_APPLICABLE") {
      expect(nov.effectiveDueDate).toBe("2026-12-21");
      expect(nov.dueDateHistory.some((h) => h.source === "MASTER_UPDATE")).toBe(true);
    }
    await expect(verifyRule(actorOf(pa), r.rule.id)).rejects.toThrow(/Partner/);
    await verifyRule(actorOf(partner), r.rule.id);
    await expect(addRuleVersion(actorOf(pa), "GST-3B-M", { paramsJson: "{bad", effectiveFrom: "2026-11-01", source: "x x x" })).rejects.toThrow(/JSON/);
  });

  it("PT tasks need a manual due date; regenerate is Practice-Admin only", async () => {
    await db().clientPtRegistration.create({ data: { clientId, stateCode: "MH", kind: "EMPLOYER", frequency: "MONTHLY", effectiveFrom: "2026-09-01" } });
    await regenerate(actorOf(pa), clientId);
    const pt = await db().task.findFirstOrThrow({ where: { clientId, complianceTypeCode: "PT-RET", periodKey: "2026-09" } });
    expect(pt.effectiveDueDate).toBeNull();
    await setManualDueDate(actorOf(pa), pt.id, "2026-10-31", "MH PT rule");
    expect((await db().task.findUniqueOrThrow({ where: { id: pt.id } })).effectiveDueDate).toBe("2026-10-31");
    await expect(regenerate(actorOf(partner), clientId)).rejects.toThrow(/access/);
  });
});
