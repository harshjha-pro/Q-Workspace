import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { listInvoices, INVOICE_STATUS_LABELS } from "@/server/services/billing/service";
import { formatInr } from "@/server/lib/money";
import { formatDate, isIsoDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { invoiceTone } from "../status";

export const metadata = { title: "Invoices" };

type SP = { status?: string; clientId?: string; from?: string; to?: string; q?: string; overdue?: string; retainer?: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  requireCap(actor, "billing.view");
  const sp = await searchParams;
  const from = sp.from && isIsoDate(sp.from) ? sp.from : undefined;
  const to = sp.to && isIsoDate(sp.to) ? sp.to : undefined;
  const rows = await load(() => listInvoices(actor, { status: sp.status || undefined, clientId: sp.clientId || undefined, from, to, q: sp.q || undefined, overdue: sp.overdue === "1", retainerDrafts: sp.retainer === "1" }));
  const totals = rows.reduce((t, r) => ({ total: t.total + (r.status === "CANCELLED" || r.status === "DRAFT" ? 0 : r.totalPaise), out: t.out + r.outstandingPaise }), { total: 0, out: 0 });
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        subtitle="GST invoices, drafts and their payment status."
        actions={can(actor, "billing.raise") ? <Link href="/billing/invoices/new" className={buttonVariants({ size: "sm" })}>New invoice</Link> : null}
      />
      <Card>
        <form method="get" className="grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <Input name="q" placeholder="Number or client" defaultValue={sp.q ?? ""} aria-label="Search" />
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            <option value="OPEN">Open (raised / partly received)</option>
            {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input type="date" name="from" defaultValue={from ?? ""} aria-label="From" />
          <Input type="date" name="to" defaultValue={to ?? ""} aria-label="To" />
          <Select name="overdue" defaultValue={sp.overdue ?? ""} aria-label="Overdue"><option value="">Any due date</option><option value="1">Overdue only</option></Select>
          <Button type="submit" size="sm" className="h-9">Filter</Button>
          {sp.clientId ? <input type="hidden" name="clientId" value={sp.clientId} /> : null}
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{rows.length} invoice{rows.length === 1 ? "" : "s"} · billed {formatInr(totals.total)} · outstanding {formatInr(totals.out)}</CardTitle>
          <span className="flex flex-wrap gap-2 text-xs">
            Export:
            <a className="text-brand hover:underline" href={`/api/billing/export?kind=invoices&format=xlsx${qs ? `&${qs}` : ""}`}>Invoices (Excel)</a>
            <a className="text-brand hover:underline" href={`/api/billing/export?kind=lines&format=xlsx${qs ? `&${qs}` : ""}`}>Lines with GST</a>
            <a className="text-brand hover:underline" href={`/api/billing/export?kind=receipts&format=xlsx${qs ? `&${qs}` : ""}`}>Receipts</a>
            <a className="text-brand hover:underline" href={`/api/billing/export?kind=invoices&format=csv${qs ? `&${qs}` : ""}`}>CSV</a>
          </span>
        </CardHeader>
        <Table>
          <THead><tr><TH>Number</TH><TH>Date</TH><TH>Client</TH><TH>Status</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Due</TH></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={7} className="text-muted">No invoices match.</TD></TR> : null}
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/billing/invoices/${r.id}`} className="font-mono text-brand hover:underline">{r.number ?? "Draft"}</Link>{r.isRetainerDraft && r.status === "DRAFT" ? <Badge tone="violet" className="ml-1">Retainer</Badge> : null}</TD>
                <TD className="whitespace-nowrap">{formatDate(r.date)}</TD>
                <TD>{r.clientName}{r.engagementName ? <span className="block text-xs text-muted">{r.engagementName}</span> : null}</TD>
                <TD><Badge tone={invoiceTone(r.status)}>{INVOICE_STATUS_LABELS[r.status] ?? r.status}</Badge></TD>
                <TD className="text-right tabular-nums">{formatInr(r.totalPaise)}</TD>
                <TD className="text-right tabular-nums">{r.outstandingPaise ? formatInr(r.outstandingPaise) : "—"}</TD>
                <TD className="whitespace-nowrap">{r.dueDate ? (r.overdue ? <Badge tone="red">{formatDate(r.dueDate)}</Badge> : formatDate(r.dueDate)) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
