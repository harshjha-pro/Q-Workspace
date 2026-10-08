import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import type { PortalActor } from "@/server/permissions/actor";
import { portalUpload } from "@/server/services/portal/actions";
import { listPortalUploads, linkPortalUpload, linkableItems } from "@/server/services/portal/uploads";
import { updateChecklistItem } from "@/server/services/pending/service";
import { createNotice } from "@/server/services/registers/notices";
import { noticeReplyContext, draftNoticeReply } from "@/server/services/registers/notice-reply";
import { approveVersion } from "@/server/services/doc-templates/service";
import { fileGeneratedDocument } from "@/server/services/dms/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
let portal: PortalActor;
let taskId: string;
let bankId: string;
let uploadId: string;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  portal = w.portal;
  const t = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title: "ITR", periodLabel: "AY 2026-27", status: "PENDING_FROM_CLIENT" } });
  taskId = t.id;
  await db().taskAssignment.create({ data: { taskId, userId: w.s1.id, role: "ASSIGNEE", fromDate: "2026-04-01" } });
  bankId = (await db().checklistItem.create({ data: { clientId: w.c1.id, taskId, label: "Bank statements", keywords: "bank statements", status: "REQUESTED", requestedAt: "2026-10-01" } })).id;
  await db().checklistItem.create({ data: { clientId: w.c1.id, taskId, label: "Form 16", keywords: "form 16", status: "REQUESTED", requestedAt: "2026-10-01" } });
});

describe("keyword tagging of client uploads (D-85)", () => {
  it("an unrequested upload gets a suggested item and dictionary tags; the team is pointed to Client uploads", async () => {
    const r = await portalUpload(portal, { clientId: w.c1.id, description: "Statements for the year" }, { name: "HDFC_Stmt_Apr-Sep.csv", data: Buffer.from("date,narration,amount\n") });
    uploadId = r.uploadId;
    expect((await db().portalUpload.findUniqueOrThrow({ where: { id: r.uploadId } })).autoTag).toBe(`ITEM:${bankId}`);
    expect((await db().document.findUniqueOrThrow({ where: { id: r.documentId } })).tagsCsv).toContain("bank-statement");
    const n = await db().notification.findFirstOrThrow({ where: { kind: "PORTAL_UPLOAD", userId: w.m1.id }, orderBy: { createdAt: "desc" } });
    expect(n.body).toContain("Looks like: Bank statements");
    expect(n.link).toBe("/portal-uploads");
    // The item itself is not touched until staff link it.
    expect((await db().checklistItem.findUniqueOrThrow({ where: { id: bankId } })).status).toBe("REQUESTED");
  });

  it("an unclear upload gets no suggestion", async () => {
    const r = await portalUpload(portal, { clientId: w.c1.id, description: "Misc" }, { name: "scan0042.pdf", data: Buffer.from("%PDF-1.4 x") });
    expect((await db().portalUpload.findUniqueOrThrow({ where: { id: r.uploadId } })).autoTag).toBeNull();
  });

  it("staff see uploads in scope with the suggestion; other teams and HR do not", async () => {
    const rows = await listPortalUploads(actorOf(w.m1), { status: "unlinked" });
    expect(rows.find((r) => r.id === uploadId)).toMatchObject({ suggested: { id: bankId, label: "Bank statements" }, linkedTo: null, tags: ["bank-statement"] });
    expect(await listPortalUploads(actorOf(w.m2))).toEqual([]);
    await expect(listPortalUploads(actorOf(w.hr))).rejects.toThrow(/access/);
    expect((await linkableItems(actorOf(w.m1), w.c1.id)).map((i) => i.id)).toContain(bankId);
    await expect(linkableItems(actorOf(w.m2), w.c1.id)).rejects.toThrow(/access/);
  });

  it("linking makes the item Received pending confirmation, attaches the file to the task, and is done once", async () => {
    await expect(linkPortalUpload(actorOf(w.s2), uploadId, bankId)).rejects.toThrow();
    await linkPortalUpload(actorOf(w.s1), uploadId, bankId);
    expect(await db().checklistItem.findUniqueOrThrow({ where: { id: bankId } })).toMatchObject({ status: "RECEIVED", receivedPendingConfirm: true });
    const up = await db().portalUpload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(up).toMatchObject({ checklistItemId: bankId, taskId });
    expect((await db().document.findUniqueOrThrow({ where: { id: up.documentId } })).taskId).toBe(taskId);
    await expect(linkPortalUpload(actorOf(w.s1), uploadId, bankId)).rejects.toThrow(/already linked/);
    expect(await db().auditLog.count({ where: { entityType: "PortalUpload", entityId: uploadId, action: "LINK" } })).toBe(1);
    // Confirming on the task then marks the upload confirmed (4.2 behaviour).
    await updateChecklistItem(actorOf(w.s1), bankId, { confirm: true });
    expect((await listPortalUploads(actorOf(w.m1))).find((r) => r.id === uploadId)!.confirmedBy).toBe(w.s1.displayName);
  });
});

describe("template-based draft replies (D-85)", () => {
  let noticeId: string;
  it("pre-fills from the register and lists the task's documents as enclosures", async () => {
    const n = await createNotice(actorOf(w.m1), { clientId: w.c1.id, authority: "INCOME_TAX", section: "143(2)", ayOrPeriod: "AY 2025-26", referenceNo: "ITBA/AST/S/143(2)/2026-27/1061234567(1)", noticeDate: "2026-10-01", receivedDate: "2026-10-02", noticeType: "Scrutiny notice", summary: "Details of cash deposits during demonetisation-like period", assigneeId: w.s1.id });
    noticeId = n.id;
    const task = (await db().notice.findUniqueOrThrow({ where: { id: noticeId } })).taskId!;
    await fileGeneratedDocument({ clientId: w.c1.id, taskId: task, name: "Bank statement FY 2024-25.pdf", buffer: Buffer.from("%PDF-1.4 x") });
    const ctx = await noticeReplyContext(actorOf(w.m1), noticeId);
    expect(ctx.prefill).toMatchObject({ noticeReference: "ITBA/AST/S/143(2)/2026-27/1061234567(1) u/s 143(2)", noticeDate: "01-Oct-2026", period: "AY 2025-26", matterRequested: "Details of cash deposits during demonetisation-like period" });
    expect(ctx.prefill.enclosures).toContain("1. Bank statement FY 2024-25.pdf");
    expect(ctx.templates.find((t) => t.code === "NOTICE_REPLY_INCOME_TAX")).toMatchObject({ approved: false });
    expect(ctx.defaultCode).toBeNull();
    await expect(noticeReplyContext(actorOf(w.m2), noticeId)).rejects.toThrow(/access/);
  });

  it("needs an approved template and the submissions; files a confidential Word draft on the notice's task", async () => {
    await expect(draftNoticeReply(actorOf(w.m1), noticeId, { code: "NOTICE_REPLY_INCOME_TAX", extra: { submissions: "Cash deposits are from recorded sales." } })).rejects.toThrow(/approved version/);
    const v = await db().templateVersion.findFirstOrThrow({ where: { template: { code: "NOTICE_REPLY_INCOME_TAX" }, status: "DRAFT" } });
    await approveVersion(actorOf(w.partner), v.id);
    expect((await noticeReplyContext(actorOf(w.m1), noticeId)).defaultCode).toBe("NOTICE_REPLY_INCOME_TAX");
    await expect(draftNoticeReply(actorOf(w.m1), noticeId, { code: "NOTICE_REPLY_INCOME_TAX", extra: { submissions: "  " } })).rejects.toThrow(/submissions/);
    await expect(draftNoticeReply(actorOf(w.m1), noticeId, { code: "ENGAGEMENT_LETTER_AUDIT", extra: { submissions: "x" } })).rejects.toThrow(/notice-reply template/);
    const ctx = await noticeReplyContext(actorOf(w.m1), noticeId);
    const out = await draftNoticeReply(actorOf(w.m1), noticeId, { code: "NOTICE_REPLY_INCOME_TAX", extra: { ...ctx.prefill, submissions: "The deposits are out of recorded cash sales; the cash book is enclosed." } });
    expect(out.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(out.missing).toEqual(expect.arrayContaining(["extra.officerDesignation", "extra.officeAddress"]));
    const doc = await db().document.findUniqueOrThrow({ where: { id: out.documentId! } });
    expect(doc).toMatchObject({ kind: "NOTICE_REPLY", confidentiality: "NOTICE", sharedWithClient: false, taskId: (await db().notice.findUniqueOrThrow({ where: { id: noticeId } })).taskId });
    expect(doc.name).toMatch(/^Draft reply u-s 143\(2\) AY 2025-26\.docx$/);
    expect(await db().auditLog.count({ where: { entityType: "Notice", entityId: noticeId, action: "DRAFT_REPLY" } })).toBe(1);
  });
});
