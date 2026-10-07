import Link from "next/link";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { requireCap, load } from "@/lib/page";
import { getTicket, handlerOptions } from "@/server/services/helpdesk/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "../labels";
import { AssignForm, FaqDialog, ReplyForm, StatusButtons } from "./ticket-actions";

export const metadata = { title: "Helpdesk ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireStaff();
  requireCap(actor, "helpdesk.raise");
  const t = await load(() => getTicket(actor, id));
  const handlers = t.isHandler ? await handlerOptions(actor, t.queue) : [];
  const lastAnswer = [...t.replies].reverse().find((r) => !r.isInternal && r.authorId !== t.raisedById)?.body ?? "";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`#${t.number} · ${t.subject}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/helpdesk" className="underline">Helpdesk</Link>
            <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{STATUS_LABELS[t.status] ?? t.status}</Badge>
            <Badge>{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
            {t.queue === "HR" ? <Badge tone="violet">HR queue</Badge> : null}
            {t.longOpen ? <Badge tone="amber">Long open</Badge> : null}
          </span>
        }
      />
      {t.faqArticleId ? <Alert tone="success">This ticket is now an FAQ: <Link href={`/knowledge/${t.faqArticleId}`} className="underline">open it in the knowledge base</Link>.</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Raised by {t.raisedByName}</CardTitle>
          <span className="text-xs text-muted">{formatDateTime(t.createdAt)}{t.reopenedCount ? ` · reopened ${t.reopenedCount}×` : ""}</span>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm">{t.description}</p>
          {t.screenshotDocId ? <a href={`/helpdesk/${t.id}/screenshot`} className="text-sm text-brand hover:underline">Download screenshot</a> : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
            <span className="text-muted">Assignee:</span> <span>{t.assigneeName || "Nobody yet"}</span>
            {t.isHandler ? <AssignForm id={t.id} current={t.assigneeId ?? ""} handlers={handlers} /> : null}
            {t.isHandler && !t.faqArticleId && can(actor, "knowledge.write") ? <FaqDialog id={t.id} subject={t.subject} answer={lastAnswer} /> : null}
          </div>
          <StatusButtons id={t.id} status={t.status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"} handler={t.isHandler} raiser={t.isRaiser} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Conversation ({t.replies.length})</CardTitle></CardHeader>
        {t.replies.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No replies yet.</p> : (
          <ul className="divide-y divide-line">
            {t.replies.map((r) => (
              <li key={r.id} className={r.isInternal ? "space-y-1 bg-amber-50/60 px-4 py-3" : "space-y-1 px-4 py-3"}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="text-sm font-medium text-ink">{r.authorName}</span>
                  <span>{formatDateTime(r.createdAt)}</span>
                  {r.isInternal ? <Badge tone="amber">Internal note</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
        {t.status !== "CLOSED" ? <div className="border-t border-line px-4 py-3"><ReplyForm id={t.id} handler={t.isHandler} /></div> : <p className="border-t border-line px-4 py-3 text-xs text-muted">The ticket is closed. Reopen it to continue the conversation.</p>}
      </Card>
    </div>
  );
}
