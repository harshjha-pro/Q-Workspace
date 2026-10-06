import { getSession } from "@/server/context";
import { searchAudit, auditCsv } from "@/server/services/audit/search";
import { db, transaction } from "@/server/lib/db";
import { writeAudit } from "@/server/audit";
import { isDomainError } from "@/server/lib/errors";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") return new Response("Unauthorised", { status: 401 });
  const url = new URL(req.url);
  try {
    const rows = await searchAudit(s.actor, { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined, q: url.searchParams.get("q") ?? undefined, take: 10_000 });
    await transaction((tx) => writeAudit(tx, s.actor, { entityType: "AuditLog", entityId: "-", action: "EXPORT", after: { rows: rows.length } }));
    await db().exportJob.create({ data: { kind: "AUDIT_CSV", rowCount: rows.length, fileName: "audit.csv", createdById: s.actor.kind === "USER" ? s.actor.userId : null } });
    return new Response(auditCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="qepex-audit.csv"`, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(isDomainError(e) ? e.message : "Error", { status: isDomainError(e) && e.code === "FORBIDDEN" ? 403 : 500 });
  }
}
