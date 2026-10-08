import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor, PortalActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";
import { notifyUsers } from "../notifications/service";
import { fileGeneratedDocument, documentVersionForDownload } from "../dms/service";
import { loadTask } from "../tasks/service";
import { invoicePdf } from "../billing/pdf";
import { systemActor } from "../../permissions/actor";
import { assertPortalClient } from "./service";
import { suggestItem, suggestTags } from "../../helpers/upload-tagging";
import { extractText } from "../dms/text";

/**
 * What a portal user can do (P4-02): upload requested documents, decide approvals, accept proposals and
 * engagement letters (Q-23: a logged-in click with time and IP), answer feedback, download. Every write is
 * audited with the portal actor; uploads and downloads are logged too.
 */

/** People at the firm who should hear about a client action: the task's team, else the client's Manager and Partner. */
export async function firmPeopleFor(clientId: string, taskId?: string | null): Promise<string[]> {
  const today = todayIst();
  if (taskId) {
    const a = await db().taskAssignment.findMany({ where: { taskId, fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }], user: { active: true } }, select: { userId: true } });
    if (a.length) return [...new Set(a.map((x) => x.userId))];
  }
  const c = await db().client.findUnique({ where: { id: clientId }, select: { managerId: true, partnerId: true } });
  return [c?.managerId, c?.partnerId].filter((x): x is string => !!x);
}

// ---------------------------------------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------------------------------------

const uploadInput = z.object({
  clientId: z.string().min(1),
  checklistItemId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  description: z.string().trim().max(300).default(""),
});

/**
 * A client upload: filed in the DMS (source PORTAL, visible back to the client), the requested item marked
 * Received pending staff confirmation, an inward-register entry made, and the team told. Nothing counts as
 * received until staff confirm it (spec 12; D-08 keeps the task pending until then).
 */
export async function portalUpload(actor: PortalActor, input: z.input<typeof uploadInput>, file: { name: string; data: Buffer }) {
  authorize(actor, "portal.use");
  const d = parse(uploadInput, input);
  assertPortalClient(actor, d.clientId);
  if (!file.data.length) throw new DomainError("VALIDATION", "Choose a file.", { file: "Required" });
  const item = d.checklistItemId ? await db().checklistItem.findUnique({ where: { id: d.checklistItemId } }) : null;
  if (d.checklistItemId && (!item || item.clientId !== d.clientId)) throw notFound("Requested document");
  if (item && item.status !== "REQUESTED" && !(item.status === "RECEIVED" && item.receivedPendingConfirm)) throw ruleViolation("This item is no longer requested.");
  if (!item && !d.description) throw new DomainError("VALIDATION", "Say what the document is.", { description: "Required" });
  const task = item?.taskId ? await db().task.findUnique({ where: { id: item.taskId }, select: { id: true, title: true, engagementId: true } }) : null;
  // Keyword tagging (D-85): dictionary tags always; for an unrequested upload, the open request it most likely answers.
  const sample = safeText(file.name, file.data);
  const tags = ["from-client", ...suggestTags(file.name, `${d.description} ${sample}`)];
  const suggestion = item ? null : suggestItem(`${file.name} ${d.description}`, sample, await openRequests(d.clientId));
  const doc = await fileGeneratedDocument({
    clientId: d.clientId, engagementId: task?.engagementId ?? item?.engagementId ?? null, taskId: task?.id ?? null,
    name: file.name, buffer: file.data, kind: "CLIENT_DOCUMENT", sourceType: "PORTAL", tags,
    note: item ? `For: ${item.label}` : d.description, actor,
  });
  const today = todayIst();
  const what = item ? item.label : d.description;
  const upload = await transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { sharedWithClient: true } });
    await tx.documentVersion.updateMany({ where: { documentId: doc.id }, data: { uploadedByPortalUserId: actor.portalUserId } });
    const up = await tx.portalUpload.create({
      data: { portalUserId: actor.portalUserId, clientId: d.clientId, engagementId: task?.engagementId ?? null, taskId: task?.id ?? null, checklistItemId: item?.id ?? null, documentId: doc.id, autoTag: suggestion ? `ITEM:${suggestion.id}` : null },
    });
    if (item) {
      await tx.checklistItem.update({ where: { id: item.id }, data: { status: "RECEIVED", receivedAt: item.receivedAt ?? today, receivedPendingConfirm: true, confirmedById: null, confirmedAt: null } });
      await writeAudit(tx, actor, { entityType: "ChecklistItem", entityId: item.id, action: "PORTAL_UPLOAD", before: { status: item.status }, after: { status: "RECEIVED", pendingConfirm: true, documentId: doc.id } });
    }
    const io = await tx.inwardOutward.create({
      data: { clientId: d.clientId, direction: "IN", documentDesc: `Portal upload: ${what} (${file.name})`, date: today, currentLocation: "Document store (portal)", portalUploadId: up.id },
    });
    await writeAudit(tx, actor, { entityType: "PortalUpload", entityId: up.id, action: "CREATE", after: { documentId: doc.id, checklistItemId: item?.id ?? null, inwardId: io.id, file: file.name, bytes: file.data.length } });
    return up;
  });
  const client = await db().client.findUniqueOrThrow({ where: { id: d.clientId }, select: { name: true } });
  await notifyUsers(await firmPeopleFor(d.clientId, task?.id), {
    kind: "PORTAL_UPLOAD", title: `${client.name} uploaded: ${what}`,
    body: task ? `${task.title} — confirm it on the task.` : suggestion ? `Looks like: ${suggestion.label}. Link it under Client uploads.` : "Check it under Client uploads.",
    link: task ? `/tasks/${task.id}` : "/portal-uploads", entityType: "PortalUpload", entityId: upload.id,
  });
  return { uploadId: upload.id, documentId: doc.id };
}

/** Open requested items of a client (not yet uploaded), as tagging candidates. */
export async function openRequests(clientId: string) {
  return db().checklistItem.findMany({ where: { clientId, status: "REQUESTED" }, select: { id: true, label: true, keywords: true } });
}

/** Text for tagging; a file the extractor cannot read simply contributes nothing. */
function safeText(name: string, data: Buffer) {
  try {
    return extractText(name, data).slice(0, 5000);
  } catch {
    return "";
  }
}

/** Download a shared document (or the client's own upload). Audited as DOWNLOAD by the DMS. */
export function portalDownload(actor: PortalActor, documentId: string) {
  authorize(actor, "portal.use");
  return documentVersionForDownload(actor, documentId);
}

/** An issued invoice as PDF. Drafts never leave the firm. */
export async function portalInvoicePdf(actor: PortalActor, invoiceId: string) {
  authorize(actor, "billing.view");
  const inv = await db().invoice.findUnique({ where: { id: invoiceId }, select: { id: true, clientId: true, status: true, number: true } });
  if (!inv || !actor.clientIds.includes(inv.clientId) || inv.status === "DRAFT" || !inv.number) throw notFound("Invoice");
  const pdf = await invoicePdf(systemActor(), inv.id);
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Invoice", entityId: inv.id, action: "DOWNLOAD", after: { via: "portal" } }));
  return pdf;
}

// ---------------------------------------------------------------------------------------------------------
// Client approvals (D-80)
// ---------------------------------------------------------------------------------------------------------

const requestInput = z.object({
  title: z.string().trim().min(3, "Say what to approve").max(200),
  note: z.string().trim().max(2000).default(""),
  documentId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
});

/** Staff ask the client to approve (e.g. a draft return). The attached document is shared with the client. */
export async function requestClientApproval(actor: Actor, taskId: string, input: z.input<typeof requestInput>) {
  if (actor.kind !== "USER") throw forbidden();
  authorize(actor, "portal.share");
  const t = await loadTask(actor, taskId, "task.work");
  const d = parse(requestInput, input);
  if (["FILED", "FILED_LATE", "NOT_APPLICABLE"].includes(t.status)) throw ruleViolation("This task is closed.");
  const doc = d.documentId ? await db().document.findUnique({ where: { id: d.documentId } }) : null;
  if (d.documentId && (!doc || doc.clientId !== t.clientId || doc.archivedAt)) throw new DomainError("VALIDATION", "Choose a document of this client.", { documentId: "Not available" });
  if (doc && !["NORMAL", "FINANCIALS", "NOTICE"].includes(doc.confidentiality)) throw ruleViolation("This document is too confidential to share in the portal.");
  if (!(await db().portalUserClient.count({ where: { clientId: t.clientId, portalUser: { active: true } } }))) throw ruleViolation("This client has no active portal user yet. Invite one first.");
  return transaction(async (tx) => {
    if (doc && !doc.sharedWithClient) {
      await tx.document.update({ where: { id: doc.id }, data: { sharedWithClient: true, updatedById: actor.userId } });
      await writeAudit(tx, actor, { entityType: "Document", entityId: doc.id, action: "SHARE", before: { sharedWithClient: false }, after: { sharedWithClient: true }, reason: "For client approval" });
    }
    const r = await tx.clientApprovalRequest.create({
      data: { clientId: t.clientId, taskId: t.id, documentId: doc?.id ?? null, title: d.title, note: d.note, requestedById: actor.userId, createdById: actor.userId, updatedById: actor.userId },
    });
    await writeAudit(tx, actor, { entityType: "ClientApprovalRequest", entityId: r.id, action: "CREATE", after: r });
    return r;
  });
}

export async function withdrawApprovalRequest(actor: Actor, requestId: string) {
  if (actor.kind !== "USER") throw forbidden();
  const r = await db().clientApprovalRequest.findUnique({ where: { id: requestId } });
  if (!r) throw notFound("Approval request");
  await loadTask(actor, r.taskId, "task.work");
  if (r.status !== "OPEN") throw ruleViolation("Only an open request can be withdrawn.");
  await transaction(async (tx) => {
    await tx.clientApprovalRequest.update({ where: { id: r.id }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "ClientApprovalRequest", entityId: r.id, action: "WITHDRAW", before: { status: "OPEN" }, after: { status: "WITHDRAWN" } });
  });
}

/** Requests and decisions on a task, for the staff task page. */
export async function approvalsForTask(actor: Actor, taskId: string) {
  await loadTask(actor, taskId);
  const [requests, decisions] = await Promise.all([
    db().clientApprovalRequest.findMany({ where: { taskId }, orderBy: { requestedAt: "desc" } }),
    db().clientApproval.findMany({ where: { taskId }, orderBy: { decidedAt: "desc" } }),
  ]);
  const portalNames = new Map((await db().portalUser.findMany({ where: { id: { in: decisions.map((d) => d.portalUserId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const byId = new Map(decisions.map((d) => [d.id, { ...d, byName: portalNames.get(d.portalUserId) ?? "Client" }]));
  return requests.map((r) => ({ ...r, decision: r.approvalId ? (byId.get(r.approvalId) ?? null) : null }));
}

/** Open requests for the portal, with the shared document to look at. */
export async function portalApprovals(actor: PortalActor, opts: { clientId?: string | null; includeDecided?: boolean } = {}) {
  authorize(actor, "portal.use");
  const ids = opts.clientId ? (assertPortalClient(actor, opts.clientId), [opts.clientId]) : actor.clientIds;
  const rows = await db().clientApprovalRequest.findMany({
    where: { clientId: { in: ids }, status: opts.includeDecided ? { in: ["OPEN", "DECIDED"] } : "OPEN" },
    orderBy: { requestedAt: "desc" },
    take: 100,
  });
  const decisions = new Map((await db().clientApproval.findMany({ where: { id: { in: rows.map((r) => r.approvalId).filter((x): x is string => !!x) } } })).map((d) => [d.id, d]));
  const tasks = new Map((await db().task.findMany({ where: { id: { in: rows.map((r) => r.taskId) } }, select: { id: true, title: true, periodLabel: true } })).map((t) => [t.id, t]));
  return rows.map((r) => {
    const t = tasks.get(r.taskId);
    const d = r.approvalId ? decisions.get(r.approvalId) : undefined;
    return {
      id: r.id, clientId: r.clientId, title: r.title, note: r.note, documentId: r.documentId, requestedAt: r.requestedAt, status: r.status,
      forWhat: t ? [t.title, t.periodLabel].filter(Boolean).join(" · ") : "", decision: d ? { decision: d.decision, comment: d.comment, decidedAt: d.decidedAt } : null,
    };
  });
}

const decideInput = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().max(2000).default("") });

/** The client's decision, with time and IP. A rejection needs a reason so the team knows what to change. */
export async function decideClientApproval(actor: PortalActor, requestId: string, input: z.input<typeof decideInput>, meta: { ip?: string } = {}) {
  authorize(actor, "portal.use");
  const d = parse(decideInput, input);
  const r = await db().clientApprovalRequest.findUnique({ where: { id: requestId } });
  if (!r || !actor.clientIds.includes(r.clientId)) throw notFound("Approval request");
  if (r.status !== "OPEN") throw ruleViolation("This request is already decided or withdrawn.");
  if (d.decision === "REJECTED" && d.comment.length < 3) throw new DomainError("VALIDATION", "Tell the firm what needs to change.", { comment: "Required when not approving" });
  const approval = await transaction(async (tx) => {
    const done = await tx.clientApprovalRequest.updateMany({ where: { id: r.id, status: "OPEN" }, data: { status: "DECIDED" } });
    if (!done.count) throw ruleViolation("This request is already decided or withdrawn.");
    const a = await tx.clientApproval.create({ data: { taskId: r.taskId, portalUserId: actor.portalUserId, decision: d.decision, comment: d.comment, documentId: r.documentId, ip: meta.ip ?? actor.ip ?? null } });
    await tx.clientApprovalRequest.update({ where: { id: r.id }, data: { approvalId: a.id } });
    await writeAudit(tx, actor, { entityType: "ClientApproval", entityId: a.id, action: d.decision, after: { requestId: r.id, comment: d.comment, ip: a.ip } });
    return a;
  });
  const client = await db().client.findUniqueOrThrow({ where: { id: r.clientId }, select: { name: true } });
  await notifyUsers([...new Set([r.requestedById, ...(await firmPeopleFor(r.clientId, r.taskId))])], {
    kind: "CLIENT_APPROVAL", priority: d.decision === "REJECTED" ? "HIGH" : "NORMAL",
    title: `${client.name} ${d.decision === "APPROVED" ? "approved" : "did not approve"}: ${r.title}`, body: d.comment.slice(0, 200),
    link: `/tasks/${r.taskId}`, entityType: "ClientApproval", entityId: approval.id,
  });
  return approval;
}

// ---------------------------------------------------------------------------------------------------------
// Proposals and engagement letters (Q-23)
// ---------------------------------------------------------------------------------------------------------

/** Proposals sent to the client and letters issued to it, waiting for the client's answer. */
export async function portalAcceptances(actor: PortalActor, opts: { clientId?: string | null } = {}) {
  authorize(actor, "portal.use");
  const ids = opts.clientId ? (assertPortalClient(actor, opts.clientId), [opts.clientId]) : actor.clientIds;
  const [proposals, letters] = await Promise.all([
    db().proposal.findMany({
      where: { clientId: { in: ids }, status: { in: ["SENT", "ACCEPTED", "REJECTED"] } },
      select: { id: true, clientId: true, title: true, scope: true, deliverables: true, timelines: true, feeBasis: true, feePaise: true, ratePaise: true, oopTerms: true, validUntil: true, status: true, decidedAt: true },
      orderBy: { updatedAt: "desc" }, take: 50,
    }),
    db().engagementLetter.findMany({
      where: { clientId: { in: ids }, status: { in: ["ISSUED", "ACCEPTED", "SIGNED_UPLOADED"] } },
      select: { id: true, clientId: true, body: true, status: true, issuedAt: true, acceptedAt: true, acceptedByPortalUserId: true },
      orderBy: { updatedAt: "desc" }, take: 50,
    }),
  ]);
  return { proposals, letters };
}

/** A sent proposal accepted or declined from the portal; the owner is told. Expired proposals cannot be accepted. */
export async function portalDecideProposal(actor: PortalActor, proposalId: string, decision: "ACCEPTED" | "REJECTED", meta: { ip?: string } = {}) {
  authorize(actor, "portal.use");
  const p = await db().proposal.findUnique({ where: { id: proposalId } });
  if (!p || !p.clientId || !actor.clientIds.includes(p.clientId)) throw notFound("Proposal");
  if (p.status !== "SENT") throw ruleViolation("This proposal is not waiting for your answer.");
  if (decision === "ACCEPTED" && p.validUntil && p.validUntil < todayIst()) throw ruleViolation("This proposal has expired. Ask the firm for a fresh one.");
  await transaction(async (tx) => {
    const done = await tx.proposal.updateMany({ where: { id: p.id, status: "SENT" }, data: { status: decision, decidedAt: new Date() } });
    if (!done.count) throw ruleViolation("This proposal is not waiting for your answer.");
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: p.id, action: decision, before: { status: "SENT" }, after: { status: decision, via: "portal", ip: meta.ip ?? actor.ip ?? null } });
  });
  const client = await db().client.findUniqueOrThrow({ where: { id: p.clientId }, select: { name: true } });
  await notifyUsers([...new Set([p.createdById, ...(await firmPeopleFor(p.clientId))].filter((x): x is string => !!x))], {
    kind: "PROPOSAL_DECIDED", priority: "HIGH", title: `${client.name} ${decision === "ACCEPTED" ? "accepted" : "declined"} the proposal: ${p.title}`,
    link: `/crm/proposals/${p.id}`, entityType: "Proposal", entityId: p.id,
  });
}

/**
 * Q-23: a logged-in click accepts an issued letter (time, IP, who). Staff then set up the engagement from
 * the letter page; a signed copy stays optional.
 */
export async function portalAcceptLetter(actor: PortalActor, letterId: string, meta: { ip?: string } = {}) {
  authorize(actor, "portal.use");
  const l = await db().engagementLetter.findUnique({ where: { id: letterId } });
  if (!l || !actor.clientIds.includes(l.clientId)) throw notFound("Engagement letter");
  if (l.status !== "ISSUED") throw ruleViolation("This letter is not waiting for acceptance.");
  const ip = meta.ip ?? actor.ip ?? null;
  await transaction(async (tx) => {
    const done = await tx.engagementLetter.updateMany({ where: { id: l.id, status: "ISSUED" }, data: { status: "ACCEPTED", acceptedByPortalUserId: actor.portalUserId, acceptedAt: new Date(), acceptedIp: ip } });
    if (!done.count) throw ruleViolation("This letter is not waiting for acceptance.");
    await writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: l.id, action: "ACCEPTED", before: { status: "ISSUED" }, after: { status: "ACCEPTED", via: "portal", ip } });
  });
  const client = await db().client.findUniqueOrThrow({ where: { id: l.clientId }, select: { name: true } });
  await notifyUsers([...new Set([l.createdById, ...(await firmPeopleFor(l.clientId))].filter((x): x is string => !!x))], {
    kind: "LETTER_ACCEPTED", priority: "HIGH", title: `${client.name} accepted the engagement letter`, body: "Set up the engagement from the letter page.",
    link: `/crm/letters/${l.id}`, entityType: "EngagementLetter", entityId: l.id,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Feedback (P3-15 request → answered in the portal)
// ---------------------------------------------------------------------------------------------------------

export async function portalFeedbackRequests(actor: PortalActor) {
  authorize(actor, "portal.use");
  const rows = await db().feedback.findMany({ where: { clientId: { in: actor.clientIds }, receivedAt: null }, orderBy: { requestedAt: "desc" } });
  const engs = new Map((await db().engagement.findMany({ where: { id: { in: rows.map((r) => r.engagementId) } }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  return rows.map((r) => ({ id: r.id, clientId: r.clientId, engagement: engs.get(r.engagementId) ?? "", requestedAt: r.requestedAt }));
}

/** Everything the task page's approval card needs: requests with decisions, documents to attach, portal readiness. */
export async function taskApprovalPanel(actor: Actor, taskId: string) {
  const t = await loadTask(actor, taskId);
  const [requests, documents, portalUsers] = await Promise.all([
    approvalsForTask(actor, taskId),
    db().document.findMany({ where: { clientId: t.clientId, archivedAt: null, employeeUserId: null, confidentiality: { in: ["NORMAL", "FINANCIALS", "NOTICE"] }, OR: [{ taskId }, ...(t.engagementId ? [{ engagementId: t.engagementId }] : [])] }, select: { id: true, name: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db().portalUserClient.count({ where: { clientId: t.clientId, portalUser: { active: true } } }),
  ]);
  return { requests, documents, hasPortalUser: portalUsers > 0 };
}
