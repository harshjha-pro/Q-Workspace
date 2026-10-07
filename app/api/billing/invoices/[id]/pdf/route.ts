import { getSession } from "@/server/context";
import { invoicePdf } from "@/server/services/billing/service";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /api/billing/invoices/<id>/pdf — GST invoice PDF, scoped by billing.view, logged, never cached. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { id } = await ctx.params;
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  try {
    const out = await invoicePdf(s.actor, id);
    return new Response(new Uint8Array(out.body), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${out.fileName.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "invoice pdf failed");
    return new Response("Could not build the PDF. The error has been logged for the admin.", { status: 500 });
  }
}
