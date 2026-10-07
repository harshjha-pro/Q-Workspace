import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { diffDays, isIsoDate, todayIst } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import { authorizeBilling, billingClientIds, idOf, inClients, staffOnly } from "./common";
import { bucketOf, BUCKETS } from "./ageing";

export const DISBURSEMENT_KINDS = ["GOVT_FEE", "ROC_FEE", "CHALLAN", "STAMP_DUTY", "TRAVEL", "OTHER"] as const;
export const DISBURSEMENT_KIND_LABELS: Record<string, string> = { GOVT_FEE: "Government fee", ROC_FEE: "ROC fee", CHALLAN: "Challan", STAMP_DUTY: "Stamp duty", TRAVEL: "Travel", OTHER: "Other" };
export const DISBURSEMENT_STATUS_LABELS: Record<string, string> = { UNRECOVERED: "Unrecovered", ADDED_TO_INVOICE: "Added to invoice", RECOVERED: "Recovered" };

const input = z.object({
  clientId: z.string().min(1, "Pick a client"),
  engagementId: z.string().nullish(),
  date: zIsoDate.refine(isIsoDate, "Use a valid date"),
  amountPaise: z.number().int().positive("Amount must be above zero"),
  kind: z.enum(DISBURSEMENT_KINDS),
  description: z.string().trim().min(3, "Describe what was paid").max(300),
  paidBy: z.string().trim().max(80).default("FIRM"),
  receiptDocumentId: z.string().nullish(),
});
export type DisbursementInput = z.input<typeof input>;

async function checkEngagement(clientId: string, engagementId: string | null | undefined) {
  if (!engagementId) return;
  const e = await db().engagement.findUnique({ where: { id: engagementId }, select: { clientId: true } });
  if (!e || e.clientId !== clientId) throw new DomainError("VALIDATION", "The engagement does not belong to this client.", { engagementId: "Pick an engagement of this client" });
}

/** Amount paid on a client's behalf (P3-30): government / ROC fees, challans, stamp duty… recovered through an invoice. */
export async function createDisbursement(actor: Actor, data: DisbursementInput) {
  authorizeBilling(actor, "disbursement.manage");
  const d = parse(input, data);
  await assertClientAccess(actor, "disbursement.manage", d.clientId);
  await checkEngagement(d.clientId, d.engagementId);
  if (d.date > todayIst()) throw new DomainError("VALIDATION", "The payment date cannot be in the future.", { date: "Pick today or earlier" });
  return transaction(async (tx) => {
    const row = await tx.disbursement.create({ data: { ...d, engagementId: d.engagementId ?? null, receiptDocumentId: d.receiptDocumentId ?? null, status: "UNRECOVERED", createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Disbursement", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
}

export async function updateDisbursement(actor: Actor, id: string, data: Partial<DisbursementInput>) {
  authorizeBilling(actor, "disbursement.manage");
  const before = await db().disbursement.findUnique({ where: { id } });
  if (!before) throw notFound("Disbursement");
  await assertClientAccess(actor, "disbursement.manage", before.clientId);
  if (before.status !== "UNRECOVERED") throw ruleViolation("Only an unrecovered disbursement can be edited (it is already on an invoice).");
  const d = parsePartial(input.omit({ clientId: true }), data);
  await checkEngagement(before.clientId, d.engagementId);
  return transaction(async (tx) => {
    const after = await tx.disbursement.update({ where: { id }, data: { ...d, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Disbursement", entityId: id, action: "UPDATE", before, after });
    return after;
  });
}

export async function listDisbursements(actor: Actor, f: { status?: string; clientId?: string } = {}) {
  const ids = await billingClientIds(actor);
  const rows = await db().disbursement.findMany({
    where: { AND: [inClients(ids), f.status ? { status: f.status } : {}, f.clientId ? { clientId: f.clientId } : {}] },
    orderBy: [{ date: "desc" }],
    take: 1000,
  });
  const today = todayIst();
  const lineIds = rows.map((r) => r.invoiceLineId).filter((x): x is string => !!x);
  const [clients, lines] = await Promise.all([
    db().client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true, code: true } }),
    lineIds.length ? db().invoiceLine.findMany({ where: { id: { in: lineIds } }, select: { id: true, invoice: { select: { id: true, number: true, status: true } } } }) : [],
  ]);
  const c = new Map(clients.map((x) => [x.id, x]));
  const l = new Map(lines.map((x) => [x.id, x.invoice]));
  await logSensitiveView(actor, "BILLING", "Disbursement", "list", JSON.stringify({ ...f, rows: rows.length }));
  return rows.map((r) => {
    const age = diffDays(r.date, today);
    return { ...r, clientName: c.get(r.clientId)?.name ?? "", clientCode: c.get(r.clientId)?.code ?? "", ageDays: age, bucket: r.status === "UNRECOVERED" ? bucketOf(age) : null, invoice: r.invoiceLineId ? (l.get(r.invoiceLineId) ?? null) : null, fromExpenseClaim: !!r.expenseClaimId };
  });
}

/** Ageing of unrecovered amounts (not yet on any invoice). */
export async function unrecoveredAgeing(actor: Actor) {
  const rows = (await listDisbursements(actor, { status: "UNRECOVERED" }));
  const totals = BUCKETS.map(() => 0);
  for (const r of rows) totals[BUCKETS.findIndex((b) => b.key === r.bucket)]! += r.amountPaise;
  return { buckets: BUCKETS.map((b, i) => ({ ...b, amountPaise: totals[i]! })), totalPaise: totals.reduce((a, b) => a + b, 0), count: rows.length };
}

/** Unrecovered disbursements of a client, for the invoice builder. */
export async function unrecoveredForClient(actor: Actor, clientId: string) {
  staffOnly(actor);
  await assertClientAccess(actor, "billing.raise", clientId);
  return db().disbursement.findMany({ where: { clientId, status: "UNRECOVERED" }, orderBy: { date: "asc" } });
}
