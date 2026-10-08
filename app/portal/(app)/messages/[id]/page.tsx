import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortal } from "@/server/context";
import { getThread } from "@/server/services/messages/service";
import { isDomainError } from "@/server/lib/errors";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { ThreadView } from "@/components/messages/thread-view";
import { ReplyForm } from "@/components/messages/forms";
import { portalReplyAction } from "../../actions";
import { RefreshOnce } from "@/components/messages/refresh-once";

export const metadata = { title: "Conversation" };

export default async function PortalThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePortal();
  const { id } = await params;
  const v = await getThread(actor, id).catch((e) => {
    if (isDomainError(e)) notFound();
    throw e;
  });
  return (
    <div className="space-y-4">
      <RefreshOnce when={v.markedRead > 0} />
      <PageHeader title={v.thread.subject} subtitle={<><Link className="hover:underline" href="/portal/messages">Messages</Link> · {v.client.name}{v.engagement ? ` · ${v.engagement.name}` : ""}</>} />
      <Card><CardContent className="pt-4"><ThreadView messages={v.messages} mineIsClient /></CardContent></Card>
      <Card><CardContent className="pt-4"><ReplyForm action={portalReplyAction.bind(null, id)} /></CardContent></Card>
      {v.thread.closed ? <p className="text-xs text-muted">The firm closed this conversation. Writing again reopens it.</p> : null}
    </div>
  );
}
