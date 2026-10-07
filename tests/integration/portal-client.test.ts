import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeClient } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst } from "@/server/lib/dates";
import { gstinCheckChar } from "@/server/domain/gstin";
import type { PortalActor } from "@/server/permissions/actor";
import { portalBilling, portalDashboard, portalDocuments, portalFilings, portalRequests, plainStatus } from "@/server/services/portal/service";
import {
  portalUpload, portalDownload, portalInvoicePdf, requestClientApproval, withdrawApprovalRequest, approvalsForTask, portalApprovals, decideClientApproval,
  portalAcceptances, portalDecideProposal, portalAcceptLetter, portalFeedbackRequests,
} from "@/server/services/portal/actions";
import { updateChecklistItem, setPending } from "@/server/services/pending/service";
import { fileGeneratedDocument } from "@/server/services/dms/service";
import { updateFirmProfile, createDraft, issueInvoice, recordReceipt } from "@/server/services/billing/service";
import { seedCrmReference } from "@/prisma/seed/phase3/crm";
import { createProposal, approveProposal, markProposalSent } from "@/server/services/crm/proposals";
import { generateLetter, markLetterIssued, acceptLetterWithSignedCopy } from "@/server/services/crm/letters";
import { recordFeedback } from "@/server/services/crm/feedback";

let w: Awaited<ReturnType<typeof buildWorld>>;
let portal: PortalActor; // linked to c1 only
let other: PortalActor; // linked to c2 only
let taskId: string;
let itemId: string;
const today = todayIst();
const gstin = (state: string, pan: string) => `${state}${pan}1Z` + gstinCheckChar(`${state}${pan}1Z`);

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  portal = w.portal;
  const pu = await db().portalUser.create({ data: { name: "C2 Owner", email: "owner@c2.example.com", clients: { create: { clientId: w.c2.id } } } });
  other = { kind: "PORTAL", portalUserId: pu.id, role: "PORTAL", clientIds: [w.c2.id], displayName: "C2 Owner" };
  await db().client.update({ where: { id: w.c1.id }, data: { stateCode: "RJ", address: "MI Road, Jaipur" } });
  const t = await db().task.create({
    data: { clientId: w.c1.id, engagementId: w.e1.id, title: "GSTR-3B", periodLabel: "Sep 2026", effectiveDueDate: addDays(today, 10), status: "IN_PROGRESS", budgetMinutes: 600 },
  });
  taskId = t.id;
  await db().taskAssignment.create({ data: { taskId, userId: w.s1.id, role: "ASSIGNEE", fromDate: addDays(today, -30) } });
  const item = await db().checklistItem.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, taskId, label: "Purchase register", status: "REQUESTED", requestedAt: addDays(today, -3), note: "INTERNAL: chase Ravi twice" } });
  itemId = item.id;
  await db().checklistItem.create({ data: { clientId: w.c1.id, taskId, label: "Not asked yet", status: "NOT_REQUESTED" } });
  await db().checklistItem.create({ data: { clientId: w.c2.id, label: "C2 bank statement", status: "REQUESTED", requestedAt: today } });
  await setPending(actorOf(w.s1), taskId, { what: "Purchase register", itemIds: [itemId] });
});

describe("document requests and uploads (P4-02)", () => {
  it("lists only requested items of the user's own clients, without the staff note", async () => {
    const r = await portalRequests(portal);
    expect(r.map((x) => x.label)).toEqual(["Purchase register"]);
    expect(r[0]).toMatchObject({ forWhat: "GSTR-3B · Sep 2026", uploaded: false });
    expect(JSON.stringify(r)).not.toMatch(/INTERNAL|twice/);
    expect((await portalRequests(other)).map((x) => x.label)).toEqual(["C2 bank statement"]);
    await expect(portalRequests(portal, { clientId: w.c2.id })).rejects.toThrow(/access/);
  });

  it("upload: filed from PORTAL and visible to the client, item received pending confirmation, inward entry, team told", async () => {
    await expect(portalUpload(other, { clientId: w.c1.id, checklistItemId: itemId }, { name: "x.pdf", data: Buffer.from("x") })).rejects.toThrow(/access/);
    await expect(portalUpload(other, { clientId: w.c2.id, checklistItemId: itemId }, { name: "x.pdf", data: Buffer.from("x") })).rejects.toThrow(/not found/);
    await expect(portalUpload(portal, { clientId: w.c1.id }, { name: "x.pdf", data: Buffer.from("x") })).rejects.toThrow(/what the document is/);
    const r = await portalUpload(portal, { clientId: w.c1.id, checklistItemId: itemId }, { name: "purchases-sep.csv", data: Buffer.from("date,amount\n2026-09-01,100\n") });
    const doc = await db().document.findUniqueOrThrow({ where: { id: r.documentId }, include: { versions: true } });
    expect(doc).toMatchObject({ sourceType: "PORTAL", sharedWithClient: true, clientId: w.c1.id, taskId });
    expect(doc.versions[0]!.uploadedByPortalUserId).toBe(portal.portalUserId);
    expect(await db().checklistItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: "RECEIVED", receivedPendingConfirm: true });
    expect(await db().inwardOutward.findFirstOrThrow({ where: { portalUploadId: r.uploadId } })).toMatchObject({ direction: "IN", clientId: w.c1.id, date: today });
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "PORTAL_UPLOAD" } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityType: "PortalUpload", actorType: "PORTAL", actorPortalUserId: portal.portalUserId } })).toBe(1);
    // Still pending until staff confirm (D-08); the client sees "uploaded, being checked".
    expect((await db().task.findUniqueOrThrow({ where: { id: taskId } })).pendingFromClient).toBe(true);
    expect((await portalRequests(portal))[0]).toMatchObject({ uploaded: true });
  });

  it("staff confirmation marks the upload confirmed and resumes the task", async () => {
    await updateChecklistItem(actorOf(w.s1), itemId, { confirm: true });
    expect(await db().portalUpload.findFirstOrThrow({ where: { checklistItemId: itemId } })).toMatchObject({ confirmedById: w.s1.id });
    expect((await db().task.findUniqueOrThrow({ where: { id: taskId } })).pendingFromClient).toBe(false);
    expect(await portalRequests(portal)).toEqual([]);
    await expect(portalUpload(portal, { clientId: w.c1.id, checklistItemId: itemId }, { name: "again.pdf", data: Buffer.from("x") })).rejects.toThrow(/no longer requested/);
  });

  it("other documents can be sent without a request", async () => {
    const r = await portalUpload(portal, { clientId: w.c1.id, description: "Rent agreement" }, { name: "rent.pdf", data: Buffer.from("%PDF-1.4 rent") });
    expect(await db().inwardOutward.findFirstOrThrow({ where: { portalUploadId: r.uploadId } })).toMatchObject({ documentDesc: "Portal upload: Rent agreement (rent.pdf)" });
  });
});

describe("downloads", () => {
  it("shows shared documents and own uploads only; unshared is refused; downloads are audited", async () => {
    const internal = await fileGeneratedDocument({ clientId: w.c1.id, name: "working-paper.txt", buffer: Buffer.from("internal") });
    const shared = await fileGeneratedDocument({ clientId: w.c1.id, name: "GSTR-3B Sep.pdf", buffer: Buffer.from("%PDF-1.4 return") });
    await db().document.update({ where: { id: shared.id }, data: { sharedWithClient: true } });
    const names = (await portalDocuments(portal)).map((d) => d.name);
    expect(names).toContain("GSTR-3B Sep.pdf");
    expect(names).toContain("purchases-sep.csv");
    expect(names).not.toContain("working-paper.txt");
    expect(await portalDocuments(other)).toEqual([]);
    await expect(portalDownload(portal, internal.id)).rejects.toThrow();
    await expect(portalDownload(other, shared.id)).rejects.toThrow();
    const f = await portalDownload(portal, shared.id);
    expect(f.data.toString()).toBe("%PDF-1.4 return");
    expect(await db().auditLog.count({ where: { entityType: "Document", entityId: shared.id, action: "DOWNLOAD", actorType: "PORTAL" } })).toBe(1);
  });
});

describe("filings in plain words", () => {
  it("never says 'under review' or names staff; filed shows the date and acknowledgment, ack file only if shared", async () => {
    expect(plainStatus({ status: "UNDER_REVIEW", effectiveDueDate: addDays(today, 3), filedDate: null, pendingFromClient: false }, today).text).toMatch(/^In progress/);
    expect(plainStatus({ status: "IN_PROGRESS", effectiveDueDate: addDays(today, -1), filedDate: null, pendingFromClient: false }, today).text).toMatch(/^Overdue/);
    expect(plainStatus({ status: "PENDING_FROM_CLIENT", effectiveDueDate: addDays(today, 3), filedDate: null, pendingFromClient: true }, today).text).toBe("Waiting for your documents");
    const filed = await db().task.create({ data: { clientId: w.c1.id, title: "GSTR-1", periodLabel: "Aug 2026", effectiveDueDate: addDays(today, -20), status: "FILED", filedDate: addDays(today, -22) } });
    const ackDoc = await fileGeneratedDocument({ clientId: w.c1.id, name: "ack.pdf", buffer: Buffer.from("%PDF-1.4 ack") });
    await db().acknowledgment.create({ data: { taskId: filed.id, ackType: "ARN", number: "AA0809260012345", date: addDays(today, -22), documentId: ackDoc.id } });
    let f = await portalFilings(portal);
    const row = f.recent.find((r) => r.id === filed.id)!;
    expect(row.status.text).toMatch(/^Filed on/);
    expect(row.acks).toEqual([{ type: "ARN", number: "AA0809260012345", date: addDays(today, -22), documentId: null }]);
    await db().document.update({ where: { id: ackDoc.id }, data: { sharedWithClient: true } });
    f = await portalFilings(portal);
    expect(f.recent.find((r) => r.id === filed.id)!.acks[0]!.documentId).toBe(ackDoc.id);
    expect(f.upcoming.map((r) => r.title)).toContain("GSTR-3B");
    expect(JSON.stringify(f)).not.toMatch(/budgetMinutes|assignments|underReview|Under review/);
    expect((await portalFilings(other)).upcoming).toEqual([]);
  });
});

describe("invoices and receipts", () => {
  let invoiceId: string;
  let draftId: string;
  it("shows issued invoices with balance and receipts, never drafts; bank/UPI from the firm profile", async () => {
    await updateFirmProfile(actorOf(w.pa), { name: "QEPEX India", address: "C-Scheme, Jaipur", stateCode: "RJ", pan: "AAFFQ1234K", gstin: gstin("08", "AAFFQ1234K"), bankName: "HDFC Bank", bankAccount: "50200012345678", bankIfsc: "HDFC0000123", upiId: "qepex@hdfcbank" });
    const fee = { kind: "FEE" as const, description: "Professional fees", quantityMilli: 1000, ratePaise: 10_000_00 };
    const inv = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, -40), lines: [fee] });
    await issueInvoice(actorOf(w.pa), inv.id, { date: addDays(today, -40) });
    invoiceId = inv.id;
    draftId = (await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: today, lines: [fee] })).id;
    await recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, -5), amountPaise: 5_000_00, mode: "UPI", reference: "UTR123", allocations: [{ invoiceId, amountPaise: 5_000_00 }] });
    const b = await portalBilling(portal);
    expect(b.invoices).toHaveLength(1);
    expect(b.invoices[0]).toMatchObject({ status: "Part paid", totalPaise: 11_800_00, balancePaise: 6_800_00 });
    expect(b.outstandingPaise).toBe(6_800_00);
    expect(b.receipts).toEqual([expect.objectContaining({ amountPaise: 5_000_00, mode: "UPI", reference: "UTR123" })]);
    expect(b.payTo).toMatchObject({ bankAccount: "50200012345678", upiId: "qepex@hdfcbank" });
    expect((await portalBilling(other)).invoices).toEqual([]);
  });

  it("PDF for an issued invoice only, own clients only; download audited", async () => {
    await expect(portalInvoicePdf(portal, draftId)).rejects.toThrow(/not found/);
    await expect(portalInvoicePdf(other, invoiceId)).rejects.toThrow(/not found/);
    const pdf = await portalInvoicePdf(portal, invoiceId);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(await db().auditLog.count({ where: { entityType: "Invoice", entityId: invoiceId, action: "DOWNLOAD", actorType: "PORTAL" } })).toBe(1);
  });
});

describe("client approvals (D-80)", () => {
  let reqId: string;
  it("staff on the task ask for approval; the document is shared; a client without a portal user cannot be asked", async () => {
    const draft = await fileGeneratedDocument({ clientId: w.c1.id, taskId, name: "GSTR-3B draft.pdf", buffer: Buffer.from("%PDF-1.4 draft") });
    await expect(requestClientApproval(actorOf(w.s2), taskId, { title: "Approve draft GSTR-3B" })).rejects.toThrow();
    await expect(requestClientApproval(actorOf(w.hr), taskId, { title: "Approve draft GSTR-3B" })).rejects.toThrow();
    const r = await requestClientApproval(actorOf(w.s1), taskId, { title: "Approve draft GSTR-3B", note: "Please check the ITC figure.", documentId: draft.id });
    reqId = r.id;
    expect((await db().document.findUniqueOrThrow({ where: { id: draft.id } })).sharedWithClient).toBe(true);
    const lonely = await makeClient();
    const t2 = await db().task.create({ data: { clientId: lonely.id, title: "ITR" } });
    await expect(requestClientApproval(actorOf(w.partner), t2.id, { title: "Approve ITR" })).rejects.toThrow(/no active portal user/);
    expect((await portalApprovals(portal)).map((a) => a.title)).toEqual(["Approve draft GSTR-3B"]);
    expect(await portalApprovals(other)).toEqual([]);
  });

  it("not approving needs a reason; the decision keeps time and IP; it can be made once; staff see it", async () => {
    await expect(decideClientApproval(other, reqId, { decision: "APPROVED" })).rejects.toThrow(/not found/);
    await expect(decideClientApproval(portal, reqId, { decision: "REJECTED" })).rejects.toThrow(/what needs to change/);
    await decideClientApproval(portal, reqId, { decision: "APPROVED", comment: "OK to file" }, { ip: "203.0.113.7" });
    await expect(decideClientApproval(portal, reqId, { decision: "REJECTED", comment: "changed my mind" })).rejects.toThrow(/already/);
    const [row] = await approvalsForTask(actorOf(w.s1), taskId);
    expect(row).toMatchObject({ status: "DECIDED", decision: { decision: "APPROVED", comment: "OK to file", ip: "203.0.113.7", byName: "CFO" } });
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "CLIENT_APPROVAL" } })).toBe(1);
    await expect(withdrawApprovalRequest(actorOf(w.s1), reqId)).rejects.toThrow(/open request/);
  });
});

describe("proposals and engagement letters (Q-23)", () => {
  it("client accepts a sent proposal and the letter in the portal; staff then set up the engagement without a signed copy", async () => {
    await seedCrmReference(db());
    const tpl = await db().serviceTemplate.findFirstOrThrow({ where: { name: "Tax audit" } });
    const p = await createProposal(actorOf(w.m1), { clientId: w.c1.id, serviceTemplateId: tpl.id });
    await expect(portalDecideProposal(portal, p.id, "ACCEPTED")).rejects.toThrow(/not waiting/);
    await approveProposal(actorOf(w.partner), p.id);
    await markProposalSent(actorOf(w.m1), p.id);
    expect((await portalAcceptances(portal)).proposals.map((x) => x.id)).toEqual([p.id]);
    expect(JSON.stringify((await portalAcceptances(portal)).proposals)).not.toMatch(/budgetMinutes/);
    await expect(portalDecideProposal(other, p.id, "ACCEPTED")).rejects.toThrow(/not found/);
    await portalDecideProposal(portal, p.id, "ACCEPTED", { ip: "203.0.113.8" });
    expect((await db().proposal.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ACCEPTED");

    const { letter } = await generateLetter(actorOf(w.m1), p.id);
    await expect(portalAcceptLetter(portal, letter.id)).rejects.toThrow(/not waiting/); // still a draft
    await markLetterIssued(actorOf(w.m1), letter.id);
    await expect(acceptLetterWithSignedCopy(actorOf(w.m1), letter.id, null)).rejects.toThrow(/signed copy/);
    await portalAcceptLetter(portal, letter.id, { ip: "203.0.113.9" });
    expect(await db().engagementLetter.findUniqueOrThrow({ where: { id: letter.id } })).toMatchObject({ status: "ACCEPTED", acceptedByPortalUserId: portal.portalUserId, acceptedIp: "203.0.113.9" });
    expect(await db().notification.count({ where: { kind: "LETTER_ACCEPTED" } })).toBeGreaterThan(0);
    const r = await acceptLetterWithSignedCopy(actorOf(w.m1), letter.id, null);
    expect(r.newClient).toBe(false);
    expect(await db().engagement.findUniqueOrThrow({ where: { id: r.engagementId } })).toMatchObject({ clientId: w.c1.id, engagementLetterId: letter.id });
    expect((await db().engagementLetter.findUniqueOrThrow({ where: { id: letter.id } })).status).toBe("ACCEPTED");
    await expect(acceptLetterWithSignedCopy(actorOf(w.m1), letter.id, null)).rejects.toThrow(/already set up/);
  });

  it("an expired proposal cannot be accepted from the portal", async () => {
    const tpl = await db().serviceTemplate.findFirstOrThrow({ where: { name: "ROC annual filing" } });
    const p = await createProposal(actorOf(w.m1), { clientId: w.c1.id, serviceTemplateId: tpl.id, validUntil: addDays(today, 1) });
    await approveProposal(actorOf(w.partner), p.id);
    await markProposalSent(actorOf(w.m1), p.id);
    await db().proposal.update({ where: { id: p.id }, data: { validUntil: addDays(today, -1) } });
    await expect(portalDecideProposal(portal, p.id, "ACCEPTED")).rejects.toThrow(/expired/);
    await portalDecideProposal(portal, p.id, "REJECTED");
  });
});

describe("feedback and dashboard", () => {
  it("the client answers feedback once, for their own client only", async () => {
    const f = await db().feedback.create({ data: { engagementId: w.e1.id, clientId: w.c1.id } });
    expect((await portalFeedbackRequests(portal)).map((x) => x.id)).toEqual([f.id]);
    await expect(recordFeedback(other, f.id, { rating: 5 })).rejects.toThrow(/not found/);
    await recordFeedback(portal, f.id, { rating: 4, comment: "Prompt service" });
    expect(await db().feedback.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ rating: 4, portalUserId: portal.portalUserId });
    await expect(recordFeedback(portal, f.id, { rating: 1 })).rejects.toThrow(/already recorded/);
    expect(await portalFeedbackRequests(portal)).toEqual([]);
  });

  it("dashboard counts are the user's own and carry no internal fields", async () => {
    const d = await portalDashboard(portal);
    expect(d).toMatchObject({ toUpload: 0, toApprove: 0, outstandingPaise: 6_800_00, feedbackRequested: 0 });
    expect(d.dueSoon.map((x) => x.title)).toContain("GSTR-3B");
    expect(JSON.stringify(d)).not.toMatch(/[mM]inutes|INTERNAL|assignments|displayName/);
    const o = await portalDashboard(other);
    expect(o).toMatchObject({ toUpload: 1, outstandingPaise: 0 });
  });
});
