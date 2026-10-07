import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { ruleViolation } from "../../lib/errors";
import { authorize, requireStaff } from "../../permissions/guards";
import { assertUserAccess, userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { notifyUsers } from "../notifications/service";

/**
 * Achievements and applause (spec 7.3, P3-04).
 * - Only Partners (anyone) and Managers (their team) send applause, always with a badge.
 * - Applause is immutable: this module deliberately exports NO edit, revoke or delete function.
 * - There is no leaderboard: nothing here ranks people or returns counts per person for comparison.
 */
export const BADGES = [
  { code: "DEADLINE_HERO", name: "Deadline Hero", description: "Pulled a filing over the line before the due date under pressure." },
  { code: "CLEAN_REVIEW", name: "Clean Review", description: "Work came through review with no or minimal points." },
  { code: "CLIENT_CHAMPION", name: "Client Champion", description: "Went beyond the brief for a client." },
  { code: "FAST_LEARNER", name: "Fast Learner", description: "Picked up a new area or tool quickly." },
  { code: "TEAM_PLAYER", name: "Team Player", description: "Helped colleagues and the team succeed." },
  { code: "PROBLEM_SOLVER", name: "Problem Solver", description: "Found a way through a difficult problem." },
] as const;
export type BadgeCode = (typeof BADGES)[number]["code"];
const BADGE_CODES = BADGES.map((b) => b.code) as [BadgeCode, ...BadgeCode[]];

const applauseInput = z.object({
  toUserId: z.string().min(1, "Choose a person"),
  badgeCode: z.enum(BADGE_CODES, { message: "Choose a badge" }),
  message: z.string().trim().min(5, "Say a few words about what they did").max(1000),
});
export type ApplauseInput = z.input<typeof applauseInput>;

export async function listBadges() {
  return db().badge.findMany({ orderBy: { name: "asc" } });
}

/** Send applause. Managers may applaud only people in their team (direct reports / client-team members). */
export async function giveApplause(actor: Actor, input: ApplauseInput) {
  requireStaff(actor);
  authorize(actor, "applause.give");
  const d = parse(applauseInput, input);
  if (d.toUserId === actor.userId) throw ruleViolation("Applause is for colleagues — you cannot applaud yourself.");
  await assertUserAccess(actor, "applause.give", d.toUserId);
  const to = await db().user.findUnique({ where: { id: d.toUserId } });
  if (!to || !to.active || to.isSystem) throw ruleViolation("Choose an active colleague.");
  const badge = await db().badge.findUnique({ where: { code: d.badgeCode } });
  const badgeName = badge?.name ?? BADGES.find((b) => b.code === d.badgeCode)!.name;
  const row = await transaction(async (tx) => {
    const a = await tx.applause.create({ data: { toUserId: d.toUserId, fromUserId: actor.userId, badgeCode: d.badgeCode, message: d.message, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Applause", entityId: a.id, action: "CREATE", after: { toUserId: d.toUserId, badgeCode: d.badgeCode, message: d.message } });
    return a;
  });
  await notifyUsers([d.toUserId], { kind: "APPLAUSE", title: `${actor.displayName} applauded you: ${badgeName}`, body: d.message, link: "/applause", entityType: "Applause", entityId: row.id });
  return row;
}

type ApplauseRow = { id: string; toUserId: string; fromUserId: string; badgeCode: string | null; message: string; createdAt: Date };

async function decorate(rows: ApplauseRow[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.toUserId, r.fromUserId]))];
  const users = await db().user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const badges = new Map((await db().badge.findMany()).map((b) => [b.code, b.name]));
  return rows.map((r) => ({
    id: r.id, toUserId: r.toUserId, fromUserId: r.fromUserId, toName: names.get(r.toUserId) ?? "", fromName: names.get(r.fromUserId) ?? "",
    badgeCode: r.badgeCode, badgeName: r.badgeCode ? badges.get(r.badgeCode) ?? r.badgeCode : null, message: r.message, createdAt: r.createdAt,
  }));
}

/** My applause: what I received (everyone) and what I sent (Partners / Managers). Newest first; no counts or ranking. */
export async function myApplause(actor: Actor) {
  requireStaff(actor);
  const [received, sent] = await Promise.all([
    db().applause.findMany({ where: { toUserId: actor.userId }, orderBy: { createdAt: "desc" }, take: 200 }),
    db().applause.findMany({ where: { fromUserId: actor.userId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return { received: await decorate(received), sent: await decorate(sent) };
}

/**
 * Applause one person received in a date window (YYYY-MM-DD, inclusive, IST by createdAt date) — supporting
 * evidence for their appraisal file (spec 7.3). No actor: the caller (appraisal module) has already decided the
 * viewer may read this person's appraisal. Returns entries only, never totals for comparison.
 */
export async function applauseFor(userId: string, from: string, to: string) {
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T23:59:59.999+05:30`);
  const rows = await db().applause.findMany({ where: { toUserId: userId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: "asc" } });
  return decorate(rows);
}

/** People the actor may applaud (picker). */
export async function applaudablePeople(actor: Actor) {
  requireStaff(actor);
  const scope = authorize(actor, "applause.give");
  const rows = await db().user.findMany({
    where: { AND: [userWhere(actor, scope), { active: true, isSystem: false, id: { not: actor.userId } }] },
    select: { id: true, displayName: true, role: true },
    orderBy: { displayName: "asc" },
  });
  return rows;
}
