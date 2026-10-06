import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { notFound, ruleViolation, conflict } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";

const teamInput = z.object({
  name: z.string().trim().min(2).max(60),
  leadManagerId: z.string().nullable().optional(),
});

export async function listTeams(actor: Actor) {
  authorize(actor, "users.manage");
  return db().clientTeam.findMany({
    where: { active: true },
    include: {
      leadManager: { select: { id: true, displayName: true } },
      members: { where: { toDate: null }, include: { user: { select: { id: true, displayName: true, role: true } } } },
      _count: { select: { clients: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createTeam(actor: Actor, input: z.input<typeof teamInput>) {
  authorize(actor, "users.manage");
  const data = parse(teamInput, input);
  return transaction(async (tx) => {
    if (await tx.clientTeam.findUnique({ where: { name: data.name } })) throw conflict("A team with that name exists.");
    if (data.leadManagerId) await assertManagerish(tx, data.leadManagerId);
    const team = await tx.clientTeam.create({ data: { ...data, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ClientTeam", entityId: team.id, action: "CREATE", after: data });
    return team;
  });
}

export async function updateTeam(actor: Actor, teamId: string, input: z.input<typeof teamInput>) {
  authorize(actor, "users.manage");
  const data = parse(teamInput, input);
  return transaction(async (tx) => {
    const before = await tx.clientTeam.findUnique({ where: { id: teamId } });
    if (!before) throw notFound("Team");
    if (data.leadManagerId) await assertManagerish(tx, data.leadManagerId);
    const after = await tx.clientTeam.update({ where: { id: teamId }, data: { ...data, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ClientTeam", entityId: teamId, action: "UPDATE", before, after });
    return after;
  });
}

export async function addTeamMember(actor: Actor, teamId: string, userId: string) {
  authorize(actor, "users.manage");
  return transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw ruleViolation("Only active people can join a team.");
    if (user.role === "HR_ADMIN") throw ruleViolation("HR Admin has no client access and cannot join a client team.");
    const existing = await tx.clientTeamMember.findFirst({ where: { teamId, userId, toDate: null } });
    if (existing) return existing;
    const m = await tx.clientTeamMember.create({ data: { teamId, userId, fromDate: todayIst(), createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ClientTeamMember", entityId: m.id, action: "CREATE", after: { teamId, userId } });
    return m;
  });
}

/**
 * Leaving a team ends membership today and revokes vault grants for that team's clients
 * (spec 6.5: access removed automatically when a person leaves the team).
 */
export async function removeTeamMember(actor: Actor, teamId: string, userId: string) {
  authorize(actor, "users.manage");
  return transaction(async (tx) => {
    const m = await tx.clientTeamMember.findFirst({ where: { teamId, userId, toDate: null } });
    if (!m) throw notFound("Team membership");
    await tx.clientTeamMember.update({ where: { id: m.id }, data: { toDate: todayIst(), updatedById: idOf(actor) } });
    const clientIds = (await tx.client.findMany({ where: { teamId }, select: { id: true } })).map((c) => c.id);
    const revoked = await tx.credentialGrant.updateMany({
      where: { userId, clientId: { in: clientIds }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "LEFT_TEAM" },
    });
    await writeAudit(tx, actor, {
      entityType: "ClientTeamMember",
      entityId: m.id,
      action: "END",
      after: { teamId, userId, credentialGrantsRevoked: revoked.count },
    });
  });
}

async function assertManagerish(tx: Tx, userId: string) {
  const u = await tx.user.findUnique({ where: { id: userId } });
  if (!u || !u.active || !["MANAGER", "PARTNER"].includes(u.role)) throw ruleViolation("Team lead must be an active Manager or Partner.");
}

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
