import { getSession } from "@/server/context";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { proposalPdf } from "@/server/services/crm/proposals";
import { letterFile } from "@/server/services/crm/letters";
import { campaignCsv } from "@/server/services/crm/campaigns";

/**
 * GET /api/crm/proposal/<id>?format=pdf · /api/crm/letter/<id>?format=pdf|docx · /api/crm/campaign/<id>?format=csv
 * Scoped and audited by the CRM services; never cached.
 */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { kind, id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") ?? "pdf";
  try {
    let out: { body: Buffer; fileName: string; contentType: string };
    if (kind === "proposal" && format === "pdf") out = await proposalPdf(s.actor, id);
    else if (kind === "letter" && (format === "pdf" || format === "docx")) out = await letterFile(s.actor, id, format);
    else if (kind === "campaign" && format === "csv") out = await campaignCsv(s.actor, id);
    else return new Response("Unknown download", { status: 404 });
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
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "crm download failed");
    return new Response("Download failed. The error has been logged for the admin.", { status: 500 });
  }
}
