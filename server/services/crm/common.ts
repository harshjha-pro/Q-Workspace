import type { Prisma } from "@/generated/prisma/client";
import { db } from "../../lib/db";
import { authorize, can } from "../../permissions/guards";
import { clientWhere, userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import type { Capability } from "../../permissions/matrix";
import { forbidden, notFound } from "../../lib/errors";

/** Shared helpers for the CRM module (spec 10, P3-08 … P3-16). */

export const LEAD_STAGES = ["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "WON", "LOST", "ON_HOLD"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New", CONTACTED: "Contacted", MEETING: "Meeting", PROPOSAL_SENT: "Proposal sent", WON: "Won", LOST: "Lost", ON_HOLD: "On hold",
};
export const OPEN_LEAD_STAGES: LeadStage[] = ["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "ON_HOLD"];
export const LEAD_SOURCES = ["REFERRAL", "EXISTING_CLIENT", "WEBSITE", "EVENT", "OTHER"] as const;
export const LEAD_SOURCE_LABELS: Record<(typeof LEAD_SOURCES)[number], string> = {
  REFERRAL: "Referral", EXISTING_CLIENT: "Existing client", WEBSITE: "Website", EVENT: "Event", OTHER: "Other",
};
export const ACTIVITY_KINDS = ["CALL", "MEETING", "EMAIL", "WHATSAPP", "NOTE"] as const;
export const ACTIVITY_LABELS: Record<(typeof ACTIVITY_KINDS)[number], string> = { CALL: "Call", MEETING: "Meeting", EMAIL: "Email", WHATSAPP: "WhatsApp", NOTE: "Note" };
export const PROPOSAL_STATUSES = ["DRAFT", "APPROVED", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED"] as const;

export const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
const NONE = "__none__";

const isFirm = (scope: string) => scope === "firm" || scope === "firm_read";

/** Client ids the actor may see under a capability, or null for "all". */
export async function visibleClientIds(actor: Actor, cap: Capability): Promise<string[] | null> {
  const scope = authorize(actor, cap);
  if (isFirm(scope) || actor.kind === "SYSTEM") return null;
  const rows = await db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } });
  return rows.map((r) => r.id);
}

export const inClients = (ids: string[] | null) => (ids === null ? {} : { clientId: { in: ids } });

/**
 * Leads the actor may see under a CRM capability. Leads have no team of their own, so:
 * firm scope → all; Manager (team) → leads owned or created by people in their team, or linked to a
 * team client; Staff (assigned) → leads they own or have logged business-development time against.
 */
export async function leadWhere(actor: Actor, cap: Capability): Promise<Prisma.LeadWhereInput> {
  const scope = authorize(actor, cap);
  if (isFirm(scope) || actor.kind === "SYSTEM") return {};
  if (actor.kind !== "USER") return { id: NONE };
  if (scope === "team" || scope === "team_read") {
    const [people, clients] = await Promise.all([
      db().user.findMany({ where: userWhere(actor, "team"), select: { id: true } }),
      db().client.findMany({ where: clientWhere(actor, "team"), select: { id: true } }),
    ]);
    const ids = people.map((p) => p.id);
    const cids = clients.map((c) => c.id);
    return { OR: [{ ownerId: { in: ids } }, { createdById: { in: ids } }, { clientId: { in: cids } }] };
  }
  if (scope === "assigned" || scope === "self") {
    const worked = await db().workEntry.findMany({ where: { userId: actor.userId, leadId: { not: null }, deletedAt: null }, select: { leadId: true }, distinct: ["leadId"] });
    return { OR: [{ ownerId: actor.userId }, { id: { in: worked.map((w) => w.leadId!) } }] };
  }
  return { id: NONE };
}

/** Throws unless the actor may act on this lead under the capability. */
export async function assertLeadAccess(actor: Actor, cap: Capability, leadId: string) {
  const where = await leadWhere(actor, cap);
  const n = await db().lead.count({ where: { AND: [{ id: leadId }, where] } });
  if (n === 0) {
    const exists = await db().lead.count({ where: { id: leadId } });
    if (!exists) throw notFound("Lead");
    throw forbidden();
  }
}

/** Fees, proposals and renewals are billing data: never shown to Staff or Articles (spec 7.1). */
export const canSeeFees = (actor: Actor) => can(actor, "billing.view");

export function assertFees(actor: Actor) {
  if (!canSeeFees(actor)) throw forbidden("Fee information is not available to your role.");
}

export function softCan(actor: Actor, cap: Capability) {
  return can(actor, cap);
}

// ---------------------------------------------------------------------------
// Identifier normalisation for the duplicate check
// ---------------------------------------------------------------------------
export const normPan = (v?: string | null) => (v ? v.trim().toUpperCase() : null) || null;
export const normGstin = normPan;
export const normEmail = (v?: string | null) => (v ? v.trim().toLowerCase() : null) || null;
/** Last 10 digits, so "+91 98200 12345" and "9820012345" match. */
export const normPhone = (v?: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
};

/** Words that say nothing about who an entity is, ignored in name similarity. */
const STOP = new Set(["private", "pvt", "limited", "ltd", "llp", "the", "and", "&", "co", "company", "huf", "dr", "mr", "mrs", "ms", "of", "india", "associates", "trust", "society", "group"]);
export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}
/** Jaccard similarity of significant name words (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let both = 0;
  for (const t of ta) if (tb.has(t)) both += 1;
  return both / (ta.size + tb.size - both);
}

export const rupees = (paise: number) => `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Letterhead lines for generated CRM documents. */
export async function firmHeader(): Promise<string[]> {
  const firm = await db().firmProfile.findFirst({ orderBy: { createdAt: "asc" } });
  if (!firm) return [];
  return [firm.name, firm.address, [firm.gstin ? `GSTIN ${firm.gstin}` : "", firm.email, firm.phone].filter(Boolean).join(" · ")].filter(Boolean);
}
