import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { firmDashboard } from "@/server/services/analytics/firm";
import { formatInrCompact } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Columns, KpiRow, StatTile } from "@/components/charts/charts";
import { PeriodPicker, hoursText, pctText } from "../_ui";

export const metadata = { title: "Firm dashboard" };

export default async function FirmDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "analytics.firm");
  const d = await firmDashboard(actor, { period: (await searchParams).period });
  return (
    <div className="space-y-4">
      <PageHeader title="Firm" subtitle={`${d.period.label} · Partners only`} actions={<PeriodPicker base="/analytics/firm" current={d.period.key} />} />
      <h2 className="text-sm font-semibold text-muted">Compliance</h2>
      <KpiRow>
        <StatTile label="Filings due" value={String(d.compliance.due)} href={`/analytics/compliance?period=${d.period.key}`} />
        <StatTile label="Filed on time" value={pctText(d.compliance.onTimePct)} sub={`${d.compliance.filedLate} late`} />
        <StatTile label="Overdue now" value={String(d.compliance.overdueNow)} tone={d.compliance.overdueNow ? "bad" : undefined} href="/tasks?overdue=1&mine=0" />
        <StatTile label="Late-fee exposure" value={formatInrCompact(d.compliance.exposurePaise)} tone={d.compliance.exposurePaise ? "bad" : undefined} />
        <StatTile label="Hours logged" value={hoursText(d.effort.hours)} sub={`${hoursText(d.effort.clientHours)} on clients`} />
        <StatTile label="Chargeable share" value={pctText(d.effort.chargeableShare)} sub="of hours logged" />
      </KpiRow>
      <h2 className="text-sm font-semibold text-muted">Money and growth</h2>
      <KpiRow>
        <StatTile label="Invoiced" value={formatInrCompact(d.billing.invoicedPaise)} sub={`${d.billing.invoiceCount} invoice${d.billing.invoiceCount === 1 ? "" : "s"}`} href="/billing" />
        <StatTile label="Collected" value={formatInrCompact(d.billing.collectedPaise)} sub={d.billing.tdsPaise ? `+ ${formatInrCompact(d.billing.tdsPaise)} TDS` : undefined} />
        <StatTile label="Receivable now" value={formatInrCompact(d.billing.receivablePaise)} sub={`${formatInrCompact(d.billing.over90Paise)} over 90 days`} tone={d.billing.over90Paise ? "warn" : undefined} />
        <StatTile label="Active clients" value={String(d.clients.active)} sub={`${d.clients.newInPeriod} new in period`} />
        <StatTile label="Open leads" value={String(d.growth.openLeads)} sub={`${d.growth.proposalsSent} proposal${d.growth.proposalsSent === 1 ? "" : "s"} out`} href="/crm/leads" />
        <StatTile label="Proposals pipeline" value={formatInrCompact(d.growth.pipelinePaise)} sub={`${d.people.headcount} people in the firm`} />
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Invoiced and collected, last 12 months</CardTitle></CardHeader><CardContent>
          <Columns title="Invoiced and collected by month" labels={d.trend.map((t) => t.label)} series={[
            { name: "Invoiced", values: d.trend.map((t) => t.invoicedPaise / 100), format: (v) => formatInrCompact(v * 100) },
            { name: "Collected", values: d.trend.map((t) => t.collectedPaise / 100), format: (v) => formatInrCompact(v * 100) },
          ]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Filed on time, last 12 months</CardTitle></CardHeader><CardContent>
          <Columns title="Share of filings made on time by month" labels={d.trend.map((t) => t.label)} series={[{ name: "On time", values: d.trend.map((t) => t.onTimePct), format: (v) => `${v}%` }]} />
        </CardContent></Card>
      </div>
    </div>
  );
}
