import { buildPdf, rs, type PdfBlock } from "../../documents/pdf";
import { amountInWords } from "../../documents/words";
import { formatDate } from "../../lib/dates";
import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { getInvoice } from "./invoices";
import { pct } from "./gst";

const qty = (milli: number) => (milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, ""));

/** GST tax invoice PDF (P3-34). Drafts are watermarked DRAFT, cancelled invoices CANCELLED. */
export async function invoicePdf(actor: Actor, id: string): Promise<{ body: Buffer; fileName: string }> {
  const inv = await getInvoice(actor, id);
  const states = new Map((await db().state.findMany({ select: { code: true, name: true, gstCode: true } })).map((s) => [s.code, s]));
  const pos = states.get(inv.placeOfSupply);
  const firmState = states.get(inv.firm.stateCode);
  const intra = inv.placeOfSupply === inv.firm.stateCode;
  const fees = inv.lines.filter((l) => l.kind === "FEE");
  const reimb = inv.lines.filter((l) => l.kind === "REIMBURSEMENT");
  const rates = [...new Set(fees.map((l) => l.gstRateBp))];
  const rateLabel = rates.length === 1 ? pct(rates[0]!) : "as per lines";
  const halfLabel = rates.length === 1 ? pct(rates[0]! / 2) : "";
  const recipientGstin = inv.meta.recipientGstin ?? "";

  const blocks: PdfBlock[] = [
    {
      type: "kv", columns: 2, rows: [
        ["Invoice no.", inv.number ?? "DRAFT — not yet numbered"],
        ["Invoice date", formatDate(inv.date)],
        ["Due date", formatDate(inv.dueDate)],
        ["Place of supply", pos ? `${pos.name} (${pos.gstCode})` : inv.placeOfSupply],
        ["Reverse charge", "No"],
        ["Engagement", inv.engagement ? `${inv.engagement.name} (${inv.engagement.code})` : ""],
      ],
    },
    { type: "heading", text: "Bill to" },
    {
      type: "kv", rows: [
        ["Name", inv.client.name],
        ["Address", inv.client.address],
        ["GSTIN", recipientGstin || "Unregistered"],
        ["State", (() => { const st = states.get(recipientGstin ? (inv.client.gstins.find((g) => g.gstin === recipientGstin)?.stateCode ?? "") : (inv.client.stateCode ?? "")); return st ? `${st.name} (${st.gstCode})` : ""; })()],
        ["PAN", inv.client.pan ?? ""],
      ],
    },
    { type: "heading", text: "Professional services" },
    {
      type: "table",
      columns: [{ header: "#", width: 4 }, { header: "Description", width: 40 }, { header: "SAC", width: 10 }, { header: "Qty", width: 7, align: "right" }, { header: "Rate", width: 14, align: "right" }, { header: "Taxable value", width: 16, align: "right" }],
      rows: fees.map((l, i) => [String(i + 1), l.description, l.sac, qty(l.quantityMilli), rs(l.ratePaise, false), rs(l.amountPaise, false)]),
      totals: ["", "Total taxable value", "", "", "", rs(inv.taxablePaise, false)],
    },
    {
      type: "kv", rows: intra
        ? [[`CGST @ ${halfLabel}`, rs(inv.cgstPaise)], [`SGST @ ${halfLabel}`, rs(inv.sgstPaise)]]
        : [[`IGST @ ${rateLabel}`, rs(inv.igstPaise)]],
    },
  ];
  if (reimb.length) {
    blocks.push(
      { type: "heading", text: "Reimbursement of expenses paid on your behalf (as pure agent — not part of taxable value)" },
      {
        type: "table",
        columns: [{ header: "#", width: 4 }, { header: "Description", width: 70 }, { header: "Amount", width: 17, align: "right" }],
        rows: reimb.map((l, i) => [String(i + 1), l.description, rs(l.amountPaise, false)]),
        totals: ["", "Total reimbursements", rs(inv.reimbursementPaise, false)],
      },
    );
  }
  blocks.push(
    { type: "kv", rows: [["Invoice total", rs(inv.totalPaise)], ["Amount in words", amountInWords(inv.totalPaise)]] },
    { type: "heading", text: "Payment details" },
    {
      type: "kv", rows: [
        ["Bank", inv.firm.bankName],
        ["Account no.", inv.firm.bankAccount],
        ["IFSC", inv.firm.bankIfsc],
        ["UPI ID", inv.firm.upiId],
      ],
    },
  );
  if (inv.irn) {
    blocks.push({ type: "heading", text: "E-invoice" }, { type: "kv", rows: [["IRN", inv.irn], ["Ack no.", inv.meta.ackNo ?? ""], ["Ack date", formatDate(inv.meta.ackDate)]] });
  }
  if (inv.firm.invoiceNote) blocks.push({ type: "text", text: inv.firm.invoiceNote, size: 8.5 });
  if (inv.status === "CANCELLED" && inv.meta.cancelReason) blocks.push({ type: "text", text: `Cancelled: ${inv.meta.cancelReason}`, bold: true });
  blocks.push({ type: "signature", lines: [`For ${inv.firm.name}`, "", "Authorised signatory"] });
  blocks.push({ type: "text", text: "This is a computer-generated invoice.", size: 8, align: "center" });

  const body = await buildPdf({
    title: "Tax Invoice",
    header: [inv.firm.name, inv.firm.address, `GSTIN: ${inv.firm.gstin || "—"}${firmState ? `  ·  State: ${firmState.name} (${firmState.gstCode})` : ""}${inv.firm.pan ? `  ·  PAN: ${inv.firm.pan}` : ""}`, [inv.firm.email, inv.firm.phone].filter(Boolean).join("  ·  ")].filter(Boolean),
    subtitle: "Original for recipient",
    blocks,
    footer: inv.number ?? "Draft",
    watermark: inv.status === "DRAFT" ? "DRAFT" : inv.status === "CANCELLED" ? "CANCELLED" : undefined,
  });
  return { body, fileName: `${(inv.number ?? `draft-${inv.id.slice(-6)}`).replace(/[^\w-]/g, "_")}.pdf` };
}
