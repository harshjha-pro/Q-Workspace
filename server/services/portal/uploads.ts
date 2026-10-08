import { db, transaction } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { clientWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";
import { loadTask } from "../tasks/service";

/**
 * Client uploads for staff (P4-02 / P4-06 →, D-85): every portal upload with what it was for, the keyword
 * suggestion for unrequested ones, and whether staff have confirmed it. Linking an upload to a requested item
 * makes it count exactly as if the client had uploaded against that item (Received, pending confirmation).
 */
async function visibleClientIds(actor: Actor): Promise<string[] | null> {
  if (actor.kind !== "USER") throw forbidden();
  const scope = authorize(actor, "portal.share");
  if (scope === "firm" || scope === "firm_read") return null;
  return (await db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } })).map((c) => c.id);
}

export async function listPortalUploads(actor: Actor, f: { status?: "unlinked" | "to-confirm" | "all"; take?: number } = {}) {
  const ids = await visibleClientIds(actor);
  const status = f.status ?? "all";
  const rows = await db().portalUpload.findMany({
    where: {
      ...(ids ? { clientId: { in: ids } } : {}),
      ...(status === "unlinked" ? { checklistItemId: null } : status === "to-confirm" ? { checklistItemId: { not: null }, confirmedAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: f.take ?? 200,
  });
  const itemIds = [...new Set(rows.flatMap((r) => [r.checklistItemId, r.autoTag?.startsWith("ITEM:") ? r.autoTag.slice(5) : null]).filter((x): x is string => !!x))];
  const [clients, docs, items, users, confirmers] = await Promise.all([
    db().client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true } }),
    db().document.findMany({ where: { id: { in: rows.map((r) => r.documentId) } }, select: { id: true, name: true, tagsCsv: true } }),
    db().checklistItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, label: true, status: true, taskId: true, receivedPendingConfirm: true } }),
    db().portalUser.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.portalUserId))] } }, select: { id: true, name: true } }),
    db().user.findMany({ where: { id: { in: rows.map((r) => r.confirmedById).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } }),
  ]);
  const cn = new Map(clients.map((c) => [c.id, c.name]));
  const dm = new Map(docs.map((d) => [d.id, d]));
  const im = new Map(items.map((i) => [i.id, i]));
  const un = new Map(users.map((u) => [u.id, u.name]));
  const sn = new Map(confirmers.map((u) => [u.id, u.displayName]));
  const taskIds = [...new Set(items.map((i) => i.taskId).filter((x): x is string => !!x))];
  const tasks = new Map((await db().task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true, periodLabel: true } })).map((t) => [t.id, t]));
  const label = (itemId: string | null) => {
    const i = itemId ? im.get(itemId) : undefined;
    if (!i) return null;
    const t = i.taskId ? tasks.get(i.taskId) : undefined;
    return { id: i.id, label: i.label, taskId: i.taskId, task: t ? [t.title, t.periodLabel].filter(Boolean).join(" · ") : null, stillRequested: i.status === "REQUESTED" };
  };
  return rows.map((r) => {
    const doc = dm.get(r.documentId);
    const suggested = r.checklistItemId ? null : label(r.autoTag?.startsWith("ITEM:") ? r.autoTag.slice(5) : null);
    return {
      id: r.id, clientId: r.clientId, clientName: cn.get(r.clientId) ?? "", documentId: r.documentId, fileName: doc?.name ?? "", tags: (doc?.tagsCsv ?? "").split(",").filter((t) => t && t !== "from-client"),
      uploadedBy: un.get(r.portalUserId) ?? "Client", uploadedAt: r.createdAt,
      linkedTo: label(r.checklistItemId), suggested: suggested?.stillRequested ? suggested : null,
      confirmedAt: r.confirmedAt, confirmedBy: r.confirmedById ? (sn.get(r.confirmedById) ?? "") : null,
    };
  });
}

/** Requested items of a client that an unlinked upload could be linked to (tasks the actor can work only). */
export async function linkableItems(actor: Actor, clientId: string) {
  const ids = await visibleClientIds(actor);
  if (ids && !ids.includes(clientId)) throw forbidden();
  const items = await db().checklistItem.findMany({ where: { clientId, status: "REQUESTED", taskId: { not: null } }, select: { id: true, label: true, taskId: true }, orderBy: { requestedAt: "asc" } });
  const tasks = new Map((await db().task.findMany({ where: { id: { in: items.map((i) => i.taskId!) } }, select: { id: true, title: true, periodLabel: true } })).map((t) => [t.id, t]));
  return items.map((i) => {
    const t = tasks.get(i.taskId!);
    return { id: i.id, label: `${i.label} — ${t ? [t.title, t.periodLabel].filter(Boolean).join(" · ") : ""}` };
  });
}

/**
 * Link an unrequested upload to a requested item: the item becomes Received pending confirmation and the
 * document is attached to the item's task. Needs task.work on that task.
 */
export async function linkPortalUpload(actor: Actor, uploadId: string, checklistItemId: string) {
  if (actor.kind !== "USER") throw forbidden();
  const ids = await visibleClientIds(actor);
  const up = await db().portalUpload.findUnique({ where: { id: uploadId } });
  if (!up || (ids && !ids.includes(up.clientId))) throw notFound("Upload");
  if (up.checklistItemId) throw ruleViolation("This upload is already linked.");
  const item = await db().checklistItem.findUnique({ where: { id: checklistItemId } });
  if (!item || item.clientId !== up.clientId || !item.taskId) throw new DomainError("VALIDATION", "Choose a requested item of the same client.", { checklistItemId: "Not available" });
  if (item.status !== "REQUESTED") throw ruleViolation("That item is no longer requested.");
  const task = await loadTask(actor, item.taskId, "task.work");
  const today = todayIst();
  await transaction(async (tx) => {
    const done = await tx.portalUpload.updateMany({ where: { id: up.id, checklistItemId: null }, data: { checklistItemId: item.id, taskId: task.id, engagementId: task.engagementId, updatedById: actor.userId } });
    if (!done.count) throw ruleViolation("This upload is already linked.");
    await tx.document.update({ where: { id: up.documentId }, data: { taskId: task.id, updatedById: actor.userId } });
    await tx.checklistItem.update({ where: { id: item.id }, data: { status: "RECEIVED", receivedAt: item.receivedAt ?? today, receivedPendingConfirm: true, confirmedById: null, confirmedAt: null, updatedById: actor.userId } });
    await writeAudit(tx, actor, {
      entityType: "PortalUpload", entityId: up.id, action: "LINK", after: { checklistItemId: item.id, taskId: task.id, suggested: up.autoTag === `ITEM:${item.id}` },
    });
  });
  return { taskId: task.id };
}
