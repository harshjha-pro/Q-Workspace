import Link from "next/link";
import { requireStaff } from "@/server/context";
import { requireCap, load } from "@/lib/page";
import { isDomainError } from "@/server/lib/errors";
import { closeReadiness, engagementSummary } from "@/server/services/lifecycle/archive";
import { completionReport, type CompletionReport } from "@/server/services/lifecycle/completion";
import { formatDate, formatDateTime } from "@/server/lib/dates";
import { formatInr, formatMinutes } from "@/server/lib/money";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { engagementStatusTone } from "@/components/status";
import { Comments } from "@/components/comments/comments";
import { SERVICE_LINE_LABELS } from "../../knowledge/labels";
import { CloseEngagementDialog } from "../close-dialog";

export const metadata = { title: "Engagement completion" };

async function tryReport(fn: () => Promise<CompletionReport>) {
  try {
    return await fn();
  } catch (e) {
    if (isDomainError(e) && e.code === "FORBIDDEN") return null;
    throw e;
  }
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0"><span className="text-muted">{k}</span><span className="text-right">{v || "—"}</span></div>;
}

export default async function CompletionPage({ params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  const actor = await requireStaff();
  requireCap(actor, "engagement.view");
  const s = await load(() => engagementSummary(actor, engagementId));
  const r = actor.role === "PARTNER" || actor.role === "MANAGER" ? await tryReport(() => completionReport(actor, engagementId)) : null;
  const ready = r && !s.archivedAt ? await closeReadiness(actor, engagementId) : null;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${s.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={s.archivedAt ? "/archive" : `/engagements/${s.id}`} className="underline">{s.archivedAt ? "Archive" : "Engagement"}</Link>
            <span className="font-mono">{s.code}</span>
            <span>{s.client.name}</span>
            <Badge tone={engagementStatusTone(s.status)}>{s.status.replace(/_/g, " ").toLowerCase()}</Badge>
            {s.archivedAt ? <Badge tone="neutral">Archived {formatDateTime(s.archivedAt)} · read-only</Badge> : null}
          </span>
        }
        actions={
          <span className="flex flex-wrap gap-2">
            {r ? <a href={`/api/lifecycle/completion/${s.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>Download PDF</a> : null}
            {ready ? <CloseEngagementDialog id={s.id} openTasks={ready.openTasks.length} isPartner={actor.role === "PARTNER"} /> : null}
          </span>
        }
      />
      {ready && ready.openTasks.length ? (
        <Alert tone="warn">
          {ready.openTasks.length} task(s) still open: {ready.openTasks.slice(0, 5).map((t) => t.title).join("; ")}{ready.openTasks.length > 5 ? "…" : ""}
        </Alert>
      ) : null}
      {!r ? (
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle><span className="text-xs text-muted">The full completion report is for the engagement&apos;s Manager and Partner.</span></CardHeader>
          <CardContent>
            <KV k="Service line" v={SERVICE_LINE_LABELS[s.serviceLine] ?? s.serviceLine} />
            <KV k="Start / end" v={`${formatDate(s.startDate) || "—"} to ${formatDate(s.endDate) || "—"}`} />
            <KV k="Hours logged (effort)" v={formatMinutes(s.totalMinutes)} />
            <KV k="Tasks" v={Object.entries(s.taskCounts).map(([k, n]) => `${n} ${k.replace(/_/g, " ").toLowerCase()}`).join(", ")} />
          </CardContent>
        </Card>
      ) : <Report r={r} />}
      <Comments entityType="ENGAGEMENT" entityId={s.id} />
    </div>
  );
}

function Report({ r }: { r: CompletionReport }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Key dates</CardTitle></CardHeader>
          <CardContent>
            <KV k="Start" v={formatDate(r.keyDates.start)} />
            <KV k="End" v={formatDate(r.keyDates.end)} />
            <KV k="First / last work logged" v={`${formatDate(r.keyDates.firstWork) || "—"} / ${formatDate(r.keyDates.lastWork) || "—"}`} />
            <KV k="First / last filing" v={`${formatDate(r.keyDates.firstFiling) || "—"} / ${formatDate(r.keyDates.lastFiling) || "—"}`} />
            <KV k="Closed" v={formatDate(r.keyDates.closed)} />
            <KV k="Archived" v={formatDate(r.keyDates.archived)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Review and billing</CardTitle></CardHeader>
          <CardContent>
            <KV k="Partner / Manager" v={[r.engagement.partnerName, r.engagement.managerName].filter(Boolean).join(" / ")} />
            <KV k="Review points raised" v={String(r.reviewPoints.raised)} />
            <KV k="Review points cleared" v={String(r.reviewPoints.cleared)} />
            <KV k="Review points still open" v={r.reviewPoints.open ? <span className="font-medium text-red-700">{r.reviewPoints.open}</span> : "0"} />
            {r.canSeeBilling && r.billing ? (
              <>
                <KV k="Billing status" v={<Badge tone={r.billing.status === "FULLY_RECEIVED" ? "green" : r.billing.status === "NOT_YET_BILLED" ? "neutral" : "amber"}>{r.billing.label}</Badge>} />
                <KV k="Billed / received" v={`${formatInr(r.billing.billedPaise)} / ${formatInr(r.billing.receivedPaise)}`} />
                <KV k="Outstanding" v={formatInr(r.billing.outstandingPaise)} />
              </>
            ) : <KV k="Billing status" v="—" />}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Hours logged by person and stage</CardTitle><span className="text-xs text-muted">Effort record only — {formatMinutes(r.totalMinutes)} in total{r.engagement.budgetMinutes ? `, budget ${formatMinutes(r.engagement.budgetMinutes)}` : ""}.</span></CardHeader>
        <Table>
          <THead><tr><TH>Person</TH>{r.stages.map((s) => <TH key={s} className="text-right">{s}</TH>)}<TH className="text-right">Total</TH></tr></THead>
          <TBody>
            {r.hours.length === 0 ? <TR><TD colSpan={r.stages.length + 2} className="text-muted">No work logged.</TD></TR> : null}
            {r.hours.map((h) => (
              <TR key={h.userId}><TD>{h.name}</TD>{r.stages.map((s) => <TD key={s} className="whitespace-nowrap text-right">{h.byStage[s] ? formatMinutes(h.byStage[s]!) : "—"}</TD>)}<TD className="whitespace-nowrap text-right font-medium">{formatMinutes(h.minutes)}</TD></TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Acknowledgments ({r.acknowledgments.length})</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Task</TH><TH>Type</TH><TH>Number</TH><TH>Date</TH></tr></THead>
            <TBody>
              {r.acknowledgments.length === 0 ? <TR><TD colSpan={4} className="text-muted">None recorded.</TD></TR> : null}
              {r.acknowledgments.map((a, i) => <TR key={i}><TD>{a.task}</TD><TD>{a.type}</TD><TD className="font-mono text-xs">{a.number}</TD><TD className="whitespace-nowrap">{formatDate(a.date)}</TD></TR>)}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>UDINs ({r.udins.length})</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Document</TH><TH>UDIN</TH><TH>Signed</TH></tr></THead>
            <TBody>
              {r.udins.length === 0 ? <TR><TD colSpan={3} className="text-muted">None.</TD></TR> : null}
              {r.udins.map((u, i) => <TR key={i}><TD>{u.documentType}</TD><TD className="font-mono text-xs">{u.udin ?? u.status.toLowerCase()}</TD><TD className="whitespace-nowrap">{formatDate(u.signingDate)}</TD></TR>)}
            </TBody>
          </Table>
        </Card>
      </div>
      {r.reviewPoints.items.length ? (
        <Card>
          <details>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Review points ({r.reviewPoints.items.length})</summary>
            <Table>
              <THead><tr><TH>Task</TH><TH>Point</TH><TH>Raised</TH><TH>Status</TH></tr></THead>
              <TBody>
                {r.reviewPoints.items.map((p, i) => (
                  <TR key={i}><TD>{p.task}</TD><TD className="whitespace-pre-wrap">{p.text}</TD><TD className="whitespace-nowrap text-xs">{p.raisedBy}, {formatDate(p.raisedAt)}</TD><TD><Badge tone={p.status === "CLEARED" ? "green" : "amber"}>{p.status === "CLEARED" ? `Cleared ${formatDate(p.clearedAt)}` : "Open"}</Badge></TD></TR>
                ))}
              </TBody>
            </Table>
          </details>
        </Card>
      ) : null}
    </>
  );
}
