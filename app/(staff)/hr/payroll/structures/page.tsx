import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDate, todayIst } from "@/server/lib/dates";
import { structureOverview } from "@/server/services/payroll/structures";
import { payrollSettings } from "@/server/services/payroll/common";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../../work/action-button";
import { ProposeStructureDialog } from "../payroll-forms";
import { decideStructureAction } from "../actions";
import { inr } from "../labels";

export const metadata = { title: "Salary structures" };

export default async function StructuresPage() {
  const actor = await requireStaff();
  const today = todayIst();
  const rows = await load(() => structureOverview(actor, today));
  const { defaultRegime } = await payrollSettings();
  const canPropose = can(actor, "hr.records.manage") || can(actor, "salary.revise.approve");
  const canApprove = can(actor, "salary.revise.approve");
  const people = rows.map((r) => ({ id: r.user.id, name: r.user.displayName }));
  const drafts = rows.flatMap((r) => r.drafts.map((d) => ({ ...d, name: r.user.displayName })));
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Salary structures" subtitle="Encrypted; visible to HR and Partners only. Revisions are effective-dated and approved by a Partner." actions={canPropose ? <ProposeStructureDialog people={people} today={today} defaultRegime={defaultRegime} /> : null} />
      <p className="text-sm"><Link href="/hr/payroll" className="text-brand hover:underline">← Payroll</Link></p>
      {drafts.length ? (
        <Card>
          <CardHeader><CardTitle>Awaiting Partner approval ({drafts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {drafts.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-sm last:border-0">
                <span><span className="font-medium">{d.name}</span> · {d.kind === "STIPEND" ? "stipend" : "salary"} from {formatDate(d.effectiveFrom)} · {inr(d.monthlyGross)} / month (basic {inr(d.components.basic)})</span>
                {canApprove ? (
                  <span className="flex gap-2">
                    <ActionButton action={decideStructureAction.bind(null, d.id, true)} variant="default">Approve</ActionButton>
                    <ActionButton action={decideStructureAction.bind(null, d.id, false)} confirm="Reject and delete this draft?">Reject</ActionButton>
                  </span>
                ) : <Badge tone="amber">pending</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <Table>
          <THead><tr><TH>Person</TH><TH>From</TH><TH className="text-right">Basic</TH><TH className="text-right">HRA</TH><TH className="text-right">Allowances</TH><TH className="text-right">Variable</TH><TH className="text-right">Monthly gross</TH><TH>Regime</TH><TH /></tr></THead>
          <TBody>
            {rows.map(({ user, current, upcoming }) => (
              <TR key={user.id}>
                <TD><span className="font-medium">{user.displayName}</span><span className="block text-xs text-muted">{user.employeeProfile?.employeeCode ?? "no employee record"}</span></TD>
                {current ? (
                  <>
                    <TD className="whitespace-nowrap">{formatDate(current.effectiveFrom)}{current.kind === "STIPEND" ? <Badge className="ml-1">stipend</Badge> : null}</TD>
                    <TD className="whitespace-nowrap text-right">{inr(current.components.basic)}</TD>
                    <TD className="whitespace-nowrap text-right">{inr(current.components.hra)}</TD>
                    <TD className="whitespace-nowrap text-right">{inr(current.components.special + current.components.other)}</TD>
                    <TD className="whitespace-nowrap text-right">{inr(current.components.variable)}</TD>
                    <TD className="whitespace-nowrap text-right font-medium">{inr(current.monthlyGross)}</TD>
                    <TD>{current.kind === "SALARY" ? current.regime.toLowerCase() : "—"}</TD>
                  </>
                ) : <TD colSpan={7} className="text-muted">No approved structure{upcoming.length ? ` (one from ${formatDate(upcoming[0]!.effectiveFrom)})` : ""}</TD>}
                <TD className="text-right">{canPropose ? <ProposeStructureDialog people={people} today={today} defaultRegime={defaultRegime} preset={{ userId: user.id, label: user.displayName }} /> : null}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
