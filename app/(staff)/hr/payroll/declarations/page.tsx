import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDateTime, fyLabel, fyStartYear, todayIst } from "@/server/lib/dates";
import { listDeclarations, form16Candidates, form16PartA } from "@/server/services/payroll/declarations";
import { payrollSettings } from "@/server/services/payroll/common";
import { DECLARATION_SECTIONS } from "@/server/payroll-engine";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ActionButton } from "../../../work/action-button";
import { VerifyDeclarationDialog, Form16Dialog } from "../payroll-forms";
import { verifyDeclarationAction, generateForm16Action, issueForm16Action } from "../actions";
import { inr, rupeeText } from "../labels";

export const metadata = { title: "Declarations & Form 16" };
const LABEL = new Map(DECLARATION_SECTIONS.map((s) => [s.code, s.label]));
const STATUS_TONE = { DRAFT: "neutral", SUBMITTED: "blue", PROOFS_SUBMITTED: "amber", VERIFIED: "green" } as const;

export default async function DeclarationsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const actor = await requireStaff();
  const cur = fyStartYear(todayIst());
  const asked = Number((await searchParams).fy);
  const fy = Number.isInteger(asked) && asked > 2000 && asked <= cur ? asked : cur;
  const [decls, candidates, { form16Label }] = await Promise.all([load(() => listDeclarations(actor, fy)), load(() => form16Candidates(actor, fy)), payrollSettings()]);
  const canAct = can(actor, "payroll.prepare") || can(actor, "hr.records.manage");
  const presets = new Map(await Promise.all(candidates.filter((c) => c.form16 && canAct).map(async (c) => [c.userId, await form16PartA(actor, c.form16!.id)] as const)));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={`Declarations & ${form16Label}`} subtitle={fyLabel(fy)} actions={<>{[cur - 1, cur].map((y) => <Link key={y} href={`?fy=${y}`} className={`rounded-md border px-3 py-1.5 text-sm ${y === fy ? "border-brand text-brand" : "border-line"}`}>{fyLabel(y)}</Link>)}</>} />
      <p className="text-sm"><Link href="/hr/payroll" className="text-brand hover:underline">← Payroll</Link></p>
      <Card>
        <CardHeader><CardTitle>Investment declarations</CardTitle></CardHeader>
        {decls.length === 0 ? <CardContent><EmptyState title="No declarations for this year yet" /></CardContent> : (
          <Table>
            <THead><tr><TH>Employee</TH><TH>Regime</TH><TH>Declared</TH><TH>Proofs</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>
              {decls.map((d) => {
                const declared = d.declared ?? d.items;
                const codes = [...new Set([...Object.keys(declared), ...Object.keys(d.items)])];
                return (
                  <TR key={d.id}>
                    <TD className="font-medium">{d.name}</TD>
                    <TD>{d.regime.toLowerCase()}{d.metro ? " · metro" : ""}</TD>
                    <TD className="text-xs">{codes.length ? codes.map((c) => <span key={c} className="block">{c}: {inr(declared[c] ?? 0)}{d.declared ? ` → ${inr(d.items[c] ?? 0)}` : ""}</span>) : "—"}</TD>
                    <TD className="text-xs">{d.proofs.length ? d.proofs.map((p) => <a key={p.id} href={`/api/files/${p.documentId}`} className="block text-brand hover:underline">{p.section} · {inr(p.amountPaise)}</a>) : "—"}</TD>
                    <TD><Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"}>{d.status.toLowerCase().replace("_", " ")}</Badge></TD>
                    <TD className="text-right">{canAct && d.status !== "DRAFT" && d.userId !== actor.userId ? (
                      <VerifyDeclarationDialog action={verifyDeclarationAction.bind(null, d.id, codes)} sections={codes.map((c) => ({ code: c, label: LABEL.get(c) ?? c, declared: rupeeText(d.items[c] ?? 0) }))} />
                    ) : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>{form16Label} · {fyLabel(fy)}</CardTitle></CardHeader>
        {candidates.length === 0 ? <CardContent><EmptyState title="No paid salary runs in this year" /></CardContent> : (
          <Table>
            <THead><tr><TH>Employee</TH><TH>Paid months</TH><TH>Certificate</TH><TH /></tr></THead>
            <TBody>
              {candidates.map((c) => {
                const p = presets.get(c.userId);
                return (
                  <TR key={c.userId}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD>{c.months}</TD>
                    <TD>{c.form16?.pdfDocumentId ? <><a href={`/api/files/${c.form16.pdfDocumentId}`} className="text-brand hover:underline">PDF</a> · {c.form16.issuedAt ? `issued ${formatDateTime(c.form16.issuedAt)}` : <Badge tone="amber">not issued</Badge>}</> : "—"}</TD>
                    <TD className="whitespace-nowrap text-right">
                      {canAct && c.userId !== actor.userId ? <Form16Dialog action={generateForm16Action.bind(null, c.userId, fy)} label={form16Label} preset={p ? { tan: p.employerTan, certificateNo: p.certificateNo, citTds: p.citTds, quarters: Object.fromEntries(p.quarters.map((q) => [q.quarter, { receiptNo: q.receiptNo, amount: rupeeText(q.amountPaise) }])) } : null} /> : null}
                      {canAct && c.form16 && !c.form16.issuedAt ? <ActionButton action={issueForm16Action.bind(null, c.form16.id)} variant="default">Issue</ActionButton> : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
