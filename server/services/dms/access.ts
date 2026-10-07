import type { Prisma } from "@/generated/prisma/client";
import { db } from "../../lib/db";
import { forbidden, notFound } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { authorize, can, isReadOnlyScope, scopeOf } from "../../permissions/guards";
import { clientWhere, engagementWhere } from "../../permissions/scopes";
import type { Scope } from "../../permissions/matrix";

/**
 * Who sees which document (spec 13.1, permissions.md).
 *  - Client documents follow `dms.view`: Partner firm, Manager team, Staff/Article assigned
 *    (engagement documents only for engagements they are on), Practice Admin firm read-only,
 *    HR Admin none, portal users only documents shared with their own client.
 *  - Confidentiality narrows that further: BILLING needs billing.view (never Staff/Article),
 *    SALARY / HR client documents are Partner and Manager only.
 *  - Employee documents (employeeUserId) are not DMS documents; server/services/documents handles them.
 *  - Firm-level documents with no client (e.g. peer-review packs) are Partner only.
 */
export const CONFIDENTIALITY = ["NORMAL", "FINANCIALS", "NOTICE", "SALARY", "HR", "BILLING"] as const;
export type Confidentiality = (typeof CONFIDENTIALITY)[number];
export const CONFIDENTIALITY_LABELS: Record<Confidentiality, string> = {
  NORMAL: "Normal", FINANCIALS: "Financial statements", NOTICE: "Notice", SALARY: "Salary", HR: "HR", BILLING: "Billing",
};
/** Confidentiality levels whose every view/download is written to SensitiveViewLog. */
export const LOGGED_LEVELS: Partial<Record<string, "FINANCIALS" | "NOTICE">> = { FINANCIALS: "FINANCIALS", NOTICE: "NOTICE" };

export function allowedConfidentiality(actor: Actor): string[] {
  if (actor.kind === "SYSTEM") return [...CONFIDENTIALITY];
  const out: string[] = ["NORMAL", "FINANCIALS", "NOTICE"];
  if (actor.kind === "PORTAL") return out;
  if (can(actor, "billing.view")) out.push("BILLING");
  if (actor.role === "PARTNER" || actor.role === "MANAGER") out.push("SALARY", "HR");
  return out;
}

export type DmsScope = { scope: Scope; readOnly: boolean };

/** Throws FORBIDDEN for roles without dms.view (HR Admin). */
export function dmsScope(actor: Actor): DmsScope {
  const scope = authorize(actor, "dms.view");
  return { scope, readOnly: isReadOnlyScope(scope) || actor.kind === "PORTAL" };
}

/** Client ids the actor may browse in the DMS (null = every client). */
export async function visibleClientIds(actor: Actor): Promise<string[] | null> {
  const { scope } = dmsScope(actor);
  if (scope === "firm" || scope === "firm_read" || actor.kind === "SYSTEM") return null;
  return (await db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } })).map((c) => c.id);
}

/** Engagement ids the actor may see documents of (null = all engagements of visible clients). */
export async function visibleEngagementIds(actor: Actor): Promise<string[] | null> {
  const { scope } = dmsScope(actor);
  if (scope !== "assigned") return null; // team / firm see every engagement of their clients
  return (await db().engagement.findMany({ where: engagementWhere(actor, scope), select: { id: true } })).map((e) => e.id);
}

/** Prisma filter for every DMS document the actor may see. */
export async function visibleDocumentWhere(actor: Actor): Promise<Prisma.DocumentWhereInput> {
  const clientIds = await visibleClientIds(actor);
  const engagementIds = await visibleEngagementIds(actor);
  const and: Prisma.DocumentWhereInput[] = [
    { employeeUserId: null, archivedAt: null, confidentiality: { in: allowedConfidentiality(actor) } },
  ];
  if (actor.kind === "PORTAL") and.push({ sharedWithClient: true });
  and.push(clientIds === null ? { clientId: { not: null } } : { clientId: { in: clientIds } });
  if (engagementIds !== null) and.push({ OR: [{ engagementId: null }, { engagementId: { in: engagementIds } }] });
  return { AND: and };
}

type DocLike = { id: string; clientId: string | null; engagementId: string | null; employeeUserId: string | null; confidentiality: string; sharedWithClient: boolean; kind: string };

/**
 * Record-level check for one document. mode "write" also refuses read-only scopes (Practice Admin,
 * portal). Returns the actor's scope.
 */
export async function assertDocumentAccess(actor: Actor, doc: DocLike, mode: "read" | "write" = "read"): Promise<DmsScope> {
  if (doc.employeeUserId) throw forbidden("Employee documents are kept in the person's HR file.");
  if (!doc.clientId) {
    // Firm-level documents (peer-review packs, QC exports): Partner only.
    if (actor.kind === "SYSTEM" || (actor.kind === "USER" && actor.role === "PARTNER")) return { scope: "firm", readOnly: false };
    throw forbidden();
  }
  const s = dmsScope(actor);
  if (mode === "write" && s.readOnly) throw forbidden("You can view these documents but not change them.");
  if (actor.kind === "PORTAL") {
    if (!actor.clientIds.includes(doc.clientId) || !doc.sharedWithClient) throw forbidden();
  } else if (actor.kind === "USER") {
    const ok = await db().client.count({ where: { AND: [{ id: doc.clientId }, clientWhere(actor, s.scope)] } });
    if (!ok) throw forbidden();
    if (doc.engagementId && s.scope === "assigned") {
      const e = await db().engagement.count({ where: { AND: [{ id: doc.engagementId }, engagementWhere(actor, s.scope)] } });
      if (!e) throw forbidden();
    }
  }
  if (!allowedConfidentiality(actor).includes(doc.confidentiality)) throw forbidden("This document is confidential.");
  return s;
}

/** Check write access to a client (and optionally one of its engagements) before filing into it. */
export async function assertCanFile(actor: Actor, clientId: string, engagementId?: string | null) {
  const s = dmsScope(actor);
  if (s.readOnly) throw forbidden("You can view these documents but not add to them.");
  if (actor.kind === "USER") {
    const ok = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere(actor, s.scope)] } });
    if (!ok) throw (await db().client.count({ where: { id: clientId } })) ? forbidden() : notFound("Client");
  }
  if (engagementId) {
    const e = await db().engagement.findUnique({ where: { id: engagementId }, select: { clientId: true } });
    if (!e) throw notFound("Engagement");
    if (e.clientId !== clientId) throw forbidden("That engagement belongs to another client.");
    if (actor.kind === "USER" && s.scope === "assigned") {
      const ok = await db().engagement.count({ where: { AND: [{ id: engagementId }, engagementWhere(actor, s.scope)] } });
      if (!ok) throw forbidden();
    }
  }
  return s;
}

/** Manager-or-Partner actions on documents (confidentiality, archive): Partner firm, Manager team. */
export function canCurate(actor: Actor) {
  return actor.kind === "SYSTEM" || (actor.kind === "USER" && (actor.role === "PARTNER" || actor.role === "MANAGER") && scopeOf(actor, "dms.view") !== "none");
}
