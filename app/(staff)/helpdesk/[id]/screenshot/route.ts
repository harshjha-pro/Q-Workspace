import { getSession } from "@/server/context";
import { ticketScreenshot } from "@/server/services/helpdesk/service";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /helpdesk/<id>/screenshot — the ticket's screenshot, for the raiser and the queue's handlers only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { id } = await ctx.params;
  try {
    const f = await ticketScreenshot(s.actor, id);
    return new Response(new Uint8Array(f.data), {
      headers: {
        "content-type": f.mimeType,
        "content-disposition": `attachment; filename="${f.fileName.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "screenshot download failed");
    return new Response("Download failed.", { status: 500 });
  }
}
