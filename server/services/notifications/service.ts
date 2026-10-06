import { db } from "../../lib/db";
import { forbidden } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";

export type NotifyInput = {
  kind: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  priority?: "NORMAL" | "HIGH" | "ESCALATION";
  /** Same key → created once (jobs can rerun safely). Made per-user automatically. */
  dedupeKey?: string;
};

/**
 * In-app notification centre (replaces email/SMS/WhatsApp, brief §4). Every alert points to an
 * action via `link`. Browser notifications are raised by the open app from these rows.
 */
export async function notifyUsers(userIds: string[], n: NotifyInput) {
  const active = await db().user.findMany({ where: { id: { in: [...new Set(userIds)] }, active: true }, select: { id: true } });
  let created = 0;
  for (const { id } of active) {
    const dedupeKey = n.dedupeKey ? (n.dedupeKey.includes(id) ? n.dedupeKey : `${n.dedupeKey}|${id}`) : null;
    if (dedupeKey && (await db().notification.findUnique({ where: { dedupeKey } }))) continue;
    await db().notification.create({
      data: { userId: id, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link ?? "", entityType: n.entityType ?? null, entityId: n.entityId ?? null, priority: n.priority ?? "NORMAL", dedupeKey },
    });
    created += 1;
  }
  return created;
}

function self(actor: Actor) {
  if (actor.kind !== "USER") throw forbidden();
  return actor.userId;
}

export async function listNotifications(actor: Actor, opts: { unreadOnly?: boolean; take?: number; after?: Date } = {}) {
  const userId = self(actor);
  return db().notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}), ...(opts.after ? { createdAt: { gt: opts.after } } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
  });
}

export async function unreadCount(actor: Actor) {
  return db().notification.count({ where: { userId: self(actor), readAt: null } });
}

export async function markRead(actor: Actor, id?: string) {
  const userId = self(actor);
  await db().notification.updateMany({ where: { userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}

export async function getPreferences(actor: Actor) {
  const userId = self(actor);
  return (await db().notificationPreference.findUnique({ where: { userId } })) ?? { userId, quietFrom: null, quietTo: null, browserEnabled: true, mutedKindsCsv: "" };
}

/** Quiet hours and muted kinds silence browser pop-ups only; escalations can never be muted (spec 9.2). */
export async function savePreferences(actor: Actor, p: { quietFrom?: string | null; quietTo?: string | null; browserEnabled: boolean; mutedKinds: string[] }) {
  const userId = self(actor);
  const muted = p.mutedKinds.filter((k) => !k.startsWith("ESCALATE") && !k.endsWith("ESCALATION")).join(",");
  const data = { quietFrom: p.quietFrom || null, quietTo: p.quietTo || null, browserEnabled: p.browserEnabled, mutedKindsCsv: muted };
  return db().notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}
