import { getSession } from "@/server/context";
import { exportPeerReviewWorkbook } from "@/server/services/qc/peer-review";
import { isDomainError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/** GET /api/qc/peer-review?from=YYYY-MM-DD&to=YYYY-MM-DD — peer-review pack as Excel (Partner, audited). */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const q = new URL(req.url).searchParams;
  try {
    const out = await exportPeerReviewWorkbook(s.actor, { periodFrom: q.get("from") ?? "", periodTo: q.get("to") ?? "" });
    return new Response(new Uint8Array(out.body), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${out.fileName}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response(e.message, { status: e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400 });
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "peer-review export failed");
    return new Response("Export failed. The error has been logged for the admin.", { status: 500 });
  }
}
