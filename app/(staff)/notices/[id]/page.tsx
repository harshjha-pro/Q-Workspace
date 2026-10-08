import { Comments } from "@/components/comments/comments";
import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getNotice, label, NOTICE_STATUSES } from "@/server/services/registers/notices";
import { can } from "@/server/permissions/guards";
import { load, requireCap } from "@/lib/page";
import { diffDays, formatDate, formatDateTime, todayIst } from "@/server/lib/dates";
import { formatInr } from "@/server/lib/money";
import { PageHeader, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { peopleOptions } from "../../registers/_lib/pickers";
import { AUTHORITY_LABELS, DEMAND_LABELS, NOTICE_STATUS_LABELS, NOTICE_STATUS_TONE, dueTone } from "../labels";
import { NoticeActions } from "./notice-actions";
import { DraftReplyDialog } from "./draft-reply";
import { noticeReplyContext } from "@/server/services/registers/notice-reply";
import { draftReplyAction } from "../actions";
import { isDomainError } from "@/server/lib/errors";

export const metadata = { title: "Notice" };

function Row({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{l}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "notice.view");
  const n = await load(() => getNotice(actor, id));
  const canManage = can(actor, "notice.manage");
  const people = canManage ? await peopleOptions(["PARTNER", "MANAGER", "STAFF", "ARTICLE"]) : [];
  const today = todayIst();
  const days = n.responseDueDate && n.status !== "CLOSED" ? diffDays(today, n.responseDueDate) : null;
  const tone = dueTone(days);
  const person = (uid: string | null) => (uid ? n.people[uid] ?? "—" : "—");
  const replyCtx = canManage && n.status !== "CLOSED" ? await noticeReplyContext(actor, id).catch((e) => {
    // Someone who can view but not manage this notice simply gets no button; anything else is a real error.
    if (isDomainError(e) && e.code === "FORBIDDEN") return null;
    throw e;
  }) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={label(n)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${n.client.id}`} className="underline">{n.client.name}</Link>
            <span className="font-mono">{n.client.code}</span>
            <Badge tone={NOTICE_STATUS_TONE[n.status] ?? "neutral"}>{NOTICE_STATUS_LABELS[n.status] ?? n.status}</Badge>
          </span>
        }
        actions={replyCtx ? <DraftReplyDialog action={draftReplyAction.bind(null, id)} ctx={replyCtx} /> : null}
      />
      {canManage ? (
        <NoticeActions
          id={n.id}
          closed={n.status === "CLOSED"}
          statuses={[...NOTICE_STATUSES]}
          people={people}
          today={today}
          current={{
            status: n.status, outcome: n.outcome, demandStatus: n.demandStatus, demand: n.demandPaise ? String(n.demandPaise / 100) : "",
            responseDueDate: n.responseDueDate ?? "", assigneeId: n.assigneeId ?? "", reviewerId: n.reviewerId ?? "", summary: n.summary,
          }}
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Notice</CardTitle></CardHeader>
          <CardContent>
            <Row label="Authority" value={AUTHORITY_LABELS[n.authority] ?? n.authority} />
            <Row label="Section" value={n.section ? `u/s ${n.section}` : ""} />
            <Row label="AY / period" value={n.ayOrPeriod} />
            <Row label="Notice type" value={n.noticeType} />
            <Row label="Reference / DIN" value={n.referenceNo ? <span className="font-mono">{n.referenceNo}</span> : ""} />
            <Row label="Notice date" value={formatDate(n.noticeDate)} />
            <Row label="Received on" value={formatDate(n.receivedDate)} />
            <Row
              label="Response due"
              value={n.responseDueDate ? (
                <span className={tone === "red" ? "font-medium text-red-700" : tone === "amber" ? "font-medium text-amber-700" : ""}>
                  {formatDate(n.responseDueDate)}{days !== null ? ` (${days < 0 ? `${-days} days late` : days === 0 ? "today" : `in ${days} days`})` : ""}
                </span>
              ) : ""}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Handling</CardTitle></CardHeader>
          <CardContent>
            <Row label="Assignee" value={person(n.assigneeId)} />
            <Row label="Reviewer" value={person(n.reviewerId)} />
            <Row label="Response task" value={n.taskId ? <Link href={`/tasks/${n.taskId}`} className="text-brand hover:underline">Open task</Link> : "No task"} />
            <Row label="Demand" value={n.demandPaise ? `${formatInr(n.demandPaise)} · ${DEMAND_LABELS[n.demandStatus] ?? n.demandStatus}` : DEMAND_LABELS[n.demandStatus] ?? ""} />
            <Row label="Outcome" value={n.outcome} />
            {n.closedAt ? <Row label="Closed" value={formatDateTime(n.closedAt)} /> : null}
          </CardContent>
        </Card>
      </div>
      {n.summary ? (
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{n.summary}</p></CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Hearings and adjournments ({n.hearings.length})</CardTitle><span className="text-xs text-muted">Reminders go out 7, 3 and 1 day before each date.</span></CardHeader>
        <Table>
          <THead><tr><TH>Date</TH><TH>Kind</TH><TH>Notes</TH><TH>Outcome</TH></tr></THead>
          <TBody>
            {n.hearings.length === 0 ? <TR><TD colSpan={4} className="text-muted">No hearings yet.</TD></TR> : null}
            {n.hearings.map((h) => (
              <TR key={h.id}>
                <TD className={h.date >= today ? "font-medium" : "text-muted"}>{formatDate(h.date)}</TD>
                <TD><Badge tone={h.kind === "ADJOURNMENT" ? "amber" : "violet"}>{h.kind === "ADJOURNMENT" ? "Adjournment" : "Hearing"}</Badge></TD>
                <TD className="whitespace-pre-wrap">{h.notes}</TD>
                <TD className="whitespace-pre-wrap">{h.outcome}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Comments entityType="NOTICE" entityId={id} />
    </div>
  );
}
