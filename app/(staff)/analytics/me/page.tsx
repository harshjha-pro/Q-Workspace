import { requireStaff } from "@/server/context";
import { requireCap } from "@/lib/page";
import { personalDashboard } from "@/server/services/analytics/personal";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarList, Columns, KpiRow, StatTile } from "@/components/charts/charts";
import { PeriodPicker, hoursText, pctText } from "../_ui";

export const metadata = { title: "My dashboard" };

export default async function MyDashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "analytics.personal");
  const d = await personalDashboard(actor, { period: (await searchParams).period });
  return (
    <div className="space-y-4">
      <PageHeader title="My dashboard" subtitle={`${d.period.label}. Only you see this page.`} actions={<PeriodPicker base="/analytics/me" current={d.period.key} />} />
      <KpiRow>
        <StatTile label="Hours logged" value={hoursText(d.effort.hours)} sub={`${hoursText(d.effort.weekHours)} this week`} />
        <StatTile label="On client work" value={hoursText(d.effort.clientHours)} sub={`${hoursText(d.effort.chargeableHours)} chargeable`} />
        <StatTile label="My open tasks" value={String(d.tasks.open)} sub={`${d.tasks.dueNext7} due in 7 days`} href="/tasks?mine=1" />
        <StatTile label="Overdue" value={String(d.tasks.overdue)} sub={`${d.tasks.waitingOnClient} waiting on client`} href="/tasks?overdue=1&mine=1" tone={d.tasks.overdue ? "bad" : undefined} />
        <StatTile label="Filed on time this FY" value={pctText(d.tasks.onTimePctThisFy)} sub={`${d.tasks.filedThisFy} filed`} />
        <StatTile label="CPE this FY" value={hoursText(d.cpeHoursThisFy)} href="/me/growth" />
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Hours logged, last 14 days</CardTitle></CardHeader><CardContent>
          <Columns title="Hours logged per day" labels={d.effort.daily.map((x) => formatDate(x.date).slice(0, 6))} series={[{ name: "Hours", values: d.effort.daily.map((x) => x.hours), format: hoursText }]} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Where my time went</CardTitle></CardHeader><CardContent className="space-y-4">
          <BarList title="Hours by client" rows={d.effort.topClients.map((c) => ({ label: c.name, value: c.hours, display: hoursText(c.hours) }))} />
          {d.effort.categories.length ? <BarList title="Internal time" rows={d.effort.categories.map((c) => ({ label: c.name, value: c.hours, display: hoursText(c.hours) }))} /> : null}
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Reviews of my work, last 90 days</CardTitle></CardHeader><CardContent className="text-sm">
        {d.reviews.submitted ? <p>{d.reviews.submitted} sent for review, {d.reviews.returned} returned. {d.reviews.pointsRaised} review points raised, {d.reviews.pointsOpen} still open.</p> : <p className="text-muted">Nothing sent for review in the last 90 days.</p>}
      </CardContent></Card>
    </div>
  );
}
