import { getSession } from "@/server/context";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { offerLetterDownload } from "@/server/services/hr/recruitment";
import { letterDownload } from "@/server/services/hr/letters";
import { receiptDownload } from "@/server/services/hr/expenses";

/**
 * GET /api/hr/download/<offer|letter|receipt>/<id>?format=pdf|docx — HR documents, authorised and
 * audited by the service (pay letters log a sensitive view), never cached.
 */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { kind, id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "docx") return new Response("Format must be pdf or docx", { status: 400 });
  try {
    const out =
      kind === "offer" ? await offerLetterDownload(s.actor, id, format)
        : kind === "letter" ? await letterDownload(s.actor, id, format)
          : kind === "receipt" ? await receiptDownload(s.actor, id)
            : null;
    if (!out) return new Response("Unknown document", { status: 404 });
    return new Response(new Uint8Array(out.body), {
      headers: {
        "content-type": out.contentType,
        "content-disposition": `attachment; filename="${out.fileName.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "hr download failed");
    return new Response("Download failed. The error has been logged for the admin.", { status: 500 });
  }
}
