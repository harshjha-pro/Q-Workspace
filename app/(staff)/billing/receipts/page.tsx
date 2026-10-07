import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { listReceipts } from "@/server/services/billing/service";
import { formatInr } from "@/server/lib/money";
import { formatDate, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { billingClientOptions } from "../_lib";
import { AllocateDialog, RecordReceiptForm, ReverseDialog } from "./receipt-ui";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "billing.view");
  const sp = await searchParams;
  const canRecord = can(actor, "billing.receipt.record");
  const [rows, clients] = await Promise.all([load(() => listReceipts(actor, { clientId: sp.clientId || undefined })), canRecord ? billingClientOptions(actor, "billing.receipt.record") : Promise.resolve([])]);
  return (
    <div className="space-y-4">
      <PageHeader title="Receipts" subtitle="Payments received by UPI, NEFT, RTGS, IMPS, cheque or cash, entered manually and allocated to invoices." />
      {canRecord ? <RecordReceiptForm clients={clients} defaultClientId={sp.clientId} today={todayIst()} /> : null}
      <Card>
        <CardHeader><CardTitle>Recent receipts ({rows.length})</CardTitle>{sp.clientId ? <Link href="/billing/receipts" className="text-sm text-brand hover:underline">All clients</Link> : null}</CardHeader>
        <Table>
          <THead><tr><TH>Date</TH><TH>Client</TH><TH>Mode / ref</TH><TH className="text-right">Received</TH><TH className="text-right">TDS</TH><TH>Invoices</TH><TH className="text-right">Advance</TH><TH /></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={8} className="text-muted">No receipts yet.</TD></TR> : null}
            {rows.map((r) => (
              <TR key={r.id} className={r.reversed ? "opacity-60" : undefined}>
                <TD className="whitespace-nowrap">{formatDate(r.date)}</TD>
                <TD>{r.clientName}</TD>
                <TD>{r.mode}{r.reference ? <span className="block font-mono text-xs text-muted">{r.reference}</span> : null}</TD>
                <TD className="text-right tabular-nums">{formatInr(r.amountPaise)}</TD>
                <TD className="text-right tabular-nums">{r.tdsPaise ? formatInr(r.tdsPaise) : "—"}</TD>
                <TD className="text-xs">
                  {r.reversed ? <Badge tone="red">Reversed: {r.reversedReason}</Badge> : r.allocations.map((a) => <Link key={a.id} href={`/billing/invoices/${a.invoiceId}`} className="block font-mono text-brand hover:underline">{a.invoice.number} · {formatInr(a.amountPaise)}</Link>)}
                </TD>
                <TD className="text-right tabular-nums">{r.unallocatedPaise ? formatInr(r.unallocatedPaise) : "—"}</TD>
                <TD className="whitespace-nowrap">
                  {canRecord && !r.reversed && r.unallocatedPaise > 0 ? <AllocateDialog receiptId={r.id} clientId={r.clientId} available={r.unallocatedPaise} /> : null}
                  {canRecord && !r.reversed ? <ReverseDialog receiptId={r.id} /> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
