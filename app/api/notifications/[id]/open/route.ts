import { getSession } from "@/server/context";
import { db } from "@/server/lib/db";
import { markRead } from "@/server/services/notifications/service";

/** Same-origin paths only, so a stored link can never become an open redirect. */
const safePath = (link: string) => (link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\") ? link : "/notifications");

/** Opening a notification (list click or browser popup) marks it read and goes to its action. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return Response.redirect(new URL("/login", req.url), 303);
  const { id } = await params;
  const n = await db().notification.findFirst({ where: { id, userId: s.actor.userId }, select: { link: true } });
  if (n) await markRead(s.actor, id);
  return Response.redirect(new URL(n ? safePath(n.link) : "/notifications", req.url), 303);
}
