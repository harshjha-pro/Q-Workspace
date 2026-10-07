import { db, type Tx } from "../../lib/db";
import { storeFile, readStoredFile } from "../../lib/storage";
import type { Actor } from "../../permissions/actor";
import { idOf } from "./common";

/** Store a generated payroll file (Form 16 PDF, Part A data) in the employee's private document area. */
export async function storeEmployeeFile(tx: Tx, actor: Actor, userId: string, name: string, data: Buffer, kind: string) {
  const profile = await tx.employeeProfile.findUnique({ where: { userId }, select: { employeeCode: true } });
  const stored = await storeFile(["_hr", profile?.employeeCode ?? userId, "payroll"], name, data);
  return tx.document.create({
    data: {
      name, kind, sourceType: "GENERATED", confidentiality: "SALARY", employeeUserId: userId, createdById: idOf(actor),
      versions: { create: { version: 1, storagePath: stored.storagePath, originalName: name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: idOf(actor) } },
    },
  });
}

export async function readDocumentText(documentId: string): Promise<string | null> {
  const doc = await db().document.findUnique({ where: { id: documentId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!doc?.versions[0]) return null;
  return (await readStoredFile(doc.versions[0].storagePath)).toString("utf8");
}
