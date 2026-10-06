import { getSession } from "@/server/context";
import { getPreferences, listNotifications, unreadCount } from "@/server/services/notifications/service";

/**
 * Polled by the open app every 60 s (no push server). Returns the unread count, notifications newer
 * than `after`, the popup preferences, and `now` — the cursor for the next poll (taken before the
 * query, so nothing created during the request is skipped).
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  const now = new Date();
  const afterRaw = new URL(req.url).searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  const [unread, items, prefs] = await Promise.all([
    unreadCount(s.actor),
    after && !Number.isNaN(after.getTime()) ? listNotifications(s.actor, { after, unreadOnly: true, take: 20 }) : Promise.resolve([]),
    getPreferences(s.actor),
  ]);
  return Response.json(
    {
      now: now.toISOString(),
      unread,
      items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, priority: n.priority })),
      prefs: { browserEnabled: prefs.browserEnabled, quietFrom: prefs.quietFrom, quietTo: prefs.quietTo, muted: prefs.mutedKindsCsv ? prefs.mutedKindsCsv.split(",") : [] },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
