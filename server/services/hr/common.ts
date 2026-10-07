import { z } from "zod";
import { db, type Tx } from "../../lib/db";
import { forbidden } from "../../lib/errors";
import { can, scopeOf, isReadOnlyScope } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import type { Capability } from "../../permissions/matrix";
import { storeFile } from "../../lib/storage";
import { writeAudit } from "../../audit";

/** Shared helpers for the HR process services (recruitment, appraisals, CPE, expenses, assets, exits, letters). */

export const zIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
export const zId = z.string().min(1, "Required");

export const idOf = (a: Actor): string | null => (a.kind === "PORTAL" ? null : a.userId);

export function staffId(actor: Actor): string {
  if (actor.kind !== "USER" && actor.kind !== "SYSTEM") throw forbidden();
  return actor.userId;
}

/** Holds the capability at a scope that allows writing (not *_read, not none). */
export function canWrite(actor: Actor, cap: Capability): boolean {
  if (!can(actor, cap)) return false;
  return !isReadOnlyScope(scopeOf(actor, cap));
}

export function requireWrite(actor: Actor, cap: Capability) {
  if (!canWrite(actor, cap)) throw forbidden();
  return scopeOf(actor, cap);
}

/** HR Admin or Partner: the people who run HR processes firm-wide. */
export const isHrOrPartner = (a: Actor) => a.kind === "SYSTEM" || (a.kind === "USER" && (a.role === "HR_ADMIN" || a.role === "PARTNER"));

/** Salary-class data (stipend, F&F amounts): Partner / HR firm-wide (permissions invariant 5). */
export const seesSalaryFirm = (a: Actor) => scopeOf(a, "salary.view") === "firm";

/**
 * Client names in HR screens only for Partner / Manager. HR Admin has no client data (invariant 6) and
 * Staff/Articles see the counts on their own record.
 */
export const seesClientNames = (a: Actor) => a.kind === "SYSTEM" || (a.kind === "USER" && (a.role === "PARTNER" || a.role === "MANAGER"));

/** True when `userId` is inside the actor's people scope for a capability (self / team / firm). */
export async function personInScope(actor: Actor, cap: Capability, userId: string): Promise<boolean> {
  const scope = scopeOf(actor, cap);
  if (scope === "none") return false;
  const n = await db().user.count({ where: { AND: [{ id: userId }, userWhere(actor, scope)] } });
  return n > 0;
}

export async function namesOf(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await db().user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
  return new Map(rows.map((u) => [u.id, u.displayName]));
}

/** HR Admins and (optionally) Partners, for notifications. */
export async function hrPeople(withPartners = false): Promise<string[]> {
  const rows = await db().user.findMany({ where: { active: true, isSystem: false, role: { in: withPartners ? ["HR_ADMIN", "PARTNER"] : ["HR_ADMIN"] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Store a generated text (letter body) or an uploaded file as a Document row with one version.
 * HR documents carry employeeUserId so they never appear in client folders.
 */
export async function storeHrDocument(
  tx: Tx,
  actor: Actor,
  opts: { segments: string[]; fileName: string; data: Buffer; kind: string; employeeUserId?: string | null; sourceType?: string },
) {
  const stored = await storeFile(["_hr", ...opts.segments], opts.fileName, opts.data);
  const doc = await tx.document.create({
    data: {
      name: opts.fileName,
      kind: opts.kind,
      sourceType: opts.sourceType ?? "GENERATED",
      confidentiality: "HR",
      employeeUserId: opts.employeeUserId ?? null,
      createdById: idOf(actor),
      versions: {
        create: { version: 1, storagePath: stored.storagePath, originalName: opts.fileName, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: idOf(actor) },
      },
    },
  });
  await writeAudit(tx, actor, { entityType: "Document", entityId: doc.id, action: "CREATE", after: { kind: opts.kind, name: opts.fileName, employeeUserId: opts.employeeUserId ?? null } });
  return doc;
}

/** Latest version's stored path of a document. */
export async function latestVersion(documentId: string) {
  return db().documentVersion.findFirst({ where: { documentId }, orderBy: { version: "desc" } });
}

export const minutesToHoursText = (m: number) => {
  const h = Math.round((m / 60) * 10) / 10;
  return `${h} hr${h === 1 ? "" : "s"} logged`;
};
