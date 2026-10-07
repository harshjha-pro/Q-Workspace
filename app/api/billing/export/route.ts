import { getSession } from "@/server/context";
import { runBillingExport, BILLING_EXPORT_KINDS, type BillingExportKind } from "@/server/services/billing/service";
import { isDomainError } from "@/server/lib/errors";
import { isIsoDate } from "@/server/lib/dates";
import { logger } from "@/server/lib/logger";

/** GET /api/billing/export?kind=invoices|lines|receipts&from=&to=&format=csv|xlsx — accounting export, scoped and logged. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  if (s.needsTotpEnrolment || s.mustChangePassword) return new Response("Finish account setup first", { status: 403 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") ?? "invoices";
  if (!BILLING_EXPORT_KINDS.includes(kind as BillingExportKind)) return new Response("kind must be invoices, lines or receipts", { status: 400 });
  const format = q.get("format") ?? "csv";
  if (format !== "csv" && format !== "xlsx") return new Response("Format must be csv or xlsx", { status: 400 });
  const from = q.get("from") || undefined;
  const to = q.get("to") || undefined;
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return new Response("Dates must be YYYY-MM-DD", { status: 400 });
  if (from && to && from > to) return new Response("From is after To", { status: 400 });
  try {
    const out = await runBillingExport(s.actor, kind as BillingExportKind, format, { from, to });
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
    logger().error({ err: e instanceof Error ? e.stack : String(e) }, "billing export failed");
    return new Response("Export failed. The error has been logged for the admin.", { status: 500 });
  }
}
