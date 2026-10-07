import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { can } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import type { Capability } from "../../permissions/matrix";
import { writeAudit, logSensitiveView } from "../../audit";
import { addDays, formatDate, todayIst } from "../../lib/dates";
import { FEE_BASES, FEE_BASIS_LABELS, SERVICE_LINES, SERVICE_LINE_LABELS, zIsoDate, type ServiceLine } from "../../domain/enums";
import { getSetting } from "../settings/service";
import { buildPdf, rs, type PdfBlock } from "../../documents/pdf";
import { amountInWords } from "../../documents/words";
import { assertFees, assertLeadAccess, firmHeader, idOf } from "./common";
import { proposalSpec, suggestBudgetMinutes, templateSpec } from "./templates";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Value compared with the approval limit: the fee, or for time-based work rate × budgeted hours. */
export function proposalValuePaise(p: { feePaise: number; ratePaise: number; budgetMinutes: number }) {
  return p.feePaise > 0 ? p.feePaise : Math.round((p.ratePaise * p.budgetMinutes) / 60);
}

type ProposalRow = NonNullable<Awaited<ReturnType<ReturnType<typeof db>["proposal"]["findUnique"]>>>;

/** Record-level check: through the lead, or the client for proposals to existing clients. Fees ⇒ billing roles only. */
async function assertProposalAccess(actor: Actor, cap: Capability, p: { leadId: string | null; clientId: string | null }) {
  assertFees(actor);
  if (p.leadId) return assertLeadAccess(actor, cap, p.leadId);
  if (p.clientId) return void (await assertClientAccess(actor, cap, p.clientId));
  throw forbidden();
}

async function loadProposal(actor: Actor, id: string, cap: Capability = "crm.view") {
  const p = await db().proposal.findUnique({ where: { id } });
  if (!p) throw notFound("Proposal");
  await assertProposalAccess(actor, cap, p);
  return p;
}

const createInput = z.object({
  leadId: z.preprocess(blankToNull, z.string().nullable().optional()),
  clientId: z.preprocess(blankToNull, z.string().nullable().optional()),
  serviceTemplateId: z.string().min(1, "Choose a service template"),
  title: z.preprocess(blankToNull, z.string().trim().min(3).max(160).nullable().optional()),
  validUntil: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
});

/** New proposal built from a service template (P3-09); budget hours suggested from past actuals. */
export async function createProposal(actor: Actor, input: z.input<typeof createInput>) {
  const d = parse(createInput, input);
  if (!d.leadId && !d.clientId) throw new DomainError("VALIDATION", "A proposal is for a lead or an existing client.", { leadId: "Choose a lead" });
  const lead = d.leadId ? await db().lead.findUnique({ where: { id: d.leadId } }) : null;
  if (d.leadId && !lead) throw notFound("Lead");
  if (lead && (lead.stage === "WON" || lead.stage === "LOST")) throw ruleViolation("This lead is closed.");
  const clientId = d.clientId ?? lead?.clientId ?? null;
  await assertProposalAccess(actor, "crm.manage", { leadId: d.leadId ?? null, clientId });
  const t = await db().serviceTemplate.findUnique({ where: { id: d.serviceTemplateId } });
  if (!t || !t.active) throw new DomainError("VALIDATION", "Choose an active service template.", { serviceTemplateId: "Not available" });
  const title = d.title ?? t.name;
  const spec = templateSpec(t);
  const budget = await suggestBudgetMinutes(spec.engagementType, spec.effortMinutes);
  const validity = await getSetting<number>("crm.proposalValidityDays", 30);
  return transaction(async (tx) => {
    const p = await tx.proposal.create({
      data: {
        leadId: d.leadId ?? null, clientId, serviceTemplateId: t.id, title, serviceLine: t.serviceLine, scope: t.scope, deliverables: t.deliverables, timelines: t.timelines,
        feeBasis: t.feeBasis, feePaise: t.feeBasis === "TIME" ? 0 : t.defaultFeePaise, ratePaise: t.feeBasis === "TIME" ? t.defaultFeePaise : 0,
        budgetMinutes: budget.minutes, oopTerms: t.oopTerms, validUntil: d.validUntil ?? addDays(todayIst(), validity),
        createdById: idOf(actor), updatedById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: p.id, action: "CREATE", after: p, reason: `From template "${t.name}"; budget: ${budget.basis}` });
    return { ...p, budgetBasis: budget.basis };
  });
}

const editInput = z.object({
  title: z.string().trim().min(3).max(160),
  serviceLine: z.enum(SERVICE_LINES),
  scope: z.string().max(8000),
  deliverables: z.string().max(8000),
  timelines: z.string().max(4000),
  feeBasis: z.enum(FEE_BASES),
  feePaise: z.number().int().min(0),
  ratePaise: z.number().int().min(0),
  budgetMinutes: z.number().int().min(0).multipleOf(15, "Budget is in 15-minute steps"),
  oopTerms: z.string().max(4000),
  gstRateBp: z.number().int().min(0).max(10000),
  validUntil: z.preprocess(blankToNull, zIsoDate.nullable()),
});

function checkFee(p: { feeBasis: string; feePaise: number; ratePaise: number }) {
  if (p.feeBasis === "TIME" && !p.ratePaise) throw new DomainError("VALIDATION", "Time-based proposals need an hourly rate.", { ratePaise: "Hourly rate" });
  if (p.feeBasis !== "TIME" && !p.feePaise) throw new DomainError("VALIDATION", "Enter the fee.", { feePaise: "Fee" });
}

/**
 * Edit (P3-09 versioning): a draft is edited in place; an approved or sent proposal is never changed —
 * the edit becomes a new draft version (needing approval again) and the old one is marked Superseded.
 */
export async function updateProposal(actor: Actor, id: string, input: Partial<z.input<typeof editInput>>) {
  const p = await loadProposal(actor, id, "crm.manage");
  const d = parsePartial(editInput, input);
  if (!["DRAFT", "APPROVED", "SENT"].includes(p.status)) throw ruleViolation(`A ${p.status.toLowerCase()} proposal cannot be edited.`);
  const merged = { ...p, ...d };
  if (merged.feeBasis === "TIME") merged.feePaise = 0;
  if (p.status === "DRAFT") {
    return transaction(async (tx) => {
      const after = await tx.proposal.update({ where: { id }, data: { ...d, feePaise: merged.feePaise, updatedById: idOf(actor) } });
      await writeAudit(tx, actor, { entityType: "Proposal", entityId: id, action: "UPDATE", before: p, after });
      return after;
    });
  }
  return transaction(async (tx) => {
    const { id: _old, createdAt: _c, updatedAt: _u, ...copy } = merged;
    void _old; void _c; void _u;
    const next = await tx.proposal.create({
      data: {
        ...copy, version: p.version + 1, parentId: p.id, status: "DRAFT", approvedById: null, approvedAt: null, sentAt: null, decidedAt: null,
        createdById: idOf(actor), updatedById: idOf(actor),
      },
    });
    await tx.proposal.update({ where: { id }, data: { status: "SUPERSEDED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: id, action: "SUPERSEDED", before: { status: p.status }, after: { status: "SUPERSEDED", by: next.id } });
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: next.id, action: "NEW_VERSION", before: p, after: next });
    return next;
  });
}

/**
 * Who may approve (spec 10.2 "Partner approval required; approval limits configurable"): a Partner
 * always; a Manager only when `crm.proposalApprovalLimitPaise` is above 0 and the value is within it.
 */
export async function approvalRight(actor: Actor, p: { feePaise: number; ratePaise: number; budgetMinutes: number }) {
  if (can(actor, "proposal.approve")) return { ok: true as const, reason: "Partner" };
  if (actor.kind !== "USER" || actor.role !== "MANAGER") return { ok: false as const, reason: "Only a Partner can approve proposals." };
  const limit = await getSetting<number>("crm.proposalApprovalLimitPaise", 0);
  if (!limit) return { ok: false as const, reason: "Proposals need a Partner's approval." };
  if (proposalValuePaise(p) > limit) return { ok: false as const, reason: `Above your approval limit of ${rs(limit)} — a Partner must approve.` };
  return { ok: true as const, reason: "Within the Manager approval limit" };
}

export async function approveProposal(actor: Actor, id: string) {
  const p = await loadProposal(actor, id, can(actor, "proposal.approve") ? "crm.view" : "crm.manage");
  if (p.status !== "DRAFT") throw ruleViolation("Only a draft proposal can be approved.");
  checkFee(p);
  if (p.validUntil && p.validUntil < todayIst()) throw ruleViolation("The validity date has passed; edit it first.");
  const right = await approvalRight(actor, p);
  if (!right.ok) throw forbidden(right.reason);
  return transaction(async (tx) => {
    const after = await tx.proposal.update({ where: { id }, data: { status: "APPROVED", approvedById: idOf(actor), approvedAt: new Date(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: id, action: "APPROVE", before: { status: p.status }, after: { status: "APPROVED" }, reason: right.reason });
    return after;
  });
}

/** Mark sent (nothing is emailed — the PDF is downloaded and sent by the person). Moves the lead to Proposal Sent. */
export async function markProposalSent(actor: Actor, id: string) {
  const p = await loadProposal(actor, id, "crm.manage");
  if (p.status !== "APPROVED") throw ruleViolation("A proposal must be approved before it is sent.");
  return transaction(async (tx) => {
    const after = await tx.proposal.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), updatedById: idOf(actor) } });
    if (p.leadId) {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: p.leadId } });
      if (["NEW", "CONTACTED", "MEETING", "ON_HOLD"].includes(lead.stage)) {
        await tx.lead.update({ where: { id: lead.id }, data: { stage: "PROPOSAL_SENT", updatedById: idOf(actor) } });
        await writeAudit(tx, actor, { entityType: "Lead", entityId: lead.id, action: "STAGE", before: { stage: lead.stage }, after: { stage: "PROPOSAL_SENT" }, reason: "Proposal sent" });
      }
    }
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: id, action: "SENT", before: { status: p.status }, after: { status: "SENT" } });
    return after;
  });
}

const decideInput = z.object({ decision: z.enum(["ACCEPTED", "REJECTED"]), note: z.string().trim().max(2000).default("") });

/** Record the client's answer to a sent proposal. An expired proposal cannot be accepted. */
export async function decideProposal(actor: Actor, id: string, input: z.input<typeof decideInput>) {
  const p = await loadProposal(actor, id, "crm.manage");
  const d = parse(decideInput, input);
  if (p.status !== "SENT") throw ruleViolation("Only a sent proposal can be accepted or rejected.");
  if (d.decision === "ACCEPTED" && p.validUntil && p.validUntil < todayIst()) {
    await expireOne(actor, p);
    throw ruleViolation("This proposal has expired. Edit it to create a new version with a fresh validity date.");
  }
  return transaction(async (tx) => {
    const after = await tx.proposal.update({ where: { id }, data: { status: d.decision, decidedAt: new Date(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: id, action: d.decision, before: { status: p.status }, after: { status: d.decision }, reason: d.note });
    return after;
  });
}

async function expireOne(actor: Actor, p: ProposalRow) {
  await transaction(async (tx) => {
    await tx.proposal.update({ where: { id: p.id }, data: { status: "EXPIRED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Proposal", entityId: p.id, action: "EXPIRE", before: { status: p.status }, after: { status: "EXPIRED" }, reason: `Valid until ${p.validUntil}` });
  });
}

/** Daily job: sent proposals past their validity date become Expired. Idempotent. */
export async function runProposalExpiry(today: string = todayIst()) {
  const { systemActor } = await import("../../permissions/actor");
  const due = await db().proposal.findMany({ where: { status: { in: ["SENT", "APPROVED"] }, validUntil: { lt: today } } });
  for (const p of due) await expireOne(systemActor(), p);
  return { expired: due.length };
}

/** All versions of one proposal (walks parentId both ways). */
async function versionFamily(p: ProposalRow) {
  const siblings = await db().proposal.findMany({ where: p.leadId ? { leadId: p.leadId } : { clientId: p.clientId, leadId: null }, orderBy: { version: "asc" } });
  const byId = new Map(siblings.map((s) => [s.id, s]));
  let root = p;
  while (root.parentId && byId.get(root.parentId)) root = byId.get(root.parentId)!;
  const family = [root];
  for (let i = 0; i < family.length; i++) for (const s of siblings) if (s.parentId === family[i]!.id) family.push(s);
  return family.sort((a, b) => a.version - b.version);
}

export async function getProposal(actor: Actor, id: string) {
  const p = await loadProposal(actor, id);
  await logSensitiveView(actor, "BILLING", "Proposal", id);
  const [versions, lead, client, letters, right, approver] = await Promise.all([
    versionFamily(p),
    p.leadId ? db().lead.findUnique({ where: { id: p.leadId } }) : null,
    p.clientId ? db().client.findUnique({ where: { id: p.clientId }, select: { id: true, code: true, name: true } }) : null,
    db().engagementLetter.findMany({ where: { proposalId: id }, orderBy: { createdAt: "desc" } }),
    approvalRight(actor, p),
    p.approvedById ? db().user.findUnique({ where: { id: p.approvedById }, select: { displayName: true } }) : null,
  ]);
  const spec = await proposalSpec(p);
  return { proposal: p, versions, lead, client, letters, canApprove: right.ok, approvalNote: right.reason, approverName: approver?.displayName ?? null, spec, valuePaise: proposalValuePaise(p) };
}

export async function listProposals(actor: Actor, f: { status?: string } = {}) {
  assertFees(actor);
  const { leadWhere, visibleClientIds } = await import("./common");
  const lw = await leadWhere(actor, "crm.view");
  const leads = await db().lead.findMany({ where: lw, select: { id: true, name: true } });
  const cids = await visibleClientIds(actor, "crm.view");
  const rows = await db().proposal.findMany({
    where: {
      AND: [
        { OR: [{ leadId: { in: leads.map((l) => l.id) } }, { leadId: null, ...(cids === null ? { clientId: { not: null } } : { clientId: { in: cids } }) }] },
        f.status ? { status: f.status } : { status: { not: "SUPERSEDED" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const leadNames = new Map(leads.map((l) => [l.id, l.name]));
  const clients = new Map((await db().client.findMany({ where: { id: { in: rows.map((r) => r.clientId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return rows.map((r) => ({ ...r, forName: (r.leadId ? leadNames.get(r.leadId) : null) ?? (r.clientId ? clients.get(r.clientId) : null) ?? "" }));
}

/** Proposal PDF (spec 10.2). Drafts carry a DRAFT watermark. */
export async function proposalPdf(actor: Actor, id: string) {
  const { proposal: p, lead, client } = await getProposal(actor, id);
  const forName = client?.name ?? lead?.name ?? "";
  const fee =
    p.feeBasis === "TIME"
      ? `${rs(p.ratePaise)} per hour (time-based)${p.budgetMinutes ? `; estimated ${Math.round(p.budgetMinutes / 60)} hours` : ""}`
      : `${rs(p.feePaise)} (${amountInWords(p.feePaise)})${p.feeBasis === "RETAINER" ? " — recurring retainer" : ""}`;
  const gst = p.gstRateBp ? `GST at ${(p.gstRateBp / 100).toFixed(2).replace(/\.00$/, "")}% will be charged extra.` : "GST at the applicable rate will be charged extra.";
  const section = (title: string, text: string): PdfBlock[] => (text.trim() ? [{ type: "heading", text: title }, { type: "text", text: text.trim() }] : []);
  const blocks: PdfBlock[] = [
    { type: "kv", columns: 2, rows: [["To", forName], ["Contact", lead?.contactName ?? ""], ["Date", formatDate(todayIst())], ["Valid until", formatDate(p.validUntil)], ["Service", SERVICE_LINE_LABELS[p.serviceLine as ServiceLine] ?? p.serviceLine], ["Version", String(p.version)]] },
    ...section("Scope of work", p.scope),
    ...section("Deliverables", p.deliverables),
    ...section("Timelines", p.timelines),
    { type: "heading", text: "Professional fees" },
    { type: "kv", rows: [["Fee basis", FEE_BASIS_LABELS[p.feeBasis as keyof typeof FEE_BASIS_LABELS] ?? p.feeBasis], ["Fee", fee], ["GST", gst]] },
    ...section("Out-of-pocket expenses", p.oopTerms),
    { type: "spacer" },
    { type: "signature", lines: ["For the firm", "Authorised signatory"] },
  ];
  const body = await buildPdf({ title: `Proposal: ${p.title}`, header: await firmHeader(), blocks, watermark: ["DRAFT", "SUPERSEDED"].includes(p.status) ? p.status : undefined, footer: `Proposal v${p.version}` });
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Proposal", entityId: id, action: "DOWNLOAD", after: { format: "pdf" } }));
  return { body, fileName: `Proposal - ${forName} - v${p.version}.pdf`, contentType: "application/pdf" };
}
