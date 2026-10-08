import Link from "next/link";
import { requirePortal } from "@/server/context";
import { listThreads } from "@/server/services/messages/service";
import { portalThreadOptions } from "@/server/services/portal/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewThreadDialog } from "@/components/messages/forms";
import { portalStartThreadAction } from "../actions";

export const metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const actor = await requirePortal();
  const [rows, options] = await Promise.all([listThreads(actor, { status: "all" }), portalThreadOptions(actor)]);
  const clients = options;
  return (
    <div className="space-y-4">
      <PageHeader title="Messages" subtitle="Write to the firm securely. Files you attach are kept with your documents." actions={<NewThreadDialog action={portalStartThreadAction} clients={options} base="/portal/messages" />} />
      <Card>
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">No conversations yet.</p> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/portal/messages/${r.id}`} className="font-medium hover:underline">{r.subject}</Link>
                  {r.unread ? <Badge tone="blue" className="ml-2">{r.unread} new</Badge> : null}
                  <div className="text-xs text-muted">{[clients.length > 1 ? r.clientName : null, r.engagementName, formatDateTime(r.lastMessageAt)].filter(Boolean).join(" · ")}</div>
                </div>
                {r.closed ? <Badge>Closed</Badge> : r.waitingSince ? <Badge tone="amber">Waiting for the firm</Badge> : <Badge tone="green">Replied</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
