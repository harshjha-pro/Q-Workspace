import { getSession } from "@/server/context";
import { myIcs } from "@/server/services/calendar/service";
import { isDomainError } from "@/server/lib/errors";

/** My next 90 days as an .ics file — replaces calendar sync (no external integrations). */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  try {
    const ics = await myIcs(s.actor, new URL(req.url).origin);
    return new Response(ics, {
      headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="qepex-my-work.ics"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(isDomainError(e) ? e.message : "Error", { status: isDomainError(e) && e.code === "FORBIDDEN" ? 403 : 500 });
  }
}
