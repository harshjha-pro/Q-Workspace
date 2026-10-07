import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeEngagement } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { todayIst } from "@/server/lib/dates";
import { storeFile, resolveInside } from "@/server/lib/storage";
import { seedCollabReference } from "@/prisma/seed/phase3/collab";
import { closeEngagement, listArchive } from "@/server/services/lifecycle/archive";
import { completionReport, completionReportPdf } from "@/server/services/lifecycle/completion";
import { setRetentionRule, requestPurge, decidePurge, previewPurge, runRetentionPurgeProposals, listRetentionRules } from "@/server/services/lifecycle/retention";
import { ensureFirmClient, recordFirmObligation, listFirmCompliance } from "@/server/services/firm-compliance/service";
import { syncClientCompliance } from "@/server/services/compliance/sync";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await seedCollabReference(db());
});

describe("close and archive (P3-06) + completion report (P3-01)", () => {
  it("needs all tasks closed, or a Partner override with a reason", async () => {
    await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "Open task", periodKey: "O-1", isOneOff: true, status: "IN_PROGRESS" } });
    const filed = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "Filed task", periodKey: "O-2", isOneOff: true, status: "FILED", filedDate: today, ackType: "ARN", ackNumber: "AA0810260001234" } });
    await db().acknowledgment.create({ data: { taskId: filed.id, ackType: "ARN", number: "AA0810260001234", date: today } });
    await db().reviewPoint.create({ data: { taskId: filed.id, text: "Tie ITC to 2B", raisedById: w.m1.id, status: "CLEARED", clearedById: w.s1.id, clearedAt: new Date() } });
    await db().reviewPoint.create({ data: { taskId: filed.id, text: "Attach workings", raisedById: w.m1.id } });
    await db().workEntry.create({ data: { userId: w.s1.id, date: today, engagementId: w.e1.id, clientId: w.c1.id, taskId: filed.id, stageName: "Preparation", minutes: 120 } });
    await db().workEntry.create({ data: { userId: w.m1.id, date: today, engagementId: w.e1.id, clientId: w.c1.id, taskId: filed.id, stageName: "Review", minutes: 45 } });

    await expect(closeEngagement(actorOf(w.s1), w.e1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(closeEngagement(actorOf(w.m1), w.e1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(closeEngagement(actorOf(w.m2), w.e1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(closeEngagement(actorOf(w.partner), w.e1.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("the completion report is for the engagement's Manager and Partner", async () => {
    for (const u of [w.s1, w.a1, w.pa, w.hr, w.m2]) await expect(completionReport(actorOf(u), w.e1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const r = await completionReport(actorOf(w.m1), w.e1.id);
    expect(r.totalMinutes).toBe(165);
    expect(r.hours.find((h) => h.userId === w.s1.id)!.byStage).toEqual({ Preparation: 120 });
    expect(r.stageTotals).toEqual({ Preparation: 120, Review: 45 });
    expect(r.acknowledgments.map((a) => a.number)).toEqual(["AA0810260001234"]);
    expect([r.reviewPoints.raised, r.reviewPoints.cleared, r.reviewPoints.open]).toEqual([2, 1, 1]);
    expect(r.billing?.status).toBe("NOT_YET_BILLED");
    expect(await db().sensitiveViewLog.count({ where: { entityId: w.e1.id, kind: "BILLING" } })).toBe(1);
    const pdf = await completionReportPdf(actorOf(w.partner), w.e1.id);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("Partner override closes and archives; follow-ups are raised; archive is read-only and scoped", async () => {
    const r = await closeEngagement(actorOf(w.partner), w.e1.id, { overrideReason: "Client moved to another firm" });
    expect([r.engagement.status, !!r.engagement.archivedAt, r.feedbackRequested, r.renewalReminder]).toEqual(["COMPLETED", true, true, false]);
    expect(await db().notification.count({ where: { userId: w.m1.id, kind: "FEEDBACK_REQUEST" } })).toBe(1);
    const audit = await db().auditLog.findFirstOrThrow({ where: { entityId: w.e1.id, action: "CLOSE_ARCHIVE" } });
    expect(audit.reason).toContain("Partner override");
    await expect(closeEngagement(actorOf(w.partner), w.e1.id, { overrideReason: "again please" })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    expect((await listArchive(actorOf(w.s1))).map((e) => e.id)).toEqual([w.e1.id]);
    expect(await listArchive(actorOf(w.s2))).toHaveLength(0);
    expect((await listArchive(actorOf(w.m1), { q: w.c1.name })).length).toBe(1);
  });

  it("a Manager closes when every task is closed; recurring work gets a renewal reminder", async () => {
    const e = await makeEngagement(w.c1.id);
    await db().engagement.update({ where: { id: e.id }, data: { recurrence: "RECURRING", managerId: w.m1.id } });
    await db().task.create({ data: { clientId: w.c1.id, engagementId: e.id, title: "Done", periodKey: "D-1", isOneOff: true, status: "NOT_APPLICABLE" } });
    const r = await closeEngagement(actorOf(w.m1), e.id);
    expect(r.renewalReminder).toBe(true);
    expect(await db().notification.count({ where: { userId: w.m1.id, kind: "RENEWAL" } })).toBe(1);
  });
});

describe("retention and purge (P3-07, Q-19)", () => {
  let oldDocId = "";
  let oldPath = "";

  it("rules are seeded unverified with purge disabled; purge is blocked until a Partner sets a period", async () => {
    const rules = await listRetentionRules(actorOf(w.pa));
    expect(rules.length).toBeGreaterThanOrEqual(6);
    expect(rules.every((r) => !r.purgeEnabled && r.retainYears === null && !r.verifiedAt)).toBe(true);
    await expect(requestPurge(actorOf(w.pa), "CLIENT_DOCUMENTS")).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    await expect(listRetentionRules(actorOf(w.m1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRetentionRule(actorOf(w.pa), "CLIENT_DOCUMENTS", { retainYears: 1, purgeEnabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRetentionRule(actorOf(w.partner), "CLIENT_DOCUMENTS", { retainYears: null, purgeEnabled: true })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setRetentionRule(actorOf(w.partner), "HR_DOCUMENTS", { retainYears: 5, purgeEnabled: true })).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    const r = await setRetentionRule(actorOf(w.partner), "CLIENT_DOCUMENTS", { retainYears: 1, purgeEnabled: true, source: "Firm policy" });
    expect(r.verifiedById).toBe(w.partner.id);
  });

  it("lists records past retention; a purge needs a Partner's approval, deletes files and soft-marks rows", async () => {
    const mk = async (name: string, ageDays: number) => {
      const f = await storeFile(["test", "retention"], name, Buffer.from(`content of ${name}`));
      const d = await db().document.create({
        data: { clientId: w.c1.id, name, createdAt: new Date(Date.now() - ageDays * 86_400_000), versions: { create: { version: 1, storagePath: f.storagePath, originalName: name, mimeType: f.mimeType, sizeBytes: f.sizeBytes, sha256: f.sha256 } } },
      });
      return { id: d.id, path: f.storagePath };
    };
    const old = await mk("old.txt", 800);
    oldDocId = old.id;
    oldPath = old.path;
    const fresh = await mk("fresh.txt", 10);
    expect((await previewPurge(actorOf(w.pa), "CLIENT_DOCUMENTS")).count).toBe(1);
    const req = await requestPurge(actorOf(w.pa), "CLIENT_DOCUMENTS");
    expect([req.status, req.count]).toEqual(["PENDING", 1]);
    await expect(requestPurge(actorOf(w.pa), "CLIENT_DOCUMENTS")).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    expect(fs.existsSync(resolveInside(oldPath))).toBe(true);
    for (const u of [w.pa, w.m1, w.s1]) await expect(decidePurge(actorOf(u), req.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "PURGE_APPROVAL" } })).toBe(1);

    const out = await decidePurge(actorOf(w.partner), req.id, true, "Annual clean-up");
    expect([out.purged, out.skipped]).toEqual([1, 0]);
    expect(fs.existsSync(resolveInside(oldPath))).toBe(false);
    const doc = await db().document.findUniqueOrThrow({ where: { id: oldDocId }, include: { versions: true } });
    expect(doc.tagsCsv).toContain("PURGED");
    expect(doc.versions[0]!.note).toContain("Purged");
    expect(await db().document.count({ where: { id: fresh.id, tagsCsv: { contains: "PURGED" } } })).toBe(0);
    expect(await db().auditLog.count({ where: { entityType: "Document", entityId: oldDocId, action: "PURGE" } })).toBe(1);
    expect((await db().purgeRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("EXECUTED");
    await expect(decidePurge(actorOf(w.partner), req.id, true)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });

  it("the job only proposes; disabling the rule blocks approval", async () => {
    const f = await storeFile(["test", "retention"], "older.txt", Buffer.from("x"));
    await db().document.create({ data: { clientId: w.c1.id, name: "older.txt", createdAt: new Date(Date.now() - 900 * 86_400_000), versions: { create: { version: 1, storagePath: f.storagePath, originalName: "older.txt", mimeType: f.mimeType, sizeBytes: f.sizeBytes, sha256: f.sha256 } } } });
    expect((await runRetentionPurgeProposals()).requests).toBe(1);
    const req = await db().purgeRequest.findFirstOrThrow({ where: { status: "PENDING" } });
    expect(req.requestedById).toBe("system");
    await setRetentionRule(actorOf(w.partner), "CLIENT_DOCUMENTS", { retainYears: 1, purgeEnabled: false });
    await expect(decidePurge(actorOf(w.partner), req.id, true)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    expect(fs.existsSync(resolveInside(f.storagePath))).toBe(true);
    await decidePurge(actorOf(w.partner), req.id, false, "Not now");
    expect((await db().purgeRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("REJECTED");
  });
});

describe("firm's own compliance (P3-31, spec 13.6)", () => {
  it("creates the firm as an internal client once", async () => {
    await db().firmProfile.create({ data: { name: "Test Firm", pan: "AAFFT1234K", stateCode: "RJ" } });
    const a = await ensureFirmClient();
    const b = await ensureFirmClient();
    expect(a.id).toBe(b.id);
    expect([a.isFirm, a.code, a.name]).toEqual([true, "CL-0000", "Test Firm (Firm)"]);
  });

  it("seeds firm-only types with an unverified MANUAL rule", async () => {
    const types = await db().complianceType.findMany({ where: { isFirmOnly: true }, include: { rules: true } });
    expect(types.map((t) => t.code)).toEqual(expect.arrayContaining(["FIRM-ICAI-COP", "FIRM-PI-INSURANCE", "FIRM-PEER-REVIEW", "FIRM-OFFICE-LICENCE"]));
    expect(types.every((t) => t.rules.length === 1 && t.rules[0]!.kind === "MANUAL" && !t.rules[0]!.verifiedAt)).toBe(true);
  });

  it("records firm-only obligations for the firm client only, and the nightly sync leaves them alone", async () => {
    const firm = await ensureFirmClient();
    await expect(recordFirmObligation(actorOf(w.s1), { typeCode: "FIRM-PI-INSURANCE", periodLabel: "2026-27", dueDate: "2027-03-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordFirmObligation(actorOf(w.pa), { typeCode: "GST-3B-M", periodLabel: "2026-27", dueDate: "2027-03-31" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const t = await recordFirmObligation(actorOf(w.pa), { typeCode: "FIRM-PI-INSURANCE", periodLabel: "2026-27", dueDate: "2027-03-31", ownerId: w.m1.id, note: "Policy schedule" });
    expect([t.clientId, t.effectiveDueDate, t.complianceTypeCode]).toEqual([firm.id, "2027-03-31", null]);
    await expect(recordFirmObligation(actorOf(w.partner), { typeCode: "FIRM-PI-INSURANCE", periodLabel: "2026-27", dueDate: "2027-03-31" })).rejects.toMatchObject({ code: "RULE_VIOLATION" });

    await syncClientCompliance(firm.id);
    await syncClientCompliance(w.c1.id);
    expect((await db().task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("UPCOMING");
    const firmCodes = (await db().complianceType.findMany({ where: { isFirmOnly: true }, select: { code: true } })).map((c) => c.code);
    expect(await db().task.count({ where: { complianceTypeCode: { in: firmCodes } } })).toBe(0);
    expect(await db().task.count({ where: { clientId: { not: firm.id }, periodKey: { startsWith: "FIRM:" } } })).toBe(0);

    const view = await listFirmCompliance(actorOf(w.partner));
    expect(view.tasks.find((x) => x.id === t.id)).toMatchObject({ kind: "FIRM_ONLY", typeCode: "FIRM-PI-INSURANCE" });
    expect((await listFirmCompliance(actorOf(w.s2))).tasks).toHaveLength(0);
    await expect(listFirmCompliance(actorOf(w.hr))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
