import Link from "next/link";
import { requireStaff } from "@/server/context";
import { listFeedback, feedbackSummary } from "@/server/services/crm/feedback";
import { visibleClientIds, inClients } from "@/server/services/crm/common";
import { can } from "@/server/permissions/guards";
import { db } from "@/server/lib/db";
import { requireCap } from "@/lib/page";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyText } from "../_ui/common";
import { RequestFeedbackDialog, RecordFeedbackDialog } from "../_ui/feedback-forms";
import { requestFeedbackAction, recordFeedbackAction } from "../actions";

export const metadata = { title: "Client feedback" };

export default async function FeedbackPage() {
  const actor = await requireStaff();
  requireCap(actor, "crm.view");
  const manage = can(actor, "crm.manage");
  const [pending, received, summary] = await Promise.all([listFeedback(actor, { pending: true }), listFeedback(actor, { pending: false }), feedbackSummary(actor)]);
  let closed: { id: string; name: string }[] = [];
  if (manage) {
    const ids = await visibleClientIds(actor, "crm.manage");
    const asked = new Set((await db().feedback.findMany({ select: { engagementId: true } })).map((f) => f.engagementId));
    const rows = await db().engagement.findMany({ where: { status: { in: ["COMPLETED", "ARCHIVED"] }, ...inClients(ids) }, select: { id: true, code: true, name: true, client: { select: { name: true } } }, orderBy: { closedAt: "desc" }, take: 200 });
    closed = rows.filter((e) => !asked.has(e.id)).map((e) => ({ id: e.id, name: `${e.client.name} — ${e.code} ${e.name}` }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Client feedback"
        subtitle={<><Link className="hover:underline" href="/crm/opportunities">Opportunities</Link> · {summary.responses ? `Average ${summary.average?.toFixed(1)} / 5 from ${summary.responses} response${summary.responses === 1 ? "" : "s"}; ${summary.low} low` : "No responses yet"}</>}
        actions={manage && closed.length ? <RequestFeedbackDialog action={requestFeedbackAction} engagements={closed} /> : null}
      />
      <Card>
        <CardHeader><CardTitle>Waiting for the client ({pending.length})</CardTitle><span className="text-xs text-muted">Copy the message and send it by email or WhatsApp; the portal link arrives in Phase 4.</span></CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : null}
          {pending.map((f) => (
            <div key={f.id} className="space-y-2 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className="font-medium">{f.clientName}</span> — {f.engagement?.name}</span>
                {manage ? <RecordFeedbackDialog action={recordFeedbackAction.bind(null, f.id)} /> : null}
              </div>
              <CopyText text={f.message} rows={7} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Received</CardTitle></CardHeader>
        <CardContent>
          {received.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
          <ul className="divide-y divide-line">
            {received.map((f) => (
              <li key={f.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={(f.rating ?? 0) <= 2 ? "red" : (f.rating ?? 0) >= 4 ? "green" : "amber"}>{f.rating} / 5</Badge>
                  <span className="font-medium">{f.clientName}</span><span className="text-muted">— {f.engagement?.name}</span>
                  <span className="text-xs text-muted">{formatDateTime(f.receivedAt)}</span>
                  {f.alertedAt ? <Badge tone="red">Partner alerted</Badge> : null}
                </div>
                {f.comment ? <p className="mt-1 whitespace-pre-wrap text-muted">“{f.comment}”</p> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
