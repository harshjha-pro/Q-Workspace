import { getSession } from "@/server/context";
import { meetingIcs } from "@/server/services/meetings/service";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /meetings/<id>/ics — one meeting as an .ics file for any calendar app (calendar sync, spec 13.8). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { id } = await ctx.params;
  try {
    const out = await meetingIcs(s.actor, id, new URL(req.url).origin);
    return new Response(out.body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${out.fileName.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "meeting ics failed");
    return new Response("Could not build the calendar file.", { status: 500 });
  }
}
