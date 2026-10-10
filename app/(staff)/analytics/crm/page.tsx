import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { crmDashboard } from "@/server/services/analytics/crm";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/server/services/crm/common";
import { formatInr, formatInrCompact } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BarList, Columns, KpiRow, StatTile } from "@/components/charts/charts";
import { PeriodPicker, pctText } from "../_ui";

export const metadata = { title: "CRM dashboard" };

const RENEWAL: Record<string, string> = { DUE: "Due", PROPOSED: "Fee proposed", APPROVED: "Approved", LETTER_ISSUED: "Letter issued", DECLINED: "Declined" };

export default async function CrmDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.firm")) redirect("/denied");
  const d = await crmDashboard(actor, { period: (await searchParams).period });
  const h = d.headline;
  const r = d.renewals;
  return (
    <div className="space-y-4">
      <PageHeader title="CRM" subtitle={`${d.period.label} · leads, proposals, renewals and client feedback · Partners only`} actions={<PeriodPicker base="/analytics/crm" current={d.period.key} />} />
      <KpiRow>
        <StatTile label="Leads created" value={String(h.leadsCreated)} sub={`${h.openLeads} open now`} href="/crm/leads" />
        <StatTile label="Conversion" value={pctText(h.conversionPct)} sub={`${h.won} won · ${h.lost} lost`} />
        <StatTile label="Won fees (estimate)" value={formatInrCompact(h.wonFeePaise)} sub={h.avgDaysToWin === null ? "no wins in period" : `${h.avgDaysToWin} days to win on average`} />
        <StatTile label="Proposal pipeline" value={formatInrCompact(h.pipelinePaise)} sub={`${h.proposalsSent} sent · ${h.expiringSoon} expire in 7 days`} tone={h.expiringSoon ? "warn" : undefined} />
        <StatTile label="Proposals accepted" value={pctText(h.acceptancePct)} sub={`${formatInrCompact(h.acceptedPaise)} accepted in period`} />
        <StatTile label="Follow-ups overdue" value={String(h.followUpsOverdue)} tone={h.followUpsOverdue ? "warn" : undefined} href="/crm/leads" />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Leads created in the period, where they are now</CardTitle></CardHeader><CardContent>
          <BarList title="Leads created in the period by current stage" rows={d.funnel.map((f) => ({ label: LEAD_STAGE_LABELS[f.stage], value: f.count }))} empty="No leads created in this period." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Lead sources</CardTitle></CardHeader><CardContent>
          <Table>
            <THead><tr><TH>Source</TH><TH className="text-right">Leads</TH><TH className="text-right">Won</TH><TH className="text-right">Won %</TH></tr></THead>
            <TBody>
              {d.sources.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No leads in this period.</TD></TR> : null}
              {d.sources.map((s) => <TR key={s.source}><TD>{LEAD_SOURCE_LABELS[s.source as keyof typeof LEAD_SOURCE_LABELS] ?? s.source}</TD><TD className="text-right tabular-nums">{s.leads}</TD><TD className="text-right tabular-nums">{s.won}</TD><TD className="text-right tabular-nums">{pctText(s.wonPct)}</TD></TR>)}
            </TBody>
          </Table>
          {d.lostReasons.length ? (
            <div className="mt-3 text-sm"><div className="mb-1 text-xs font-medium text-muted">Why leads were lost</div>
              <ul className="space-y-0.5">{d.lostReasons.map((l) => <li key={l.reason} className="flex justify-between gap-2"><span className="truncate">{l.reason}</span><span className="tabular-nums text-muted">{l.count}</span></li>)}</ul>
            </div>
          ) : null}
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Proposals awaiting the client</CardTitle></CardHeader><CardContent>
          <BarList title="Value of proposals sent and awaiting a decision, by service line" rows={d.pipelineByLine.map((p) => ({ label: p.label, value: p.paise, display: `${formatInrCompact(p.paise)} · ${p.count}` }))} empty="No proposals awaiting a decision." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Renewals in the next {r.windowDays} days</CardTitle></CardHeader><CardContent>
          {r.due === 0 ? <p className="text-sm text-muted">No renewals due in this window.</p> : (
            <>
              <ul className="space-y-1 text-sm">{r.byStatus.map((s) => <li key={s.status} className="flex justify-between"><span>{RENEWAL[s.status] ?? s.status}</span><span className="tabular-nums">{s.count}</span></li>)}</ul>
              {r.approvedFeePaise ? <p className="mt-2 text-sm">Approved fees {formatInr(r.approvedFeePaise)} against {formatInr(r.lastFeePaise)} last period ({pctText(r.lastFeePaise ? Math.round(((r.approvedFeePaise - r.lastFeePaise) / r.lastFeePaise) * 1000) / 10 : null)} change).</p> : null}
            </>
          )}
          <Link href="/crm/opportunities" className="mt-2 inline-block text-sm text-brand hover:underline">Open renewals</Link>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>New clients, last 12 months</CardTitle></CardHeader><CardContent>
          <Columns title="New clients onboarded by month" labels={d.clientGrowth.map((m) => m.label)} series={[{ name: "New clients", values: d.clientGrowth.map((m) => m.count), format: (v) => String(v) }]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Client feedback and cross-sell</CardTitle></CardHeader><CardContent>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div><div className="text-lg font-semibold tabular-nums">{h.avgRating === null ? "—" : `${h.avgRating} / 5`}</div><div className="text-xs text-muted">average rating</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{h.feedbackReceived} of {h.feedbackRequested}</div><div className="text-xs text-muted">responses</div></div>
            <div><div className={`text-lg font-semibold tabular-nums ${h.lowRatings ? "text-red-700" : ""}`}>{h.lowRatings}</div><div className="text-xs text-muted">low ratings</div></div>
          </div>
          <div className="mt-4 text-xs font-medium text-muted">Open cross-sell opportunities</div>
          <BarList title="Open cross-sell opportunities by service line" rows={d.opportunities.map((o) => ({ label: o.label, value: o.count }))} empty="No open opportunities." />
        </CardContent></Card>
      </div>
    </div>
  );
}
