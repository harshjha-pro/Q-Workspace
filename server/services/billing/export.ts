import { db, transaction } from "../../lib/db";
import { toCsv } from "../../lib/csv";
import { buildSheet, type Column } from "../../excel/workbook";
import { writeAudit, logSensitiveView } from "../../audit";
import type { Actor } from "../../permissions/actor";
import { billingClientIds, inClients, outstandingOf, readMeta, type InvoiceMeta, type ReceiptMeta, idOf } from "./common";

export const BILLING_EXPORT_KINDS = ["invoices", "lines", "receipts"] as const;
export type BillingExportKind = (typeof BILLING_EXPORT_KINDS)[number];

/** Rupees with two decimals as a number (accounting packages import numbers, not "Rs." strings). */
const r = (paise: number) => Math.round(paise) / 100;

/**
 * Generic accounting export (P4-01 replaced by Excel/CSV, A-list). Column layouts are documented in the
 * Phase 3 report; one row per invoice, per invoice line (with its own GST split) or per receipt.
 * Drafts are never exported; cancelled invoices are, with their status, so the number series is complete.
 */
export async function runBillingExport(actor: Actor, kind: BillingExportKind, format: "csv" | "xlsx", f: { from?: string; to?: string } = {}) {
  const ids = await billingClientIds(actor);
  const dateWhere = f.from || f.to ? { date: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {};
  let columns: Column[] = [];
  let rows: Record<string, unknown>[] = [];
  const states = new Map((await db().state.findMany({ select: { code: true, gstCode: true, name: true } })).map((s) => [s.code, s]));

  if (kind === "invoices" || kind === "lines") {
    const invs = await db().invoice.findMany({ where: { ...inClients(ids), ...dateWhere, status: { not: "DRAFT" } }, include: { lines: { orderBy: { createdAt: "asc" } } }, orderBy: [{ date: "asc" }, { number: "asc" }] });
    const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(invs.map((i) => i.clientId))] } }, select: { id: true, code: true, name: true } })).map((c) => [c.id, c]));
    const engs = new Map((await db().engagement.findMany({ where: { id: { in: invs.map((i) => i.engagementId).filter((x): x is string => !!x) } }, select: { id: true, code: true } })).map((e) => [e.id, e.code]));
    if (kind === "invoices") {
      columns = [
        { key: "number", header: "Invoice No" }, { key: "date", header: "Invoice Date" }, { key: "dueDate", header: "Due Date" }, { key: "status", header: "Status" },
        { key: "clientCode", header: "Client Code" }, { key: "clientName", header: "Client Name", width: 32 }, { key: "gstin", header: "Recipient GSTIN" },
        { key: "pos", header: "Place of Supply" }, { key: "posCode", header: "POS State Code" }, { key: "engagement", header: "Engagement Code" },
        { key: "taxable", header: "Taxable Value" }, { key: "cgst", header: "CGST" }, { key: "sgst", header: "SGST" }, { key: "igst", header: "IGST" },
        { key: "reimb", header: "Reimbursements (no GST)" }, { key: "total", header: "Invoice Total" }, { key: "received", header: "Received (incl. TDS)" },
        { key: "writtenOff", header: "Written Off" }, { key: "outstanding", header: "Outstanding" }, { key: "irn", header: "IRN", width: 66 }, { key: "ackNo", header: "Ack No" },
        { key: "ackDate", header: "Ack Date" }, { key: "cancelReason", header: "Cancellation Reason" },
      ];
      rows = invs.map((i) => {
        const m = readMeta<InvoiceMeta>(i.notes);
        const c = clients.get(i.clientId);
        return {
          number: i.number, date: i.date, dueDate: i.dueDate ?? "", status: i.status, clientCode: c?.code ?? "", clientName: c?.name ?? "", gstin: m.recipientGstin ?? "",
          pos: states.get(i.placeOfSupply)?.name ?? i.placeOfSupply, posCode: states.get(i.placeOfSupply)?.gstCode ?? "", engagement: i.engagementId ? (engs.get(i.engagementId) ?? "") : "",
          taxable: r(i.taxablePaise), cgst: r(i.cgstPaise), sgst: r(i.sgstPaise), igst: r(i.igstPaise), reimb: r(i.reimbursementPaise), total: r(i.totalPaise),
          received: r(i.receivedPaise), writtenOff: r(i.writtenOffPaise), outstanding: i.status === "CANCELLED" ? 0 : r(outstandingOf(i)), irn: i.irn ?? "", ackNo: m.ackNo ?? "", ackDate: m.ackDate ?? "", cancelReason: m.cancelReason ?? "",
        };
      });
    } else {
      columns = [
        { key: "number", header: "Invoice No" }, { key: "date", header: "Invoice Date" }, { key: "status", header: "Invoice Status" }, { key: "clientCode", header: "Client Code" },
        { key: "clientName", header: "Client Name", width: 32 }, { key: "gstin", header: "Recipient GSTIN" }, { key: "posCode", header: "POS State Code" }, { key: "lineNo", header: "Line No" },
        { key: "type", header: "Line Type" }, { key: "description", header: "Description", width: 40 }, { key: "sac", header: "SAC" }, { key: "qty", header: "Quantity" },
        { key: "rate", header: "Rate" }, { key: "amount", header: "Taxable Value / Amount" }, { key: "gstRate", header: "GST Rate %" }, { key: "cgst", header: "CGST" },
        { key: "sgst", header: "SGST" }, { key: "igst", header: "IGST" }, { key: "lineTotal", header: "Line Total" },
      ];
      for (const i of invs) {
        const m = readMeta<InvoiceMeta>(i.notes);
        const c = clients.get(i.clientId);
        const intra = i.igstPaise === 0 && (i.cgstPaise > 0 || i.sgstPaise > 0);
        i.lines.forEach((l, n) => {
          const fee = l.kind === "FEE";
          const half = fee && intra ? Math.round((l.amountPaise * l.gstRateBp) / 20000) : 0;
          const igst = fee && !intra ? Math.round((l.amountPaise * l.gstRateBp) / 10000) : 0;
          rows.push({
            number: i.number, date: i.date, status: i.status, clientCode: c?.code ?? "", clientName: c?.name ?? "", gstin: m.recipientGstin ?? "", posCode: states.get(i.placeOfSupply)?.gstCode ?? "",
            lineNo: n + 1, type: l.kind, description: l.description, sac: l.sac, qty: l.quantityMilli / 1000, rate: r(l.ratePaise), amount: r(l.amountPaise), gstRate: l.gstRateBp / 100,
            cgst: r(half), sgst: r(half), igst: r(igst), lineTotal: r(l.amountPaise + 2 * half + igst),
          });
        });
      }
    }
  } else {
    const recs = await db().receipt.findMany({ where: { ...inClients(ids), ...dateWhere }, include: { allocations: { include: { invoice: { select: { number: true } } } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(recs.map((x) => x.clientId))] } }, select: { id: true, code: true, name: true } })).map((c) => [c.id, c]));
    columns = [
      { key: "date", header: "Receipt Date" }, { key: "clientCode", header: "Client Code" }, { key: "clientName", header: "Client Name", width: 32 }, { key: "mode", header: "Mode" },
      { key: "reference", header: "Reference (UTR / Cheque / UPI)" }, { key: "amount", header: "Amount Received" }, { key: "tds", header: "TDS Deducted by Client" },
      { key: "settled", header: "Total Settled" }, { key: "allocated", header: "Allocated" }, { key: "advance", header: "Unallocated (Advance)" },
      { key: "allocations", header: "Allocations (Invoice No:Amount)", width: 40 }, { key: "reversed", header: "Reversed" }, { key: "reversalReason", header: "Reversal Reason" }, { key: "notes", header: "Notes" },
    ];
    rows = recs.map((x) => {
      const m = readMeta<ReceiptMeta>(x.notes);
      const tds = m.tdsPaise ?? 0;
      const allocated = x.allocations.reduce((t, a) => t + a.amountPaise, 0);
      const c = clients.get(x.clientId);
      return {
        date: x.date, clientCode: c?.code ?? "", clientName: c?.name ?? "", mode: x.mode, reference: x.reference, amount: r(x.amountPaise), tds: r(tds), settled: r(x.amountPaise + tds),
        allocated: r(allocated), advance: m.reversedAt ? 0 : r(x.amountPaise + tds - allocated), allocations: x.allocations.map((a) => `${a.invoice.number}:${r(a.amountPaise).toFixed(2)}`).join("; "),
        reversed: m.reversedAt ? "Yes" : "No", reversalReason: m.reversedReason ?? "", notes: m.text ?? "",
      };
    });
  }

  const stamp = `${f.from ?? "all"}_${f.to ?? "all"}`;
  const fileName = `billing-${kind}-${stamp}.${format}`;
  const body = format === "csv" ? Buffer.from(toCsv(columns.map((c) => c.header), rows.map((row) => columns.map((c) => row[c.key])))) : await buildSheet(kind, columns, rows);
  await logSensitiveView(actor, "BILLING", "Export", kind, JSON.stringify({ ...f, rows: rows.length }));
  await transaction(async (tx) => {
    await writeAudit(tx, actor, { entityType: "Export", entityId: `billing-${kind}`, action: "EXPORT", after: { kind, format, rows: rows.length, filter: f } });
    await tx.exportJob.create({ data: { kind: `BILLING_${kind.toUpperCase()}_${format.toUpperCase()}`, paramsJson: JSON.stringify(f), rowCount: rows.length, fileName, createdById: idOf(actor) } });
  });
  return { body, fileName, rows: rows.length, contentType: format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
