import { db } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import type { Prisma } from "@/generated/prisma/client";

export type AuditFilter = { from?: string; to?: string; userId?: string; q?: string; take?: number };

/** Audit trail search (spec 5.7): Partner/Admin firm-wide, Manager their team, others their own actions. */
export async function searchAudit(actor: Actor, f: AuditFilter) {
  const scope = authorize(actor, "audit.search");
  const people = scope === "firm" || scope === "firm_read" ? null : await db().user.findMany({ where: userWhere(actor, scope === "self" ? "self" : "team"), select: { id: true } });
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      people ? { actorUserId: { in: people.map((p) => p.id) } } : {},
      f.userId ? { actorUserId: f.userId } : {},
      f.from ? { at: { gte: new Date(`${f.from}T00:00:00+05:30`) } } : {},
      f.to ? { at: { lte: new Date(`${f.to}T23:59:59+05:30`) } } : {},
      f.q ? { OR: [{ entityType: { contains: f.q } }, { action: { contains: f.q.toUpperCase() } }, { reason: { contains: f.q } }, { afterJson: { contains: f.q } }, { entityId: f.q }] } : {},
    ],
  };
  const rows = await db().auditLog.findMany({ where, orderBy: { at: "desc" }, take: f.take ?? 200 });
  const names = new Map((await db().user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[])] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({ ...r, actorName: r.actorType === "SYSTEM" ? "System" : r.actorUserId ? names.get(r.actorUserId) ?? r.actorUserId : "Portal user" }));
}

export function auditCsv(rows: Awaited<ReturnType<typeof searchAudit>>) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["When (UTC)", "Who", "Action", "Entity", "Entity id", "Reason", "Before", "After"];
  return [head.join(","), ...rows.map((r) => [r.at.toISOString(), r.actorName, r.action, r.entityType, r.entityId, r.reason, r.beforeJson, r.afterJson].map(esc).join(","))].join("\n");
}
