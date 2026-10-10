import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { profitabilityDashboard } from "@/server/services/analytics/profitability";
import { formatInr, formatInrCompact } from "@/server/lib/money";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BarList, KpiRow, StatTile } from "@/components/charts/charts";
import { PeriodPicker, hoursText, pctText } from "../_ui";

export const metadata = { title: "Profitability and cash" };

const BASIS: Record<string, string> = { FIXED: "Fixed fee", RETAINER: "Retainer", TIME: "Time" };

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.firm")) redirect("/denied");
  const d = await profitabilityDashboard(actor, { period: (await searchParams).period });
  const h = d.headline;
  const c = d.concentration;
  return (
    <div className="space-y-4">
      <PageHeader title="Profitability and cash" subtitle={`${d.period.label} · Partners only · cost rates are confidential`} actions={<PeriodPicker base="/analytics/profitability" current={d.period.key} />} />
      {h.hoursWithoutRate > 0 ? (
        <Alert tone="warn">{hoursText(h.hoursWithoutRate)} in this period have no cost rate, so cost and realization are understated. Set rates under <Link className="underline" href="/hr/cost-rates">HR → Cost rates</Link>.</Alert>
      ) : null}
      <KpiRow>
        <StatTile label="Fees billed" value={formatInrCompact(h.billedPaise)} sub="taxable fees, issued invoices" />
        <StatTile label="Cost of hours" value={formatInrCompact(h.costPaise)} sub={`${formatInrCompact(h.engagementCostPaise)} on engagements`} />
        <StatTile label="Realization" value={pctText(h.realizationPct)} sub="fees billed ÷ cost on engagements" tone={h.realizationPct !== null && h.realizationPct < 100 ? "bad" : undefined} />
        <StatTile label="Unbilled work (WIP)" value={formatInrCompact(h.wipCostPaise)} sub={`at cost · ${formatInrCompact(h.wipValuePaise)} billable value`} tone={h.wipCostPaise ? "warn" : undefined} />
        <StatTile label="Receivable" value={formatInrCompact(h.receivablePaise)} sub={h.dsoDays === null ? "no invoices in 90 days" : `DSO ${h.dsoDays} days`} href="/billing" />
        <StatTile label="Days to collect" value={h.daysToCollect === null ? "—" : `${h.daysToCollect} days`} sub={`${h.invoicesCollected} invoice${h.invoicesCollected === 1 ? "" : "s"} paid in full`} />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Realization by service line</CardTitle></CardHeader><CardContent>
          <Table>
            <THead><tr><TH>Service line</TH><TH className="text-right">Billed</TH><TH className="text-right">Cost</TH><TH className="text-right">Realization</TH></tr></THead>
            <TBody>
              {d.realizationByLine.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">Nothing billed or logged in this period.</TD></TR> : null}
              {d.realizationByLine.map((r) => (
                <TR key={r.key}>
                  <TD>{r.label}</TD>
                  <TD className="text-right tabular-nums">{formatInr(r.billedPaise)}</TD>
                  <TD className="text-right tabular-nums">{formatInr(r.costPaise)}</TD>
                  <TD className={`text-right tabular-nums ${r.realizationPct !== null && r.realizationPct < 100 ? "font-medium text-red-700" : ""}`}>{pctText(r.realizationPct)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="mt-2 text-xs text-muted">Billing and effort fall in different months, so a single month can swing; longer periods are steadier.</p>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Lowest realization to date</CardTitle></CardHeader><CardContent>
          <Table>
            <THead><tr><TH>Engagement</TH><TH className="text-right">Billed</TH><TH className="text-right">Cost</TH><TH className="text-right">Realization</TH></tr></THead>
            <TBody>
              {d.lowestRealization.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No running engagements with cost logged.</TD></TR> : null}
              {d.lowestRealization.map((r) => (
                <TR key={r.id}>
                  <TD><Link className="font-medium hover:underline" href={`/analytics/engagements/${r.id}`}>{r.name}</Link><div className="text-xs text-muted">{r.code} · {r.client} · {BASIS[r.feeBasis] ?? r.feeBasis}</div></TD>
                  <TD className="text-right tabular-nums">{formatInr(r.billedPaise)}</TD>
                  <TD className="text-right tabular-nums">{formatInr(r.costPaise)}</TD>
                  <TD className="text-right tabular-nums">{pctText(r.realizationPct)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="mt-2 text-xs text-muted">Active and on-hold engagements, all fees billed so far against the cost of all hours so far.</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Unbilled work by age</CardTitle></CardHeader><CardContent>
          <BarList title="Unbilled chargeable work at cost by age of the work" rows={d.wip.buckets.map((b) => ({ label: b.label, value: b.costPaise, display: `${formatInrCompact(b.costPaise)} · ${hoursText(b.hours)}` }))} empty="No unbilled chargeable work." />
          <p className="mt-2 text-xs text-muted">Chargeable hours logged after each engagement&apos;s last invoice, aged by the date of the work. {d.wip.engagements} engagement{d.wip.engagements === 1 ? "" : "s"}.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Receivables by age</CardTitle></CardHeader><CardContent>
          <BarList title="Amount receivable by invoice age" rows={d.cash.ageing.map((b) => ({ label: b.label, value: b.amountPaise, display: formatInrCompact(b.amountPaise) }))} empty="Nothing receivable." />
          <p className="mt-2 text-xs text-muted">DSO = receivable ÷ {formatInrCompact(d.cash.quarterInvoicedPaise)} invoiced in the last 90 days × 90.</p>
        </CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Largest unbilled engagements</CardTitle></CardHeader><CardContent>
        <Table>
          <THead><tr><TH>Engagement</TH><TH>Basis</TH><TH className="text-right">Unbilled</TH><TH className="text-right">At cost</TH><TH className="text-right">Billable value</TH><TH>Last invoice</TH><TH className="text-right">Oldest work</TH></tr></THead>
          <TBody>
            {d.wip.top.length === 0 ? <TR><TD colSpan={7} className="text-sm text-muted">No unbilled chargeable work.</TD></TR> : null}
            {d.wip.top.map((r) => (
              <TR key={r.id}>
                <TD><Link className="font-medium hover:underline" href={`/analytics/engagements/${r.id}`}>{r.name}</Link><div className="text-xs text-muted">{r.code} · {r.client}</div></TD>
                <TD className="text-sm">{BASIS[r.feeBasis] ?? r.feeBasis}</TD>
                <TD className="text-right tabular-nums">{hoursText(r.hours)}</TD>
                <TD className="text-right tabular-nums">{formatInr(r.costPaise)}</TD>
                <TD className="text-right tabular-nums">{r.valuePaise ? formatInr(r.valuePaise) : "—"}</TD>
                <TD className="text-sm">{r.lastInvoice ? formatDate(r.lastInvoice) : "Never billed"}</TD>
                <TD className="text-right tabular-nums">{r.ageDays} days</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-muted">Billable value is hours × rate for time-billed work and the full fee for a fixed fee never billed; retainers bill on their schedule, so they show cost only.</p>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Client concentration, last 12 months</CardTitle></CardHeader><CardContent>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div><div className="text-lg font-semibold tabular-nums">{pctText(c.top1Pct)}</div><div className="text-xs text-muted">largest client</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{pctText(c.top5Pct)}</div><div className="text-xs text-muted">top 5</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{pctText(c.top10Pct)}</div><div className="text-xs text-muted">top 10</div></div>
          </div>
          <BarList title="Share of fees billed by client, last 12 months" rows={c.top.map((r) => ({ label: r.name, value: r.paise, display: `${pctText(r.sharePct)} · ${formatInrCompact(r.paise)}`, href: `/clients/${r.id}` }))} empty="No fees billed in the last 12 months." />
          <p className="mt-2 text-xs text-muted">{formatInrCompact(c.yearBilledPaise)} of fees from {c.clients} client{c.clients === 1 ? "" : "s"}.</p>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Cost rate per designation</CardTitle></CardHeader><CardContent>
          <Table>
            <THead><tr><TH>Designation</TH><TH className="text-right">People</TH><TH className="text-right">Rate / hour</TH><TH className="text-right">Hours</TH><TH className="text-right">Cost</TH></tr></THead>
            <TBody>
              {d.costRates.map((r) => (
                <TR key={r.id}>
                  <TD>{r.name}{r.effectiveFrom ? <div className="text-xs text-muted">from {formatDate(r.effectiveFrom)}</div> : null}</TD>
                  <TD className="text-right tabular-nums">{r.people}</TD>
                  <TD className="text-right tabular-nums">{r.ratePaisePerHour === null ? <span className="text-red-700">Not set</span> : formatInr(r.ratePaisePerHour)}</TD>
                  <TD className="text-right tabular-nums">{hoursText(r.hours)}</TD>
                  <TD className="text-right tabular-nums">{formatInr(r.costPaise)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="mt-2 text-xs text-muted">Internal cost of an hour, set by Partners and HR. Hours here are effort in the period, for costing only.</p>
        </CardContent></Card>
      </div>
    </div>
  );
}
