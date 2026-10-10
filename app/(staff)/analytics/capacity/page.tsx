import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { capacityForecast } from "@/server/services/analytics/capacity";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Columns, KpiRow, StatTile } from "@/components/charts/charts";
import { cn } from "@/lib/utils";
import { hoursText, pctText } from "../_ui";

export const metadata = { title: "Capacity forecast" };

/** Load bands in reserved status colours, always with the % and a label. */
const BAND = {
  ok: { label: "Within capacity", cell: "bg-white text-ink", tone: "green" as const },
  near: { label: "Approaching", cell: "bg-status-warning/40 text-ink", tone: "amber" as const },
  over: { label: "Overloaded", cell: "bg-status-critical text-white", tone: "red" as const },
  none: { label: "No capacity", cell: "bg-gray-100 text-muted", tone: "neutral" as const },
};

export default async function CapacityPage({ searchParams }: { searchParams: Promise<{ grain?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.firm")) redirect("/denied");
  const d = await capacityForecast(actor, { grain: (await searchParams).grain });
  const s = d.settings;
  const totalCap = d.buckets.reduce((a, b) => a + b.capacityHours, 0);
  const totalDem = d.buckets.reduce((a, b) => a + b.demandHours, 0);
  const totalUnassigned = d.buckets.reduce((a, b) => a + b.unassignedHours, 0);
  const unit = d.grain === "week" ? "Week of" : "Month";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Capacity forecast"
        subtitle={`Next ${d.buckets.length} ${d.grain === "week" ? "weeks" : "months"} · Partners only · planning estimate, not a measure of anyone's performance`}
        actions={
          <nav aria-label="Grain" className="flex gap-1.5 text-sm">
            {(["week", "month"] as const).map((g) => <Link key={g} href={`/analytics/capacity?grain=${g}`} aria-current={d.grain === g ? "page" : undefined} className={cn("rounded-md px-2.5 py-1", d.grain === g ? "bg-brand text-white" : "border border-line bg-white")}>{g === "week" ? "13 weeks" : "6 months"}</Link>)}
          </nav>
        }
      />
      <KpiRow>
        <StatTile label="Available hours" value={hoursText(Math.round(totalCap))} sub={`${s.hoursPerDay} h × working days, less leave`} />
        <StatTile label="Forecast work" value={hoursText(Math.round(totalDem))} sub="remaining effort on open tasks" />
        <StatTile label="Peak" value={d.peak ? pctText(d.peak.loadPct) : "—"} sub={d.peak ? `${unit.toLowerCase()} ${d.peak.label}` : "no forecast work"} tone={d.peak && d.peak.loadPct > s.bands[1]! ? "bad" : d.peak && d.peak.loadPct >= s.bands[0]! ? "warn" : undefined} />
        <StatTile label="People overloaded" value={String(d.overloadedPeople)} sub="in at least one period" tone={d.overloadedPeople ? "warn" : undefined} />
        <StatTile label="Unassigned work" value={hoursText(Math.round(totalUnassigned))} sub="tasks with no current assignee" tone={totalUnassigned ? "warn" : undefined} />
        <StatTile label="Tasks without estimate" value={String(d.noEstimate.count)} sub="no history and no budget" />
      </KpiRow>

      <Card><CardHeader><CardTitle>Available hours and forecast work</CardTitle></CardHeader><CardContent>
        <Columns
          title="Available hours and forecast work by period"
          labels={d.buckets.map((b) => b.label)}
          series={[
            { name: "Available", values: d.buckets.map((b) => b.capacityHours), format: (v) => hoursText(v) },
            { name: "Forecast work", values: d.buckets.map((b) => b.demandHours), format: (v) => hoursText(v) },
          ]}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-center text-xs">
            <caption className="sr-only">Firm forecast load by period</caption>
            <thead><tr><th scope="col" className="p-1 text-left font-medium">Load</th>{d.buckets.map((b) => <th key={b.from} scope="col" className="p-1 font-medium">{b.label}</th>)}</tr></thead>
            <tbody><tr>
              <th scope="row" className="p-1 text-left font-normal text-muted">Firm</th>
              {d.buckets.map((b) => <td key={b.from} className="p-0.5"><span title={`${b.label}: ${hoursText(b.demandHours)} of ${hoursText(b.capacityHours)} available · ${BAND[b.band as keyof typeof BAND].label}`} className={cn("block rounded px-1 py-1 tabular-nums", BAND[b.band as keyof typeof BAND].cell)}>{pctText(b.loadPct)}</span></td>)}
            </tr></tbody>
          </table>
        </div>
        <Legend near={s.bands[0]!} over={s.bands[1]!} />
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Forecast load by person</CardTitle><span className="text-xs text-muted">Alphabetical. Forecast work on a person&apos;s current tasks against their available hours.</span></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
            <caption className="sr-only">Forecast load by person and period, as a percentage of available hours</caption>
            <thead><tr>
              <th scope="col" className="sticky left-0 z-10 border-b border-line bg-surface p-2 text-left font-medium">Person</th>
              {d.buckets.map((b) => <th key={b.from} scope="col" className="border-b border-line p-2 font-medium">{b.label}</th>)}
            </tr></thead>
            <tbody>
              {d.people.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface p-2 text-left font-normal">
                    <div className="font-medium text-ink">{p.name}</div><div className="text-muted">{p.designation}</div>
                  </th>
                  {p.cells.map((c, i) => {
                    const b = BAND[c.band as keyof typeof BAND];
                    return (
                      <td key={i} className="border-b border-line p-0.5 text-center">
                        <span title={`${p.name} · ${d.buckets[i]!.label}: ${hoursText(c.demandHours)} forecast, ${hoursText(c.capacityHours)} available · ${b.label}`} className={cn("block rounded px-1 py-1 tabular-nums", b.cell)}>
                          {c.capacityHours === 0 && c.demandHours === 0 ? "—" : c.loadPct === null ? "Leave" : `${Math.round(c.loadPct)}%`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Suggested rebalancing</CardTitle><span className="text-xs text-muted">Suggestions only. Reassign on the task if you agree.</span></CardHeader>
        <CardContent>
          {d.suggestions.length === 0 ? <p className="text-sm text-muted">No suggestions: nobody is overloaded, or no teammate on the client&apos;s team has room.</p> : (
            <Table>
              <THead><tr><TH>Task</TH><TH>{unit}</TH><TH className="text-right">Remaining</TH><TH>From</TH><TH>Suggested</TH></tr></THead>
              <TBody>
                {d.suggestions.map((r) => (
                  <TR key={r.taskId}>
                    <TD><Link className="font-medium hover:underline" href={`/tasks/${r.taskId}`}>{r.title}</Link><div className="text-xs text-muted">{r.client}</div></TD>
                    <TD className="text-sm">{r.bucket}</TD>
                    <TD className="text-right tabular-nums">{hoursText(r.hours)}</TD>
                    <TD className="text-sm">{r.fromName}</TD>
                    <TD className="text-sm">{r.toName}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted">Only tasks with a single assignee and not yet with a reviewer, moved to someone on the client&apos;s team who stays under {s.bands[0]}% after the move.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Forecast work by type</CardTitle></CardHeader><CardContent>
          <Table>
            <THead><tr><TH>Type</TH><TH className="text-right">Tasks</TH><TH className="text-right">Remaining</TH><TH>Estimate from</TH></tr></THead>
            <TBody>
              {d.byType.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No forecast work.</TD></TR> : null}
              {d.byType.map((t) => <TR key={t.code}><TD>{t.name}</TD><TD className="text-right tabular-nums">{t.tasks}</TD><TD className="text-right tabular-nums">{hoursText(t.hours)}</TD><TD className="text-xs text-muted">{t.source}</TD></TR>)}
            </TBody>
          </Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Tasks without an estimate</CardTitle></CardHeader><CardContent>
          {d.noEstimate.count === 0 ? <p className="text-sm text-muted">Every open task has an estimate.</p> : (
            <>
              <Alert tone="info">{d.noEstimate.count} open task{d.noEstimate.count === 1 ? "" : "s"} have no history of the same type (fewer than {s.minSamples} filed in {s.historyMonths} months) and no budget, so they are left out of the forecast.</Alert>
              <ul className="mt-2 space-y-1 text-sm">
                {d.noEstimate.sample.map((t) => <li key={t.id}><Link href={`/tasks/${t.id}`} className="hover:underline">{t.title}</Link> <span className="text-xs text-muted">· {t.client} · due {formatDate(t.due)}</span></li>)}
              </ul>
            </>
          )}
        </CardContent></Card>
      </div>
      <p className="text-xs text-muted">Settings: {s.hoursPerDay} h per working day (Q-24), work spread over {s.leadDays} days before the due date, bands {s.bands[0]}% / {s.bands[1]}%. Change them under Admin → Settings.</p>
    </div>
  );
}

function Legend({ near, over }: { near: number; over: number }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      <span className="inline-flex items-center gap-1.5"><Badge tone="green">Within capacity</Badge>below {near}%</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-status-warning/40" />Approaching: {near}–{over}%</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-status-critical" />Overloaded: above {over}%</span>
    </div>
  );
}
