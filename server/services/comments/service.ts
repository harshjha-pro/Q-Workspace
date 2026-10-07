import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, isDomainError, notFound, ruleViolation } from "../../lib/errors";
import { requireStaff, scopeOf } from "../../permissions/guards";
import { assertEngagementAccess } from "../../permissions/scopes";
import type { Actor, StaffActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { loadTask } from "../tasks/service";
import { visibleClientIds } from "../registers/common";
import { assertLeadAccess } from "../crm/common";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";

/**
 * Comments and @mentions (spec 13.7, P3-32) on tasks, engagements, notices and leads. Whoever can see the record
 * can read and add comments; an @mention notifies the colleague only if they can see the record too.
 * Authors edit their own comment within a window (setting, default 15 minutes) and soft-delete it any time.
 */
export const ENTITY_TYPES = ["TASK", "ENGAGEMENT", "NOTICE", "LEAD"] as const;
export type CommentEntity = (typeof ENTITY_TYPES)[number];

export function entityLink(entityType: CommentEntity, entityId: string) {
  return entityType === "TASK" ? `/tasks/${entityId}` : entityType === "ENGAGEMENT" ? `/engagements/${entityId}` : entityType === "NOTICE" ? `/notices/${entityId}` : `/crm/leads/${entityId}`;
}

/** Throws FORBIDDEN / NOT_FOUND unless the actor may see the record. Uses each module's own scope rules. */
export async function assertCanSee(actor: Actor, entityType: CommentEntity, entityId: string) {
  switch (entityType) {
    case "TASK":
      await loadTask(actor, entityId, "task.view");
      return;
    case "ENGAGEMENT":
      await assertEngagementAccess(actor, "engagement.view", entityId);
      return;
    case "NOTICE": {
      // Same rule as the notice register: client scope, or the notice's assignee / reviewer.
      const n = await db().notice.findUnique({ where: { id: entityId }, select: { clientId: true, assigneeId: true, reviewerId: true } });
      if (!n) throw notFound("Notice");
      const ids = await visibleClientIds(actor, "notice.view");
      const mine = actor.kind === "USER" && (n.assigneeId === actor.userId || n.reviewerId === actor.userId);
      if (ids && !ids.includes(n.clientId) && !mine) throw forbidden();
      return;
    }
    case "LEAD":
      // The CRM module's own lead scope (firm / team / owned-or-worked-on).
      await assertLeadAccess(actor, "crm.view", entityId);
      return;
    default:
      throw new DomainError("VALIDATION", "Comments are not available on this record.");
  }
}

function asActor(u: { id: string; role: string; isSenior: boolean; displayName: string }): StaffActor {
  return { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
}

async function canSee(u: { id: string; role: string; isSenior: boolean; displayName: string }, entityType: CommentEntity, entityId: string) {
  try {
    await assertCanSee(asActor(u), entityType, entityId);
    return true;
  } catch (e) {
    if (isDomainError(e)) return false;
    throw e;
  }
}

/** Active colleagues who can see the record — the @mention autocomplete list. */
export async function mentionCandidates(actor: Actor, entityType: CommentEntity, entityId: string) {
  requireStaff(actor);
  await assertCanSee(actor, entityType, entityId);
  const users = await db().user.findMany({
    where: { active: true, isSystem: false, role: { not: "PORTAL" } },
    select: { id: true, username: true, displayName: true, role: true, isSenior: true },
    orderBy: { displayName: "asc" },
  });
  const out: { id: string; username: string; displayName: string }[] = [];
  for (const u of users) if (await canSee(u, entityType, entityId)) out.push({ id: u.id, username: u.username, displayName: u.displayName });
  return out;
}

const MENTION = /(^|[^\w.@])@([a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])/gi;
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION)) out.add(m[2]!.toLowerCase());
  return [...out];
}

/** Users mentioned in the body who can see the record (others are silently not notified). */
async function resolveMentions(body: string, entityType: CommentEntity, entityId: string, authorId: string) {
  const names = parseMentions(body);
  if (!names.length) return { allowed: [] as string[], skipped: [] as string[] };
  const users = await db().user.findMany({ where: { username: { in: names }, active: true, isSystem: false }, select: { id: true, username: true, displayName: true, role: true, isSenior: true } });
  const allowed: string[] = [];
  const skipped: string[] = [];
  for (const u of users) {
    if (u.id === authorId) continue;
    if (await canSee(u, entityType, entityId)) allowed.push(u.id);
    else skipped.push(u.username);
  }
  return { allowed, skipped };
}

async function editWindowMinutes() {
  const v = await getSetting<number>("comments.editWindowMinutes", 15);
  return typeof v === "number" && v >= 0 ? v : 15;
}

const commentInput = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Write a comment").max(5000),
});

async function assertWritable(entityType: CommentEntity, entityId: string) {
  // Archived engagements are read-only (spec 7.2) — the discussion is part of the closed record.
  if (entityType === "ENGAGEMENT") {
    const e = await db().engagement.findUnique({ where: { id: entityId }, select: { archivedAt: true } });
    if (e?.archivedAt) throw ruleViolation("This engagement is archived and read-only.");
  }
}

async function notifyMentions(actor: StaffActor, userIds: string[], c: { id: string; entityType: string; entityId: string; body: string }) {
  if (!userIds.length) return;
  const link = `${entityLink(c.entityType as CommentEntity, c.entityId)}#comment-${c.id}`;
  await notifyUsers(userIds, { kind: "MENTION", title: `${actor.displayName} mentioned you in a comment`, body: c.body.slice(0, 200), link, entityType: "Comment", entityId: c.id, dedupeKey: `mention|${c.id}` });
  await db().mention.updateMany({ where: { commentId: c.id, userId: { in: userIds }, notifiedAt: null }, data: { notifiedAt: new Date() } });
}

export async function addComment(actor: Actor, input: z.input<typeof commentInput>) {
  requireStaff(actor);
  const d = parse(commentInput, input);
  await assertCanSee(actor, d.entityType, d.entityId);
  await assertWritable(d.entityType, d.entityId);
  const { allowed, skipped } = await resolveMentions(d.body, d.entityType, d.entityId, actor.userId);
  const c = await transaction(async (tx) => {
    const row = await tx.comment.create({ data: { entityType: d.entityType, entityId: d.entityId, authorId: actor.userId, body: d.body, createdById: actor.userId } });
    for (const userId of allowed) await tx.mention.create({ data: { commentId: row.id, userId, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Comment", entityId: row.id, action: "CREATE", after: { entityType: d.entityType, entityId: d.entityId, body: d.body, mentions: allowed } });
    return row;
  });
  await notifyMentions(actor, allowed, c);
  return { comment: c, notified: allowed.length, notNotified: skipped };
}

async function ownComment(actor: StaffActor, id: string) {
  const c = await db().comment.findUnique({ where: { id }, include: { mentions: true } });
  if (!c || c.deletedAt) throw notFound("Comment");
  if (c.authorId !== actor.userId) throw forbidden("You can change only your own comments.");
  await assertCanSee(actor, c.entityType as CommentEntity, c.entityId);
  await assertWritable(c.entityType as CommentEntity, c.entityId);
  return c;
}

/** Edit your own comment within the edit window. Newly mentioned colleagues are notified. */
export async function editComment(actor: Actor, id: string, body: string, now = new Date()) {
  requireStaff(actor);
  const c = await ownComment(actor, id);
  const text = parse(z.string().trim().min(1, "Write a comment").max(5000), body);
  const minutes = await editWindowMinutes();
  if (now.getTime() - c.createdAt.getTime() > minutes * 60_000) throw ruleViolation(`Comments can be edited for ${minutes} minutes after posting.`);
  const { allowed } = await resolveMentions(text, c.entityType as CommentEntity, c.entityId, actor.userId);
  const already = new Set(c.mentions.map((m) => m.userId));
  const fresh = allowed.filter((u) => !already.has(u));
  const after = await transaction(async (tx) => {
    const row = await tx.comment.update({ where: { id }, data: { body: text, editedAt: now, updatedById: actor.userId } });
    for (const userId of fresh) await tx.mention.create({ data: { commentId: id, userId, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Comment", entityId: id, action: "UPDATE", before: { body: c.body }, after: { body: text, newMentions: fresh } });
    return row;
  });
  if (fresh.length) {
    const link = `${entityLink(c.entityType as CommentEntity, c.entityId)}#comment-${c.id}`;
    await notifyUsers(fresh, { kind: "MENTION", title: `${actor.displayName} mentioned you in a comment`, body: text.slice(0, 200), link, entityType: "Comment", entityId: c.id, dedupeKey: `mention|${c.id}` });
    await db().mention.updateMany({ where: { commentId: id, userId: { in: fresh }, notifiedAt: null }, data: { notifiedAt: new Date() } });
  }
  return after;
}

/** Soft-delete your own comment (the text stays in the audit trail). */
export async function deleteComment(actor: Actor, id: string) {
  requireStaff(actor);
  const c = await ownComment(actor, id);
  await transaction(async (tx) => {
    await tx.comment.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Comment", entityId: id, action: "DELETE", before: { body: c.body } });
  });
}

/** The thread on a record, oldest first. Deleted comments show as a placeholder without their text. */
export async function listComments(actor: Actor, entityType: CommentEntity, entityId: string, now = new Date()) {
  requireStaff(actor);
  if (!ENTITY_TYPES.includes(entityType)) throw new DomainError("VALIDATION", "Unknown record type.");
  await assertCanSee(actor, entityType, entityId);
  const rows = await db().comment.findMany({ where: { entityType, entityId }, include: { mentions: true }, orderBy: { createdAt: "asc" }, take: 500 });
  const ids = [...new Set(rows.flatMap((r) => [r.authorId, ...r.mentions.map((m) => m.userId)]))];
  const users = new Map((await db().user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, username: true } })).map((u) => [u.id, u]));
  const minutes = await editWindowMinutes();
  const readOnly = entityType === "ENGAGEMENT" && !!(await db().engagement.findUnique({ where: { id: entityId }, select: { archivedAt: true } }))?.archivedAt;
  return {
    readOnly,
    editWindowMinutes: minutes,
    comments: rows.map((r) => {
      const mine = r.authorId === actor.userId;
      return {
        id: r.id,
        authorId: r.authorId,
        authorName: users.get(r.authorId)?.displayName ?? "",
        body: r.deletedAt ? "" : r.body,
        deleted: !!r.deletedAt,
        createdAt: r.createdAt,
        editedAt: r.editedAt,
        mentions: r.deletedAt ? [] : r.mentions.map((m) => users.get(m.userId)?.displayName ?? ""),
        canEdit: mine && !r.deletedAt && !readOnly && now.getTime() - r.createdAt.getTime() <= minutes * 60_000,
        canDelete: mine && !r.deletedAt && !readOnly,
      };
    }),
  };
}

/** Whether the comment thread should be offered at all (e.g. HR Admin on a task: no). */
export function commentsVisibleFor(actor: Actor, entityType: CommentEntity) {
  const cap = entityType === "TASK" ? "task.view" : entityType === "ENGAGEMENT" ? "engagement.view" : entityType === "NOTICE" ? "notice.view" : "crm.view";
  return scopeOf(actor, cap) !== "none";
}
