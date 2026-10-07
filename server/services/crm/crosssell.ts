import { db, transaction } from "../../lib/db";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import { systemActor, type Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { toSearch } from "../../lib/codes";
import { isCompany, type ServiceLine } from "../../domain/enums";
import { idOf, inClients, visibleClientIds } from "./common";

/**
 * Cross-sell rules (P3-13, spec 10.6). Data-driven: each rule says when a client profile suggests a
 * service and what engagement already covers it. Add a rule here and the nightly run picks it up.
 */
type ClientProfile = {
  constitution: string;
  gstins: { status: string }[];
  taxAuditApplicable: boolean;
  statutoryAuditApplicable: boolean;
  tdsApplicable: boolean;
  pfApplicable: boolean;
  esiApplicable: boolean;
};
type Eng = { serviceLine: string; engagementType: string; name: string };
export type CrossSellRule = { code: string; serviceLine: ServiceLine; description: string; applies: (c: ClientProfile) => boolean; coveredBy: (e: Eng) => boolean };

const AUTO_SUFFIX = " (no longer applies)";
const isTaxAudit = (e: Eng) => e.engagementType === "AUDIT" && /tax audit/i.test(e.name);

export const CROSS_SELL_RULES: CrossSellRule[] = [
  { code: "GST_NO_ENGAGEMENT", serviceLine: "GST", description: "GST registered but no GST engagement", applies: (c) => c.gstins.some((g) => g.status === "ACTIVE"), coveredBy: (e) => e.serviceLine === "GST" || e.engagementType === "GST_RETURN" },
  { code: "COMPANY_NO_SECRETARIAL", serviceLine: "COMPANY_LAW", description: "Company / LLP with no ROC or secretarial engagement", applies: (c) => isCompany(c.constitution) || c.constitution === "LLP", coveredBy: (e) => e.engagementType === "ROC_ANNUAL" || e.serviceLine === "COMPANY_LAW" },
  { code: "TAX_AUDIT_NO_ENGAGEMENT", serviceLine: "AUDIT", description: "Tax audit applicable but no tax-audit engagement", applies: (c) => c.taxAuditApplicable, coveredBy: isTaxAudit },
  { code: "STAT_AUDIT_NO_ENGAGEMENT", serviceLine: "AUDIT", description: "Statutory audit applicable but no audit engagement", applies: (c) => c.statutoryAuditApplicable, coveredBy: (e) => e.engagementType === "AUDIT" && !isTaxAudit(e) },
  { code: "TDS_NO_ENGAGEMENT", serviceLine: "DIRECT_TAX", description: "TDS applicable but no TDS return engagement", applies: (c) => c.tdsApplicable, coveredBy: (e) => e.engagementType === "TDS_RETURN" },
  { code: "PAYROLL_NO_ENGAGEMENT", serviceLine: "ACCOUNTING", description: "PF / ESI applicable but no payroll compliance engagement", applies: (c) => c.pfApplicable || c.esiApplicable, coveredBy: (e) => e.engagementType === "PAYROLL_STATUTORY" },
];

/** Rules that fire for one client profile (pure; used by the job and tests). */
export function evaluateCrossSell(c: ClientProfile, engagements: Eng[]): CrossSellRule[] {
  return CROSS_SELL_RULES.filter((r) => r.applies(c) && !engagements.some(r.coveredBy));
}

/**
 * Refresh suggestions: new matches become OPEN opportunities; open ones no longer matching are
 * dismissed. Converted / dismissed rows are left alone (unique per client + rule), so it is idempotent.
 */
export async function runCrossSell(actor: Actor = systemActor()) {
  const ids = await visibleClientIds(actor, actor.kind === "SYSTEM" ? "crm.view" : "crm.manage");
  const clients = await db().client.findMany({
    where: { status: "ACTIVE", isFirm: false, ...(ids ? { id: { in: ids } } : {}) },
    include: { gstins: { select: { status: true } }, engagements: { where: { status: { notIn: ["CANCELLED", "ARCHIVED"] } }, select: { serviceLine: true, engagementType: true, name: true } } },
  });
  const existing = await db().opportunity.findMany({ where: { clientId: { in: clients.map((c) => c.id) } } });
  const byKey = new Map(existing.map((o) => [`${o.clientId}|${o.ruleCode}`, o]));
  let created = 0;
  let closed = 0;
  for (const c of clients) {
    const firing = new Set(evaluateCrossSell(c, c.engagements).map((r) => r.code));
    await transaction(async (tx) => {
      for (const rule of CROSS_SELL_RULES) {
        const o = byKey.get(`${c.id}|${rule.code}`);
        if (firing.has(rule.code) && !o) {
          const row = await tx.opportunity.create({ data: { clientId: c.id, ruleCode: rule.code, serviceLine: rule.serviceLine, description: rule.description, createdById: idOf(actor) } });
          await writeAudit(tx, actor, { entityType: "Opportunity", entityId: row.id, action: "CREATE", after: { clientId: c.id, ruleCode: rule.code } });
          created += 1;
        } else if (firing.has(rule.code) && o?.status === "DISMISSED" && o.description.endsWith(AUTO_SUFFIX)) {
          // It applied, stopped applying, and applies again: suggest it again.
          await tx.opportunity.update({ where: { id: o.id }, data: { status: "OPEN", description: rule.description, updatedById: idOf(actor) } });
          await writeAudit(tx, actor, { entityType: "Opportunity", entityId: o.id, action: "REOPEN", reason: "Rule applies again" });
          created += 1;
        } else if (!firing.has(rule.code) && o?.status === "OPEN") {
          await tx.opportunity.update({ where: { id: o.id }, data: { status: "DISMISSED", description: `${o.description}${AUTO_SUFFIX}`, updatedById: idOf(actor) } });
          await writeAudit(tx, actor, { entityType: "Opportunity", entityId: o.id, action: "AUTO_DISMISS", reason: "Rule no longer applies" });
          closed += 1;
        }
      }
    });
  }
  return { clients: clients.length, created, closed };
}

export async function listOpportunities(actor: Actor, f: { status?: string } = {}) {
  const ids = await visibleClientIds(actor, "crm.view");
  const rows = await db().opportunity.findMany({ where: { ...inClients(ids), status: f.status ?? "OPEN" }, orderBy: [{ serviceLine: "asc" }, { createdAt: "desc" }], take: 500 });
  const clients = new Map((await db().client.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, name: true, code: true } })).map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, client: clients.get(r.clientId) }));
}

/** One click: the opportunity becomes a lead for the existing client (source: existing client). */
export async function convertOpportunity(actor: Actor, id: string) {
  authorize(actor, "crm.manage");
  const o = await db().opportunity.findUnique({ where: { id } });
  if (!o) throw notFound("Opportunity");
  await assertClientAccess(actor, "crm.manage", o.clientId);
  if (o.status !== "OPEN") throw ruleViolation("This suggestion is already handled.");
  const c = await db().client.findUniqueOrThrow({ where: { id: o.clientId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } });
  const owner = c.managerId ?? c.partnerId ?? (actor.kind === "USER" && ["PARTNER", "MANAGER"].includes(actor.role) ? actor.userId : null);
  const contact = c.contacts[0];
  return transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        name: c.name, searchName: toSearch(c.name, c.pan), entityType: c.constitution, contactName: contact?.name ?? "", email: contact?.email ?? null, phone: contact?.phone ?? null, pan: c.pan,
        servicesCsv: o.serviceLine, source: "EXISTING_CLIENT", referrerClientId: c.id, clientId: c.id, ownerId: owner, notes: `Cross-sell: ${o.description}`, createdById: idOf(actor), updatedById: idOf(actor),
      },
    });
    await tx.opportunity.update({ where: { id }, data: { status: "CONVERTED", leadId: lead.id, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Lead", entityId: lead.id, action: "CREATE", after: lead, reason: `From cross-sell ${o.ruleCode}` });
    await writeAudit(tx, actor, { entityType: "Opportunity", entityId: id, action: "CONVERT", after: { leadId: lead.id } });
    return lead;
  });
}

export async function dismissOpportunity(actor: Actor, id: string, reason: string) {
  const o = await db().opportunity.findUnique({ where: { id } });
  if (!o) throw notFound("Opportunity");
  await assertClientAccess(actor, "crm.manage", o.clientId);
  if (o.status !== "OPEN") throw ruleViolation("This suggestion is already handled.");
  if (reason.trim().length < 3) throw new DomainError("VALIDATION", "Say why it is dismissed.", { reason: "Reason" });
  await transaction(async (tx) => {
    await tx.opportunity.update({ where: { id }, data: { status: "DISMISSED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Opportunity", entityId: id, action: "DISMISS", reason });
  });
}
