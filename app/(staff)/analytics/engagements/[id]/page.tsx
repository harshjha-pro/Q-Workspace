import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load, requireCap } from "@/lib/page";
import { engagementDashboard } from "@/server/services/analytics/engagements";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarList, Columns, KpiRow, Meter, StatTile } from "@/components/charts/charts";
import { monthName } from "@/server/services/analytics/common";
import { budgetEstimate } from "@/server/services/analytics/estimates";
import { can } from "@/server/permissions/guards";
import { hoursText } from "../../_ui";

export const metadata = { title: "Engagement analytics" };

export default async function EngagementAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "engagement.view");
  const { id } = await params;
  const d = await load(() => engagementDashboard(actor, id));
  const b = d.budget;
  const est = can(actor, "engagement.manage") ? await budgetEstimate(actor, { engagementType: d.engagement.engagementType, clientId: d.engagement.client.id, excludeEngagementId: d.engagement.id }) : null;
  return (
    <div className="space-y-4">
      <PageHeader title={d.engagement.name} subtitle={<><Link className="hover:underline" href={`/engagements/${d.engagement.id}`}>{d.engagement.code}</Link> · <Link className="hover:underline" href={`/clients/${d.engagement.client.id}`}>{d.engagement.client.name}</Link></>} />
      <Card><CardContent className="pt-4"><Meter label={`${hoursText(b.usedHours)} logged of ${hoursText(b.budgetHours)} budgeted`} percent={b.percent} note={b.signal} />{est ? <p className="mt-2 text-xs text-muted">Estimate from past actuals: {est.suggestedHours === null ? "none yet" : hoursText(est.suggestedHours)} · {est.basis}{est.byStage.length ? ` · usual split: ${est.byStage.slice(0, 4).map((s) => `${s.stage} ${s.sharePct}%`).join(", ")}` : ""}</p> : null}</CardContent></Card>
      <KpiRow>
        <StatTile label="Remaining" value={b.percent === null ? "—" : hoursText(b.remainingHours)} tone={b.health === "Over" ? "bad" : b.health === "AtRisk" ? "warn" : undefined} />
        <StatTile label="Tasks done" value={`${d.tasks.closed} of ${d.tasks.total}`} />
        <StatTile label="Overdue tasks" value={String(d.tasks.overdue)} tone={d.tasks.overdue ? "bad" : undefined} />
        <StatTile label="Waiting on client" value={String(d.tasks.waitingOnClient)} />
        <StatTile label="Open review points" value={String(d.openReviewPoints)} />
        {d.billing ? <StatTile label="Billed" value={formatInr(d.billing.billedPaise)} sub={`${d.billing.label} · ${formatInr(d.billing.outstandingPaise)} outstanding`} /> : null}
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Effort by stage</CardTitle></CardHeader><CardContent>
          <BarList title="Hours logged by stage" rows={d.byStage.map((s) => ({ label: s.stage, value: s.hours, display: hoursText(s.hours) }))} empty="No time logged yet." />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Effort by month</CardTitle></CardHeader><CardContent>
          {d.byMonth.length ? <Columns title="Hours logged by month" labels={d.byMonth.map((m) => monthName(m.month))} series={[{ name: "Hours", values: d.byMonth.map((m) => m.hours), format: hoursText }]} /> : <p className="text-sm text-muted">No time logged yet.</p>}
        </CardContent></Card>
      </div>
      {d.byPerson ? (
        <Card><CardHeader><CardTitle>Who worked on it</CardTitle><span className="text-xs text-muted">Alphabetical, for planning, not a ranking</span></CardHeader><CardContent>
          <BarList title="Hours logged by person" rows={d.byPerson.map((p) => ({ label: p.name, value: p.hours, display: hoursText(p.hours) }))} />
        </CardContent></Card>
      ) : null}
    </div>
  );
}
