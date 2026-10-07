import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";
import { idOf, namesOf, requireWrite, staffId, zIso } from "./common";

// ---------------------------------------------------------------------------
// Firm asset register (spec 11.11, P3-23). HR manages; Partners read.
// ---------------------------------------------------------------------------

export const ASSET_KINDS = ["LAPTOP", "PHONE", "DONGLE", "OTHER"] as const;
export const ASSET_LABELS: Record<(typeof ASSET_KINDS)[number], string> = { LAPTOP: "Laptop", PHONE: "Phone", DONGLE: "Internet dongle", OTHER: "Other" };
export const CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "LOST"] as const;

const assetInput = z.object({
  tag: z.string().trim().min(1, "Enter the asset tag").max(40),
  kind: z.enum(ASSET_KINDS),
  description: z.string().trim().max(300).default(""),
  serial: z.string().trim().max(100).default(""),
  purchaseDate: zIso.nullish(),
  condition: z.enum(CONDITIONS).default("GOOD"),
});
export type AssetInput = z.input<typeof assetInput>;

/** Assets a person currently holds — used by the exit checklist and the offboarding custody list. */
export async function assetsHeldBy(userId: string) {
  const rows = await db().assetAssignment.findMany({ where: { userId, returnedAt: null }, include: { asset: true }, orderBy: { issuedAt: "asc" } });
  return rows.map((r) => ({ assignmentId: r.id, assetId: r.asset.id, tag: r.asset.tag, kind: r.asset.kind, description: r.asset.description, issuedAt: r.issuedAt, condition: r.asset.condition }));
}

export async function listAssets(actor: Actor) {
  authorize(actor, "assets.manage");
  const rows = await db().asset.findMany({ include: { assignments: { orderBy: { issuedAt: "desc" } } }, orderBy: { tag: "asc" } });
  const names = await namesOf(rows.flatMap((a) => a.assignments.map((x) => x.userId)));
  return rows.map((a) => {
    const current = a.assignments.find((x) => !x.returnedAt) ?? null;
    return { ...a, holder: current ? { userId: current.userId, name: names.get(current.userId) ?? "", issuedAt: current.issuedAt, assignmentId: current.id } : null, history: a.assignments.map((x) => ({ ...x, name: names.get(x.userId) ?? "" })) };
  });
}

/** My assets (everyone may see what they hold). */
export async function myAssets(actor: Actor) {
  return assetsHeldBy(staffId(actor));
}

export async function createAsset(actor: Actor, input: AssetInput) {
  requireWrite(actor, "assets.manage");
  const p = parse(assetInput, input);
  if (await db().asset.findUnique({ where: { tag: p.tag } })) throw ruleViolation("That tag is already used.");
  return transaction(async (tx) => {
    const a = await tx.asset.create({ data: { ...p, purchaseDate: p.purchaseDate ?? null, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Asset", entityId: a.id, action: "CREATE", after: a });
    return a;
  });
}

export async function updateAsset(actor: Actor, assetId: string, input: Partial<AssetInput>) {
  requireWrite(actor, "assets.manage");
  const p = parsePartial(assetInput, input);
  const before = await db().asset.findUnique({ where: { id: assetId } });
  if (!before) throw notFound("Asset");
  if (p.tag && p.tag !== before.tag && (await db().asset.findUnique({ where: { tag: p.tag } }))) throw ruleViolation("That tag is already used.");
  return transaction(async (tx) => {
    const after = await tx.asset.update({ where: { id: assetId }, data: { ...p, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Asset", entityId: assetId, action: "UPDATE", before, after });
    return after;
  });
}

export async function issueAsset(actor: Actor, assetId: string, userId: string, issuedAt = todayIst()) {
  requireWrite(actor, "assets.manage");
  const a = await db().asset.findUnique({ where: { id: assetId }, include: { assignments: { where: { returnedAt: null } } } });
  if (!a) throw notFound("Asset");
  if (a.status === "RETIRED") throw ruleViolation("This asset is retired.");
  if (a.assignments.length) throw ruleViolation("This asset is already issued. Record its return first.");
  const u = await db().user.findUnique({ where: { id: userId } });
  if (!u || !u.active || u.isSystem) throw notFound("Person");
  return transaction(async (tx) => {
    const as = await tx.assetAssignment.create({ data: { assetId, userId, issuedAt, createdById: idOf(actor) } });
    await tx.asset.update({ where: { id: assetId }, data: { status: "ASSIGNED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Asset", entityId: assetId, action: "ISSUE", after: { userId, issuedAt } });
    return as;
  });
}

export async function returnAsset(actor: Actor, assetId: string, condition: (typeof CONDITIONS)[number], returnedAt = todayIst()) {
  requireWrite(actor, "assets.manage");
  if (!CONDITIONS.includes(condition)) throw ruleViolation("Choose the condition.");
  const current = await db().assetAssignment.findFirst({ where: { assetId, returnedAt: null } });
  if (!current) throw ruleViolation("This asset is not issued to anyone.");
  if (returnedAt < current.issuedAt) throw ruleViolation("Return date is before the issue date.");
  await transaction(async (tx) => {
    await tx.assetAssignment.update({ where: { id: current.id }, data: { returnedAt, conditionOnReturn: condition, updatedById: idOf(actor) } });
    await tx.asset.update({ where: { id: assetId }, data: { status: condition === "LOST" ? "RETIRED" : "IN_STOCK", condition, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Asset", entityId: assetId, action: "RETURN", after: { userId: current.userId, returnedAt, condition } });
  });
}

export async function retireAsset(actor: Actor, assetId: string) {
  requireWrite(actor, "assets.manage");
  const a = await db().asset.findUnique({ where: { id: assetId }, include: { assignments: { where: { returnedAt: null } } } });
  if (!a) throw notFound("Asset");
  if (a.assignments.length) throw ruleViolation("Record the return before retiring it.");
  if (a.status === "RETIRED") throw ruleViolation("Already retired.");
  await transaction(async (tx) => {
    await tx.asset.update({ where: { id: assetId }, data: { status: "RETIRED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Asset", entityId: assetId, action: "RETIRE", before: { status: a.status }, after: { status: "RETIRED" } });
  });
}
