import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDate, todayIst } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { listCostRates } from "@/server/services/payroll/cost-rates";
import { PageHeader, Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CostRateDialog } from "./cost-forms";
import { setCostRateAction } from "./actions";

export const metadata = { title: "Cost rates" };

export default async function CostRatesPage() {
  const actor = await requireStaff();
  const rows = await load(() => listCostRates(actor));
  const today = todayIst();
  const manage = can(actor, "hr.records.manage") || can(actor, "salary.revise.approve");
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Cost rates per designation" subtitle="Internal ₹ per hour, effective-dated (Q-22). Visible to Partners and HR only; used for realization and budgets." />
      <p className="text-sm"><Link href="/hr" className="text-brand hover:underline">← HR</Link></p>
      <Card>
        <Table>
          <THead><tr><TH>Designation</TH><TH className="text-right">People</TH><TH className="text-right">Current rate / hour</TH><TH>History</TH><TH /></tr></THead>
          <TBody>
            {rows.map((d) => {
              const current = d.costRates.find((r) => r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today));
              return (
                <TR key={d.id}>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="text-right">{d._count.users}</TD>
                  <TD className="whitespace-nowrap text-right">{current ? formatInr(current.ratePaisePerHour) : <span className="text-muted">not set</span>}</TD>
                  <TD className="text-xs text-muted">{d.costRates.map((r) => <span key={r.id} className="block">{formatInr(r.ratePaisePerHour)} from {formatDate(r.effectiveFrom)}{r.effectiveTo ? ` to ${formatDate(r.effectiveTo)}` : ""}</span>)}</TD>
                  <TD className="text-right">{manage ? <CostRateDialog action={setCostRateAction.bind(null, d.id)} name={d.name} today={today} /> : null}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
