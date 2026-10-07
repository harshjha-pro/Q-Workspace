import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load, requireCap } from "@/lib/page";
import { can } from "@/server/permissions/guards";
import { formatDateTime } from "@/server/lib/dates";
import { getTemplate, MERGE_FIELDS, CATEGORY_LABELS } from "@/server/services/doc-templates/service";
import { fieldsIn } from "@/server/documents/merge";
import { listClients } from "@/server/services/clients/service";
import { listEngagements } from "@/server/services/engagements/service";
import { db } from "@/server/lib/db";
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MetaForm, TemplateEditor, VersionButtons, EmployeeGenerateForm } from "../templates-ui";
import { DRAFT_MARKER } from "@/server/services/doc-templates/defaults";

export const metadata = { title: "Document template" };

const STATUS_TONE: Record<string, "green" | "amber" | "neutral"> = { APPROVED: "green", DRAFT: "amber", RETIRED: "neutral" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "templates.manage");
  const { id } = await params;
  const t = await load(() => getTemplate(actor, id));
  const isHr = t.category === "HR_LETTER";
  const latest = t.versions[0];
  const approved = t.versions.find((v) => v.status === "APPROVED");

  const canClients = can(actor, "client.view");
  const [clients, engagements, employees] = await Promise.all([
    !isHr && canClients ? listClients(actor, { take: 1000 }) : Promise.resolve([]),
    !isHr && can(actor, "engagement.view") ? listEngagements(actor, {}) : Promise.resolve([]),
    isHr && (can(actor, "hr.records.manage") || actor.role === "PARTNER")
      ? db().user.findMany({ where: { active: true, isSystem: false }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })
      : Promise.resolve([]),
  ]);
  const pickers = {
    clients: clients.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
    engagements: engagements.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}`, clientId: e.clientId })),
    employees: employees.map((u) => ({ value: u.id, label: u.displayName })),
  };
  const groups = MERGE_FIELDS.filter((g) => (isHr ? !["client", "engagement"].includes(g.group) : g.group !== "employee"));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.name}
        subtitle={<><Link href="/admin/doc-templates" className="text-brand hover:underline">Document templates</Link> / {CATEGORY_LABELS[t.category] ?? t.category} / <span className="font-mono">{t.code}</span></>}
      />
      {!approved ? <Alert tone="warn">No approved version: documents cannot be generated from this template until a Partner approves a draft.</Alert> : null}
      {latest?.body.includes(DRAFT_MARKER) ? <Alert tone="info">This is a seeded firm draft. Review the wording, remove the marker line, save, and ask a Partner to approve.</Alert> : null}
      <Card>
        <CardHeader><CardTitle>Edit</CardTitle>{latest ? <Badge tone={STATUS_TONE[latest.status]}>Editing from v{latest.version} ({latest.status.toLowerCase()})</Badge> : null}</CardHeader>
        <CardContent>
          <TemplateEditor templateId={t.id} initialBody={latest?.body ?? ""} isDraft={latest?.status === "DRAFT"} fieldGroups={groups} pickers={pickers} isHr={isHr} canEdit />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Versions</CardTitle><span className="text-xs text-muted">Draft → Approved (Partner) → Retired. Approving retires the previous approved version.</span></CardHeader>
          <Table>
            <THead><tr><TH>Version</TH><TH>Status</TH><TH className="hidden sm:table-cell">Saved by</TH><TH className="hidden md:table-cell">Approved</TH><TH /></tr></THead>
            <TBody>
              {t.versions.map((v) => (
                <TR key={v.id}>
                  <TD>v{v.version}<div className="text-xs text-muted">{fieldsIn(v.body).length} merge fields</div></TD>
                  <TD><Badge tone={STATUS_TONE[v.status]}>{v.status.toLowerCase()}</Badge></TD>
                  <TD className="hidden sm:table-cell">{v.by}<div className="text-xs text-muted">{formatDateTime(v.updatedAt)}</div></TD>
                  <TD className="hidden md:table-cell">{v.approvedAt ? <>{v.approvedBy}<div className="text-xs text-muted">{formatDateTime(v.approvedAt)}</div></> : "—"}</TD>
                  <TD><VersionButtons templateId={t.id} versionId={v.id} status={v.status} canApprove={t.canApprove} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
          <CardContent><MetaForm templateId={t.id} name={t.name} outputFormat={t.outputFormat} active={t.active} /></CardContent>
        </Card>
      </div>
      {isHr && approved && pickers.employees.length ? (
        <Card>
          <CardHeader><CardTitle>Generate for an employee</CardTitle><span className="text-xs text-muted">Uses approved v{approved.version}. The letter downloads; it is not filed in client folders.</span></CardHeader>
          <CardContent><EmployeeGenerateForm code={t.code} employees={pickers.employees} extraFields={fieldsIn(approved.body).filter((f) => f.startsWith("extra.")).map((f) => f.slice(6))} /></CardContent>
        </Card>
      ) : !isHr && approved ? (
        <Alert tone="info">To generate this for a client, open the client or engagement under <Link href="/documents" className="underline">Documents</Link> and use “Generate document”; the result is filed there.</Alert>
      ) : null}
    </div>
  );
}
