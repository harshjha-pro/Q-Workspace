import { getSession } from "@/server/context";
import { completionReportPdf } from "@/server/services/lifecycle/completion";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /api/lifecycle/completion/<engagementId> — the engagement completion report as a PDF (P3-01). */
export async function GET(_req: Request, ctx: { params: Promise<{ engagementId: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { engagementId } = await ctx.params;
  try {
    const out = await completionReportPdf(s.actor, engagementId);
    return new Response(new Uint8Array(out.body), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${out.fileName.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "completion report failed");
    return new Response("The report could not be built. The error has been logged for the admin.", { status: 500 });
  }
}
