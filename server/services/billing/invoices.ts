import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { can } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { addDays, diffDays, fyKey, fyStartYear, isIsoDate, todayIst } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import { assertInvoiceAccess, authorizeBilling, billingClientIds, billingSettings, idOf, inClients, ISSUED_STATUSES, OPEN_STATUSES, outstandingOf, recomputeInvoice, type InvoiceMeta, invoiceMeta, invoiceMetaColumns } from "./common";
import { computeTotals, formatInvoiceNumber, isIntraState, lineAmount, MAX_INVOICE_NUMBER_LENGTH, placeOfSupply, seriesPrefix } from "./gst";
import { firmProfileGaps, firmStateCode, getFirmProfile } from "./firm";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const lineInput = z.object({
  kind: z.enum(["FEE", "REIMBURSEMENT"]),
  description: z.string().trim().min(1, "Describe the line").max(300),
  sac: z.string().trim().regex(/^(\d{4,8})?$/, "SAC is 4–8 digits").optional(),
  quantityMilli: z.number().int().min(1, "Quantity must be above zero").max(1_000_000_000).default(1000),
  ratePaise: z.number().int().min(0, "Rate cannot be negative").max(100_000_000_000),
  engagementId: z.string().nullish(),
  disbursementId: z.string().nullish(),
});
const draftInput = z.object({
  clientId: z.string().min(1, "Pick a client"),
  engagementId: z.string().nullish(),
  date: zIsoDate.refine(isIsoDate, "Use a valid date"),
  recipientGstin: z.string().trim().toUpperCase().nullish(),
  periodFrom: zIsoDate.nullish(),
  periodTo: zIsoDate.nullish(),
  notes: z.string().max(1000).default(""),
  lines: z.array(lineInput).min(1, "Add at least one line").max(100),
});
export type DraftInput = z.input<typeof draftInput>;
export type LineInput = z.input<typeof lineInput>;

// ---------------------------------------------------------------------------
// Draft building
// ---------------------------------------------------------------------------

type Prepared = {
  header: { engagementId: string | null; date: string; placeOfSupply: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; reimbursementPaise: number; totalPaise: number; notes: string };
  lines: { kind: string; description: string; sac: string; quantityMilli: number; ratePaise: number; amountPaise: number; gstRateBp: number; engagementId: string | null; disbursementId: string | null }[];
};

/** Validate references, apply SAC / GST settings, compute place of supply and totals. */
async function prepare(d: z.infer<typeof draftInput>, invoiceId: string | null, keepMeta: InvoiceMeta = {}): Promise<Prepared> {
  const client = await db().client.findUnique({ where: { id: d.clientId }, include: { gstins: { where: { status: "ACTIVE" } } } });
  if (!client) throw notFound("Client");
  const engIds = [...new Set([d.engagementId, ...d.lines.map((l) => l.engagementId)].filter((x): x is string => !!x))];
  const engs = await db().engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, clientId: true, serviceLine: true } });
  if (engs.length !== engIds.length || engs.some((e) => e.clientId !== d.clientId)) throw new DomainError("VALIDATION", "The engagement does not belong to this client.", { engagementId: "Pick an engagement of this client" });
  const engById = new Map(engs.map((e) => [e.id, e]));

  let gstinState: string | null = null;
  let recipientGstin = d.recipientGstin || "";
  if (recipientGstin) {
    const g = client.gstins.find((x) => x.gstin === recipientGstin);
    if (!g) throw new DomainError("VALIDATION", "That GSTIN is not an active registration of this client.", { recipientGstin: "Pick one of the client's GSTINs" });
    gstinState = g.stateCode;
  } else if (client.gstins.length) {
    const g = client.gstins.find((x) => x.stateCode === client.stateCode) ?? client.gstins[0]!;
    recipientGstin = g.gstin;
    gstinState = g.stateCode;
  }

  const disbIds = d.lines.map((l) => l.disbursementId).filter((x): x is string => !!x);
  if (new Set(disbIds).size !== disbIds.length) throw new DomainError("VALIDATION", "A disbursement is listed twice.");
  if (disbIds.length) {
    const ds = await db().disbursement.findMany({ where: { id: { in: disbIds } } });
    const ownLineIds = invoiceId ? (await db().invoiceLine.findMany({ where: { invoiceId }, select: { id: true } })).map((l) => l.id) : [];
    for (const id of disbIds) {
      const x = ds.find((y) => y.id === id);
      if (!x || x.clientId !== d.clientId) throw new DomainError("VALIDATION", "A disbursement does not belong to this client.");
      const free = x.status === "UNRECOVERED" || (x.invoiceLineId !== null && ownLineIds.includes(x.invoiceLineId));
      if (!free) throw ruleViolation("A disbursement is already on another invoice.");
    }
  }

  const s = await billingSettings();
  const firmState = await firmStateCode();
  const pos = placeOfSupply({ firmState, clientState: client.stateCode, recipientGstinState: gstinState });
  const lines = d.lines.map((l) => {
    const engagementId = l.engagementId ?? d.engagementId ?? null;
    const fee = l.kind === "FEE";
    return {
      kind: l.kind,
      description: l.description,
      sac: fee ? l.sac || s.sacFor(engagementId ? engById.get(engagementId)?.serviceLine : null) : "",
      quantityMilli: l.quantityMilli,
      ratePaise: l.ratePaise,
      amountPaise: lineAmount(l.quantityMilli, l.ratePaise),
      gstRateBp: fee ? s.gstRateBp : 0,
      engagementId,
      disbursementId: fee ? null : (l.disbursementId ?? null),
    };
  });
  const totals = computeTotals(lines.map((l) => ({ kind: l.kind as "FEE" | "REIMBURSEMENT", amountPaise: l.amountPaise, gstRateBp: l.gstRateBp })), isIntraState(firmState, pos));
  if (totals.totalPaise <= 0) throw new DomainError("VALIDATION", "The invoice total must be above zero.");
  const meta: InvoiceMeta = { ...keepMeta, text: d.notes || undefined, recipientGstin: recipientGstin || undefined, periodFrom: d.periodFrom ?? undefined, periodTo: d.periodTo ?? undefined };
  return { header: { engagementId: d.engagementId ?? null, date: d.date, placeOfSupply: pos, ...totals, ...invoiceMetaColumns(meta) }, lines };
}

async function writeLines(tx: Tx, actor: Actor, invoiceId: string, lines: Prepared["lines"]) {
  for (const l of lines) {
    const row = await tx.invoiceLine.create({ data: { ...l, invoiceId, createdById: idOf(actor) } });
    if (l.disbursementId) await tx.disbursement.update({ where: { id: l.disbursementId }, data: { status: "ADDED_TO_INVOICE", invoiceLineId: row.id, updatedById: idOf(actor) } });
  }
}

/** Release disbursements held by an invoice's lines (draft edited / discarded, invoice cancelled). */
async function releaseDisbursements(tx: Tx, actor: Actor, invoiceId: string) {
  const lineIds = (await tx.invoiceLine.findMany({ where: { invoiceId }, select: { id: true } })).map((l) => l.id);
  if (lineIds.length) await tx.disbursement.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { status: "UNRECOVERED", invoiceLineId: null, updatedById: idOf(actor) } });
}

/** New DRAFT invoice. No number yet — numbers are allocated on issue so the series stays gapless. */
export async function createDraft(actor: Actor, input: DraftInput, opts: { retainerPeriod?: string } = {}) {
  authorizeBilling(actor, "billing.raise");
  const d = parse(draftInput, input);
  await assertClientAccess(actor, "billing.raise", d.clientId);
  const p = await prepare(d, null, opts.retainerPeriod ? { retainerPeriod: opts.retainerPeriod } : {});
  return transaction(async (tx) => {
    const inv = await tx.invoice.create({ data: { ...p.header, clientId: d.clientId, status: "DRAFT", isRetainerDraft: !!opts.retainerPeriod, createdById: idOf(actor) } });
    await writeLines(tx, actor, inv.id, p.lines);
    await writeAudit(tx, actor, { entityType: "Invoice", entityId: inv.id, action: opts.retainerPeriod ? "RETAINER_DRAFT" : "CREATE_DRAFT", after: { ...p.header, lines: p.lines.length } });
    return inv;
  });
}

/** Edit a draft: header fields that are sent, and the full line list when `lines` is sent. */
export async function updateDraft(actor: Actor, id: string, input: Partial<Omit<DraftInput, "clientId">>) {
  authorizeBilling(actor, "billing.raise");
  const inv = await assertInvoiceAccess(actor, "billing.raise", id);
  if (inv.status !== "DRAFT") throw ruleViolation("Only a draft can be edited; an issued invoice is final (cancel it with a reason instead).");
  const patch = parsePartial(draftInput.omit({ clientId: true }), input);
  const meta = invoiceMeta(inv);
  const existing = await db().invoiceLine.findMany({ where: { invoiceId: id }, orderBy: { createdAt: "asc" } });
  const merged = parse(draftInput, {
    clientId: inv.clientId,
    engagementId: patch.engagementId !== undefined ? patch.engagementId : inv.engagementId,
    date: patch.date ?? inv.date,
    recipientGstin: patch.recipientGstin !== undefined ? patch.recipientGstin : meta.recipientGstin,
    periodFrom: patch.periodFrom !== undefined ? patch.periodFrom : meta.periodFrom,
    periodTo: patch.periodTo !== undefined ? patch.periodTo : meta.periodTo,
    notes: patch.notes ?? meta.text ?? "",
    lines: patch.lines ?? existing.map((l) => ({ kind: l.kind as "FEE" | "REIMBURSEMENT", description: l.description, sac: l.sac, quantityMilli: l.quantityMilli, ratePaise: l.ratePaise, engagementId: l.engagementId, disbursementId: l.disbursementId })),
  });
  const p = await prepare(merged, id, { retainerPeriod: meta.retainerPeriod });
  return transaction(async (tx) => {
    await releaseDisbursements(tx, actor, id);
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    const after = await tx.invoice.update({ where: { id }, data: { ...p.header, updatedById: idOf(actor) } });
    await writeLines(tx, actor, id, p.lines);
    await writeAudit(tx, actor, { entityType: "Invoice", entityId: id, action: "UPDATE_DRAFT", before: inv, after });
    return after;
  });
}

/**
 * Issue (raise) a draft: allocate the next number of the FY series inside the same transaction, so a
 * failure leaves no gap. Retainer drafts need a Partner (billing.approve, P3-35).
 */
export async function issueInvoice(actor: Actor, id: string, opts: { date?: string } = {}) {
  authorizeBilling(actor, "billing.raise");
  const inv = await assertInvoiceAccess(actor, "billing.raise", id);
  if (inv.status !== "DRAFT") throw ruleViolation("This invoice is already issued or cancelled.");
  if (inv.isRetainerDraft) authorizeBilling(actor, "billing.approve");
  const date = opts.date ?? inv.date;
  if (!isIsoDate(date)) throw new DomainError("VALIDATION", "Use a valid date.", { date: "Use a valid date" });
  if (date > todayIst()) throw new DomainError("VALIDATION", "An invoice cannot be dated in the future.", { date: "Pick today or earlier" });
  const firm = await getFirmProfile();
  const gaps = firmProfileGaps(firm);
  if (gaps.length) throw ruleViolation(`Complete the firm profile before issuing invoices (missing: ${gaps.join(", ")}).`);
  if (inv.totalPaise <= 0) throw ruleViolation("The invoice total must be above zero.");
  const s = await billingSettings();
  const fyStart = fyStartYear(date);
  const fy = fyKey(fyStart);
  const prefix = seriesPrefix(s.prefix, fyStart);

  return transaction(async (tx) => {
    const series = (await tx.invoiceSeries.findUnique({ where: { fy_prefix: { fy, prefix } } })) ?? (await tx.invoiceSeries.create({ data: { fy, prefix, nextNumber: 1, createdById: idOf(actor) } }));
    const last = await tx.invoice.findFirst({ where: { seriesId: series.id, number: { not: null } }, orderBy: { date: "desc" }, select: { date: true } });
    if (last && last.date > date) throw ruleViolation(`Invoices in a series run in date order; the last one is dated ${last.date}.`);
    const n = series.nextNumber;
    const number = formatInvoiceNumber(prefix, n);
    if (number.length > MAX_INVOICE_NUMBER_LENGTH) throw ruleViolation(`Invoice number ${number} would exceed ${MAX_INVOICE_NUMBER_LENGTH} characters; shorten the prefix.`);
    // Optimistic guard: only the caller that still sees nextNumber = n may take it.
    const bumped = await tx.invoiceSeries.updateMany({ where: { id: series.id, nextNumber: n }, data: { nextNumber: n + 1, updatedById: idOf(actor) } });
    if (bumped.count !== 1) throw ruleViolation("Another invoice was issued at the same moment. Please try again.");
    const approver = inv.isRetainerDraft || can(actor, "billing.approve");
    const after = await tx.invoice.update({
      where: { id },
      data: {
        number, seriesId: series.id, date, dueDate: addDays(date, s.paymentTermsDays), status: "RAISED",
        raisedById: idOf(actor), raisedAt: new Date(), ...(approver ? { approvedById: idOf(actor), approvedAt: new Date() } : {}), updatedById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "Invoice", entityId: id, action: "ISSUE", before: { status: inv.status }, after: { number, date, status: "RAISED", totalPaise: inv.totalPaise } });
    return after;
  });
}

/**
 * Cancel: a draft is discarded (billing.raise); an issued invoice with nothing received or written off is
 * cancelled with a reason by a Partner (billing.approve). The number stays used, so the series stays gapless.
 */
export async function cancelInvoice(actor: Actor, id: string, reason: string) {
  authorizeBilling(actor, "billing.raise");
  const inv = await assertInvoiceAccess(actor, "billing.raise", id);
  if (!reason?.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  if (inv.status === "CANCELLED") throw ruleViolation("Already cancelled.");
  if (inv.status !== "DRAFT") {
    authorizeBilling(actor, "billing.approve");
    const [alloc, wo] = await Promise.all([db().receiptAllocation.count({ where: { invoiceId: id } }), db().writeOff.count({ where: { invoiceId: id, status: { in: ["APPROVED", "PENDING"] } } })]);
    if (alloc || wo) throw ruleViolation("Receipts or write-offs exist against this invoice; reverse them before cancelling.");
  }
  const meta = invoiceMeta(inv);
  return transaction(async (tx) => {
    await releaseDisbursements(tx, actor, id);
    const after = await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), ...invoiceMetaColumns({ ...meta, cancelReason: reason.trim() }), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Invoice", entityId: id, action: inv.status === "DRAFT" ? "DISCARD_DRAFT" : "CANCEL", reason: reason.trim(), before: { status: inv.status }, after: { status: "CANCELLED" } });
    return after;
  });
}

const eInvoiceInput = z.object({
  irn: z.string().trim().toLowerCase().regex(/^([0-9a-f]{64})?$/, "The IRN is 64 letters/digits (0-9, a-f)"),
  ackNo: z.string().trim().regex(/^(\d{1,20})?$/, "Digits only"),
  ackDate: z.union([z.literal(""), zIsoDate]),
});

/** E-invoice details typed in from the IRP (no IRP connection, A6). Allowed on issued invoices. */
export async function setEInvoiceDetails(actor: Actor, id: string, input: z.input<typeof eInvoiceInput>) {
  authorizeBilling(actor, "billing.raise");
  const inv = await assertInvoiceAccess(actor, "billing.raise", id);
  if (!ISSUED_STATUSES.includes(inv.status)) throw ruleViolation("Enter the IRN after the invoice is issued.");
  const d = parse(eInvoiceInput, input);
  if (d.ackDate && d.ackDate < inv.date) throw new DomainError("VALIDATION", "The acknowledgement is dated before the invoice.", { ackDate: "Check the date" });
  const meta = invoiceMeta(inv);
  return transaction(async (tx) => {
    const after = await tx.invoice.update({ where: { id }, data: { irn: d.irn || null, ...invoiceMetaColumns({ ...meta, ackNo: d.ackNo, ackDate: d.ackDate }), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Invoice", entityId: id, action: "E_INVOICE", before: { irn: inv.irn, ackNo: meta.ackNo, ackDate: meta.ackDate }, after: d });
    return after;
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type InvoiceFilter = { status?: string; clientId?: string; from?: string; to?: string; q?: string; overdue?: boolean; retainerDrafts?: boolean };

export async function listInvoices(actor: Actor, f: InvoiceFilter = {}) {
  const ids = await billingClientIds(actor);
  const today = todayIst();
  const where = {
    AND: [
      inClients(ids),
      f.status === "OPEN" ? { status: { in: OPEN_STATUSES } } : f.status ? { status: f.status } : {},
      f.clientId ? { clientId: f.clientId } : {},
      f.from ? { date: { gte: f.from } } : {},
      f.to ? { date: { lte: f.to } } : {},
      f.overdue ? { status: { in: OPEN_STATUSES }, dueDate: { lt: today } } : {},
      f.retainerDrafts ? { status: "DRAFT", isRetainerDraft: true } : {},
    ],
  };
  let rows = await db().invoice.findMany({ where, orderBy: [{ date: "desc" }, { number: "desc" }], take: 1000 });
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true, code: true, partnerId: true } })).map((c) => [c.id, c]));
  const engs = new Map((await db().engagement.findMany({ where: { id: { in: rows.map((r) => r.engagementId).filter((x): x is string => !!x) } }, select: { id: true, name: true, code: true } })).map((e) => [e.id, e]));
  if (f.q) {
    // Number / client name / code search is done in memory (client is not a relation on Invoice).
    const q = f.q.toLowerCase();
    rows = rows.filter((r) => (r.number ?? "").toLowerCase().includes(q) || (clients.get(r.clientId)?.name ?? "").toLowerCase().includes(q) || (clients.get(r.clientId)?.code ?? "").toLowerCase().includes(q));
  }
  await logSensitiveView(actor, "BILLING", "Invoice", "list", JSON.stringify({ ...f, rows: rows.length }));
  return rows.map((r) => ({
    ...r,
    clientName: clients.get(r.clientId)?.name ?? "",
    clientCode: clients.get(r.clientId)?.code ?? "",
    engagementName: r.engagementId ? (engs.get(r.engagementId)?.name ?? "") : "",
    outstandingPaise: OPEN_STATUSES.includes(r.status) ? outstandingOf(r) : 0,
    ageDays: r.status === "DRAFT" || r.status === "CANCELLED" ? 0 : diffDays(r.date, today),
    overdue: OPEN_STATUSES.includes(r.status) && !!r.dueDate && r.dueDate < today,
  }));
}

export async function getInvoice(actor: Actor, id: string) {
  const inv = await assertInvoiceAccess(actor, "billing.view", id);
  const [lines, allocations, writeOffs, reminders, client, engagement, firm] = await Promise.all([
    db().invoiceLine.findMany({ where: { invoiceId: id }, orderBy: { createdAt: "asc" } }),
    db().receiptAllocation.findMany({ where: { invoiceId: id }, include: { receipt: true }, orderBy: { createdAt: "asc" } }),
    db().writeOff.findMany({ where: { invoiceId: id }, orderBy: { createdAt: "asc" } }),
    db().reminderLog.findMany({ where: { invoiceId: id, kind: "PAYMENT" }, orderBy: { sentAt: "desc" } }),
    db().client.findUniqueOrThrow({ where: { id: inv.clientId }, include: { gstins: { where: { status: "ACTIVE" } }, contacts: { orderBy: [{ isBilling: "desc" }, { isPrimary: "desc" }] } } }),
    inv.engagementId ? db().engagement.findUnique({ where: { id: inv.engagementId } }) : null,
    getFirmProfile(),
  ]);
  const users = new Map((await db().user.findMany({ where: { id: { in: [inv.raisedById, inv.approvedById, inv.createdById, ...writeOffs.flatMap((w) => [w.requestedById, w.approvedById]), ...reminders.map((r) => r.sentById)].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  await logSensitiveView(actor, "BILLING", "Invoice", id, inv.number ?? "draft");
  return {
    ...inv,
    meta: invoiceMeta(inv),
    outstandingPaise: OPEN_STATUSES.includes(inv.status) ? outstandingOf(inv) : 0,
    overdue: OPEN_STATUSES.includes(inv.status) && !!inv.dueDate && inv.dueDate < todayIst(),
    lines,
    allocations,
    writeOffs,
    reminders,
    client,
    engagement,
    firm,
    userNames: users,
  };
}

/**
 * Suggested fee line for an engagement and period (P3-03): fixed fee, one retainer instalment
 * (fee ÷ billing.retainerMonthlyDivisor) or chargeable hours logged × the engagement's hourly rate.
 */
export async function suggestFeeLines(actor: Actor, engagementId: string, period: { from?: string; to?: string } = {}): Promise<LineInput[]> {
  authorizeBilling(actor, "billing.raise");
  const e = await db().engagement.findUnique({ where: { id: engagementId } });
  if (!e) throw notFound("Engagement");
  await assertClientAccess(actor, "billing.raise", e.clientId);
  const s = await billingSettings();
  const sac = s.sacFor(e.serviceLine);
  if (e.feeBasis === "TIME") {
    const entries = await db().workEntry.findMany({
      where: { engagementId, deletedAt: null, chargeable: true, ...(period.from || period.to ? { date: { ...(period.from ? { gte: period.from } : {}), ...(period.to ? { lte: period.to } : {}) } } : {}) },
      select: { minutes: true },
    });
    const minutes = entries.reduce((t, x) => t + x.minutes, 0);
    if (!minutes) return [];
    const range = period.from || period.to ? ` (${period.from ?? "start"} to ${period.to ?? "date"})` : "";
    return [{ kind: "FEE", description: `${e.name} — professional fees for time spent${range}`, sac, quantityMilli: Math.round((minutes * 1000) / 60), ratePaise: e.ratePaisePerHour, engagementId }];
  }
  if (e.feeBasis === "RETAINER") {
    return [{ kind: "FEE", description: `${e.name} — retainer fee${period.from ? ` for ${period.from.slice(0, 7)}` : ""}`, sac, quantityMilli: 1000, ratePaise: Math.round(e.feePaise / s.retainerDivisor), engagementId }];
  }
  return e.feePaise > 0 ? [{ kind: "FEE", description: `${e.name} — professional fees`, sac, quantityMilli: 1000, ratePaise: e.feePaise, engagementId }] : [];
}

// ---------------------------------------------------------------------------
// Engagement billing status (for other modules)
// ---------------------------------------------------------------------------

export type EngagementBillingStatus = "NOT_YET_BILLED" | "INVOICE_RAISED" | "PARTLY_RECEIVED" | "FULLY_RECEIVED" | "WRITTEN_OFF";
export const ENGAGEMENT_BILLING_LABELS: Record<EngagementBillingStatus, string> = {
  NOT_YET_BILLED: "Not yet billed",
  INVOICE_RAISED: "Invoice raised",
  PARTLY_RECEIVED: "Partly received",
  FULLY_RECEIVED: "Fully received",
  WRITTEN_OFF: "Written off",
};

function rollUp(invs: { status: string; totalPaise: number; receivedPaise: number; writtenOffPaise: number; date: string }[]) {
  const billed = invs.reduce((t, i) => t + i.totalPaise, 0);
  const received = invs.reduce((t, i) => t + i.receivedPaise, 0);
  const writtenOff = invs.reduce((t, i) => t + i.writtenOffPaise, 0);
  let status: EngagementBillingStatus;
  if (!invs.length) status = "NOT_YET_BILLED";
  else if (invs.every((i) => i.status === "RAISED")) status = "INVOICE_RAISED";
  else if (invs.every((i) => i.status === "WRITTEN_OFF")) status = "WRITTEN_OFF";
  else if (invs.every((i) => i.status === "FULLY_RECEIVED" || i.status === "WRITTEN_OFF")) status = "FULLY_RECEIVED";
  else status = "PARTLY_RECEIVED";
  return {
    status, label: ENGAGEMENT_BILLING_LABELS[status], billedPaise: billed, receivedPaise: received, writtenOffPaise: writtenOff,
    outstandingPaise: Math.max(0, billed - received - writtenOff), lastInvoiceDate: invs.map((i) => i.date).sort().at(-1) ?? null,
  };
}

/**
 * Billing status of an engagement from its issued (non-cancelled) invoices. No permission check:
 * the CALLER must hold billing.view for the engagement's client before showing the result.
 */
export async function billingStatusFor(engagementId: string) {
  const invs = await db().invoice.findMany({
    where: { status: { in: ISSUED_STATUSES }, OR: [{ engagementId }, { lines: { some: { engagementId } } }] },
    select: { status: true, totalPaise: true, receivedPaise: true, writtenOffPaise: true, date: true },
  });
  return rollUp(invs);
}

/** Batched form of billingStatusFor for lists (same caller obligation). */
export async function billingStatusMap(engagementIds: string[]) {
  const invs = await db().invoice.findMany({
    where: { status: { in: ISSUED_STATUSES }, OR: [{ engagementId: { in: engagementIds } }, { lines: { some: { engagementId: { in: engagementIds } } } }] },
    select: { status: true, totalPaise: true, receivedPaise: true, writtenOffPaise: true, date: true, engagementId: true, lines: { select: { engagementId: true } } },
  });
  const out = new Map<string, ReturnType<typeof rollUp>>();
  for (const id of engagementIds) out.set(id, rollUp(invs.filter((i) => i.engagementId === id || i.lines.some((l) => l.engagementId === id))));
  return out;
}

export { recomputeInvoice };
