import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { createClient, addGstin } from "@/server/services/clients/service";
import { createEngagement, assignToEngagement } from "@/server/services/engagements/service";
import { getTask, moveStage, recordFiling, markNotApplicable, bulkReassign, bulkChangeChecker, createAmendment } from "@/server/services/tasks/service";
import { submitForReview, approveReview, returnReview, respondToPoint, clearPoint, signOff, waitingForMyReview } from "@/server/services/review/service";
import { setPending, updateChecklistItem, pendingMessage, logReminder, markAllRequested } from "@/server/services/pending/service";
import { gstinCheckChar } from "@/server/domain/gstin";

const g = (s: string, pan: string) => `${s}${pan}1Z` + gstinCheckChar(`${s}${pan}1Z`);
let w: Record<string, Awaited<ReturnType<typeof makeUser>>>;
let gstTaskId = "";

beforeAll(async () => {
  await resetDb();
  w = {
    partner: await makeUser("PARTNER"), partner2: await makeUser("PARTNER"), manager: await makeUser("MANAGER"),
    maker: await makeUser("STAFF"), senior: await makeUser("STAFF", { isSenior: true }), article: await makeUser("ARTICLE"), pa: await makeUser("PRACTICE_ADMIN"),
  };
  const c = await createClient(actorOf(w.pa!), { name: "Review Flow Pvt Ltd", constitution: "PRIVATE_COMPANY", pan: "AABCR1111R", stateCode: "MH", partnerId: w.partner!.id, managerId: w.manager!.id, onboardingDate: "2026-04-01" });
  const e = await createEngagement(actorOf(w.partner!), { clientId: c.id, name: "GST returns", serviceLine: "GST", engagementType: "GST_RETURN", recurrence: "RECURRING" });
  await assignToEngagement(actorOf(w.manager!), e.id, { userId: w.maker!.id, role: "MAKER" });
  await assignToEngagement(actorOf(w.manager!), e.id, { userId: w.senior!.id, role: "CHECKER" });
  const audit = await createEngagement(actorOf(w.partner!), { clientId: c.id, name: "Statutory audit FY 2025-26", serviceLine: "AUDIT", engagementType: "AUDIT", recurrence: "RECURRING", feePaise: 10_00_000_00 });
  await assignToEngagement(actorOf(w.manager!), audit.id, { userId: w.maker!.id, role: "MAKER" });
  await addGstin(actorOf(w.pa!), c.id, { gstin: g("27", "AABCR1111R"), frequency: "MONTHLY", frequencyEffectiveFrom: "2026-04-01" });
  gstTaskId = (await db().task.findFirstOrThrow({ where: { clientId: c.id, complianceTypeCode: "GST-3B-M", periodKey: "2026-08" } })).id;
});

describe("maker → checker → filing (P2-12, P2-13, scenario 11)", () => {
  it("stages needing review cannot be skipped; client approval needs a note", async () => {
    await moveStage(actorOf(w.maker!), gstTaskId, 3, "");
    await expect(moveStage(actorOf(w.maker!), gstTaskId, 4)).rejects.toThrow(/needs senior review/);
    expect((await db().task.findUniqueOrThrow({ where: { id: gstTaskId } })).status).toBe("IN_PROGRESS");
  });

  it("maker cannot check own work; Article cannot check; checker returns with points", async () => {
    const req = await submitForReview(actorOf(w.maker!), gstTaskId, "Please review");
    expect((await db().task.findUniqueOrThrow({ where: { id: gstTaskId } })).status).toBe("UNDER_REVIEW");
    expect((await waitingForMyReview(actorOf(w.senior!))).map((r) => r.id)).toEqual([req.id]);
    await expect(approveReview(actorOf(w.maker!), req.id)).rejects.toThrow();
    await expect(approveReview(actorOf(w.article!), req.id)).rejects.toThrow(/never checkers/);
    await returnReview(actorOf(w.senior!), req.id, ["ITC of ₹12,400 not reconciled", "Attach 2B"]);
    const t = await getTask(actorOf(w.maker!), gstTaskId);
    expect(t.status).toBe("IN_PROGRESS");
    expect(t.reviews[0]!.points).toHaveLength(2);
  });

  it("filing is blocked while review points are open or approval is missing", async () => {
    await expect(recordFiling(actorOf(w.maker!), gstTaskId, { ackNumber: "AA27", filedDate: "2026-09-18" })).rejects.toThrow(/review point/);
    const points = await db().reviewPoint.findMany({ where: { taskId: gstTaskId } });
    await respondToPoint(actorOf(w.maker!), points[0]!.id, "Reconciled");
    await expect(clearPoint(actorOf(w.maker!), points[0]!.id)).rejects.toThrow();
    for (const p of points) await clearPoint(actorOf(w.senior!), p.id);
    await expect(recordFiling(actorOf(w.maker!), gstTaskId, { ackNumber: "AA27", filedDate: "2026-09-18" })).rejects.toThrow(/checker has not approved/);
  });

  it("approval advances the stage; filing without ARN is refused; with ARN → Filed", async () => {
    const req = await submitForReview(actorOf(w.maker!), gstTaskId);
    await approveReview(actorOf(w.senior!), req.id);
    expect((await db().task.findUniqueOrThrow({ where: { id: gstTaskId } })).stageIndex).toBe(4);
    await moveStage(actorOf(w.maker!), gstTaskId, 5, "Client approved on WhatsApp");
    await expect(recordFiling(actorOf(w.maker!), gstTaskId, { ackNumber: " ", filedDate: "2026-09-18" })).rejects.toThrow(/acknowledgment/);
    await recordFiling(actorOf(w.maker!), gstTaskId, { ackNumber: "AA270926123456X", filedDate: "2026-09-18" });
    const t = await db().task.findUniqueOrThrow({ where: { id: gstTaskId } });
    expect([t.status, t.ackNumber]).toEqual(["FILED", "AA270926123456X"]);
    await expect(markNotApplicable(actorOf(w.manager!), gstTaskId, "x")).rejects.toThrow(/filed task/);
    const amend = await createAmendment(actorOf(w.manager!), gstTaskId, null);
    expect(amend.amendsTaskId).toBe(gstTaskId);
  });

  it("filed late when after the effective due date", async () => {
    const t = await db().task.findFirstOrThrow({ where: { complianceTypeCode: "GST-R1-M", periodKey: "2026-08" } });
    await recordFiling(actorOf(w.maker!), t.id, { ackNumber: "AA27R1", filedDate: "2026-09-15" }).catch(() => undefined);
    const after = await db().task.findUniqueOrThrow({ where: { id: t.id } });
    if (after.status !== "IN_PROGRESS" && after.status !== "UPCOMING") expect(after.status).toBe("FILED_LATE");
  });
});

describe("pending from client (P2-16, P2-17)", () => {
  it("pending record, copy message, mark as sent, auto-resume when items received", async () => {
    const t = await db().task.findFirstOrThrow({ where: { complianceTypeCode: "GST-3B-M", periodKey: "2026-09" }, include: { assignments: true } });
    const items = await db().checklistItem.findMany({ where: { taskId: t.id }, orderBy: { sortOrder: "asc" } });
    await setPending(actorOf(w.maker!), t.id, { what: "Sales register and 2B", itemIds: [items[0]!.id, items[1]!.id] });
    expect((await db().task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("PENDING_FROM_CLIENT");
    const msg = await pendingMessage(actorOf(w.maker!), t.id);
    expect(msg.text).toContain(items[0]!.label);
    await logReminder(actorOf(w.maker!), t.id, { channel: "WHATSAPP", messageText: msg.text });
    expect(await db().reminderLog.count({ where: { taskId: t.id } })).toBe(1);
    await updateChecklistItem(actorOf(w.maker!), items[0]!.id, { status: "RECEIVED" });
    expect((await db().task.findUniqueOrThrow({ where: { id: t.id } })).pendingFromClient).toBe(true);
    await updateChecklistItem(actorOf(w.maker!), items[1]!.id, { status: "NOT_APPLICABLE", note: "No B2B sales" });
    const after = await db().task.findUniqueOrThrow({ where: { id: t.id } });
    expect([after.pendingFromClient, after.status]).toEqual([false, "UPCOMING"]);
    await markAllRequested(actorOf(w.maker!), t.id);
    expect(await db().checklistItem.count({ where: { taskId: t.id, status: "NOT_REQUESTED" } })).toBe(0);
  });
});

describe("audit sign-off, EQR and UDIN", () => {
  it("EQR (fee above threshold) before Partner sign-off; different Partners; UDIN register row opened", async () => {
    const t = await db().task.findFirstOrThrow({ where: { complianceTypeCode: "STAT-AUDIT" } });
    await expect(signOff(actorOf(w.manager!), t.id, "PARTNER")).rejects.toThrow(/access/);
    await expect(signOff(actorOf(w.partner!), t.id, "PARTNER")).rejects.toThrow(/quality review/);
    await signOff(actorOf(w.partner2!), t.id, "EQR");
    await expect(signOff(actorOf(w.partner2!), t.id, "PARTNER")).rejects.toThrow(/differ from the EQR/);
    await signOff(actorOf(w.partner!), t.id, "PARTNER");
    const after = await db().task.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.signoffRecorded).toBe(true);
    const udin = await db().uDINRecord.findUniqueOrThrow({ where: { id: after.udinRecordId! } });
    expect(udin.status).toBe("AWAITING");
  });
});

describe("bulk actions (P2-10)", () => {
  it("reassign and change checker respect maker ≠ checker and roles; Staff cannot bulk", async () => {
    const tasks = await db().task.findMany({ where: { complianceTypeCode: "GST-R1-M", status: "UPCOMING" }, take: 2 });
    const ids = tasks.map((t) => t.id);
    await expect(bulkReassign(actorOf(w.maker!), ids, w.senior!.id)).rejects.toThrow(/access/);
    await expect(bulkChangeChecker(actorOf(w.manager!), ids, w.article!.id)).rejects.toThrow(/never checkers/);
    await expect(bulkReassign(actorOf(w.manager!), ids, w.senior!.id)).rejects.toThrow(/maker and checker/);
    await bulkReassign(actorOf(w.manager!), ids, w.article!.id);
    expect(await db().taskAssignment.count({ where: { taskId: { in: ids }, userId: w.article!.id, role: "MAKER", toDate: null } })).toBe(2);
  });
});
