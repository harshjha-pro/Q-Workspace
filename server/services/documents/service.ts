import { db, transaction } from "../../lib/db";
import { forbidden, notFound } from "../../lib/errors";
import { can } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { readStoredFile } from "../../lib/storage";
import { writeAudit, logSensitiveView } from "../../audit";
import { allowedConfidentiality } from "../dms/access";

/**
 * Authorised download of a stored file. Files are never served statically: every download
 * checks access, is audited, and HR documents are logged as sensitive views.
 */
export async function documentForDownload(actor: Actor, documentId: string) {
  const doc = await db().document.findUnique({ where: { id: documentId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!doc || !doc.versions[0]) throw notFound("Document");
  if (doc.employeeUserId) {
    const self = actor.kind === "USER" && actor.userId === doc.employeeUserId;
    if (!self && !can(actor, "hr.records.manage") && actor.role !== "PARTNER") throw forbidden();
    if (!self) await logSensitiveView(actor, "SALARY", "Document", doc.id, "employee document");
  } else if (doc.clientId) {
    await assertClientAccess(actor, "dms.view", doc.clientId);
    // Phase 3 (P3-26): BILLING / SALARY / HR client documents are narrower than client access.
    if (!allowedConfidentiality(actor).includes(doc.confidentiality)) throw forbidden("This document is confidential.");
    if (doc.confidentiality === "FINANCIALS" || doc.confidentiality === "NOTICE") {
      await logSensitiveView(actor, doc.confidentiality === "FINANCIALS" ? "FINANCIALS" : "NOTICE", "Document", doc.id);
    }
  } else if (actor.kind !== "SYSTEM" && actor.role !== "PARTNER") {
    throw forbidden();
  }
  const v = doc.versions[0];
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Document", entityId: doc.id, action: "DOWNLOAD", after: { version: v.version } }));
  return { data: await readStoredFile(v.storagePath), fileName: v.originalName, mimeType: v.mimeType };
}

export async function listEmployeeDocuments(actor: Actor, userId: string) {
  const self = actor.kind === "USER" && actor.userId === userId;
  if (!self && !can(actor, "hr.records.manage") && actor.role !== "PARTNER") return [];
  return db().document.findMany({ where: { employeeUserId: userId, archivedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
}
