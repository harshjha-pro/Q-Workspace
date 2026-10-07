import { requirePortal } from "@/server/context";
import { portalBilling } from "@/server/services/portal/service";
import { formatDate } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export const metadata = { title: "Invoices" };

const MODE: Record<string, string> = { UPI: "UPI", NEFT: "NEFT", RTGS: "RTGS", IMPS: "IMPS", CHEQUE: "Cheque", CASH: "Cash" };

export default async function InvoicesPage() {
  const actor = await requirePortal();
  const b = await portalBilling(actor);
  const multi = actor.clientIds.length > 1;
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices & payments" subtitle={b.outstandingPaise ? `Outstanding: ${formatInr(b.outstandingPaise)}` : "Nothing outstanding."} />
      {b.payTo ? (
        <Card>
          <CardHeader><CardTitle>How to pay</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {b.payTo.bankAccount ? <p>Bank transfer to <span className="font-medium">{b.payTo.name}</span>: {b.payTo.bankName} · A/c {b.payTo.bankAccount} · IFSC {b.payTo.bankIfsc}</p> : null}
            {b.payTo.upiId ? <p>UPI: <span className="font-mono">{b.payTo.upiId}</span></p> : null}
            <p className="text-muted">Please quote the invoice number. Payments are confirmed by the firm; there is no online payment here.</p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Invoice</TH>{multi ? <TH>Entity</TH> : null}<TH>Date</TH><TH>Due</TH><TH className="text-right">Amount</TH><TH className="text-right">Balance</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {b.invoices.length === 0 ? <TR><TD colSpan={8} className="text-sm text-muted">No invoices yet.</TD></TR> : null}
            {b.invoices.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium">{i.number}</TD>{multi ? <TD>{i.clientName}</TD> : null}<TD>{formatDate(i.date)}</TD><TD>{formatDate(i.dueDate)}</TD>
                <TD className="text-right tabular-nums">{formatInr(i.totalPaise)}</TD><TD className="text-right tabular-nums">{formatInr(i.balancePaise)}</TD>
                <TD><Badge tone={i.overdue ? "red" : i.status === "Paid" ? "green" : i.status === "Cancelled" ? "neutral" : "amber"}>{i.overdue ? "Overdue" : i.status}</Badge></TD>
                <TD><a className="text-sm underline" href={`/api/portal/invoices/${i.id}`}>PDF</a></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Payments received</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Date</TH>{multi ? <TH>Entity</TH> : null}<TH>Mode</TH><TH>Reference</TH><TH className="text-right">Amount</TH><TH className="text-right">TDS</TH></tr></THead>
          <TBody>
            {b.receipts.length === 0 ? <TR><TD colSpan={6} className="text-sm text-muted">No payments recorded yet.</TD></TR> : null}
            {b.receipts.map((r) => <TR key={r.id}><TD>{formatDate(r.date)}</TD>{multi ? <TD>{r.clientName}</TD> : null}<TD>{MODE[r.mode] ?? r.mode}</TD><TD>{r.reference}</TD><TD className="text-right tabular-nums">{formatInr(r.amountPaise)}</TD><TD className="text-right tabular-nums">{r.tdsPaise ? formatInr(r.tdsPaise) : ""}</TD></TR>)}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
