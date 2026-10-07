import Link from "next/link";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { requireCap, load } from "@/lib/page";
import { db } from "@/server/lib/db";
import { firmOnlyTypes, listFirmCompliance } from "@/server/services/firm-compliance/service";
import { formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { TASK_STATUS_TONE } from "@/components/status";
import { RecordObligationDialog } from "./record-dialog";

export const metadata = { title: "Firm compliance" };

type FirmTask = Awaited<ReturnType<typeof listFirmCompliance>>["tasks"][number];

function Rows({ rows }: { rows: FirmTask[] }) {
  return (
    <Table>
      <THead><tr><TH>Due</TH><TH>Obligation</TH><TH>Status</TH><TH>Owner</TH></tr></THead>
      <TBody>
        {rows.length === 0 ? <TR><TD colSpan={4} className="text-muted">Nothing here.</TD></TR> : null}
        {rows.map((t) => (
          <TR key={t.id} className={t.display === "OVERDUE" ? "bg-red-50/60" : undefined}>
            <TD className="whitespace-nowrap">{t.effectiveDueDate ? formatDate(t.effectiveDueDate) : <Badge tone="amber">Enter date</Badge>}</TD>
            <TD><Link href={`/tasks/${t.id}`} className="text-brand hover:underline">{t.title}</Link>{t.periodLabel && !t.title.includes(t.periodLabel) ? <span className="text-xs text-muted"> · {t.periodLabel}</span> : null}</TD>
            <TD><Badge tone={t.display === "OVERDUE" ? "red" : TASK_STATUS_TONE[t.status] ?? "neutral"}>{t.display === "OVERDUE" ? "overdue" : t.status.replace(/_/g, " ").toLowerCase()}</Badge></TD>
            <TD>{t.owner || <span className="text-muted">—</span>}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** The firm's own compliance (spec 13.6): statutory returns from the engine plus firm-only renewals. */
export default async function FirmCompliancePage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "task.view");
  const sp = await searchParams;
  const { firm, tasks } = await load(() => listFirmCompliance(actor, { includeClosed: sp.all === "1" }));
  const canRecord = can(actor, "dueDateMaster.manage") || can(actor, "task.bulk");
  const [types, people] = canRecord
    ? await Promise.all([firmOnlyTypes(), db().user.findMany({ where: { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN"] } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } })])
    : [[], []];
  const firmOnly = tasks.filter((t) => t.kind === "FIRM_ONLY");
  const statutory = tasks.filter((t) => t.kind !== "FIRM_ONLY");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Firm compliance"
        subtitle={<>The firm&apos;s own obligations, run as the internal client <span className="font-mono">{firm.code}</span>. {sp.all === "1" ? <Link href="/firm-compliance" className="underline">Hide closed</Link> : <Link href="/firm-compliance?all=1" className="underline">Show closed too</Link>}</>}
        actions={canRecord && types.length ? <RecordObligationDialog types={types.map((t) => ({ code: t.code, name: t.name, appliesWhen: t.appliesWhen }))} people={people.map((p) => ({ id: p.id, name: p.displayName }))} /> : null}
      />
      {tasks.length === 0 ? <Card><EmptyState title="No firm obligations to show">Statutory returns appear once the firm&apos;s GSTIN, TDS, PF/ESI and PT flags are set on its client record; add renewals with &quot;Add firm obligation&quot;.</EmptyState></Card> : null}
      <Card>
        <CardHeader><CardTitle>Memberships, COP, insurance, peer review and licences ({firmOnly.length})</CardTitle><span className="text-xs text-muted">Due dates typed from the document — check them.</span></CardHeader>
        <Rows rows={firmOnly} />
      </Card>
      <Card>
        <CardHeader><CardTitle>Statutory returns ({statutory.length})</CardTitle><span className="text-xs text-muted">GST, TDS, PF / ESI / PT and advance tax from the compliance calendar.</span></CardHeader>
        <Rows rows={statutory} />
      </Card>
    </div>
  );
}
