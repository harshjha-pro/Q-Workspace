import Link from "next/link";
import { requireStaff } from "@/server/context";
import { load, requireCap } from "@/lib/page";
import { getThread } from "@/server/services/messages/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloseThreadButton } from "@/components/messages/forms";
import { ThreadView } from "@/components/messages/thread-view";
import { ReplyForm } from "@/components/messages/forms";
import { closeThreadAction, replyAction } from "../actions";

export const metadata = { title: "Conversation" };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  requireCap(actor, "portal.share");
  const { id } = await params;
  const v = await load(() => getThread(actor, id));
  return (
    <div className="space-y-4">
      <PageHeader
        title={v.thread.subject}
        subtitle={<><Link className="hover:underline" href="/messages">Messages</Link> · <Link className="hover:underline" href={`/clients/${v.client.id}`}>{v.client.name}</Link>{v.engagement ? <> · <Link className="hover:underline" href={`/engagements/${v.engagement.id}`}>{v.engagement.name}</Link></> : null}{v.thread.closed ? <> · <Badge>Closed</Badge></> : v.thread.waitingSince ? <> · <Badge tone="amber">Client waiting since {formatDateTime(v.thread.waitingSince)}</Badge></> : null}</>}
        actions={<CloseThreadButton closed={v.thread.closed} action={closeThreadAction.bind(null, id, !v.thread.closed)} />}
      />
      <Card><CardContent className="pt-4"><ThreadView messages={v.messages} mineIsClient={false} /></CardContent></Card>
      <Card><CardContent className="pt-4"><ReplyForm action={replyAction.bind(null, id)} disabled={v.thread.closed ? "Closed. Reopen it to reply." : undefined} /></CardContent></Card>
      <p className="text-xs text-muted">The client sees your name and message, and any attached file. Attachments are filed in Documents and shared with the client.</p>
    </div>
  );
}
