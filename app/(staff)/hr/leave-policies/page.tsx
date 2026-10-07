import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can, scopeOf } from "@/server/permissions/guards";
import { formatDate, todayIst } from "@/server/lib/dates";
import { listPolicies, listBalances } from "@/server/services/attendance/leave-policies";
import { PageHeader, Card, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../work/action-button";
import { PolicyDialog, AdjustBalanceDialog } from "./policy-forms";
import { createPolicyAction, updatePolicyAction, verifyPolicyAction, runAccrualAction, adjustBalanceAction } from "./actions";

export const metadata = { title: "Leave policies" };
const TYPE: Record<string, string> = { PERSONAL: "Personal", SICK: "Sick", EXAM_STUDY: "Exam / study", OTHER: "Other" };
const d = (h: number): string => (h < 0 ? `-${d(-h)}` : h % 2 ? `${Math.floor(h / 2)}½` : String(h / 2));

export default async function LeavePoliciesPage() {
  const actor = await requireStaff();
  if (["none", "self"].includes(scopeOf(actor, "hr.records.view"))) redirect("/denied");
  const [policies, balances] = await Promise.all([load(() => listPolicies(actor)), load(() => listBalances(actor))]);
  const manage = can(actor, "hr.records.manage");
  const isPartner = actor.role === "PARTNER";
  const types = [...new Set(balances.flatMap((b) => b.balances.map((x) => x.leaveType)))];
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Leave policies & balances" subtitle="Quota, accrual, carry-forward and encashment per employee category (spec 11.3)."
        actions={<>{manage || isPartner ? <ActionButton action={runAccrualAction}>Run accrual now</ActionButton> : null}{manage ? <PolicyDialog action={createPolicyAction} trigger="Add policy" d={{ name: "", employeeCategory: "STAFF", leaveType: "PERSONAL", quotaDays: 12, accrual: "ANNUAL", carryDays: 0, encashable: false, effectiveFrom: todayIst(), source: "" }} /> : null}</>} />
      <p className="text-sm"><Link href="/hr" className="text-brand hover:underline">← HR</Link></p>
      {policies.some((p) => !p.verifiedById) ? <Alert tone="warn">Unverified policies are placeholders (Q-20) until a Partner confirms them. Leave beyond a balance is still approved but the excess becomes loss of pay.</Alert> : null}
      <Card>
        <Table>
          <THead><tr><TH>Policy</TH><TH>Category</TH><TH>Type</TH><TH className="text-right">Days / year</TH><TH>Accrual</TH><TH className="text-right">Carry forward</TH><TH>Encash</TH><TH>From</TH><TH /></tr></THead>
          <TBody>
            {policies.map((p) => (
              <TR key={p.id}>
                <TD><span className="font-medium">{p.name}</span>{p.verifiedById ? <Badge tone="green" className="ml-1">confirmed</Badge> : <Badge tone="amber" className="ml-1">unverified</Badge>}{p.source ? <span className="block text-xs text-muted">{p.source}</span> : null}</TD>
                <TD>{p.employeeCategory.toLowerCase()}</TD>
                <TD>{TYPE[p.leaveType] ?? p.leaveType}</TD>
                <TD className="text-right">{d(p.quotaHalfDays)}</TD>
                <TD>{p.accrual.toLowerCase()}</TD>
                <TD className="text-right">{d(p.carryForwardMaxHalfDays)}</TD>
                <TD>{p.encashable ? "yes" : "no"}</TD>
                <TD className="whitespace-nowrap">{formatDate(p.effectiveFrom)}</TD>
                <TD className="whitespace-nowrap text-right">
                  {manage ? <PolicyDialog action={updatePolicyAction.bind(null, p.id)} trigger="Edit" d={{ name: p.name, employeeCategory: p.employeeCategory, leaveType: p.leaveType, quotaDays: p.quotaHalfDays / 2, accrual: p.accrual, carryDays: p.carryForwardMaxHalfDays / 2, encashable: p.encashable, effectiveFrom: p.effectiveFrom, source: p.source }} /> : null}
                  {isPartner && !p.verifiedById ? <ActionButton action={verifyPolicyAction.bind(null, p.id)} variant="ghost">Confirm</ActionButton> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Balances this year (days available)</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Person</TH>{types.map((t) => <TH key={t} className="text-right">{TYPE[t] ?? t}</TH>)}</tr></THead>
          <TBody>
            {balances.map(({ user, balances: bs }) => (
              <TR key={user.id}>
                <TD className="font-medium">{user.displayName}</TD>
                {types.map((t) => {
                  const b = bs.find((x) => x.leaveType === t);
                  return (
                    <TD key={t} className="whitespace-nowrap text-right">
                      {b ? <><span className={b.availableHalfDays < 0 ? "text-red-700" : ""}>{d(b.availableHalfDays)}</span><span className="block text-xs text-muted">taken {d(b.takenHalfDays)}</span>{manage ? <AdjustBalanceDialog action={adjustBalanceAction.bind(null, b.id)} label={`${user.displayName}, ${TYPE[t] ?? t}`} /> : null}</> : "—"}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
