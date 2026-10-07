import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load, requireCap } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDateTime } from "@/server/lib/dates";
import {
  browseClients, clientDocuments, engagementDocuments, listDocuments, searchDocuments, documentCounts,
  DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, SUGGESTED_TAGS, AUDIT_SECTIONS, CONFIDENTIALITY_LABELS, type DocRow,
} from "@/server/services/dms/service";
import { allowedConfidentiality } from "@/server/services/dms/access";
import { generatableTemplates, CATEGORY_LABELS } from "@/server/services/doc-templates/service";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SERVICE_LINE_LABELS, type ServiceLine } from "@/server/domain/enums";
import { UploadDialog, GenerateDialog, AuditSectionRow, CompletenessBar, DocLink, type Opt } from "./documents-ui";

export const metadata = { title: "Documents" };

type SP = { q?: string; clientId?: string; engagementId?: string; period?: string; cq?: string };

const kinds: Opt[] = DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] ?? k }));
const sections: Opt[] = AUDIT_SECTIONS.map((s) => ({ value: s.code, label: s.name }));
const SECTION_NAME = new Map(AUDIT_SECTIONS.map((s) => [s.code as string, s.name as string]));
const CONF_TONE: Record<string, "neutral" | "amber" | "red" | "violet" | "blue"> = { NORMAL: "neutral", FINANCIALS: "amber", NOTICE: "red", SALARY: "violet", HR: "violet", BILLING: "blue" };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function DocTable({ rows, showClient = false, showSection = false, empty = "No documents here yet." }: { rows: DocRow[]; showClient?: boolean; showSection?: boolean; empty?: string }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Document</TH>
          {showClient ? <TH className="hidden md:table-cell">Client / folder</TH> : null}
          {showSection ? <TH className="hidden sm:table-cell">Section</TH> : null}
          <TH className="hidden sm:table-cell">Tags</TH>
          <TH className="hidden md:table-cell">Updated</TH>
        </tr>
      </THead>
      <TBody>
        {rows.length === 0 ? <TR><TD colSpan={5} className="text-muted">{empty}</TD></TR> : null}
        {rows.map((d) => (
          <TR key={d.id}>
            <TD>
              <DocLink id={d.id} name={d.name} />
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                <span>{DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}</span>
                <span>· v{d.currentVersion}</span>
                <span>· {size(d.sizeBytes)}</span>
                {d.confidentiality !== "NORMAL" ? <Badge tone={CONF_TONE[d.confidentiality]}>{CONFIDENTIALITY_LABELS[d.confidentiality as keyof typeof CONFIDENTIALITY_LABELS] ?? d.confidentiality}</Badge> : null}
                {d.checkedOut ? <Badge tone="amber">Checked out</Badge> : null}
                {showClient ? <span className="md:hidden">· {d.clientName}</span> : null}
              </div>
            </TD>
            {showClient ? <TD className="hidden md:table-cell"><div>{d.clientName}</div><div className="font-mono text-xs text-muted">{d.folderPath}</div></TD> : null}
            {showSection ? <TD className="hidden sm:table-cell">{d.auditSectionCode ? SECTION_NAME.get(d.auditSectionCode) : <span className="text-muted">—</span>}</TD> : null}
            <TD className="hidden sm:table-cell"><div className="flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t} tone={t === "signed" || t === "final" ? "green" : "neutral"}>{t}</Badge>)}</div></TD>
            <TD className="hidden whitespace-nowrap text-xs text-muted md:table-cell">{formatDateTime(d.updatedAt)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function SearchBox({ q, clientId, engagementId }: { q?: string; clientId?: string; engagementId?: string }) {
  return (
    <form method="get" action="/documents" className="flex gap-2" role="search">
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      {engagementId ? <input type="hidden" name="engagementId" value={engagementId} /> : null}
      <Input name="q" defaultValue={q} placeholder={engagementId ? "Search this engagement…" : clientId ? "Search this client…" : "Search names, tags and text inside documents…"} aria-label="Search documents" className="min-w-0 flex-1" />
      <Button type="submit" variant="secondary">Search</Button>
    </form>
  );
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  requireCap(actor, "dms.view");
  const sp = await searchParams;
  const levels: Opt[] = allowedConfidentiality(actor).map((c) => ({ value: c, label: CONFIDENTIALITY_LABELS[c as keyof typeof CONFIDENTIALITY_LABELS] ?? c }));
  const templates = await generatableTemplates(actor);
  const declareLink = can(actor, "qc.declare") ? <Link href="/qc#declarations" className="text-sm text-brand hover:underline">My independence declarations</Link> : null;

  // ---- Search
  if (sp.q?.trim()) {
    const rows = await load(() => searchDocuments(actor, sp.q!, { clientId: sp.clientId, engagementId: sp.engagementId }));
    return (
      <div className="space-y-4">
        <PageHeader title="Documents" subtitle={<Link href="/documents" className="text-brand hover:underline">← All clients</Link>} actions={declareLink} />
        <SearchBox q={sp.q} clientId={sp.clientId} engagementId={sp.engagementId} />
        <Card>
          <CardHeader><CardTitle>{rows.length} result{rows.length === 1 ? "" : "s"} for “{sp.q}”</CardTitle><span className="text-xs text-muted">Only documents you are allowed to open are shown.</span></CardHeader>
          <DocTable rows={rows} showClient empty="Nothing found. Try fewer or shorter words." />
        </Card>
      </div>
    );
  }

  // ---- Engagement folder
  if (sp.engagementId) {
    const v = await load(() => engagementDocuments(actor, sp.engagementId!, sp.period));
    const ctx = { clientId: v.client.id, engagementId: v.engagement.id, periodKey: v.selectedPeriod === "all" ? v.defaultPeriod : v.selectedPeriod };
    const canEditSections = can(actor, "engagement.manage") && !v.readOnly;
    return (
      <div className="space-y-4">
        <PageHeader
          title={`${v.engagement.code} · ${v.engagement.name}`}
          subtitle={<><Link href="/documents" className="text-brand hover:underline">Documents</Link> / <Link href={`/documents?clientId=${v.client.id}`} className="text-brand hover:underline">{v.client.name}</Link> / {SERVICE_LINE_LABELS[v.engagement.serviceLine as ServiceLine] ?? v.engagement.serviceLine}</>}
          actions={v.readOnly ? null : <><GenerateDialog ctx={ctx} templates={templates} categoryLabels={CATEGORY_LABELS} /><UploadDialog ctx={ctx} kinds={kinds} levels={levels} sections={v.audit ? sections : undefined} defaultPeriod={v.defaultPeriod} tags={SUGGESTED_TAGS} /></>}
        />
        <SearchBox clientId={v.client.id} engagementId={v.engagement.id} />
        <nav className="flex flex-wrap gap-2" aria-label="Periods">
          {[...v.periods.map((p) => p.periodKey), "all"].map((p) => (
            <Link key={p} href={`/documents?engagementId=${v.engagement.id}&period=${encodeURIComponent(p)}`} className={`rounded-full border px-3 py-1 text-sm ${v.selectedPeriod === p ? "border-brand bg-brand-50 text-brand" : "border-line bg-white text-ink hover:bg-gray-50"}`}>
              {p === "all" ? "All periods" : p}
            </Link>
          ))}
        </nav>
        {v.audit ? (
          <Card>
            <CardHeader>
              <CardTitle>Audit file index</CardTitle>
              <CompletenessBar percent={v.audit.percent} />
            </CardHeader>
            <CardContent>
              {v.audit.percent < 100 ? <Alert tone="warn" className="mb-2">The audit file is {v.audit.percent}% complete. The Partner sees this before signing off.</Alert> : null}
              <ul className="divide-y divide-line">{v.audit.sections.map((s) => <AuditSectionRow key={s.id} s={s} canEdit={canEditSections} />)}</ul>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader><CardTitle>{v.selectedPeriod === "all" ? "All documents" : `Documents · ${v.selectedPeriod}`} ({v.documents.length})</CardTitle></CardHeader>
          <DocTable rows={v.documents} showSection={!!v.audit} />
        </Card>
      </div>
    );
  }

  // ---- Client folder
  if (sp.clientId) {
    const v = await load(() => clientDocuments(actor, sp.clientId!));
    return (
      <div className="space-y-4">
        <PageHeader
          title={v.client.name}
          subtitle={<><Link href="/documents" className="text-brand hover:underline">Documents</Link> / {v.client.code}</>}
          actions={v.readOnly ? null : <><GenerateDialog ctx={{ clientId: v.client.id }} templates={templates} categoryLabels={CATEGORY_LABELS} /><UploadDialog ctx={{ clientId: v.client.id }} kinds={kinds} levels={levels} tags={SUGGESTED_TAGS} /></>}
        />
        <SearchBox clientId={v.client.id} />
        <Card>
          <CardHeader><CardTitle>Engagements</CardTitle></CardHeader>
          {v.engagements.length === 0 ? <CardContent className="text-sm text-muted">No engagements you can see.</CardContent> : (
            <ul className="divide-y divide-line">
              {v.engagements.map((e) => (
                <li key={e.id}>
                  <Link href={`/documents?engagementId=${e.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
                    <span className="min-w-0"><span className="font-mono text-xs text-muted">{e.code}</span> <span className="font-medium">{e.name}</span>{e.isAudit ? <Badge tone="violet" className="ml-2">Audit file</Badge> : null}</span>
                    <span className="text-sm text-muted">{e.documentCount} document{e.documentCount === 1 ? "" : "s"}{e.status !== "ACTIVE" ? ` · ${e.status.toLowerCase()}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Client documents ({v.clientLevel.length})</CardTitle><span className="text-xs text-muted">KYC, constitution documents and anything not tied to one engagement.</span></CardHeader>
          <DocTable rows={v.clientLevel} />
        </Card>
      </div>
    );
  }

  // ---- Home: clients and recent documents
  const [clients, recent, counts] = await Promise.all([load(() => browseClients(actor, sp.cq ?? "")), listDocuments(actor, { take: 15 }), documentCounts(actor)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Documents" subtitle={`Client → engagement → period folders. ${counts.total} document${counts.total === 1 ? "" : "s"} you can open${counts.checkedOutByMe ? `; ${counts.checkedOutByMe} checked out by you` : ""}.`} actions={declareLink} />
      <SearchBox />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clients ({clients.length})</CardTitle>
            <form method="get" action="/documents" className="flex gap-2"><Input name="cq" defaultValue={sp.cq} placeholder="Filter clients" aria-label="Filter clients" className="h-8 w-40" /></form>
          </CardHeader>
          {clients.length === 0 ? <CardContent><EmptyState title="No clients">You are not assigned to any client yet.</EmptyState></CardContent> : (
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/documents?clientId=${c.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50">
                    <span className="min-w-0 truncate"><span className="font-mono text-xs text-muted">{c.code}</span> {c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{c.documentCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Recently updated</CardTitle></CardHeader>
          <DocTable rows={recent} showClient empty="No documents yet." />
        </Card>
      </div>
    </div>
  );
}
