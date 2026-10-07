import { getSession } from "@/server/context";
import { generateFromTemplate } from "@/server/services/doc-templates/service";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/**
 * POST /api/doc-templates/generate (form fields: code, userId | clientId [+ engagementId], format, extra_<name>)
 * Generates from the APPROVED template version and returns the file. Client documents are also filed
 * into the DMS; HR letters are only downloaded. Missing merge fields are listed in X-Missing-Fields.
 */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new Response("Cross-site request refused", { status: 403 });
  const f = await req.formData();
  const str = (k: string) => String(f.get(k) ?? "").trim() || undefined;
  const extra: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("extra_") && typeof v === "string" && v.trim()) extra[k.slice(6)] = v.trim();
  const format = str("format");
  try {
    const out = await generateFromTemplate(s.actor, {
      code: str("code") ?? "", userId: str("userId"), clientId: str("clientId"), engagementId: str("engagementId"),
      format: format === "PDF" || format === "DOCX" || format === "TEXT" ? format : undefined, extra,
    });
    return new Response(new Uint8Array(out.buffer), {
      headers: {
        "content-type": out.mimeType,
        "content-disposition": `attachment; filename="${out.fileName.replace(/[^\w .()-]/g, "_")}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-missing-fields": out.missing.join(","),
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "template generation failed");
    return new Response("Generation failed. The error has been logged for the admin.", { status: 500 });
  }
}
