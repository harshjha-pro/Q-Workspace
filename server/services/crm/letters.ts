import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, conflict, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { isIsoDate, todayIst } from "../../lib/dates";
import { CONSTITUTIONS, FEE_BASIS_LABELS, RECURRENCES, SERVICE_LINE_LABELS, type ServiceLine } from "../../domain/enums";
import { renderTemplateFor } from "../../documents/library";
import { buildPdf, type PdfBlock } from "../../documents/pdf";
import { buildDocx } from "../../documents/docx";
import { amountInWords } from "../../documents/words";
import { storeFile } from "../../lib/storage";
import { createClient, saveContact } from "../clients/service";
import { assignToEngagement, createEngagement } from "../engagements/service";
import { assertFees, assertLeadAccess, firmHeader, idOf, rupees } from "./common";
import { assertClientAccess } from "../../permissions/scopes";
import { proposalSpec } from "./templates";
import { ensureChecklistTx, runConflictCheck } from "./onboarding";

/**
 * Engagement letters (P3-10). The schema requires EngagementLetter.clientId, but a new client only
 * exists once the letter is accepted; until then the letter carries the placeholder `LEAD:<leadId>`,
 * replaced by the real client id on acceptance. Since Q-39 the lead is also kept in `leadId` (D-77).
 */
export const LEAD_PLACEHOLDER = "LEAD:";
export const isPlaceholderClient = (clientId: string) => clientId.startsWith(LEAD_PLACEHOLDER);

export const DEFAULT_LETTER = `{{today.date}}

To,
{{extra.clientName}}
{{extra.clientAddress}}

Kind attention: {{extra.contactName}}

Subject: Engagement letter — {{extra.service}}

Dear Sir / Madam,

We thank you for accepting our proposal "{{extra.proposalTitle}}". This letter sets out the terms on which {{firm.name}} will carry out the engagement.

# Scope of work
{{extra.scope}}

# Deliverables
{{extra.deliverables}}

# Timelines
{{extra.timelines}}

# Professional fees
Fee basis: {{extra.feeBasis}}
Fee: {{extra.fee}}
{{extra.gstNote}}

# Out-of-pocket expenses
{{extra.oopTerms}}

# Your responsibilities
You will provide complete and accurate information and documents in time, and the management remains responsible for the books of account and for the information provided to us.

# Acceptance
Please sign and return a copy of this letter as your acceptance of these terms.

For {{firm.name}}

Authorised signatory

Accepted on behalf of {{extra.clientName}}

Signature: ____________________     Date: ____________`;

async function assertLetterAccess(actor: Actor, letter: { proposalId: string | null; clientId: string; leadId: string | null }, cap: "crm.view" | "crm.manage") {
  assertFees(actor);
  const p = !letter.leadId && letter.proposalId ? await db().proposal.findUnique({ where: { id: letter.proposalId } }) : null;
  const leadId = letter.leadId ?? p?.leadId;
  if (leadId) return assertLeadAccess(actor, cap, leadId);
  if (!isPlaceholderClient(letter.clientId)) return void (await assertClientAccess(actor, cap, letter.clientId));
  throw forbidden();
}

async function loadLetter(actor: Actor, id: string, cap: "crm.view" | "crm.manage" = "crm.view") {
  const l = await db().engagementLetter.findUnique({ where: { id } });
  if (!l) throw notFound("Engagement letter");
  await assertLetterAccess(actor, l, cap);
  return l;
}

/** Merge values for the letter: from the proposal, the lead and (when it exists) the client. */
async function letterExtras(p: { title: string; serviceLine: string; scope: string; deliverables: string; timelines: string; feeBasis: string; feePaise: number; ratePaise: number; oopTerms: string; gstRateBp: number; clientId: string | null; leadId: string | null }) {
  const lead = p.leadId ? await db().lead.findUnique({ where: { id: p.leadId } }) : null;
  const client = p.clientId ? await db().client.findUnique({ where: { id: p.clientId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } }) : null;
  const fee = p.feeBasis === "TIME" ? `${rupees(p.ratePaise)} per hour` : `${rupees(p.feePaise)} (${amountInWords(p.feePaise)})`;
  return {
    clientName: client?.name ?? lead?.name ?? "",
    clientAddress: client?.address || " ",
    contactName: client?.contacts[0]?.name ?? lead?.contactName ?? " ",
    proposalTitle: p.title,
    service: SERVICE_LINE_LABELS[p.serviceLine as ServiceLine] ?? p.serviceLine,
    serviceLine: p.serviceLine,
    scope: p.scope || " ",
    deliverables: p.deliverables || " ",
    timelines: p.timelines || " ",
    feeBasis: FEE_BASIS_LABELS[p.feeBasis as keyof typeof FEE_BASIS_LABELS] ?? p.feeBasis,
    fee,
    gstNote: p.gstRateBp ? `GST at ${(p.gstRateBp / 100).toFixed(2).replace(/\.00$/, "")}% will be charged extra.` : "GST at the applicable rate will be charged extra.",
    oopTerms: p.oopTerms || "At actuals.",
  };
}

/** Generate the letter from an accepted proposal with the firm's template for that service line. */
export async function generateLetter(actor: Actor, proposalId: string) {
  const p = await db().proposal.findUnique({ where: { id: proposalId } });
  if (!p) throw notFound("Proposal");
  assertFees(actor);
  if (p.leadId) await assertLeadAccess(actor, "crm.manage", p.leadId);
  else if (p.clientId) await assertClientAccess(actor, "crm.manage", p.clientId);
  if (p.status !== "ACCEPTED") throw ruleViolation("Generate the letter after the client accepts the proposal.");
  const open = await db().engagementLetter.findFirst({ where: { proposalId, status: { not: "WITHDRAWN" } } });
  if (open) throw conflict("This proposal already has an engagement letter.");
  const extra = await letterExtras(p);
  // Firm templates use {{client.*}} / {{engagement.*}}; for a lead those records don't exist yet, so the
  // lead and the accepted proposal supply them.
  const lead = p.leadId ? await db().lead.findUnique({ where: { id: p.leadId } }) : null;
  const fallback = {
    client: { name: extra.clientName, address: extra.clientAddress.trim(), contactName: extra.contactName.trim(), pan: lead?.pan ?? "", contactEmail: lead?.email ?? "" },
    engagement: { name: p.title, fee: extra.fee, feeBasis: extra.feeBasis },
  };
  const r = await renderTemplateFor(`ENGAGEMENT_LETTER_${p.serviceLine}`, DEFAULT_LETTER, { clientId: p.clientId, extra, fallback });
  return transaction(async (tx) => {
    const l = await tx.engagementLetter.create({
      data: { proposalId, clientId: p.clientId ?? `${LEAD_PLACEHOLDER}${p.leadId}`, leadId: p.leadId, templateVersionId: r.templateVersionId, body: r.text, createdById: idOf(actor), updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: l.id, action: "CREATE", after: { proposalId, templateVersionId: r.templateVersionId, missing: r.missing } });
    return { letter: l, missing: r.missing };
  });
}

export async function updateLetterBody(actor: Actor, id: string, body: string) {
  const l = await loadLetter(actor, id, "crm.manage");
  if (l.status !== "DRAFT") throw ruleViolation("Only a draft letter can be edited.");
  if (body.trim().length < 50) throw new DomainError("VALIDATION", "The letter text is too short.", { body: "Letter text" });
  return transaction(async (tx) => {
    const after = await tx.engagementLetter.update({ where: { id }, data: { body, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: id, action: "UPDATE", before: { body: l.body }, after: { body } });
    return after;
  });
}

export async function markLetterIssued(actor: Actor, id: string) {
  const l = await loadLetter(actor, id, "crm.manage");
  if (l.status !== "DRAFT") throw ruleViolation("Only a draft letter can be issued.");
  return transaction(async (tx) => {
    const after = await tx.engagementLetter.update({ where: { id }, data: { status: "ISSUED", issuedAt: new Date(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: id, action: "ISSUED" });
    return after;
  });
}

export async function withdrawLetter(actor: Actor, id: string, reason: string) {
  const l = await loadLetter(actor, id, "crm.manage");
  if (!["DRAFT", "ISSUED"].includes(l.status)) throw ruleViolation("An accepted letter cannot be withdrawn.");
  if (reason.trim().length < 3) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Reason" });
  await transaction(async (tx) => {
    await tx.engagementLetter.update({ where: { id }, data: { status: "WITHDRAWN", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: id, action: "WITHDRAW", reason });
  });
}

export async function getLetter(actor: Actor, id: string) {
  const l = await loadLetter(actor, id);
  const p = l.proposalId ? await db().proposal.findUnique({ where: { id: l.proposalId } }) : null;
  const lead = p?.leadId ? await db().lead.findUnique({ where: { id: p.leadId } }) : null;
  const client = isPlaceholderClient(l.clientId) ? null : await db().client.findUnique({ where: { id: l.clientId }, select: { id: true, code: true, name: true } });
  const engagements = await db().engagement.findMany({ where: { engagementLetterId: id }, select: { id: true, code: true, name: true } });
  const renewal = await db().renewal.findFirst({ where: { letterId: id } });
  return { letter: l, proposal: p, lead, client, engagements, renewal, spec: p ? await proposalSpec(p) : null, missing: [...l.body.matchAll(/\[\[([a-zA-Z]+\.[a-zA-Z0-9_]+)\]\]/g)].map((m) => m[1]!) };
}

/** Paragraphs → PDF blocks; a paragraph starting "# Heading" becomes a heading plus its text. */
export function letterBlocks(body: string): PdfBlock[] {
  return body.split(/\n{2,}/).flatMap((para): PdfBlock[] => {
    if (!para.startsWith("# ")) return [{ type: "text", text: para.trim() }];
    const [head, ...rest] = para.split("\n");
    return rest.length ? [{ type: "heading", text: head!.slice(2) }, { type: "text", text: rest.join("\n").trim() }] : [{ type: "heading", text: head!.slice(2) }];
  });
}

/** PDF or Word copy of the letter text with the firm letterhead. */
export async function letterFile(actor: Actor, id: string, format: "pdf" | "docx") {
  const { letter, lead, client } = await getLetter(actor, id);
  const title = "Engagement letter";
  const header = await firmHeader();
  const body =
    format === "docx"
      ? await buildDocx({ title, header, body: letter.body })
      : await buildPdf({
          title, header, watermark: letter.status === "DRAFT" ? "DRAFT" : undefined,
          blocks: letterBlocks(letter.body),
        });
  await transaction((tx) => writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: id, action: "DOWNLOAD", after: { format } }));
  const who = client?.name ?? lead?.name ?? "client";
  return { body, fileName: `Engagement letter - ${who}.${format}`, contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
}

const acceptInput = z.object({
  engagementType: z.string().min(2).optional(),
  recurrence: z.enum(RECURRENCES).optional(),
  engagementName: z.string().trim().min(3).max(160).optional(),
  startDate: z.string().refine(isIsoDate, "Use a valid date").optional(),
  memberUserIds: z.array(z.string()).default([]),
});
export type AcceptLetterInput = z.input<typeof acceptInput>;

/**
 * Acceptance by uploading the signed copy (portal click acceptance is Phase 4, Q-23). On acceptance:
 * client created from the lead if needed → engagement created (fee basis, fee, budget, stage template)
 * with the chosen team → onboarding checklist + conflict check for a new client → lead Won.
 * Steps reuse the clients / engagements services (each audited); a retry after a failure resumes safely.
 */
const isPracticeAdmin = (a: Actor) => a.kind === "USER" && a.role === "PRACTICE_ADMIN";

export async function acceptLetterWithSignedCopy(actor: Actor, letterId: string, file: { name: string; data: Buffer }, input: AcceptLetterInput = {}) {
  const l = await loadLetter(actor, letterId, "crm.manage");
  const d = parse(acceptInput, input);
  if (!["DRAFT", "ISSUED"].includes(l.status)) throw ruleViolation("This letter is already accepted or withdrawn.");
  const p = l.proposalId ? await db().proposal.findUnique({ where: { id: l.proposalId } }) : null;
  if (!p || p.status !== "ACCEPTED") throw ruleViolation("The proposal behind this letter is not accepted.");
  const lead = p.leadId ? await db().lead.findUnique({ where: { id: p.leadId } }) : null;
  const spec = await proposalSpec(p);
  const engagementType = d.engagementType ?? spec.engagementType;
  if (!(await db().stageTemplate.findUnique({ where: { code: engagementType } }))) throw new DomainError("VALIDATION", `Unknown engagement type ${engagementType}.`, { engagementType: "Choose a type" });
  for (const uid of d.memberUserIds) {
    const u = await db().user.findUnique({ where: { id: uid } });
    if (!u || !u.active || ["HR_ADMIN", "PRACTICE_ADMIN"].includes(u.role)) throw new DomainError("VALIDATION", "Team members must be active client-service people.", { memberUserIds: "Check the team" });
  }

  let clientId = isPlaceholderClient(l.clientId) ? (lead?.clientId ?? null) : l.clientId;
  const newClient = !clientId;
  if (newClient) {
    if (!lead) throw ruleViolation("No lead or client to accept for.");
    authorize(actor, "client.manage");
    if (!isPracticeAdmin(actor)) authorize(actor, "engagement.manage"); // Q-33: the Practice Admin may accept
    if (lead.pan && (await db().client.findFirst({ where: { pan: lead.pan, status: { not: "DISCONTINUED_CLOSED" } } }))) {
      throw conflict("A client with this lead's PAN already exists. Link the lead to that client instead of creating a new one.");
    }
  } else {
    await assertClientAccess(actor, isPracticeAdmin(actor) ? "client.manage" : "engagement.manage", clientId!);
  }
  const stored = await storeFile(["_crm", "engagement-letters"], file.name, file.data);
  const today = todayIst();

  if (newClient && lead) {
    const owner = lead.ownerId ? await db().user.findUnique({ where: { id: lead.ownerId } }) : null;
    const constitution = (CONSTITUTIONS as readonly string[]).includes(lead.entityType) ? lead.entityType : "OTHER";
    const c = await createClient(actor, {
      name: lead.name, constitution: constitution as (typeof CONSTITUTIONS)[number], pan: lead.pan ?? null, leadSource: lead.source, onboardingDate: today,
      partnerId: owner?.role === "PARTNER" ? owner.id : null, managerId: owner?.role === "MANAGER" ? owner.id : null,
    });
    clientId = c.id;
    if (lead.contactName || lead.email || lead.phone) {
      await saveContact(actor, c.id, { name: lead.contactName || lead.name, role: "Primary contact", email: lead.email ?? null, phone: lead.phone ?? null, isPrimary: true, isBilling: true });
    }
    // Remember the client on the lead at once, so a retry after a later failure does not create it twice.
    await transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data: { clientId: c.id, updatedById: idOf(actor) } });
      await tx.engagementLetter.update({ where: { id: letterId }, data: { clientId: c.id } });
      await writeAudit(tx, actor, { entityType: "Lead", entityId: lead.id, action: "CLIENT_CREATED", after: { clientId: c.id } });
    });
  }

  let engagement = await db().engagement.findFirst({ where: { proposalId: p.id } });
  if (!engagement) {
    engagement = await createEngagement(actor, {
      clientId: clientId!, name: d.engagementName ?? p.title, serviceLine: p.serviceLine as ServiceLine, engagementType, recurrence: d.recurrence ?? spec.recurrence,
      feeBasis: p.feeBasis as "FIXED" | "RETAINER" | "TIME", feePaise: p.feeBasis === "TIME" ? 0 : p.feePaise, ratePaisePerHour: p.feeBasis === "TIME" ? p.ratePaise : 0,
      budgetMinutes: Math.round(p.budgetMinutes / 15) * 15, startDate: d.startDate ?? today,
    }, { fromAcceptedLetter: true });
  }
  for (const uid of d.memberUserIds) await assignToEngagement(actor, engagement.id, { userId: uid, role: "MEMBER" }, { fromAcceptedLetter: true });

  const result = await transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        clientId, engagementId: engagement!.id, name: `Signed engagement letter - ${file.name}`, kind: "ENGAGEMENT_LETTER", sourceType: "UPLOAD", confidentiality: "NORMAL", createdById: idOf(actor),
        versions: { create: { version: 1, storagePath: stored.storagePath, originalName: file.name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: idOf(actor) } },
      },
    });
    const letter = await tx.engagementLetter.update({ where: { id: letterId }, data: { clientId: clientId!, status: "SIGNED_UPLOADED", acceptedAt: new Date(), signedCopyDocumentId: doc.id, updatedById: idOf(actor) } });
    await tx.engagement.update({ where: { id: engagement!.id }, data: { proposalId: p.id, engagementLetterId: letterId, updatedById: idOf(actor) } });
    if (lead && lead.stage !== "WON") {
      await tx.lead.update({ where: { id: lead.id }, data: { stage: "WON", wonAt: new Date(), clientId, nextFollowUp: null, updatedById: idOf(actor) } });
      await writeAudit(tx, actor, { entityType: "Lead", entityId: lead.id, action: "STAGE", before: { stage: lead.stage }, after: { stage: "WON" }, reason: "Engagement letter accepted" });
    }
    if (newClient) await ensureChecklistTx(tx, actor, clientId!, { audit: p.serviceLine === "AUDIT" || engagementType === "AUDIT" });
    await writeAudit(tx, actor, { entityType: "EngagementLetter", entityId: letterId, action: "ACCEPTED", before: { status: l.status }, after: { status: "SIGNED_UPLOADED", documentId: doc.id, engagementId: engagement!.id, clientId } });
    return { letter, engagementId: engagement!.id, clientId: clientId!, newClient };
  });
  if (newClient) await runConflictCheck(actor, clientId!);
  return result;
}

