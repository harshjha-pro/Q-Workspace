import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { monthLabel, todayIst } from "@/server/lib/dates";
import { payrollQueue } from "@/server/services/payroll/runs";
import { unverifiedRateCount } from "@/server/services/payroll/rates";
import { pendingRegularisationCount, listRegularisations } from "@/server/services/attendance/service";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RUN_KIND_LABEL, RUN_STATUS_TONE } from "./payroll/labels";

export const metadata = { title: "HR" };

/** HR dashboard (spec 9.3 HR Admin home): next run, pending regularisations, approvals. */
export default async function HrPage() {
  const actor = await requireStaff();
  const payroll = can(actor, "payroll.prepare") || can(actor, "payroll.approve");
  if (!payroll && !can(actor, "hr.records.manage")) redirect("/denied");
  const month = todayIst().slice(0, 7);
  const q = payroll ? await load(() => payrollQueue(actor)) : { runs: [], pendingStructures: 0 };
  const [unverified, pendingRegs, myRegs] = await Promise.all([
    unverifiedRateCount(),
    pendingRegularisationCount(),
    can(actor, "attendance.regularise.approve") ? load(() => listRegularisations(actor, "approvals")) : Promise.resolve([]),
  ]);
  const current = q.runs.filter((r) => r.month === month);
  const waitingPartner = q.runs.filter((r) => r.status === "REVIEWED");
  const tiles: [string, string, string][] = [
    ["Payroll runs", "/hr/payroll", current.length ? current.map((r) => `${RUN_KIND_LABEL[r.kind]}: ${r.status.toLowerCase()}`).join(" · ") : `No run yet for ${monthLabel(month)}`],
    ["Salary revisions to approve", "/hr/payroll/structures", String(q.pendingStructures)],
    ["Runs waiting for a Partner", "/hr/payroll", String(waitingPartner.length)],
    ["Attendance regularisations pending", "/hr/attendance?tab=approvals", String(myRegs.length || pendingRegs)],
    ["Unverified statutory rows", "/hr/payroll/rates", String(unverified)],
  ];
  const links: [string, string][] = [
    ["/hr/payroll", "Payroll runs"], ["/hr/payroll/structures", "Salary structures"], ["/hr/payroll/declarations", "Declarations & Form 16"], ["/hr/payroll/rates", "Statutory rates"],
    ["/hr/attendance", "Attendance"], ["/hr/leave-policies", "Leave policies & balances"], ["/hr/cost-rates", "Cost rates"],
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="HR" subtitle="Payroll, attendance and leave at a glance." />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([k, href, v]) => (
          <Link key={k} href={href} className="rounded-lg border border-line bg-white p-3 hover:bg-gray-50">
            <dt className="text-xs text-muted">{k}</dt><dd className="text-base font-semibold">{v}</dd>
          </Link>
        ))}
      </dl>
      {q.runs.length ? (
        <Card>
          <CardHeader><CardTitle>Open runs</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {q.runs.map((r) => <p key={r.id}><Link href={`/hr/payroll/${r.id}`} className="text-brand hover:underline">{RUN_KIND_LABEL[r.kind]} · {monthLabel(r.month)}</Link> <Badge tone={RUN_STATUS_TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge></p>)}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Sections</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {links.map(([href, l]) => <Link key={href} href={href} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-gray-50">{l}</Link>)}
        </CardContent>
      </Card>
    </div>
  );
}
