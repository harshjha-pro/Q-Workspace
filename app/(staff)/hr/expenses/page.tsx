import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDate, todayIst } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { claimsForReview, listConveyanceRates, MODE_LABELS } from "@/server/services/hr/expenses";
import { isHrOrPartner } from "@/server/services/hr/common";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ActionButton } from "../../work/action-button";
import { ClaimsTable } from "./claims-table";
import { DecideDialog, RateDialog } from "./ui";
import { markPaidAction } from "./actions";

export const metadata = { title: "Expense approvals" };

export default async function ExpenseApprovalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "expense.approve") && actor.role !== "HR_ADMIN") redirect("/denied");
  const asked = (await searchParams).view;
  const view = asked === "approved" || asked === "all" ? asked : can(actor, "expense.approve") ? "pending" : "approved";
  const [rows, rates] = await Promise.all([load(() => claimsForReview(actor, view)), listConveyanceRates()]);
  const payer = isHrOrPartner(actor);
  const approver = can(actor, "expense.approve");
  const tabs: [string, string][] = [["pending", "To approve"], ["approved", "Approved, to pay"], ["all", "All"]];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Expense claims" subtitle="Approve your team's claims (never your own). Client-recoverable claims go to the disbursements register on approval." />
      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Views">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/hr/expenses?view=${k}`} aria-current={view === k ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", view === k ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>{l}</Link>
        ))}
      </nav>
      <Card>
        <ClaimsTable rows={rows} showClaimant actions={(r) => {
          const row = rows.find((x) => x.id === r.id)!;
          if (r.status === "PENDING" && approver && !row.mine) return <DecideDialog claimId={r.id} label={`${row.claimant}, ${formatInr(r.amountPaise)}`} />;
          if (r.status === "APPROVED" && payer) return <span className="flex flex-wrap gap-1"><ActionButton action={markPaidAction.bind(null, r.id, "PAYROLL")}>Paid with payroll</ActionButton><ActionButton action={markPaidAction.bind(null, r.id, "SEPARATE")} variant="ghost">Paid separately</ActionButton></span>;
          return null;
        }} />
      </Card>
      <Card>
        <CardHeader><CardTitle>Conveyance rates</CardTitle>{payer ? <RateDialog today={todayIst()} /> : null}</CardHeader>
        <CardContent className="text-sm">
          {rates.length === 0 ? <p className="text-muted">No rate set: claimants type the amount (Q-21).</p> : (
            <ul className="space-y-1">{rates.map((r) => <li key={r.id}>{MODE_LABELS[r.mode as keyof typeof MODE_LABELS] ?? r.mode}: {formatInr(r.ratePaise)} from {formatDate(r.effectiveFrom)}</li>)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
