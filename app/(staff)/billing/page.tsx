import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { billingDashboard } from "@/server/services/billing/service";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ReminderCopy } from "./invoices/[id]/invoice-ui";

export const metadata = { title: "Billing" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function BillingPage() {
  const actor = await requireStaff();
  requireCap(actor, "billing.view");
  const d = await load(() => billingDashboard(actor));
  const canRaise = can(actor, "billing.raise");
  const canReceipt = can(actor, "billing.receipt.record");
  const canApprove = can(actor, "billing.approve");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing"
        subtitle={canRaise ? "Receivables, unbilled work, retainer drafts and payment reminders." : "Read-only view of your team's clients."}
        actions={
          <>
            {canRaise ? <Link href="/billing/invoices/new" className={buttonVariants({ size: "sm" })}>New invoice</Link> : null}
            {canReceipt ? <Link href="/billing/receipts" className={buttonVariants({ size: "sm", variant: "secondary" })}>Record receipt</Link> : null}
            <Link href="/billing/invoices" className={buttonVariants({ size: "sm", variant: "secondary" })}>Invoices</Link>
            <Link href="/billing/disbursements" className={buttonVariants({ size: "sm", variant: "secondary" })}>Disbursements</Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receivables" value={formatInr(d.ageing.totalPaise)} hint={`${d.ageing.byClient.length} clients`} />
        <Stat label="90+ days" value={formatInr(d.ageing.buckets[3]?.amountPaise ?? 0)} />
        <Stat label="Billed this month" value={formatInr(d.billedThisMonthPaise)} />
        <Stat label="Received this month" value={formatInr(d.receivedThisMonthPaise)} hint="incl. TDS" />
      </div>

      <Card>
        <CardHeader><CardTitle>Receivables ageing</CardTitle><span className="text-xs text-muted">Days since invoice date; open invoices only.</span></CardHeader>
        <AgeTable title="Client" rows={d.ageing.byClient.slice(0, 15)} link={(id) => `/billing/invoices?clientId=${id}&status=OPEN`} totals={d.ageing.buckets.map((b) => b.amountPaise)} total={d.ageing.totalPaise} />
        {d.ageing.byClient.length > 15 ? <p className="px-4 py-2 text-xs text-muted">Showing the 15 largest of {d.ageing.byClient.length} clients.</p> : null}
      </Card>
      <Card>
        <CardHeader><CardTitle>By Partner</CardTitle></CardHeader>
        <AgeTable title="Partner" rows={d.ageing.byPartner} />
      </Card>

      {d.retainerDrafts.length ? (
        <Card>
          <CardHeader><CardTitle>Retainer drafts awaiting approval ({d.retainerDrafts.length})</CardTitle>{canApprove ? null : <span className="text-xs text-muted">A Partner issues these.</span>}</CardHeader>
          <Table>
            <THead><tr><TH>Client</TH><TH>Date</TH><TH className="text-right">Total</TH><TH /></tr></THead>
            <TBody>
              {d.retainerDrafts.map((r) => (
                <TR key={r.id}><TD>{r.clientName}</TD><TD className="whitespace-nowrap">{formatDate(r.date)}</TD><TD className="text-right tabular-nums">{formatInr(r.totalPaise)}</TD><TD><Link className="text-brand hover:underline" href={`/billing/invoices/${r.id}`}>Review</Link></TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Unbilled work ({d.unbilled.length})</CardTitle><span className="text-xs text-muted">Chargeable work or fees not invoiced within the firm&apos;s limit.</span></CardHeader>
        <Table>
          <THead><tr><TH>Engagement</TH><TH>Client</TH><TH>Last invoice</TH><TH>Waiting</TH><TH>Unbilled hours</TH><TH className="text-right">Estimate</TH></tr></THead>
          <TBody>
            {d.unbilled.length === 0 ? <TR><TD colSpan={6} className="text-muted">Nothing waiting to be billed.</TD></TR> : null}
            {d.unbilled.slice(0, 25).map((u) => (
              <TR key={u.engagementId}>
                <TD>{canRaise ? <Link className="text-brand hover:underline" href={`/billing/invoices/new?clientId=${u.clientId}&engagementId=${u.engagementId}`}>{u.name}</Link> : u.name}</TD>
                <TD>{u.clientName}</TD>
                <TD className="whitespace-nowrap">{u.lastInvoiceDate ? formatDate(u.lastInvoiceDate) : <Badge>Never</Badge>}</TD>
                <TD><Badge tone={u.daysSince > 90 ? "red" : "amber"}>{u.daysSince} days</Badge></TD>
                <TD>{u.unbilledMinutes ? formatMinutes(u.unbilledMinutes) : "—"}</TD>
                <TD className="text-right tabular-nums">{u.estimatePaise ? formatInr(u.estimatePaise) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment reminders due ({d.reminders.length})</CardTitle><span className="text-xs text-muted">Copy the text, send it yourself, then mark it sent.</span></CardHeader>
        <Table>
          <THead><tr><TH>Invoice</TH><TH>Client</TH><TH>Age</TH><TH className="text-right">Balance</TH><TH /></tr></THead>
          <TBody>
            {d.reminders.length === 0 ? <TR><TD colSpan={5} className="text-muted">No reminders due.</TD></TR> : null}
            {d.reminders.map((r) => (
              <TR key={r.invoiceId}>
                <TD><Link className="font-mono text-brand hover:underline" href={`/billing/invoices/${r.invoiceId}`}>{r.number}</Link></TD>
                <TD>{r.clientName}{r.contactName ? <span className="block text-xs text-muted">{r.contactName}{r.contactPhone ? ` · ${r.contactPhone}` : ""}</span> : null}</TD>
                <TD className="whitespace-nowrap">{r.ageDays} days <span className="text-xs text-muted">({r.point}-day point)</span></TD>
                <TD className="text-right tabular-nums">{formatInr(r.outstandingPaise)}</TD>
                <TD>{canRaise ? <ReminderCopy invoiceId={r.invoiceId} ruleCode={r.ruleCode} text={r.text} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {d.realization ? (
        <Card>
          <CardHeader><CardTitle>Realization by client</CardTitle><span className="text-xs text-muted">Fees billed ÷ internal cost of hours. Partners and Practice Admin only.</span></CardHeader>
          <Table>
            <THead><tr><TH>Client</TH><TH>Hours</TH><TH className="text-right">Billed</TH><TH className="text-right">Cost</TH><TH className="text-right">Realization</TH></tr></THead>
            <TBody>
              {d.realization.perClient.slice(0, 20).map((r) => (
                <TR key={r.clientId}>
                  <TD>{r.clientName}</TD><TD>{formatMinutes(r.minutes)}</TD>
                  <TD className="text-right tabular-nums">{formatInr(r.billedPaise)}</TD><TD className="text-right tabular-nums">{formatInr(r.costPaise)}</TD>
                  <TD className="text-right">{r.ratio === null ? "—" : <Badge tone={r.ratio < 1 ? "red" : r.ratio < 1.5 ? "amber" : "green"}>{r.ratio.toFixed(2)}×</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <details className="border-t border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Per engagement ({d.realization.perEngagement.length})</summary>
            <Table>
              <THead><tr><TH>Engagement</TH><TH>Client</TH><TH className="text-right">Billed</TH><TH className="text-right">Cost</TH><TH className="text-right">Realization</TH></tr></THead>
              <TBody>
                {d.realization.perEngagement.map((r) => (
                  <TR key={r.engagementId}><TD>{r.name}</TD><TD>{r.clientName}</TD><TD className="text-right tabular-nums">{formatInr(r.billedPaise)}</TD><TD className="text-right tabular-nums">{formatInr(r.costPaise)}</TD><TD className="text-right">{r.ratio === null ? "—" : `${r.ratio.toFixed(2)}×`}</TD></TR>
                ))}
              </TBody>
            </Table>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

function AgeTable({ title, rows, link, totals, total }: { title: string; rows: { id: string; name: string; buckets: number[]; totalPaise: number }[]; link?: (id: string) => string; totals?: number[]; total?: number }) {
  return (
    <Table>
      <THead><tr><TH>{title}</TH><TH className="text-right">0–30</TH><TH className="text-right">31–60</TH><TH className="text-right">61–90</TH><TH className="text-right">90+</TH><TH className="text-right">Total</TH></tr></THead>
      <TBody>
        {rows.length === 0 ? <TR><TD colSpan={6} className="text-muted">Nothing outstanding.</TD></TR> : null}
        {rows.map((r) => (
          <TR key={r.id}>
            <TD>{link ? <Link className="text-brand hover:underline" href={link(r.id)}>{r.name}</Link> : r.name}</TD>
            {r.buckets.map((b, i) => <TD key={i} className="text-right tabular-nums">{b ? formatInr(b) : "—"}</TD>)}
            <TD className="text-right font-medium tabular-nums">{formatInr(r.totalPaise)}</TD>
          </TR>
        ))}
        {totals && rows.length ? (
          <TR className="bg-gray-50 font-semibold"><TD>Total</TD>{totals.map((b, i) => <TD key={i} className="text-right tabular-nums">{formatInr(b)}</TD>)}<TD className="text-right tabular-nums">{formatInr(total ?? 0)}</TD></TR>
        ) : null}
      </TBody>
    </Table>
  );
}
