import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { fyLabel, monthLabel } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { myPayslips } from "@/server/services/payroll/runs";
import { declarationFor, myForm16, taxProjection, currentFyStart } from "@/server/services/payroll/declarations";
import { payrollSettings } from "@/server/services/payroll/common";
import { DECLARATION_SECTIONS, type TdsResult } from "@/server/payroll-engine";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DeclarationForm, ProofDialog } from "./declaration-forms";
import { saveDeclarationAction, addProofAction } from "./actions";

export const metadata = { title: "Payslips & tax" };
const inr = (p: number) => formatInr(p);
const LABEL = new Map(DECLARATION_SECTIONS.map((s) => [s.code, s.label]));

function Projection({ title, t, current }: { title: string; t: TdsResult; current: boolean }) {
  const rows: [string, number][] = [
    ["Projected salary for the year", t.projectedGross], ["Standard deduction", t.standardDeduction],
    ...(t.hraExempt ? ([["HRA exemption", t.hraExempt]] as [string, number][]) : []),
    ...(t.ptDeduction ? ([["Professional tax", t.ptDeduction]] as [string, number][]) : []),
    ...t.chapterVIA.map((l) => [l.code, l.allowed] as [string, number]),
    ["Taxable income", t.tax.taxable], ["Tax for the year (incl. cess)", t.tax.total], ["Already deducted", t.priorTds], ["TDS per month from now", t.monthly],
  ];
  return (
    <div className={current ? "rounded-lg border-2 border-brand p-3" : "rounded-lg border border-line p-3"}>
      <p className="mb-2 text-sm font-medium">{title}{current ? <Badge tone="brand" className="ml-2">your choice</Badge> : null}</p>
      <dl className="space-y-1 text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-muted">{k}</dt><dd className="whitespace-nowrap">{inr(v)}</dd></div>)}</dl>
    </div>
  );
}

export default async function MyPayslipsPage() {
  const actor = await requireStaff();
  const fy = currentFyStart();
  const [slips, decl, projection, forms, { form16Label }] = await Promise.all([
    load(() => myPayslips(actor)), declarationFor(actor.userId, fy), load(() => taxProjection(actor)), load(() => myForm16(actor)), payrollSettings(),
  ]);
  const values = decl?.declared ?? decl?.items ?? {};
  const sections = DECLARATION_SECTIONS.map((s) => ({ code: s.code, label: s.label, oldOnly: s.oldOnly, value: values[s.code] ? String(values[s.code]! / 100) : "" }));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Payslips & tax" subtitle="Your payslips, investment declaration, tax projection and annual certificate." actions={<Link href="/hr/attendance?me=1" className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-gray-50">My attendance</Link>} />
      <Card>
        <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
        {slips.length === 0 ? <CardContent><EmptyState title="No payslips yet">They appear here once HR marks a payroll run paid.</EmptyState></CardContent> : (
          <Table>
            <THead><tr><TH>Month</TH><TH className="text-right">Gross</TH><TH className="text-right">TDS</TH><TH className="text-right">Net pay</TH><TH /></tr></THead>
            <TBody>
              {slips.map((s) => (
                <TR key={s.id}>
                  <TD>{monthLabel(s.month)}{s.kind === "STIPEND" ? <Badge className="ml-1">stipend</Badge> : null}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(s.gross)}</TD>
                  <TD className="whitespace-nowrap text-right">{inr(s.tds)}</TD>
                  <TD className="whitespace-nowrap text-right font-medium">{inr(s.net)}</TD>
                  <TD className="text-right"><a href={`/api/payroll/payslip/${s.id}`} className="text-sm text-brand hover:underline">Download PDF</a></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {projection ? (
        <Card>
          <CardHeader><CardTitle>Tax projection · {fyLabel(fy)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {projection.note ? <Alert tone="warn">{projection.note}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {projection.byRegime.NEW ? <Projection title="New regime" t={projection.byRegime.NEW} current={projection.current === "NEW"} /> : null}
              {projection.byRegime.OLD ? <Projection title="Old regime (with your declaration)" t={projection.byRegime.OLD} current={projection.current === "OLD"} /> : null}
            </div>
            <p className="text-xs text-muted">An estimate on your current salary structure. Rates are being verified for the Income-tax Act, 2025.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Investment declaration · {fyLabel(fy)} {decl ? <Badge className="ml-1" tone={decl.status === "VERIFIED" ? "green" : "blue"}>{decl.status.toLowerCase().replace("_", " ")}</Badge> : null}</CardTitle>
          {decl && decl.status !== "VERIFIED" ? <ProofDialog action={addProofAction.bind(null, fy)} sections={DECLARATION_SECTIONS.filter((s) => s.code !== "PRIOR_TDS").map((s) => ({ code: s.code, label: s.label }))} /> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {decl?.status === "VERIFIED" ? (
            <div className="text-sm">
              <p className="mb-1">HR verified your declaration. Amounts used for TDS:</p>
              {Object.entries(decl.items).map(([k, v]) => <p key={k} className="text-muted">{LABEL.get(k) ?? k}: {inr(v)}</p>)}
            </div>
          ) : null}
          {decl?.proofs.length ? <div className="text-sm"><p className="font-medium">Proofs</p>{decl.proofs.map((p) => <a key={p.id} href={`/api/files/${p.documentId}`} className="block text-brand hover:underline">{LABEL.get(p.section) ?? p.section} · {inr(p.amountPaise)}</a>)}</div> : null}
          <DeclarationForm action={saveDeclarationAction.bind(null, fy)} regime={decl?.regime ?? "NEW"} metro={decl?.metro ?? false} sections={sections} locked={decl?.status === "VERIFIED"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{form16Label}</CardTitle></CardHeader>
        <CardContent>
          {forms.length === 0 ? <p className="text-sm text-muted">Issued after the financial year closes.</p> : forms.map((f) => (
            <p key={f.id} className="text-sm">{f.fy} · {f.pdfDocumentId ? <a href={`/api/files/${f.pdfDocumentId}`} className="text-brand hover:underline">Download PDF</a> : "—"}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
