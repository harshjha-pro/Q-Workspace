import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { listDisbursements, BUCKETS, DISBURSEMENT_KIND_LABELS, DISBURSEMENT_STATUS_LABELS } from "@/server/services/billing/service";
import { formatInr } from "@/server/lib/money";
import { formatDate, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { billingClientOptions } from "../_lib";
import { disbursementTone } from "../status";
import { EditDisbursementDialog, NewDisbursementDialog } from "./disbursement-ui";

export const metadata = { title: "Disbursements" };

export default async function DisbursementsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "billing.view");
  const sp = await searchParams;
  const canManage = can(actor, "disbursement.manage");
  const today = todayIst();
  const [rows, clients] = await Promise.all([load(() => listDisbursements(actor, { status: sp.status || undefined })), canManage ? billingClientOptions(actor, "disbursement.manage") : Promise.resolve([])]);
  const unrecovered = rows.filter((r) => r.status === "UNRECOVERED");
  const ageing = BUCKETS.map((b) => ({ ...b, amount: unrecovered.filter((r) => r.bucket === b.key).reduce((t, r) => t + r.amountPaise, 0) }));
  const tabs: [string, string][] = [["", "All"], ["UNRECOVERED", "Unrecovered"], ["ADDED_TO_INVOICE", "Added to invoice"], ["RECOVERED", "Recovered"]];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Disbursements register"
        subtitle="Government / ROC fees, challans, stamp duty and other amounts paid for clients. Unrecovered → Added to invoice → Recovered."
        actions={canManage ? <NewDisbursementDialog clients={clients} today={today} /> : null}
      />
      {!sp.status || sp.status === "UNRECOVERED" ? (
        <Card>
          <CardHeader><CardTitle>Unrecovered ageing</CardTitle><span className="text-xs text-muted">Days since paid, not yet on an invoice.</span></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ageing.map((b) => <div key={b.key}><p className="text-xs text-muted">{b.label}</p><p className="font-semibold tabular-nums">{formatInr(b.amount)}</p></div>)}
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2 text-sm">
        {tabs.map(([k, v]) => <Link key={k} href={k ? `/billing/disbursements?status=${k}` : "/billing/disbursements"} className={`rounded-md border px-3 py-1 ${(sp.status ?? "") === k ? "border-brand bg-brand-50 text-brand" : "border-line"}`}>{v}</Link>)}
      </div>
      <Card>
        <Table>
          <THead><tr><TH>Date</TH><TH>Client</TH><TH>Type</TH><TH>Description</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH /></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={7} className="text-muted">Nothing here.</TD></TR> : null}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap">{formatDate(r.date)}{r.status === "UNRECOVERED" ? <span className="block text-xs text-muted">{r.ageDays} days</span> : null}</TD>
                <TD>{r.clientName}</TD>
                <TD>{DISBURSEMENT_KIND_LABELS[r.kind] ?? r.kind}</TD>
                <TD>{r.description}{r.fromExpenseClaim ? <Badge tone="blue" className="ml-1">Expense claim</Badge> : null}<span className="block text-xs text-muted">Paid by {r.paidBy}</span></TD>
                <TD className="text-right tabular-nums">{formatInr(r.amountPaise)}</TD>
                <TD>
                  <Badge tone={disbursementTone(r.status)}>{DISBURSEMENT_STATUS_LABELS[r.status] ?? r.status}</Badge>
                  {r.invoice ? <Link href={`/billing/invoices/${r.invoice.id}`} className="block font-mono text-xs text-brand hover:underline">{r.invoice.number ?? "Draft"}</Link> : null}
                </TD>
                <TD>{canManage && r.status === "UNRECOVERED" ? <EditDisbursementDialog id={r.id} today={today} d={{ date: r.date, amount: (r.amountPaise / 100).toFixed(2), kind: r.kind, description: r.description, paidBy: r.paidBy }} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
