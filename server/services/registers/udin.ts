import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { diffDays, todayIst } from "../../lib/dates";
import { getSettingNumber } from "../settings/service";
import { idOf } from "./common";

// ICAI UDINs are 18 characters (year, membership number, random part); ICSI UDINs are 17.
// Only shape is checked: the portals are the authority on validity.
const udinShape = /^[A-Z0-9]{17,18}$/;
const generateInput = z.object({ udin: z.string().trim().toUpperCase().regex(udinShape, "A UDIN is 17–18 letters and digits"), generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), signedDocumentId: z.string().nullable().optional() });

/** UDIN register (P2-30): a sign-off creates an AWAITING row; the partner records the UDIN generated on the portal. */
export async function recordUdin(actor: Actor, id: string, input: z.input<typeof generateInput>) {
  authorize(actor, "udin.record");
  const d = parse(generateInput, input);
  const r = await db().uDINRecord.findUnique({ where: { id } });
  if (!r) throw notFound("UDIN record");
  if (r.status !== "AWAITING") throw ruleViolation("A UDIN is already recorded for this document.");
  if (d.generatedOn < r.signingDate) throw new DomainError("VALIDATION", "The UDIN date is before the signing date.", { generatedOn: "Check the date" });
  if (d.generatedOn > todayIst()) throw new DomainError("VALIDATION", "The UDIN date cannot be in the future.", { generatedOn: "Check the date" });
  if (await db().uDINRecord.findUnique({ where: { udin: d.udin } })) throw ruleViolation("This UDIN is already recorded against another document.");
  return transaction(async (tx) => {
    const after = await tx.uDINRecord.update({ where: { id }, data: { udin: d.udin, generatedOn: d.generatedOn, signedDocumentId: d.signedDocumentId ?? null, status: "GENERATED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "UDINRecord", entityId: id, action: "GENERATED", after: d });
    return after;
  });
}

export async function revokeUdin(actor: Actor, id: string, reason: string) {
  authorize(actor, "udin.record");
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  const r = await db().uDINRecord.findUnique({ where: { id } });
  if (!r) throw notFound("UDIN record");
  await transaction(async (tx) => {
    await tx.uDINRecord.update({ where: { id }, data: { status: "REVOKED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "UDINRecord", entityId: id, action: "REVOKE", reason });
  });
}

/** Mark a batch as reconciled against the portal's UDIN list. */
export async function reconcileUdins(actor: Actor, ids: string[]) {
  authorize(actor, "udin.record");
  await transaction(async (tx) => {
    const r = await tx.uDINRecord.updateMany({ where: { id: { in: ids }, status: "GENERATED" }, data: { reconciledAt: new Date() } });
    await writeAudit(tx, actor, { entityType: "UDINRecord", entityId: "-", action: "RECONCILE", after: { count: r.count } });
  });
}

export async function listUdins(actor: Actor, f: { status?: string } = {}) {
  authorize(actor, "udin.record");
  const overdueAfter = await getSettingNumber("udin.awaitingDays", 7);
  const rows = await db().uDINRecord.findMany({ where: f.status ? { status: f.status } : {}, orderBy: [{ status: "asc" }, { signingDate: "desc" }], take: 500 });
  const [clients, partners] = await Promise.all([
    db().client.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, name: true } }),
    db().user.findMany({ where: { id: { in: rows.map((r) => r.partnerId) } }, select: { id: true, displayName: true } }),
  ]);
  const c = new Map(clients.map((x) => [x.id, x.name]));
  const p = new Map(partners.map((x) => [x.id, x.displayName]));
  const today = todayIst();
  return rows.map((r) => ({ ...r, clientName: c.get(r.clientId) ?? "", partnerName: p.get(r.partnerId) ?? "", overdue: r.status === "AWAITING" && diffDays(r.signingDate, today) > overdueAfter }));
}
