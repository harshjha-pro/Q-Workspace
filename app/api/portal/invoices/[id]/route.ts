import { getSession } from "@/server/context";
import { portalInvoicePdf } from "@/server/services/portal/actions";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /api/portal/invoices/<id> — an issued invoice PDF for the signed-in client user (audited). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "PORTAL") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment) return new Response("Finish account setup first", { status: 403 });
  const { id } = await ctx.params;
  try {
    const f = await portalInvoicePdf(s.actor, id);
    return new Response(new Uint8Array(f.body), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${f.fileName.replace(/[^\w .()-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "portal invoice download failed");
    return new Response("Download failed.", { status: 500 });
  }
}
