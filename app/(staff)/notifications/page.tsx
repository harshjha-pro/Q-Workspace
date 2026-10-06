import { requireStaff } from "@/server/context";
import { load } from "@/lib/page";
import { getPreferences, listNotifications } from "@/server/services/notifications/service";
import { formatDateTime } from "@/server/lib/dates";
import { PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { kindLabel } from "@/components/notifications/kinds";
import { cn } from "@/lib/utils";
import { EnableBrowserNotifications, MarkAllRead, PreferencesForm } from "./notifications-ui";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await requireStaff();
  const [rows, prefs] = await Promise.all([load(() => listNotifications(actor, { take: 100 })), load(() => getPreferences(actor))]);
  // Unread first; within each group newest first (the service already returns newest first).
  const list = [...rows.filter((n) => !n.readAt), ...rows.filter((n) => n.readAt)];
  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" subtitle="Every alert links to the thing to act on. Opening one marks it read." actions={unread ? <MarkAllRead /> : null} />

      <Card>
        <CardHeader><CardTitle>{unread ? `${unread} unread` : "All caught up"}</CardTitle><span className="text-xs text-muted">Latest 100</span></CardHeader>
        {list.length === 0 ? (
          <CardContent><EmptyState title="No notifications yet" /></CardContent>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id}>
                <a href={`/api/notifications/${encodeURIComponent(n.id)}/open`} className={cn("flex gap-3 px-4 py-3 hover:bg-gray-50", !n.readAt && "bg-brand-50/60")}>
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body ? <span className="block text-sm text-muted">{n.body}</span> : null}
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {formatDateTime(n.createdAt)}
                      <Badge>{kindLabel(n.kind)}</Badge>
                      {n.priority === "ESCALATION" ? <Badge tone="red">Escalation</Badge> : n.priority === "HIGH" ? <Badge tone="amber">High</Badge> : null}
                      {!n.readAt ? <span className="sr-only">Unread</span> : null}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Browser pop-ups</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <EnableBrowserNotifications />
          <PreferencesForm prefs={{ quietFrom: prefs.quietFrom, quietTo: prefs.quietTo, browserEnabled: prefs.browserEnabled, muted: prefs.mutedKindsCsv ? prefs.mutedKindsCsv.split(",") : [] }} />
        </CardContent>
      </Card>
    </div>
  );
}
