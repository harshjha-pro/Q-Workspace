import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDateTime, monthLabel } from "@/server/lib/dates";
import { getRun } from "@/server/services/payroll/runs";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../../work/action-button";
import { AdjustDialog, SendBackDialog } from "../payroll-forms";
import { adjustPayslipAction, approveRunAction, deleteRunAction, lockRunAction, paidRunAction, recalcRunAction, reviewRunAction, sendBackRunAction } from "../actions";
import { RUN_KIND_LABEL, RUN_STATUS_TONE, days, inr, rupeeText } from "../labels";

export const metadata = { title: "Payroll run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const run = await load(() => getRun(actor, id));
  const prep = can(actor, "payroll.prepare");
  const appr = can(actor, "payroll.approve");
  const t = run.totals;
  const draft = run.status === "DRAFT";
  const files: [string, string][] = [["register", "Salary register"], ["bank", "Bank transfer file"], ...(run.kind === "SALARY" ? ([["pf-ecr", "PF ECR data"], ["esi", "ESI data"], ["pt", "PT data"]] as [string, string][]) : [])];
  const bankReady = ["APPROVED", "PAID", "LOCKED"].includes(run.status);
  const below = run.payslips.filter((p) => p.lines.stipend?.belowMinimum);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={`${RUN_KIND_LABEL[run.kind] ?? run.kind} · ${monthLabel(run.month)}`}
        subtitle={<><Badge tone={RUN_STATUS_TONE[run.status] ?? "neutral"}>{run.status.toLowerCase()}</Badge>{run.reviewedAt ? ` · reviewed ${formatDateTime(run.reviewedAt)}` : ""}{run.approvedAt ? ` · approved ${formatDateTime(run.approvedAt)}` : ""}{run.paidAt ? ` · paid ${formatDateTime(run.paidAt)}` : ""}</>}
        actions={
          <>
            {draft && prep ? <ActionButton action={recalcRunAction.bind(null, id)}>Recalculate</ActionButton> : null}
            {draft && prep ? <ActionButton action={reviewRunAction.bind(null, id)} variant="default">Mark reviewed</ActionButton> : null}
            {run.status === "REVIEWED" && appr ? <ActionButton action={approveRunAction.bind(null, id)} variant="default" confirm="Approve this payroll run?">Approve</ActionButton> : null}
            {run.status === "REVIEWED" && (prep || appr) ? <SendBackDialog action={sendBackRunAction.bind(null, id)} /> : null}
            {run.status === "APPROVED" && prep ? <ActionButton action={paidRunAction.bind(null, id)} variant="default" confirm="Record that salaries were paid? Payslips will be published to employees.">Mark paid</ActionButton> : null}
            {run.status === "PAID" ? <ActionButton action={lockRunAction.bind(null, id)} confirm="Lock this run? It cannot be changed afterwards.">Lock</ActionButton> : null}
            {draft && prep ? <ActionButton action={deleteRunAction.bind(null, id)} variant="ghost" confirm="Delete this Draft run?">Delete</ActionButton> : null}
          </>
        }
      />
      <p className="text-sm"><Link href="/hr/payroll" className="text-brand hover:underline">← All runs</Link></p>
      {below.length ? <Alert tone="error">Stipend below the ICAI/ICSI minimum for {below.map((p) => p.lines.employee.name).join(", ")}. A Partner cannot approve until the stipend is revised.</Alert> : null}
      {run.status === "REVIEWED" && appr ? <Alert tone="info">Reviewed by HR and waiting for your approval. The person who prepared or reviewed the run cannot approve it.</Alert> : null}

      {t ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["People", String(t.count)], ["Gross", inr(t.gross)], ["Net pay", inr(t.net)], ["TDS", inr(t.tds)], ["PF (employee)", inr(t.pfEmployee)], ["PF (employer)", inr(t.pfEmployerEpf + t.pfEmployerEps)], ["ESI (employee + employer)", inr(t.esiEmployee + t.esiEmployer)], ["Professional Tax", inr(t.pt)]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-white p-3"><dt className="text-xs text-muted">{k}</dt><dd className="text-base font-semibold">{v}</dd></div>
          ))}
        </dl>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Downloads</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {files.map(([f, l]) => (f === "bank" && !bankReady
            ? <span key={f} className="rounded-md border border-dashed border-line px-3 py-1.5 text-sm text-muted">{l} — after approval</span>
            : <a key={f} href={`/api/payroll/run/${id}/${f}`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-gray-50">{l} (Excel)</a>))}
        </CardContent>
      </Card>

      <Card>
        <Table>
          <THead>
            <tr><TH>Employee</TH><TH className="text-right">Paid days</TH><TH className="text-right">LOP</TH><TH className="text-right">Gross</TH><TH className="text-right">PF</TH><TH className="text-right">ESI</TH><TH className="text-right">PT</TH><TH className="text-right">TDS</TH><TH className="text-right">Net</TH><TH /></tr>
          </THead>
          <TBody>
            {run.payslips.map((p) => {
              const r = p.lines.result;
              const a = p.lines.adjustments;
              return (
                <TR key={p.id}>
                  <TD>
                    <span className="font-medium">{p.lines.employee.name}</span>
                    <span className="block text-xs text-muted">{p.lines.employee.code}{p.lines.regime ? ` · ${p.lines.regime.toLowerCase()} regime` : ""}{p.lines.stipend ? ` · ${p.lines.stipend.institute} year ${p.lines.stipend.year}` : ""}</span>
                    {p.lines.stipend?.message ? <span className={p.lines.stipend.belowMinimum ? "block text-xs text-red-700" : "block text-xs text-amber-800"}>{p.lines.stipend.message}{p.lines.stipend.minimum !== null ? ` Minimum ${inr(p.lines.stipend.minimum)}.` : ""}</span> : null}
                    {a.earnings.length || a.deductions.length || a.lopOverrideHalfDays !== null ? <Badge tone="amber" className="mt-1">adjusted</Badge> : null}
                    {r.reimbursements.length ? <span className="block text-xs text-muted">+ {inr(r.reimbursements.reduce((x, y) => x + y.amount, 0))} reimbursements</span> : null}
                  </TD>
                  <TD className="text-right">{days(r.paidHalfDays)} / {r.basisDays}</TD>
                  <TD className="text-right">{days(p.lines.attendance.usedLopHalfDays)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.gross)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.pf.employee)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.esi.employee)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.pt)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(r.tdsAmount)}</TD>
                  <TD className="whitespace-nowrap text-right font-medium">{inr(r.net)}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <a href={`/api/payroll/payslip/${p.id}`} className="mr-2 text-sm text-brand hover:underline">PDF</a>
                    {draft && prep ? (
                      <AdjustDialog
                        action={adjustPayslipAction.bind(null, p.id, id)} name={p.lines.employee.name}
                        lopDays={a.lopOverrideHalfDays === null ? "" : String(a.lopOverrideHalfDays / 2)}
                        earnings={a.earnings.map((l) => ({ label: l.label, amount: rupeeText(l.amount) }))}
                        deductions={a.deductions.map((l) => ({ label: l.label, amount: rupeeText(l.amount) }))} note={a.note}
                      />
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      {run.notes ? <p className="text-sm text-muted">Notes: {run.notes}</p> : null}
    </div>
  );
}
