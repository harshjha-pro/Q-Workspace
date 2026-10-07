import { beforeAll, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeUser } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { todayIst } from "@/server/lib/dates";
import { signOff } from "@/server/services/review/service";
import { uploadDocument, documentVersionForDownload } from "@/server/services/dms/service";
import {
  eqrRequired, assignEqrReviewer, performEqr, declareIndependence, myIndependence, startChecklist, answerChecklistItem, completeChecklist, qcOverview, engagementQc, QC_DEFAULT_ITEMS,
} from "@/server/services/qc/service";
import { createInspection, addFinding, closeFinding, listInspections, runQcFindingReminders } from "@/server/services/qc/inspections";
import { peerReviewPackData, buildPeerReviewPack } from "@/server/services/qc/peer-review";

let w: Awaited<ReturnType<typeof buildWorld>>;
let p2: Awaited<ReturnType<typeof makeUser>>;
let p3: Awaited<ReturnType<typeof makeUser>>;
let big: { id: string };
let small: { id: string };
const today = todayIst();

async function auditEngagement(code: string, feePaise: number, extra: Record<string, unknown> = {}) {
  const e = await db().engagement.create({
    data: { code, clientId: w.c1.id, name: `Statutory audit FY 2025-26 ${code}`, serviceLine: "AUDIT", engagementType: "AUDIT", feePaise, partnerId: w.partner.id, managerId: w.m1.id, ...extra },
  });
  await db().engagementAssignment.create({ data: { engagementId: e.id, userId: w.s1.id, role: "MAKER", fromDate: "2026-04-01" } });
  await db().engagementAssignment.create({ data: { engagementId: e.id, userId: w.a1.id, role: "MEMBER", fromDate: "2026-04-01" } });
  return e;
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  p2 = await makeUser("PARTNER");
  p3 = await makeUser("PARTNER");
  big = await auditEngagement("EN-TQ0001", 60_000_00);
  small = await auditEngagement("EN-TQ0002", 1_00_000);
});

describe("EQR (13.2)", () => {
  it("is required above the Partner-set fee threshold or for public-interest clients", async () => {
    expect(await eqrRequired(big.id)).toBe(true);
    expect(await eqrRequired(small.id)).toBe(false);
    expect(await eqrRequired(w.e1.id)).toBe(false);
    await db().client.update({ where: { id: w.c1.id }, data: { publicInterest: true } });
    expect(await eqrRequired(small.id)).toBe(true);
    await db().client.update({ where: { id: w.c1.id }, data: { publicInterest: false } });
  });

  it("the EQR reviewer must be a different Partner from the engagement partner", async () => {
    await expect(assignEqrReviewer(actorOf(w.partner), big.id, w.partner.id)).rejects.toThrow(/different Partner/);
    await expect(assignEqrReviewer(actorOf(w.partner), big.id, w.m1.id)).rejects.toThrow(/Partner/);
    await expect(assignEqrReviewer(actorOf(w.m1), big.id, p2.id)).rejects.toThrow(/only a Partner/);
    await expect(assignEqrReviewer(actorOf(w.partner), small.id, p2.id)).rejects.toThrow(/not required/);
    await assignEqrReviewer(actorOf(w.partner), big.id, p2.id);
    expect((await engagementQc(actorOf(w.partner), big.id)).eqr.reviewer?.id).toBe(p2.id);

    const task = await db().task.create({ data: { clientId: w.c1.id, engagementId: big.id, title: "Audit report", status: "IN_PROGRESS" } });
    await db().engagement.update({ where: { id: big.id }, data: { eqrRequired: true } }); // review service's own EQR gate
    await expect(performEqr(actorOf(w.partner), task.id)).rejects.toThrow(/different Partner/);
    await expect(performEqr(actorOf(p3), task.id)).rejects.toThrow(/named EQR reviewer/);
    await expect(performEqr(actorOf(w.m1), task.id)).rejects.toThrow();
    await expect(signOff(actorOf(w.partner), task.id, "PARTNER")).rejects.toThrow(/quality review must be completed/);
    await performEqr(actorOf(p2), task.id, "No matters");
    await signOff(actorOf(w.partner), task.id, "PARTNER");
    expect(await db().signOff.count({ where: { taskId: task.id } })).toBe(2);
  });
});

describe("independence declarations", () => {
  it("are made by each team member for themself only", async () => {
    await declareIndependence(actorOf(w.s1), big.id, { hasConflict: false });
    await expect(declareIndependence(actorOf(w.s1), big.id, { userId: w.a1.id, hasConflict: false })).rejects.toThrow(/their own/);
    await expect(declareIndependence(actorOf(w.s2), big.id, { hasConflict: false })).rejects.toThrow(/team/);
    await expect(declareIndependence(actorOf(w.pa), big.id, { hasConflict: false })).rejects.toThrow();
    await expect(declareIndependence(actorOf(w.hr), big.id, { hasConflict: false })).rejects.toThrow();
    await expect(declareIndependence(actorOf(w.a1), big.id, { hasConflict: true })).rejects.toThrow(/Describe/);
    await declareIndependence(actorOf(w.a1), big.id, { hasConflict: true, note: "Cousin is the CFO" });
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "INDEPENDENCE_CONFLICT" } })).toBe(1);
    expect(await db().independenceDeclaration.count({ where: { engagementId: big.id } })).toBe(2);
    const mine = await myIndependence(actorOf(w.s1));
    expect(mine.find((m) => m.engagementId === small.id)?.declaration).toBeNull();
    expect(mine[0]!.declaration).toBeNull(); // pending first
    const row = (await qcOverview(actorOf(w.partner))).find((r) => r.id === big.id)!;
    expect(row.independence).toMatchObject({ declared: 2, team: 4, conflicts: 1 });
    expect(await qcOverview(actorOf(w.m2))).toHaveLength(0);
    await expect(qcOverview(actorOf(w.s1))).rejects.toThrow();
  });
});

describe("QC checklist", () => {
  it("Partner fills the SQC 1 checklist; Managers read only", async () => {
    const c = await startChecklist(actorOf(w.partner), small.id);
    expect((await startChecklist(actorOf(w.partner), small.id)).id).toBe(c.id);
    const items = await db().qCChecklistItem.findMany({ where: { checklistId: c.id }, orderBy: { sortOrder: "asc" } });
    expect(items).toHaveLength(QC_DEFAULT_ITEMS.length);
    expect(items.find((i) => i.label.startsWith("EQR:"))?.response).toBe("NA");
    await expect(answerChecklistItem(actorOf(w.m1), items[0]!.id, { response: "YES" })).rejects.toThrow();
    await expect(answerChecklistItem(actorOf(w.partner), items[0]!.id, { response: "NO" })).rejects.toThrow(/Explain/);
    await expect(completeChecklist(actorOf(w.partner), c.id)).rejects.toThrow(/need an answer/);
    for (const i of items.filter((x) => !x.response)) await answerChecklistItem(actorOf(w.partner), i.id, { response: "YES" });
    await completeChecklist(actorOf(w.partner), c.id);
    expect((await engagementQc(actorOf(w.m1), small.id)).checklist?.status).toBe("COMPLETE");
    await expect(startChecklist(actorOf(w.partner), w.e1.id)).rejects.toThrow(/audit engagements/);
  });
});

describe("file inspection", () => {
  it("samples closed engagements and tracks corrective actions", async () => {
    await expect(createInspection(actorOf(w.partner), { name: "Q1 inspection", periodFrom: today, periodTo: today })).rejects.toThrow(/nothing to sample/);
    await db().engagement.update({ where: { id: small.id }, data: { status: "COMPLETED", closedAt: new Date() } });
    await expect(createInspection(actorOf(w.m1), { name: "Q1 inspection", periodFrom: today, periodTo: today })).rejects.toThrow();
    const i = await createInspection(actorOf(w.partner), { name: "Q1 inspection", periodFrom: today, periodTo: today, sampleSize: 3 });
    const [listed] = await listInspections(actorOf(w.partner));
    expect(listed!.samples.map((s) => s.engagementId)).toEqual([small.id]);
    await expect(addFinding(actorOf(w.partner), i.id, { engagementId: big.id, finding: "Not in sample" })).rejects.toThrow(/sample/);
    await expect(addFinding(actorOf(w.partner), i.id, { engagementId: small.id, finding: "Materiality basis not documented", ownerId: w.s1.id })).rejects.toThrow(/due date/);
    const f = await addFinding(actorOf(w.partner), i.id, { engagementId: small.id, finding: "Materiality basis not documented", correctiveAction: "Add basis memo", ownerId: w.s1.id, dueDate: "2026-01-01" });
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "QC_FINDING" } })).toBe(1);
    expect((await runQcFindingReminders()).overdue).toBe(1);
    expect((await runQcFindingReminders()).notified).toBe(0); // once a day
    await expect(closeFinding(actorOf(w.a1), f.id)).rejects.toThrow();
    await closeFinding(actorOf(w.s1), f.id, "Memo filed");
    expect((await db().qCFinding.findUniqueOrThrow({ where: { id: f.id } })).closedAt).not.toBeNull();
  });
});

describe("peer-review pack", () => {
  it("lists engagements with UDINs, reports and review evidence; exports a zip", async () => {
    await db().uDINRecord.create({ data: { clientId: w.c1.id, engagementId: big.id, documentType: "Audit report", signingDate: today, partnerId: w.partner.id, udin: "26123456ABCDEFGHIJ", status: "GENERATED", generatedOn: today } });
    const report = await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: big.id, tags: ["signed", "report"], name: "Signed audit report" }, { name: "report.txt", data: Buffer.from("independent auditor's report") });
    await uploadDocument(actorOf(w.s1), { clientId: w.c1.id, engagementId: big.id, tags: "draft" }, { name: "wp.txt", data: Buffer.from("working paper") });
    const task = await db().task.findFirstOrThrow({ where: { engagementId: big.id } });
    const rr = await db().reviewRequest.create({ data: { taskId: task.id, stageIndex: 0, level: "MANAGER", makerId: w.s1.id, checkerId: w.m1.id, status: "APPROVED" } });
    await db().reviewPoint.create({ data: { taskId: task.id, reviewRequestId: rr.id, text: "Tie notes", raisedById: w.m1.id, status: "CLEARED" } });

    const rows = await peerReviewPackData(actorOf(w.partner), { periodFrom: today, periodTo: today });
    const row = rows.find((r) => r.engagementId === big.id)!;
    expect(row.udins.map((u) => u.udin)).toEqual(["26123456ABCDEFGHIJ"]);
    expect(row.reports.map((r) => r.id)).toEqual([report.id]);
    expect(row.reviews).toMatchObject({ requests: 1, approved: 1, pointsRaised: 1, pointsCleared: 1 });
    expect(row.signoffs.map((s) => s.level).sort()).toEqual(["EQR", "PARTNER"]);
    expect(rows.some((r) => r.engagementId === small.id)).toBe(true); // closed in the period
    expect(rows.some((r) => r.engagementId === w.e1.id)).toBe(false);
    await expect(peerReviewPackData(actorOf(w.m1), { periodFrom: today, periodTo: today })).rejects.toThrow();

    const pack = await buildPeerReviewPack(actorOf(w.partner), { periodFrom: today, periodTo: today });
    expect(pack.files).toBe(1);
    const file = await documentVersionForDownload(actorOf(w.partner), pack.documentId!);
    const names = new AdmZip(file.data).getEntries().map((e) => e.entryName);
    expect(names).toContain("peer-review-pack.xlsx");
    expect(names.some((n) => n.startsWith("EN-TQ0001/Signed audit report"))).toBe(true);
    await expect(documentVersionForDownload(actorOf(w.m1), pack.documentId!)).rejects.toThrow();
  });
});
