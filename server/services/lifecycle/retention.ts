import { z } from "zod";
import { db, transaction, type Prisma } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, requireStaff } from "../../permissions/guards";
import { systemActor, type Actor, type StaffActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { deleteStoredFile } from "../../lib/storage";
import { logger } from "../../lib/logger";
import { notifyUsers } from "../notifications/service";

/**
 * Retention and purge (spec 7.2 / 14.4, P3-07, Q-19). Every record type has a RetentionRule. Rules are seeded
 * "TODO verify" with no period and purge DISABLED; nothing can be purged until a Partner sets a period and enables it.
 * A purge always goes request → Partner approval → execution; stored files are deleted and rows are soft-marked.
 * The audit log is never purged. Implemented for documents; other record types are listed but not purgeable yet.
 */
export const PURGED_TAG = "PURGED";

type DocRule = { label: string; where: Prisma.DocumentWhereInput; basis: "ENGAGEMENT_ARCHIVED" | "CREATED" | "TICKET_CLOSED" };

/** Record types whose purge is implemented (all are documents with stored files). */
export const DOCUMENT_RECORD_TYPES: Record<string, DocRule> = {
  AUDIT_FILES: { label: "Audit files and audit working papers", where: { engagementId: { not: null }, employeeUserId: null }, basis: "ENGAGEMENT_ARCHIVED" },
  WORKING_PAPERS: { label: "Working papers of other engagements", where: { engagementId: { not: null }, employeeUserId: null }, basis: "ENGAGEMENT_ARCHIVED" },
  CLIENT_DOCUMENTS: { label: "Client documents not tied to an engagement", where: { clientId: { not: null }, engagementId: null, employeeUserId: null, sourceType: { not: "PORTAL" } }, basis: "CREATED" },
  PORTAL_UPLOADS: { label: "Client portal uploads", where: { sourceType: "PORTAL", employeeUserId: null }, basis: "CREATED" },
  PAYROLL: { label: "Payroll documents (payslips, salary records)", where: { confidentiality: "SALARY" }, basis: "CREATED" },
  HELPDESK_SCREENSHOTS: { label: "Helpdesk screenshots", where: { kind: "HELPDESK_SCREENSHOT" }, basis: "TICKET_CLOSED" },
};

/** Record types with a rule but no purge yet — what each would need is shown on the retention page. */
export const NOT_YET_PURGEABLE: Record<string, string> = {
  HR_DOCUMENTS: "Needs the employee's exit date as the start of the period and a check that no dispute or statutory claim is open.",
  BILLING_RECORDS: "Invoices, receipts and credit notes: needs a soft-delete flag on the billing tables and must keep GST-return links intact.",
  WORK_ENTRIES: "Time entries: needs aggregation into engagement totals first, because analytics and completion reports read them.",
  CLIENT_MASTER: "Client master data of discontinued clients: needs anonymisation of PAN / contacts rather than deletion (tasks and filings refer to it).",
  AUDIT_LOG: "Never purged — the audit trail is kept for ever.",
};

const OPEN_DOC_TYPES = Object.keys(DOCUMENT_RECORD_TYPES);

function partnerOnly(actor: Actor): asserts actor is StaffActor {
  requireStaff(actor);
  if (actor.role !== "PARTNER") throw forbidden("Only a Partner can do this.");
}

function viewer(actor: Actor) {
  requireStaff(actor);
  authorize(actor, "settings.manage"); // Partner and Practice Admin
}

export async function listRetentionRules(actor: Actor) {
  viewer(actor);
  const rules = await db().retentionRule.findMany({ orderBy: { recordType: "asc" } });
  const names = new Map((await db().user.findMany({ where: { id: { in: rules.map((r) => r.verifiedById ?? "") } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rules.map((r) => ({
    ...r,
    label: DOCUMENT_RECORD_TYPES[r.recordType]?.label ?? r.recordType.replace(/_/g, " ").toLowerCase(),
    purgeable: OPEN_DOC_TYPES.includes(r.recordType),
    notYet: NOT_YET_PURGEABLE[r.recordType] ?? null,
    verifiedByName: r.verifiedById ? names.get(r.verifiedById) ?? "" : "",
  }));
}

const ruleInput = z.object({
  retainYears: z.coerce.number().int().min(1, "At least 1 year").max(100).nullable(),
  basis: z.string().trim().max(300).default(""),
  source: z.string().trim().max(300).default(""),
  purgeEnabled: z.boolean().default(false),
});

/** Set the period (Partner only, Q-19). Purge can be enabled only once a period is set. Marks the rule verified. */
export async function setRetentionRule(actor: Actor, recordType: string, input: z.input<typeof ruleInput>) {
  partnerOnly(actor);
  const d = parse(ruleInput, input);
  if (d.purgeEnabled && !d.retainYears) throw new DomainError("VALIDATION", "Set the retention period before enabling purge.", { retainYears: "Required" });
  if (d.purgeEnabled && !OPEN_DOC_TYPES.includes(recordType)) throw ruleViolation("Purge is not available for this record type yet.");
  return transaction(async (tx) => {
    const before = await tx.retentionRule.findUnique({ where: { recordType } });
    if (!before) throw notFound("Retention rule");
    const after = await tx.retentionRule.update({
      where: { recordType },
      data: { retainYears: d.retainYears, basis: d.basis || before.basis, source: d.source || before.source, purgeEnabled: d.purgeEnabled, verifiedById: actor.userId, verifiedAt: new Date(), updatedById: actor.userId },
    });
    await writeAudit(tx, actor, { entityType: "RetentionRule", entityId: before.id, action: "UPDATE", before, after });
    return after;
  });
}

function yearsAgo(years: number, now: Date) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

/** Documents of a record type that are past the rule's period (never already-purged ones). */
export async function purgeCandidates(recordType: string, now = new Date()) {
  const def = DOCUMENT_RECORD_TYPES[recordType];
  if (!def) return [];
  const rule = await db().retentionRule.findUnique({ where: { recordType } });
  if (!rule?.retainYears) return [];
  const cutoff = yearsAgo(rule.retainYears, now);
  const base: Prisma.DocumentWhereInput = { AND: [def.where, { NOT: { tagsCsv: { contains: PURGED_TAG } } }] };
  if (def.basis === "ENGAGEMENT_ARCHIVED") {
    const audit = recordType === "AUDIT_FILES";
    const engagements = await db().engagement.findMany({ where: { archivedAt: { not: null, lt: cutoff }, serviceLine: audit ? "AUDIT" : { not: "AUDIT" } }, select: { id: true } });
    if (!engagements.length) return [];
    return db().document.findMany({ where: { AND: [base, { engagementId: { in: engagements.map((e) => e.id) } }] }, select: { id: true, name: true, clientId: true, engagementId: true, createdAt: true } });
  }
  if (def.basis === "TICKET_CLOSED") {
    const tickets = await db().helpdeskTicket.findMany({ where: { status: "CLOSED", closedAt: { lt: cutoff }, screenshotDocId: { not: null } }, select: { screenshotDocId: true } });
    if (!tickets.length) return [];
    return db().document.findMany({ where: { AND: [base, { id: { in: tickets.map((t) => t.screenshotDocId!) } }] }, select: { id: true, name: true, clientId: true, engagementId: true, createdAt: true } });
  }
  return db().document.findMany({ where: { AND: [base, { createdAt: { lt: cutoff } }] }, select: { id: true, name: true, clientId: true, engagementId: true, createdAt: true } });
}

function assertRuleEnabled(rule: { retainYears: number | null; purgeEnabled: boolean } | null, recordType: string) {
  if (!OPEN_DOC_TYPES.includes(recordType)) throw ruleViolation("Purge is not available for this record type yet.");
  if (!rule) throw notFound("Retention rule");
  if (!rule.retainYears || !rule.purgeEnabled) throw ruleViolation("Purge is disabled for this record type until a Partner sets the retention period and enables purge.");
}

export async function previewPurge(actor: Actor, recordType: string) {
  viewer(actor);
  const rule = await db().retentionRule.findUnique({ where: { recordType } });
  assertRuleEnabled(rule, recordType);
  const rows = await purgeCandidates(recordType);
  return { count: rows.length, sample: rows.slice(0, 20) };
}

/** Propose a purge of everything past retention for one record type (Partner / Practice Admin). */
export async function requestPurge(actor: Actor, recordType: string) {
  viewer(actor);
  return createRequest(actor, recordType);
}

async function createRequest(actor: Actor, recordType: string) {
  const rule = await db().retentionRule.findUnique({ where: { recordType } });
  assertRuleEnabled(rule, recordType);
  if (await db().purgeRequest.count({ where: { recordType, status: "PENDING" } })) throw ruleViolation("A purge request for this record type is already waiting for approval.");
  const rows = await purgeCandidates(recordType);
  if (!rows.length) throw ruleViolation("Nothing is past its retention period.");
  const requestedById = actor.kind === "USER" ? actor.userId : "system";
  const req = await transaction(async (tx) => {
    const r = await tx.purgeRequest.create({ data: { recordType, entityIdsJson: JSON.stringify(rows.map((x) => x.id)), count: rows.length, requestedById, createdById: requestedById } });
    await writeAudit(tx, actor, { entityType: "PurgeRequest", entityId: r.id, action: "CREATE", after: { recordType, count: rows.length, retainYears: rule!.retainYears } });
    return r;
  });
  const partners = await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } });
  await notifyUsers(partners.map((p) => p.id).filter((id) => id !== requestedById), { kind: "PURGE_APPROVAL", title: `Purge approval needed: ${rows.length} ${recordType.replace(/_/g, " ").toLowerCase()}`, link: "/admin/retention", entityType: "PurgeRequest", entityId: req.id, dedupeKey: `purge|${req.id}` });
  return req;
}

export async function listPurgeRequests(actor: Actor) {
  viewer(actor);
  const rows = await db().purgeRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const names = new Map((await db().user.findMany({ where: { id: { in: rows.flatMap((r) => [r.requestedById, r.approvedById ?? ""]) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({ ...r, requestedByName: r.requestedById === "system" ? "Scheduled job" : names.get(r.requestedById) ?? "", approvedByName: r.approvedById ? names.get(r.approvedById) ?? "" : "" }));
}

/**
 * Partner decision. Approval executes at once: only ids that are STILL past retention (the rule may have changed)
 * are purged — each document's stored files are deleted and the row is soft-marked (tag PURGED, archivedAt, versions
 * noted). Rows are never deleted, and every purge is in the audit trail.
 */
export async function decidePurge(actor: Actor, requestId: string, approve: boolean, reason = "") {
  partnerOnly(actor);
  const req = await db().purgeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw notFound("Purge request");
  if (req.status !== "PENDING") throw ruleViolation("This request has already been decided.");
  const now = new Date();
  if (!approve) {
    await transaction(async (tx) => {
      await tx.purgeRequest.update({ where: { id: requestId }, data: { status: "REJECTED", approvedById: actor.userId, decidedAt: now, updatedById: actor.userId } });
      await writeAudit(tx, actor, { entityType: "PurgeRequest", entityId: requestId, action: "REJECT", reason });
    });
    return { purged: 0, skipped: req.count };
  }
  const rule = await db().retentionRule.findUnique({ where: { recordType: req.recordType } });
  assertRuleEnabled(rule, req.recordType);
  const asked = new Set(JSON.parse(req.entityIdsJson) as string[]);
  const still = (await purgeCandidates(req.recordType, now)).filter((d) => asked.has(d.id));
  const docs = await db().document.findMany({ where: { id: { in: still.map((d) => d.id) } }, include: { versions: true } });
  await transaction(async (tx) => {
    for (const doc of docs) {
      await tx.document.update({ where: { id: doc.id }, data: { tagsCsv: [doc.tagsCsv, PURGED_TAG].filter(Boolean).join(","), archivedAt: doc.archivedAt ?? now, updatedById: actor.userId } });
      await tx.documentVersion.updateMany({ where: { documentId: doc.id }, data: { note: `Purged ${now.toISOString().slice(0, 10)} under retention rule ${req.recordType} (request ${requestId})`, updatedById: actor.userId } });
      await writeAudit(tx, actor, { entityType: "Document", entityId: doc.id, action: "PURGE", before: { name: doc.name, versions: doc.versions.length }, after: { purged: true }, reason: `Retention ${req.recordType}: ${rule!.retainYears} years` });
    }
    await tx.purgeRequest.update({ where: { id: requestId }, data: { status: "EXECUTED", approvedById: actor.userId, decidedAt: now, executedAt: now, count: docs.length, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "PurgeRequest", entityId: requestId, action: "APPROVE_EXECUTE", after: { purged: docs.length, skipped: asked.size - docs.length }, reason });
  });
  // Files go after the rows are marked: a failed delete leaves an orphan file (logged), never a live row without its file.
  let fileErrors = 0;
  for (const v of docs.flatMap((d) => d.versions)) {
    try {
      await deleteStoredFile(v.storagePath);
    } catch (e) {
      fileErrors += 1;
      logger().error({ documentId: v.documentId, err: e instanceof Error ? e.message : String(e) }, "purge: stored file not deleted");
    }
  }
  return { purged: docs.length, skipped: asked.size - docs.length, fileErrors };
}

/** Scheduled job: propose (never execute) purges for enabled rules with records past retention. */
export async function runRetentionPurgeProposals() {
  const rules = await db().retentionRule.findMany({ where: { purgeEnabled: true, retainYears: { not: null }, recordType: { in: OPEN_DOC_TYPES } } });
  let created = 0;
  for (const r of rules) {
    if (await db().purgeRequest.count({ where: { recordType: r.recordType, status: "PENDING" } })) continue;
    if (!(await purgeCandidates(r.recordType)).length) continue;
    await createRequest(systemActor(), r.recordType);
    created += 1;
  }
  return { rules: rules.length, requests: created };
}
