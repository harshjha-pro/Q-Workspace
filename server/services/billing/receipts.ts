import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { can } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { isIsoDate, todayIst } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import { notifyUsers } from "../notifications/service";
import { assertInvoiceAccess, authorizeBilling, billingClientIds, idOf, inClients, isReversed, OPEN_STATUSES, outstandingOf, recomputeInvoice, staffOnly, tdsOf, type ReceiptMeta, receiptMeta, receiptMetaColumns } from "./common";

export const RECEIPT_MODES = ["UPI", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH"] as const;

const allocInput = z.object({ invoiceId: z.string().min(1), amountPaise: z.number().int().positive("Allocation must be above zero") });
const receiptInput = z.object({
  clientId: z.string().min(1, "Pick a client"),
  date: zIsoDate.refine(isIsoDate, "Use a valid date"),
  amountPaise: z.number().int().min(0, "Amount cannot be negative"),
  tdsPaise: z.number().int().min(0, "TDS cannot be negative").default(0),
  mode: z.enum(RECEIPT_MODES),
  reference: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
  allocations: z.array(allocInput).max(50).default([]),
});
export type ReceiptInput = z.input<typeof receiptInput>;

/** Apply allocations to open invoices of the client, never beyond an invoice's outstanding amount. */
async function allocate(tx: Tx, actor: Actor, receiptId: string, clientId: string, allocations: { invoiceId: string; amountPaise: number }[]) {
  const ids = allocations.map((a) => a.invoiceId);
  if (new Set(ids).size !== ids.length) throw new DomainError("VALIDATION", "An invoice is listed twice.");
  for (const a of allocations) {
    const inv = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
    if (!inv || inv.clientId !== clientId) throw new DomainError("VALIDATION", "An invoice does not belong to this client.");
    if (!OPEN_STATUSES.includes(inv.status)) throw ruleViolation(`Invoice ${inv.number ?? ""} is not open for receipts.`);
    if (a.amountPaise > outstandingOf(inv)) throw ruleViolation(`The allocation to ${inv.number} is more than its balance.`);
    await tx.receiptAllocation.create({ data: { receiptId, invoiceId: a.invoiceId, amountPaise: a.amountPaise, createdById: idOf(actor) } });
    await recomputeInvoice(tx, a.invoiceId);
  }
}

/**
 * Manual receipt (A9 / P4-07): money received by UPI / NEFT / RTGS / IMPS / cheque / cash plus TDS the
 * client deducted. Receipt + TDS is what settles invoices; any part not allocated stays as an advance.
 */
export async function recordReceipt(actor: Actor, input: ReceiptInput) {
  authorizeBilling(actor, "billing.receipt.record");
  const d = parse(receiptInput, input);
  await assertClientAccess(actor, "billing.receipt.record", d.clientId);
  if (d.date > todayIst()) throw new DomainError("VALIDATION", "A receipt cannot be dated in the future.", { date: "Pick today or earlier" });
  if (d.amountPaise + d.tdsPaise <= 0) throw new DomainError("VALIDATION", "Enter the amount received or TDS.", { amountPaise: "Required" });
  if (d.mode !== "CASH" && d.amountPaise > 0 && !d.reference) throw new DomainError("VALIDATION", "Enter the UTR / cheque / UPI reference.", { reference: "Required for non-cash receipts" });
  const allocated = d.allocations.reduce((t, a) => t + a.amountPaise, 0);
  if (allocated > d.amountPaise + d.tdsPaise) throw new DomainError("VALIDATION", "Allocations exceed the receipt plus TDS.", { allocations: "Reduce the allocations" });
  return transaction(async (tx) => {
    const meta: ReceiptMeta = { text: d.notes || undefined, tdsPaise: d.tdsPaise || undefined };
    const r = await tx.receipt.create({ data: { clientId: d.clientId, date: d.date, amountPaise: d.amountPaise, mode: d.mode, reference: d.reference, ...receiptMetaColumns(meta), createdById: idOf(actor) } });
    await allocate(tx, actor, r.id, d.clientId, d.allocations);
    await writeAudit(tx, actor, { entityType: "Receipt", entityId: r.id, action: "CREATE", after: { ...d } });
    return r;
  });
}

/** Unallocated part of a receipt (advance). */
export async function unallocatedOf(receiptId: string) {
  const r = await db().receipt.findUniqueOrThrow({ where: { id: receiptId }, include: { allocations: true } });
  if (isReversed(r)) return 0;
  return r.amountPaise + tdsOf(r) - r.allocations.reduce((t, a) => t + a.amountPaise, 0);
}

/** Allocate an advance (unallocated part of an earlier receipt) to open invoices. */
export async function allocateReceipt(actor: Actor, receiptId: string, allocations: z.input<typeof allocInput>[]) {
  authorizeBilling(actor, "billing.receipt.record");
  const r = await db().receipt.findUnique({ where: { id: receiptId } });
  if (!r) throw notFound("Receipt");
  await assertClientAccess(actor, "billing.receipt.record", r.clientId);
  if (isReversed(r)) throw ruleViolation("This receipt was reversed.");
  const list = parse(z.array(allocInput).min(1, "Allocate to at least one invoice"), allocations);
  const free = await unallocatedOf(receiptId);
  if (list.reduce((t, a) => t + a.amountPaise, 0) > free) throw ruleViolation("Allocations exceed the unallocated amount of this receipt.");
  return transaction(async (tx) => {
    await allocate(tx, actor, receiptId, r.clientId, list);
    await writeAudit(tx, actor, { entityType: "Receipt", entityId: receiptId, action: "ALLOCATE", after: { allocations: list } });
  });
}

/** Reverse a receipt (bounced cheque, wrong entry): allocations removed, invoices re-opened; the row stays for the trail. */
export async function reverseReceipt(actor: Actor, receiptId: string, reason: string) {
  authorizeBilling(actor, "billing.receipt.record");
  const r = await db().receipt.findUnique({ where: { id: receiptId }, include: { allocations: true } });
  if (!r) throw notFound("Receipt");
  await assertClientAccess(actor, "billing.receipt.record", r.clientId);
  if (!reason?.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  if (isReversed(r)) throw ruleViolation("Already reversed.");
  return transaction(async (tx) => {
    await tx.receiptAllocation.deleteMany({ where: { receiptId } });
    for (const a of r.allocations) await recomputeInvoice(tx, a.invoiceId);
    const meta = receiptMeta(r);
    await tx.receipt.update({ where: { id: receiptId }, data: { ...receiptMetaColumns({ ...meta, reversedAt: todayIst(), reversedReason: reason.trim(), reversedById: idOf(actor) ?? undefined }), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Receipt", entityId: receiptId, action: "REVERSE", reason: reason.trim(), before: { allocations: r.allocations.map((a) => ({ invoiceId: a.invoiceId, amountPaise: a.amountPaise })) } });
  });
}

export async function listReceipts(actor: Actor, f: { clientId?: string; from?: string; to?: string } = {}) {
  const ids = await billingClientIds(actor);
  const rows = await db().receipt.findMany({
    where: { AND: [inClients(ids), f.clientId ? { clientId: f.clientId } : {}, f.from ? { date: { gte: f.from } } : {}, f.to ? { date: { lte: f.to } } : {}] },
    include: { allocations: { include: { invoice: { select: { number: true } } } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true, code: true } })).map((c) => [c.id, c]));
  await logSensitiveView(actor, "BILLING", "Receipt", "list", JSON.stringify({ ...f, rows: rows.length }));
  return rows.map((r) => {
    const meta = receiptMeta(r);
    const allocated = r.allocations.reduce((t, a) => t + a.amountPaise, 0);
    const tds = meta.tdsPaise ?? 0;
    return {
      ...r, clientName: clients.get(r.clientId)?.name ?? "", clientCode: clients.get(r.clientId)?.code ?? "", tdsPaise: tds, note: meta.text ?? "",
      reversed: !!meta.reversedAt, reversedReason: meta.reversedReason ?? "", allocatedPaise: allocated, unallocatedPaise: meta.reversedAt ? 0 : r.amountPaise + tds - allocated,
    };
  });
}

/** Open invoices of a client for the receipt allocation form. */
export async function openInvoicesForClient(actor: Actor, clientId: string) {
  staffOnly(actor);
  await assertClientAccess(actor, "billing.view", clientId);
  const rows = await db().invoice.findMany({ where: { clientId, status: { in: OPEN_STATUSES } }, orderBy: { date: "asc" } });
  return rows.map((r) => ({ id: r.id, number: r.number ?? "", date: r.date, totalPaise: r.totalPaise, outstandingPaise: outstandingOf(r) }));
}

// ---------------------------------------------------------------------------
// Write-offs
// ---------------------------------------------------------------------------

const writeOffInput = z.object({ amountPaise: z.number().int().positive().optional(), reason: z.string().trim().min(3, "Give a reason").max(500) });

/**
 * Write off (part of) an invoice's balance. A Partner's request is approved at once; a Practice Admin's
 * request waits for a Partner (billing.approve) and the Partners are notified.
 */
export async function requestWriteOff(actor: Actor, invoiceId: string, input: z.input<typeof writeOffInput>) {
  authorizeBilling(actor, "billing.raise");
  const inv = await assertInvoiceAccess(actor, "billing.raise", invoiceId);
  const d = parse(writeOffInput, input);
  if (!OPEN_STATUSES.includes(inv.status)) throw ruleViolation("Only an open invoice can be written off.");
  const pending = await db().writeOff.aggregate({ where: { invoiceId, status: "PENDING" }, _sum: { amountPaise: true } });
  const available = outstandingOf(inv) - (pending._sum.amountPaise ?? 0);
  const amount = d.amountPaise ?? available;
  if (amount <= 0 || amount > available) throw new DomainError("VALIDATION", "The write-off is more than the balance.", { amountPaise: "At most the balance" });
  const approveNow = can(actor, "billing.approve");
  const w = await transaction(async (tx) => {
    const row = await tx.writeOff.create({
      data: { invoiceId, amountPaise: amount, reason: d.reason, status: approveNow ? "APPROVED" : "PENDING", requestedById: idOf(actor)!, approvedById: approveNow ? idOf(actor) : null, decidedAt: approveNow ? new Date() : null, createdById: idOf(actor) },
    });
    if (approveNow) await recomputeInvoice(tx, invoiceId);
    await writeAudit(tx, actor, { entityType: "WriteOff", entityId: row.id, action: approveNow ? "APPROVE" : "REQUEST", reason: d.reason, after: { invoiceId, amountPaise: amount } });
    return row;
  });
  if (!approveNow) {
    const partners = await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } });
    await notifyUsers(partners.map((p) => p.id), { kind: "BILLING", title: `Write-off awaiting approval: ${inv.number}`, body: d.reason, link: `/billing/invoices/${invoiceId}`, entityType: "WriteOff", entityId: w.id, dedupeKey: `writeoff:${w.id}` });
  }
  return w;
}

export async function decideWriteOff(actor: Actor, writeOffId: string, approve: boolean) {
  authorizeBilling(actor, "billing.approve");
  const w = await db().writeOff.findUnique({ where: { id: writeOffId } });
  if (!w) throw notFound("Write-off");
  const inv = await assertInvoiceAccess(actor, "billing.approve", w.invoiceId);
  if (w.status !== "PENDING") throw ruleViolation("Already decided.");
  if (approve && w.amountPaise > outstandingOf(inv)) throw ruleViolation("The balance is now less than this write-off; reject it and raise a new one.");
  return transaction(async (tx) => {
    const after = await tx.writeOff.update({ where: { id: writeOffId }, data: { status: approve ? "APPROVED" : "REJECTED", approvedById: idOf(actor), decidedAt: new Date(), updatedById: idOf(actor) } });
    if (approve) await recomputeInvoice(tx, w.invoiceId);
    await writeAudit(tx, actor, { entityType: "WriteOff", entityId: writeOffId, action: approve ? "APPROVE" : "REJECT", before: { status: w.status }, after: { status: after.status } });
    return after;
  });
}

export async function pendingWriteOffs(actor: Actor) {
  const ids = await billingClientIds(actor);
  const rows = await db().writeOff.findMany({ where: { status: "PENDING", invoice: inClients(ids) }, include: { invoice: { select: { number: true, clientId: true } } }, orderBy: { createdAt: "asc" } });
  return rows;
}
