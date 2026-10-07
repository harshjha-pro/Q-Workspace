import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { getInvoice, INVOICE_STATUS_LABELS, pct, receiptMeta } from "@/server/services/billing/service";
import { formatInr } from "@/server/lib/money";
import { formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { amountInWords } from "@/server/documents/words";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { invoiceTone } from "../../status";
import { CancelDialog, DecideWriteOff, EInvoiceDialog, IssueDialog, ReminderCopy, WriteOffDialog } from "./invoice-ui";

export const metadata = { title: "Invoice" };

const qty = (milli: number) => (milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, ""));

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "billing.view");
  const { id } = await params;
  const inv = await load(() => getInvoice(actor, id));
  const today = todayIst();
  const canRaise = can(actor, "billing.raise");
  const canApprove = can(actor, "billing.approve");
  const draft = inv.status === "DRAFT";
  const open = inv.status === "RAISED" || inv.status === "PARTLY_RECEIVED";
  const issued = !draft && inv.status !== "CANCELLED";
  const intra = inv.cgstPaise > 0 || inv.sgstPaise > 0;
  const fees = inv.lines.filter((l) => l.kind === "FEE");
  const reimb = inv.lines.filter((l) => l.kind === "REIMBURSEMENT");
  const name = (uid: string | null | undefined) => (uid ? (inv.userNames.get(uid) ?? (uid === "system" ? "System" : "")) : "");
  const reminderText = `Dear ${inv.client.contacts[0]?.name ?? inv.client.name},\n\nThis is a gentle reminder that our invoice ${inv.number ?? ""} dated ${formatDate(inv.date)} for ${formatInr(inv.totalPaise)} has a balance of ${formatInr(inv.outstandingPaise)}. Kindly arrange payment${inv.firm.upiId ? ` (UPI ${inv.firm.upiId})` : ""} and share the payment details.\n\nRegards,\n${inv.firm.name}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={inv.number ?? "Draft invoice"}
        subtitle={<>{inv.client.name} · {formatDate(inv.date)} {inv.isRetainerDraft ? <Badge tone="violet">Retainer</Badge> : null}</>}
        actions={
          <>
            <Badge tone={invoiceTone(inv.status)} className="self-center">{INVOICE_STATUS_LABELS[inv.status] ?? inv.status}</Badge>
            {inv.overdue ? <Badge tone="red" className="self-center">Overdue</Badge> : null}
            <a href={`/api/billing/invoices/${inv.id}/pdf`} className={buttonVariants({ size: "sm", variant: "secondary" })}>PDF{draft ? " (draft)" : ""}</a>
            {draft && canRaise ? <Link href={`/billing/invoices/${inv.id}/edit`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Edit</Link> : null}
            {draft && canRaise && (!inv.isRetainerDraft || canApprove) ? <IssueDialog id={inv.id} date={inv.date} today={today} retainer={inv.isRetainerDraft} /> : null}
            {issued && canRaise ? <EInvoiceDialog id={inv.id} irn={inv.irn ?? ""} ackNo={inv.meta.ackNo ?? ""} ackDate={inv.meta.ackDate ?? ""} /> : null}
            {open && canRaise ? <WriteOffDialog id={inv.id} balance={formatInr(inv.outstandingPaise)} approver={canApprove} /> : null}
            {open && canRaise ? <ReminderCopy invoiceId={inv.id} ruleCode="MANUAL" text={reminderText} /> : null}
            {canRaise && (draft || (canApprove && inv.status === "RAISED" && inv.allocations.length === 0)) ? <CancelDialog id={inv.id} draft={draft} /> : null}
          </>
        }
      />
      {draft && inv.isRetainerDraft && !canApprove ? <Alert tone="info">Retainer drafts are issued by a Partner.</Alert> : null}
      {inv.status === "CANCELLED" && inv.meta.cancelReason ? <Alert tone="warn">Cancelled: {inv.meta.cancelReason}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle><span className="text-xs text-muted">Place of supply {inv.placeOfSupply} · {intra ? "intra-state (CGST + SGST)" : "inter-state (IGST)"}</span></CardHeader>
          <Table>
            <THead><tr><TH>Description</TH><TH>SAC</TH><TH className="text-right">Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Amount</TH><TH className="text-right">GST</TH></tr></THead>
            <TBody>
              {fees.map((l) => (
                <TR key={l.id}><TD>{l.description}</TD><TD className="font-mono text-xs">{l.sac}</TD><TD className="text-right">{qty(l.quantityMilli)}</TD><TD className="text-right tabular-nums">{formatInr(l.ratePaise)}</TD><TD className="text-right tabular-nums">{formatInr(l.amountPaise)}</TD><TD className="text-right">{pct(l.gstRateBp)}</TD></TR>
              ))}
              {reimb.map((l) => (
                <TR key={l.id}><TD>{l.description} <Badge>Reimbursement · no GST</Badge></TD><TD /><TD /><TD /><TD className="text-right tabular-nums">{formatInr(l.amountPaise)}</TD><TD className="text-right">—</TD></TR>
              ))}
            </TBody>
          </Table>
          <CardContent className="space-y-1 text-sm">
            <Row k="Taxable value" v={formatInr(inv.taxablePaise)} />
            {intra ? <><Row k="CGST" v={formatInr(inv.cgstPaise)} /><Row k="SGST" v={formatInr(inv.sgstPaise)} /></> : <Row k="IGST" v={formatInr(inv.igstPaise)} />}
            {inv.reimbursementPaise ? <Row k="Reimbursements" v={formatInr(inv.reimbursementPaise)} /> : null}
            <Row k="Total" v={formatInr(inv.totalPaise)} strong />
            <p className="text-xs text-muted">{amountInWords(inv.totalPaise)}</p>
            {issued ? <><Row k="Received (incl. TDS)" v={formatInr(inv.receivedPaise)} /><Row k="Written off" v={formatInr(inv.writtenOffPaise)} /><Row k="Balance" v={formatInr(inv.outstandingPaise)} strong /></> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row k="Client" v={inv.client.name} />
            <Row k="Recipient GSTIN" v={inv.meta.recipientGstin || "Unregistered"} />
            <Row k="Engagement" v={inv.engagement ? inv.engagement.name : "—"} />
            {inv.meta.periodFrom ? <Row k="Period" v={`${formatDate(inv.meta.periodFrom)} – ${formatDate(inv.meta.periodTo)}`} /> : null}
            <Row k="Due date" v={formatDate(inv.dueDate) || "On issue"} />
            <Row k="IRN" v={inv.irn ? `${inv.irn.slice(0, 12)}…` : "—"} />
            {inv.meta.ackNo ? <Row k="Ack" v={`${inv.meta.ackNo} · ${formatDate(inv.meta.ackDate)}`} /> : null}
            <Row k="Created by" v={name(inv.createdById)} />
            {inv.raisedAt ? <Row k="Issued" v={`${name(inv.raisedById)} · ${formatDateTime(inv.raisedAt)}`} /> : null}
            {inv.approvedAt ? <Row k="Approved" v={name(inv.approvedById)} /> : null}
            {inv.meta.text ? <p className="pt-2 text-xs text-muted">{inv.meta.text}</p> : null}
          </CardContent>
        </Card>
      </div>

      {issued ? (
        <Card>
          <CardHeader><CardTitle>Receipts</CardTitle>{open && can(actor, "billing.receipt.record") ? <Link href={`/billing/receipts?clientId=${inv.clientId}`} className="text-sm text-brand hover:underline">Record receipt</Link> : null}</CardHeader>
          <Table>
            <THead><tr><TH>Date</TH><TH>Mode</TH><TH>Reference</TH><TH className="text-right">Allocated here</TH><TH className="text-right">TDS on receipt</TH></tr></THead>
            <TBody>
              {inv.allocations.length === 0 ? <TR><TD colSpan={5} className="text-muted">No receipts yet.</TD></TR> : null}
              {inv.allocations.map((a) => (
                <TR key={a.id}><TD className="whitespace-nowrap">{formatDate(a.receipt.date)}</TD><TD>{a.receipt.mode}</TD><TD className="font-mono text-xs">{a.receipt.reference}</TD><TD className="text-right tabular-nums">{formatInr(a.amountPaise)}</TD><TD className="text-right tabular-nums">{formatInr(receiptMeta(a.receipt).tdsPaise ?? 0)}</TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      {inv.writeOffs.length ? (
        <Card>
          <CardHeader><CardTitle>Write-offs</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Requested</TH><TH>Reason</TH><TH className="text-right">Amount</TH><TH>Status</TH></tr></THead>
            <TBody>
              {inv.writeOffs.map((w) => (
                <TR key={w.id}>
                  <TD>{name(w.requestedById)} · {formatDateTime(w.createdAt)}</TD><TD>{w.reason}</TD><TD className="text-right tabular-nums">{formatInr(w.amountPaise)}</TD>
                  <TD>{w.status === "PENDING" && canApprove ? <DecideWriteOff writeOffId={w.id} invoiceId={inv.id} /> : <Badge tone={w.status === "APPROVED" ? "green" : w.status === "REJECTED" ? "red" : "amber"}>{w.status.toLowerCase()}{w.approvedById ? ` · ${name(w.approvedById)}` : ""}</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      {inv.reminders.length ? (
        <Card>
          <CardHeader><CardTitle>Payment reminders sent</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>When</TH><TH>By</TH><TH>Channel</TH><TH>Point</TH></tr></THead>
            <TBody>
              {inv.reminders.map((r) => (
                <TR key={r.id}><TD>{formatDateTime(r.sentAt)}</TD><TD>{name(r.sentById)}</TD><TD>{r.channel.toLowerCase()}</TD><TD>{r.ruleCode?.replace("AGE_", "") ?? ""}{r.ruleCode?.startsWith("AGE_") ? " days" : ""}</TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold text-ink" : ""}`}>{v}</span>
    </div>
  );
}
