import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { listMis, previousMonth } from "@/server/services/analytics/mis";
import { formatDateTime, todayIst } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BuildMisForm } from "./build-form";

export const metadata = { title: "Partner MIS" };

export default async function MisPage() {
  const actor = await requireStaff();
  if (!can(actor, "analytics.firm")) redirect("/denied");
  const rows = await listMis(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Partner MIS" subtitle="Monthly PDF and Excel, built on the 5th for the month before · Partners only" />
      <Card>
        <CardHeader><CardTitle>Reports</CardTitle></CardHeader>
        <Table>
          <THead><tr><TH>Month</TH><TH>PDF</TH><TH>Excel</TH><TH>Last built</TH></tr></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={4} className="text-sm text-muted">No MIS yet. The first one is built on the 5th, or build one now.</TD></TR> : null}
            {rows.map((r) => (
              <TR key={r.month}>
                <TD className="font-medium">{r.label}</TD>
                <TD>{r.pdf ? <a className="text-brand hover:underline" href={`/api/dms/${r.pdf.id}`}>Download PDF</a> : "—"}</TD>
                <TD>{r.xlsx ? <a className="text-brand hover:underline" href={`/api/dms/${r.xlsx.id}`}>Download Excel</a> : "—"}</TD>
                <TD className="text-sm text-muted">{formatDateTime(r.pdf?.updatedAt ?? r.xlsx?.updatedAt ?? null)}{r.pdf && r.pdf.currentVersion > 1 ? ` · version ${r.pdf.currentVersion}` : ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader><CardTitle>Build or rebuild a month</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted">Figures for the month (filings due, fees billed, hours, leads) plus balances as on today (receivable, unbilled work, overdue). Rebuilding keeps the earlier version in the document history. Partners are notified.</p>
          <BuildMisForm defaultMonth={previousMonth(todayIst())} />
        </CardContent>
      </Card>
    </div>
  );
}
