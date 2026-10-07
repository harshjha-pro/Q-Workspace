import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load, requireCap } from "@/lib/page";
import { formatDateTime } from "@/server/lib/dates";
import { getDocument, DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, SUGGESTED_TAGS, AUDIT_SECTIONS, CONFIDENTIALITY_LABELS } from "@/server/services/dms/service";
import { allowedConfidentiality } from "@/server/services/dms/access";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CheckOutControls, NewVersionDialog, ForceReleaseDialog, EditDocumentForm, ArchiveDialog, type Opt } from "../documents-ui";

export const metadata = { title: "Document" };

const SOURCE: Record<string, string> = { UPLOAD: "Uploaded", PORTAL: "Client portal", NOTICE: "Notice", UDIN: "UDIN register", MESSAGE: "Message", GENERATED: "Generated", IMPORT: "Import", BACKUP: "Backup" };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "dms.view");
  const { docId } = await params;
  const d = await load(() => getDocument(actor, docId));
  const kinds: Opt[] = DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] ?? k }));
  const levels: Opt[] = allowedConfidentiality(actor).map((c) => ({ value: c, label: CONFIDENTIALITY_LABELS[c as keyof typeof CONFIDENTIALITY_LABELS] ?? c }));
  const sections: Opt[] | undefined = d.isAudit ? AUDIT_SECTIONS.map((s) => ({ value: s.code, label: s.name })) : undefined;
  const back = d.engagement ? `/documents?engagementId=${d.engagement.id}` : d.client ? `/documents?clientId=${d.client.id}` : "/documents";

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.name}
        subtitle={
          <>
            <Link href="/documents" className="text-brand hover:underline">Documents</Link>
            {d.client ? <> / <Link href={`/documents?clientId=${d.client.id}`} className="text-brand hover:underline">{d.client.name}</Link></> : null}
            {d.engagement ? <> / <Link href={back} className="text-brand hover:underline">{d.engagement.code}</Link></> : null}
            {d.folder ? <span className="ml-2 font-mono text-xs">{d.folder.path}</span> : null}
          </>
        }
        actions={<a href={`/api/dms/${d.id}`} className={buttonVariants({ size: "sm" })}>Download v{d.currentVersion}</a>}
      />
      {d.confidentiality === "FINANCIALS" || d.confidentiality === "NOTICE" ? <Alert tone="info">Views and downloads of this document are logged.</Alert> : null}
      {d.archivedAt ? <Alert tone="warn">Archived on {formatDateTime(d.archivedAt)}.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Versions ({d.versions.length})</CardTitle>
              {d.can.write && (d.can.checkIn || !d.checkedOutById) ? <NewVersionDialog docId={d.id} checkIn={d.can.checkIn} /> : null}
            </CardHeader>
            <Table>
              <THead><tr><TH>Version</TH><TH className="hidden sm:table-cell">By</TH><TH>When</TH><TH className="hidden md:table-cell">Note</TH><TH /></tr></THead>
              <TBody>
                {d.versions.map((v) => (
                  <TR key={v.id}>
                    <TD>v{v.version}{v.version === d.currentVersion ? <Badge tone="green" className="ml-1">current</Badge> : null}<div className="text-xs text-muted">{size(v.sizeBytes)}</div></TD>
                    <TD className="hidden sm:table-cell">{v.byName}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(v.createdAt)}</TD>
                    <TD className="hidden text-sm md:table-cell">{v.note || <span className="text-muted">—</span>}</TD>
                    <TD><a href={`/api/dms/${d.id}?v=${v.version}`} className="text-sm text-brand hover:underline">Download</a></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader><CardTitle>Check-out</CardTitle><span className="text-xs text-muted">Check a document out while you edit it so nobody else saves a version over yours.</span></CardHeader>
            <CardContent className="space-y-2">
              <CheckOutControls docId={d.id} canCheckOut={d.can.checkOut} canCheckIn={d.can.checkIn} holder={d.checkedOutByName ? `${d.checkedOutByName}${d.checkedOutAt ? ` since ${formatDateTime(d.checkedOutAt)}` : ""}` : null} />
              {d.can.forceRelease ? <ForceReleaseDialog docId={d.id} holder={d.checkedOutByName ?? "someone"} /> : null}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>About</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted">Kind</dt><dd>{DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}</dd>
                <dt className="text-muted">Source</dt><dd>{SOURCE[d.sourceType] ?? d.sourceType}</dd>
                <dt className="text-muted">Confidentiality</dt><dd>{CONFIDENTIALITY_LABELS[d.confidentiality as keyof typeof CONFIDENTIALITY_LABELS] ?? d.confidentiality}</dd>
                {d.engagement ? <><dt className="text-muted">Engagement</dt><dd>{d.engagement.code} · {d.engagement.name}</dd></> : null}
                {d.task ? <><dt className="text-muted">Task</dt><dd><Link href={`/tasks/${d.task.id}`} className="text-brand hover:underline">{d.task.title}</Link></dd></> : null}
                {d.auditSectionCode ? <><dt className="text-muted">Audit section</dt><dd>{AUDIT_SECTIONS.find((s) => s.code === d.auditSectionCode)?.name}</dd></> : null}
                <dt className="text-muted">Tags</dt><dd className="flex flex-wrap gap-1">{d.tags.length ? d.tags.map((t) => <Badge key={t} tone={t === "signed" || t === "final" ? "green" : "neutral"}>{t}</Badge>) : <span className="text-muted">none</span>}</dd>
                <dt className="text-muted">Client portal</dt><dd>{d.sharedWithClient ? "Shared" : "Internal"}</dd>
              </dl>
            </CardContent>
          </Card>
          {d.can.write ? (
            <Card>
              <CardHeader><CardTitle>Details and tags</CardTitle>{d.can.curate ? <ArchiveDialog docId={d.id} /> : null}</CardHeader>
              <CardContent>
                <EditDocumentForm
                  docId={d.id}
                  doc={{ name: d.name, kind: d.kind, tags: d.tags.join(", "), confidentiality: d.confidentiality, auditSectionCode: d.auditSectionCode ?? "", sharedWithClient: d.sharedWithClient }}
                  kinds={kinds} levels={levels} sections={sections} tags={SUGGESTED_TAGS} canCurate={d.can.curate} canShare={d.can.share}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
