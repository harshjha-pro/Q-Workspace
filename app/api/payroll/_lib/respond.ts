import { getSession } from "@/server/context";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { StaffActor } from "@/server/permissions/actor";

/** Shared download wrapper for payroll files: session check, 401/403/404 mapping, no caching. */
export async function payrollDownload(make: (actor: StaffActor) => Promise<{ body: Buffer; fileName: string; contentType: string }>) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  try {
    const out = await make(s.actor);
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
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "payroll download failed");
    return new Response("Download failed. The error has been logged for the admin.", { status: 500 });
  }
}
