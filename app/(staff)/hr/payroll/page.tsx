import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { redirect } from "next/navigation";
import { can } from "@/server/permissions/guards";
import { monthLabel, todayIst, fyStartYear, fyLabel } from "@/server/lib/dates";
import { listRuns } from "@/server/services/payroll/runs";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CreateRunDialog } from "./payroll-forms";
import { RUN_KIND_LABEL, RUN_STATUS_TONE, inr } from "./labels";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const actor = await requireStaff();
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve")) redirect("/denied");
  const runs = await load(() => listRuns(actor));
  const fy = fyStartYear(todayIst());
  const links: [string, string][] = [["/hr/payroll/structures", "Salary structures"], ["/hr/payroll/declarations", "Declarations & Form 16"], ["/hr/payroll/rates", "Statutory rates"], ["/hr/attendance", "Attendance"], ["/hr/leave-policies", "Leave policies"], ["/hr/cost-rates", "Cost rates"]];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Payroll" subtitle="Draft → Reviewed (HR) → Approved (Partner) → Paid → Locked" actions={can(actor, "payroll.prepare") ? <CreateRunDialog month={todayIst().slice(0, 7)} /> : null} />
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Payroll sections">
        {links.map(([href, l]) => <Link key={href} href={href} className="rounded-md border border-line bg-white px-3 py-1.5 hover:bg-gray-50">{l}</Link>)}
      </nav>
      {runs.length === 0 ? <EmptyState title="No payroll runs yet">Create the first run for a month once salary structures are approved.</EmptyState> : (
        <Card>
          <Table>
            <THead><tr><TH>Month</TH><TH>Kind</TH><TH>Status</TH><TH className="text-right">People</TH><TH className="text-right">Gross</TH><TH className="text-right">Net</TH></tr></THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/hr/payroll/${r.id}`} className="font-medium text-brand hover:underline">{monthLabel(r.month)}</Link></TD>
                  <TD>{RUN_KIND_LABEL[r.kind] ?? r.kind}</TD>
                  <TD><Badge tone={RUN_STATUS_TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge>{r.totals?.belowMinimum ? <Badge tone="red" className="ml-1">below minimum</Badge> : null}</TD>
                  <TD className="text-right">{r.totals?.count ?? 0}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.totals?.gross ?? 0)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.totals?.net ?? 0)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>TDS on salary (24Q) data · {fyLabel(fy)}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((q) => <a key={q} href={`/api/payroll/24q?fy=${fy}&q=${q}`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-gray-50">Q{q} (Excel)</a>)}
          <a href={`/api/payroll/24q?fy=${fy - 1}&q=4`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-gray-50">{fyLabel(fy - 1)} Q4</a>
        </CardContent>
      </Card>
    </div>
  );
}
