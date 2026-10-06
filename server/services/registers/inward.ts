import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";
import { idOf, inClients, visibleClientIds } from "./common";

const ioInput = z.object({
  clientId: z.string().min(1),
  direction: z.enum(["IN", "OUT"]),
  documentDesc: z.string().trim().min(3, "Describe the document"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currentLocation: z.string().trim().default(""),
  custodianUserId: z.string().nullable().optional(),
  notes: z.string().default(""),
});

/** Physical documents in and out of the office, with current location and custodian (P2-33). */
export async function recordInwardOutward(actor: Actor, input: z.input<typeof ioInput>) {
  const d = parse(ioInput, input);
  await assertClientAccess(actor, "inwardOutward.manage", d.clientId);
  if (d.date > todayIst()) throw new DomainError("VALIDATION", "Date cannot be in the future.", { date: "Check the date" });
  return transaction(async (tx) => {
    const r = await tx.inwardOutward.create({ data: { ...d, custodianUserId: d.custodianUserId ?? null, handledById: idOf(actor), createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "InwardOutward", entityId: r.id, action: "CREATE", after: d });
    return r;
  });
}

async function load(actor: Actor, id: string) {
  const r = await db().inwardOutward.findUnique({ where: { id } });
  if (!r) throw notFound("Register entry");
  const ids = await visibleClientIds(actor, "inwardOutward.manage");
  if (ids && !ids.includes(r.clientId)) throw forbidden();
  return r;
}

export async function moveDocument(actor: Actor, id: string, input: { currentLocation: string; custodianUserId?: string | null }) {
  const r = await load(actor, id);
  if (r.returnedAt) throw ruleViolation("Already returned.");
  await transaction(async (tx) => {
    await tx.inwardOutward.update({ where: { id }, data: { currentLocation: input.currentLocation, custodianUserId: input.custodianUserId ?? null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "InwardOutward", entityId: id, action: "MOVE", before: r, after: input });
  });
}

export async function markReturned(actor: Actor, id: string) {
  const r = await load(actor, id);
  if (r.returnedAt) throw ruleViolation("Already returned.");
  await transaction(async (tx) => {
    await tx.inwardOutward.update({ where: { id }, data: { returnedAt: new Date(), custodianUserId: null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "InwardOutward", entityId: id, action: "RETURNED" });
  });
}

export async function listInwardOutward(actor: Actor, f: { clientId?: string; open?: boolean; custodianUserId?: string } = {}) {
  const ids = await visibleClientIds(actor, "inwardOutward.manage");
  return db().inwardOutward.findMany({
    where: { ...inClients(ids), ...(f.clientId ? { clientId: f.clientId } : {}), ...(f.open ? { returnedAt: null } : {}), ...(f.custodianUserId ? { custodianUserId: f.custodianUserId } : {}) },
    orderBy: { date: "desc" },
    take: 500,
  });
}
