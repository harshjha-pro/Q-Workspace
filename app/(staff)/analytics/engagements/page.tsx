import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { engagementPortfolio } from "@/server/services/analytics/engagements";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { KpiRow, StatTile } from "@/components/charts/charts";
import { hoursText, pctText } from "../_ui";

export const metadata = { title: "Engagement dashboard" };

const TONE = { Over: "red", AtRisk: "amber", OnTrack: "green", None: "neutral" } as const;
const FILTERS = [["", "All"], ["Over", "Over budget"], ["AtRisk", "Approaching"], ["OnTrack", "On track"], ["None", "No budget"]] as const;

export default async function EngagementPortfolioPage({ searchParams }: { searchParams: Promise<{ health?: string; serviceLine?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.team") && !can(actor, "analytics.operational")) redirect("/denied");
  const sp = await searchParams;
  const d = await engagementPortfolio(actor, { health: sp.health || undefined, serviceLine: sp.serviceLine || undefined });
  return (
    <div className="space-y-4">
      <PageHeader title="Engagements" subtitle={`Budget against effort logged · ${d.scope === "firm" ? "whole firm" : "your team"} · active and on hold`} />
      <KpiRow>
        <StatTile label="Active engagements" value={String(d.summary.active)} sub={`${d.summary.withBudget} with a budget`} />
        <StatTile label="Approaching budget" value={String(d.summary.atRisk)} href="/analytics/engagements?health=AtRisk" tone={d.summary.atRisk ? "warn" : undefined} />
        <StatTile label="Over budget" value={String(d.summary.over)} sub={`${pctText(d.summary.overShare)} of budgeted`} href="/analytics/engagements?health=Over" tone={d.summary.over ? "bad" : undefined} />
      </KpiRow>
      <nav className="flex flex-wrap gap-1.5 text-sm">
        {FILTERS.map(([k, l]) => <Link key={k} href={k ? `/analytics/engagements?health=${k}` : "/analytics/engagements"} className={`rounded-md px-2.5 py-1 ${(sp.health ?? "") === k ? "bg-brand text-white" : "border border-line bg-white"}`}>{l}</Link>)}
      </nav>
      <Card>
        <Table>
          <THead><tr><TH>Engagement</TH><TH>Service line</TH><TH className="text-right">Budget</TH><TH className="text-right">Logged</TH><TH className="text-right">Used</TH><TH>Status</TH><TH className="text-right">Overdue tasks</TH>{d.rows.some((r) => r.billingLabel !== null) ? <TH>Billing</TH> : null}</tr></THead>
          <TBody>
            {d.rows.length === 0 ? <TR><TD colSpan={8} className="text-sm text-muted">No engagements here.</TD></TR> : null}
            {d.rows.map((r) => (
              <TR key={r.id}>
                <TD><Link className="font-medium hover:underline" href={`/analytics/engagements/${r.id}`}>{r.name}</Link><div className="text-xs text-muted">{r.code} · {r.client}</div></TD>
                <TD className="text-sm">{SERVICE_LINE_LABELS[r.serviceLine as ServiceLine] ?? r.serviceLine}</TD>
                <TD className="text-right tabular-nums">{r.budgetHours ? hoursText(r.budgetHours) : "—"}</TD>
                <TD className="text-right tabular-nums">{hoursText(r.usedHours)}</TD>
                <TD className="text-right tabular-nums">{pctText(r.percent)}</TD>
                <TD><Badge tone={TONE[r.health]}>{r.signal}</Badge></TD>
                <TD className="text-right tabular-nums">{r.overdueTasks || ""}</TD>
                {r.billingLabel !== null ? <TD className="text-sm">{r.billingLabel}</TD> : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
