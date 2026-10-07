import { getSession } from "@/server/context";
import { documentVersionForDownload } from "@/server/services/dms/service";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /api/dms/<docId>?v=<version> — authorised, audited download of one document version (P3-26). */
export async function GET(req: Request, ctx: { params: Promise<{ docId: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const { docId } = await ctx.params;
  const v = new URL(req.url).searchParams.get("v");
  const version = v && /^\d{1,6}$/.test(v) ? Number(v) : undefined;
  try {
    const f = await documentVersionForDownload(s.actor, docId, version);
    return new Response(new Uint8Array(f.data), {
      headers: {
        "content-type": f.mimeType,
        "content-disposition": `attachment; filename="${f.fileName.replace(/[^\w .()-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "document download failed");
    return new Response("Download failed. The error has been logged for the admin.", { status: 500 });
  }
}
