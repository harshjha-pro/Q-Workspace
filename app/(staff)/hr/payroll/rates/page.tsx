import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDate } from "@/server/lib/dates";
import { listRateTables, type RateTable } from "@/server/services/payroll/rates";
import { PageHeader, Card, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../../work/action-button";
import { AddRateDialog } from "../payroll-forms";
import { addRateAction, verifyRateAction } from "../actions";
import { inr } from "../labels";

export const metadata = { title: "Statutory payroll rates" };

const pct = (bp: number) => `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function RatesPage() {
  const actor = await requireStaff();
  const t = await load(() => listRateTables(actor));
  const isPartner = can(actor, "payroll.approve");
  const canAdd = can(actor, "payroll.prepare") || isPartner;

  const status = (table: RateTable, r: { id: string; verifiedById: string | null; source: string }) => (
    <TD>
      {r.verifiedById ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}
      <span className="block max-w-72 text-xs text-muted">{r.source}</span>
      {!r.verifiedById && isPartner ? <ActionButton action={verifyRateAction.bind(null, table, r.id)} variant="ghost" confirm="Confirm you have checked this value against the official notification.">Verify</ActionButton> : null}
    </TD>
  );
  const section = (table: RateTable, title: string, head: string[], rows: React.ReactNode) => (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {canAdd ? <AddRateDialog table={table} title={title} action={addRateAction.bind(null, table)} /> : null}
      </CardHeader>
      <Table><THead><tr>{head.map((h) => <TH key={h}>{h}</TH>)}<TH>Status / source</TH></tr></THead><TBody>{rows}</TBody></Table>
    </Card>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Statutory payroll rates" subtitle="Every rate, slab and limit the payroll engine uses. Nothing is hard-coded." />
      <p className="text-sm"><Link href="/hr/payroll" className="text-brand hover:underline">← Payroll</Link></p>
      <Alert tone="warn">The FY 2026-27 values were seeded from the Finance Act 2025 and are Unverified. A Partner verifies each row against the current law (Income-tax Act, 2025 from 1 April 2026) before relying on TDS (Q-34).</Alert>
      {section("PF", "Provident Fund", ["From", "Employee", "Employer EPF / EPS", "PF ceiling", "EPS ceiling", "Admin / EDLI"], t.pf.map((r) => (
        <TR key={r.id}><TD>{formatDate(r.effectiveFrom)}</TD><TD>{pct(r.employeeBp)}</TD><TD>{pct(r.employerEpfBp)} / {pct(r.employerEpsBp)}</TD><TD>{inr(r.pfWageCeilingPaise)}</TD><TD>{inr(r.epsWageCeilingPaise)}</TD><TD>{pct(r.adminBp)} / {pct(r.edliBp)}</TD>{status("PF", r)}</TR>
      )))}
      {section("ESI", "ESI", ["From", "Employee", "Employer", "Wage ceiling"], t.esi.map((r) => (
        <TR key={r.id}><TD>{formatDate(r.effectiveFrom)}</TD><TD>{pct(r.employeeBp)}</TD><TD>{pct(r.employerBp)}</TD><TD>{inr(r.wageCeilingPaise)}</TD>{status("ESI", r)}</TR>
      )))}
      {section("PT", "Professional Tax slabs (a state with no rows levies none, e.g. Rajasthan)", ["State", "Gender", "Monthly gross", "PT", "Different month", "From"], t.pt.map((r) => (
        <TR key={r.id}><TD>{r.stateCode}</TD><TD>{r.gender}</TD><TD className="whitespace-nowrap">{inr(r.fromPaise)} – {r.toPaise === null ? "above" : inr(r.toPaise)}</TD><TD>{inr(r.amountPaise)}</TD><TD>{r.overrideMonth ? `${MONTHS[r.overrideMonth]}: ${inr(r.overrideAmountPaise ?? 0)}` : "—"}</TD><TD>{formatDate(r.effectiveFrom)}</TD>{status("PT", r)}</TR>
      )))}
      {section("SLAB", "Income-tax slabs", ["FY", "Regime", "Income", "Rate"], t.slabs.map((r) => (
        <TR key={r.id}><TD>{r.fy}</TD><TD>{r.regime}</TD><TD className="whitespace-nowrap">{inr(r.fromPaise)} – {r.toPaise === null ? "above" : inr(r.toPaise)}</TD><TD>{pct(r.rateBp)}</TD>{status("SLAB", r)}</TR>
      )))}
      {section("PARAM", "Tax parameters (standard deduction, rebate, cess, surcharge, deduction limits)", ["FY", "Regime", "Key", "Value"], t.params.map((r) => (
        <TR key={r.id}><TD>{r.fy}</TD><TD>{r.regime}</TD><TD className="font-mono text-xs">{r.key}</TD><TD>{r.unit === "PAISE" ? inr(r.valueInt) : r.unit === "BP" ? pct(r.valueInt) : String(r.valueInt)}</TD>{status("PARAM", r)}</TR>
      )))}
      {section("STIPEND", "Minimum article stipend", ["Institute", "Location class", "Year", "Minimum / month", "From"], t.stipend.map((r) => (
        <TR key={r.id}><TD>{r.institute}</TD><TD>{r.locationClass}</TD><TD>{r.yearOfTraining}</TD><TD>{inr(r.amountPaise)}</TD><TD>{formatDate(r.effectiveFrom)}</TD>{status("STIPEND", r)}</TR>
      )))}
    </div>
  );
}
