import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { complianceDashboard } from "@/server/services/analytics/compliance";
import { formatInr, formatInrCompact } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BarList, Columns, KpiRow, StatTile, StatusBar } from "@/components/charts/charts";
import { PeriodPicker, pctText } from "../_ui";

export const metadata = { title: "Compliance dashboard" };

export default async function ComplianceDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.team") && !can(actor, "analytics.operational")) redirect("/denied");
  const d = await complianceDashboard(actor, { period: (await searchParams).period });
  const h = d.headline;
  return (
    <div className="space-y-4">
      <PageHeader title="Compliance" subtitle={`${d.period.label} · ${d.scope === "firm" ? "whole firm" : "your team's clients"}`} actions={<PeriodPicker base="/analytics/compliance" current={d.period.key} />} />
      <KpiRow>
        <StatTile label="Due in period" value={String(h.due)} sub={`${h.upcoming} not yet due`} />
        <StatTile label="Filed on time" value={pctText(h.onTimePct)} sub={`${h.filedOnTime} on time · ${h.filedLate} late`} />
        <StatTile label="Overdue now" value={String(h.overdueNow)} href="/tasks?overdue=1&mine=0" tone={h.overdueNow ? "bad" : undefined} />
        <StatTile label="Due in 7 days" value={String(d.dueNext7)} href="/this-week" />
        <StatTile label="Waiting on client" value={String(h.waitingOnClient)} tone={h.waitingOnClient ? "warn" : undefined} />
        <StatTile label="Late-fee exposure" value={formatInrCompact(h.exposurePaise)} sub="estimate on overdue tasks" tone={h.exposurePaise ? "bad" : undefined} />
      </KpiRow>
      <Card><CardHeader><CardTitle>Filings due in the period</CardTitle></CardHeader><CardContent>
        <StatusBar title="Filings due in the period by state" parts={[
          { label: "Filed on time", value: h.filedOnTime, status: "good" },
          { label: "Filed late", value: h.filedLate, status: "serious" },
          { label: "Overdue", value: h.overdue, status: "critical" },
          { label: "Not yet due", value: h.upcoming, status: "neutral" },
        ]} />
      </CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Filed on time, last 12 months</CardTitle></CardHeader><CardContent>
          <Columns title="Share of filings made on time by month" labels={d.trend.map((t) => t.label)} series={[{ name: "On time", values: d.trend.map((t) => t.onTimePct), format: (v) => `${v}%` }]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>How long clients have kept us waiting</CardTitle></CardHeader><CardContent>
          <BarList title="Open tasks waiting on the client, by days waited" rows={d.clientDelay.map((b) => ({ label: b.label, value: b.count, display: String(b.count) }))} />
        </CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>By compliance type</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Type</TH><TH className="text-right">Due</TH><TH className="text-right">On time</TH><TH className="text-right">Late</TH><TH className="text-right">Overdue</TH><TH className="text-right">On-time share</TH></tr></THead>
          <TBody>
            {d.byType.length === 0 ? <TR><TD colSpan={6} className="text-sm text-muted">Nothing due in this period.</TD></TR> : null}
            {d.byType.map((t) => <TR key={t.code}><TD>{t.name}</TD><TD className="text-right tabular-nums">{t.due}</TD><TD className="text-right tabular-nums">{t.onTime}</TD><TD className="text-right tabular-nums">{t.late}</TD><TD className="text-right tabular-nums">{t.overdue}</TD><TD className="text-right tabular-nums">{pctText(t.onTimePct)}</TD></TR>)}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Largest late-fee exposures</CardTitle><span className="text-xs text-muted">Estimate from the due-date master rates (Unverified until checked, Q-29)</span></CardHeader>
        {h.exposureWithoutRate || h.exposureNeedsTaxDue ? (
          <div className="space-y-1 px-4">
            {h.exposureWithoutRate ? <Alert tone="warn">{h.exposureWithoutRate} overdue task(s) have no late-fee rate in the master, so they add nothing to the estimate.</Alert> : null}
            {h.exposureNeedsTaxDue ? <Alert tone="warn">{h.exposureNeedsTaxDue} overdue task(s) carry interest only, and their tax due is not entered on the task, so the estimate leaves them out.</Alert> : null}
          </div>
        ) : null}
        <Table>
          <THead><tr><TH>Task</TH><TH>Client</TH><TH className="text-right">Days late</TH><TH className="text-right">Fee</TH><TH className="text-right">Interest</TH></tr></THead>
          <TBody>
            {d.topExposures.length === 0 ? <TR><TD colSpan={5} className="text-sm text-muted">Nothing overdue.</TD></TR> : null}
            {d.topExposures.map((e) => <TR key={e.taskId}><TD><Link className="hover:underline" href={`/tasks/${e.taskId}`}>{e.title}</Link>{e.period ? <span className="text-xs text-muted"> · {e.period}</span> : null}</TD><TD className="text-sm">{e.client}</TD><TD className="text-right tabular-nums">{e.daysLate}</TD><TD className="text-right tabular-nums">{!e.hasRate ? "No rate" : e.needsTaxDue ? "—" : formatInr(e.feePaise)}</TD><TD className="text-right tabular-nums">{e.needsTaxDue ? "Tax due not entered" : e.interestPaise ? formatInr(e.interestPaise) : "—"}</TD></TR>)}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
