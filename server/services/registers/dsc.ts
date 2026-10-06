import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { diffDays, todayIst } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { idOf, visibleClientIds } from "./common";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
export const CUSTODY = ["OFFICE", "CLIENT", "STAFF"] as const;

// Spec 6.3: the register never stores a PIN. Catch the obvious attempt rather than silently keeping it.
const noPin = (s: string) => !/\b(pin|password|pwd)\b\s*(is|[:=-])?\s*\S{4,}/i.test(s);

const dscInput = z.object({
  holderName: z.string().trim().min(2, "Holder name is required"),
  holderType: z.enum(["DIRECTOR", "PARTNER", "INDIVIDUAL", "AUTHORISED_SIGNATORY"]).default("DIRECTOR"),
  directorId: z.string().nullable().optional(),
  dscClass: z.string().default("CLASS_3"),
  dscType: z.enum(["SIGNING", "ENCRYPTION", "COMBO"]).default("SIGNING"),
  issuer: z.string().trim().default(""),
  tokenSerial: z.string().trim().default(""),
  issueDate: iso.nullable().optional(),
  expiryDate: iso,
  custody: z.enum(CUSTODY).default("OFFICE"),
  location: z.string().trim().default(""),
  custodianUserId: z.string().nullable().optional(),
  notes: z.string().default("").refine(noPin, "Never record a PIN or password here"),
  clientIds: z.array(z.string()).min(1, "Link at least one client"),
});
export type DscInput = z.input<typeof dscInput>;

export async function createDsc(actor: Actor, input: DscInput) {
  authorize(actor, "dsc.manage");
  const d = parse(dscInput, input);
  if (d.issueDate && d.issueDate >= d.expiryDate) throw new DomainError("VALIDATION", "Expiry must be after issue.", { expiryDate: "Check the date" });
  if (d.custody === "STAFF" && !d.custodianUserId) throw new DomainError("VALIDATION", "Name the staff member holding it.", { custodianUserId: "Required" });
  const { clientIds, ...data } = d;
  return transaction(async (tx) => {
    const dsc = await tx.dSC.create({ data: { ...data, directorId: d.directorId ?? null, issueDate: d.issueDate ?? null, custodianUserId: d.custodianUserId ?? null, createdById: idOf(actor), clients: { create: clientIds.map((clientId) => ({ clientId })) } } });
    await writeAudit(tx, actor, { entityType: "DSC", entityId: dsc.id, action: "CREATE", after: d });
    return dsc;
  });
}

export async function updateDsc(actor: Actor, id: string, input: Partial<DscInput>) {
  authorize(actor, "dsc.manage");
  const before = await db().dSC.findUnique({ where: { id }, include: { clients: true } });
  if (!before) throw notFound("DSC");
  const d = parsePartial(dscInput, input);
  const { clientIds, ...data } = d;
  return transaction(async (tx) => {
    const after = await tx.dSC.update({ where: { id }, data: { ...data, updatedById: idOf(actor) } });
    if (clientIds) {
      await tx.dSCClient.deleteMany({ where: { dscId: id, clientId: { notIn: clientIds } } });
      for (const clientId of clientIds) await tx.dSCClient.upsert({ where: { dscId_clientId: { dscId: id, clientId } }, create: { dscId: id, clientId }, update: {} });
    }
    await writeAudit(tx, actor, { entityType: "DSC", entityId: id, action: "UPDATE", before, after: d });
    return after;
  });
}

export type ExpiryState = "EXPIRED" | "CRITICAL" | "SOON" | "OK";
export async function expiryState(expiryDate: string, today = todayIst()): Promise<{ state: ExpiryState; days: number }> {
  const [soon, critical] = await getSetting<number[]>("dsc.expiryAlertDays", [30, 7]);
  const days = diffDays(today, expiryDate);
  return { days, state: days < 0 ? "EXPIRED" : days <= critical! ? "CRITICAL" : days <= soon! ? "SOON" : "OK" };
}

export async function listDscs(actor: Actor, f: { clientId?: string; expiring?: boolean } = {}) {
  const ids = await visibleClientIds(actor, "dsc.view");
  const rows = await db().dSC.findMany({
    where: {
      active: true,
      ...(ids === null ? {} : { clients: { some: { clientId: { in: ids } } } }),
      ...(f.clientId ? { clients: { some: { clientId: f.clientId } } } : {}),
    },
    include: { clients: true },
    orderBy: { expiryDate: "asc" },
  });
  const names = new Map((await db().client.findMany({ where: { id: { in: rows.flatMap((r) => r.clients.map((c) => c.clientId)) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const out = [];
  for (const r of rows) {
    const e = await expiryState(r.expiryDate);
    if (f.expiring && e.state === "OK") continue;
    out.push({ ...r, ...e, clientNames: r.clients.map((c) => names.get(c.clientId) ?? "") });
  }
  return out;
}

const moveInput = z.object({ toCustody: z.enum(CUSTODY), location: z.string().default(""), userId: z.string().nullable().optional(), clientId: z.string().nullable().optional(), note: z.string().default("").refine(noPin, "Never record a PIN or password here") });

/** Movement log: every hand-over between office, client and staff (spec 6.3, P2-31). */
export async function recordMovement(actor: Actor, dscId: string, input: z.input<typeof moveInput>) {
  const d = parse(moveInput, input);
  const dsc = await db().dSC.findUnique({ where: { id: dscId }, include: { clients: true } });
  if (!dsc) throw notFound("DSC");
  const ids = await visibleClientIds(actor, "dsc.movement.record");
  if (ids && !dsc.clients.some((c) => ids.includes(c.clientId))) throw forbidden();
  if (d.toCustody === "STAFF" && !d.userId) throw new DomainError("VALIDATION", "Who is taking it?", { userId: "Required" });
  if (d.toCustody === "CLIENT" && d.clientId && !dsc.clients.some((c) => c.clientId === d.clientId)) throw new DomainError("VALIDATION", "That client is not linked to this DSC.");
  return transaction(async (tx) => {
    const m = await tx.dSCMovement.create({ data: { dscId, fromCustody: dsc.custody, toCustody: d.toCustody, location: d.location, userId: d.userId ?? null, clientId: d.clientId ?? null, note: d.note, createdById: idOf(actor) } });
    await tx.dSC.update({ where: { id: dscId }, data: { custody: d.toCustody, location: d.location, custodianUserId: d.toCustody === "STAFF" ? d.userId ?? null : null } });
    await writeAudit(tx, actor, { entityType: "DSC", entityId: dscId, action: "MOVEMENT", before: { custody: dsc.custody }, after: d });
    return m;
  });
}

export async function movements(actor: Actor, dscId: string) {
  const ids = await visibleClientIds(actor, "dsc.view");
  if (ids) {
    const linked = await db().dSCClient.count({ where: { dscId, clientId: { in: ids } } });
    if (!linked) throw forbidden();
  }
  return db().dSCMovement.findMany({ where: { dscId }, orderBy: { movedAt: "desc" }, take: 100 });
}
