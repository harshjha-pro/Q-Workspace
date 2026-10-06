import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "./actor";
import type { Capability, Scope } from "./matrix";
import { authorize } from "./guards";
import { db } from "../lib/db";
import { forbidden, notFound } from "../lib/errors";

const NONE = "__none__";

/* People a Manager is responsible for: direct reports and members of client teams they lead. */
function teamPeopleWhere(userId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { id: userId },
      { reportingManagerId: userId },
      { teamMemberships: { some: { toDate: null, team: { leadManagerId: userId } } } },
    ],
  };
}

/* Clients a Manager is responsible for. */
function teamClientWhere(userId: string): Prisma.ClientWhereInput {
  return {
    OR: [
      { managerId: userId },
      { partnerId: userId },
      { team: { leadManagerId: userId } },
      { engagements: { some: { managerId: userId } } },
    ],
  };
}

/* Q-06: Staff/Articles see a client only through an engagement or task they are assigned to. */
function assignedClientWhere(userId: string): Prisma.ClientWhereInput {
  return {
    OR: [
      { engagements: { some: { assignments: { some: { userId, toDate: null } } } } },
      { tasks: { some: { assignments: { some: { userId, toDate: null } } } } },
    ],
  };
}

function assignedEngagementWhere(userId: string): Prisma.EngagementWhereInput {
  return {
    OR: [
      { assignments: { some: { userId, toDate: null } } },
      { tasks: { some: { assignments: { some: { userId, toDate: null } } } } },
    ],
  };
}

function assignedTaskWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { assignments: { some: { userId, toDate: null } } },
      { engagement: { assignments: { some: { userId, toDate: null } } } },
    ],
  };
}

const base = (s: Scope) => (s === "team_read" ? "team" : s === "firm_read" ? "firm" : s);

export function clientWhere(actor: Actor, scope: Scope): Prisma.ClientWhereInput {
  const s = base(scope);
  if (s === "firm") return {};
  if (actor.kind === "PORTAL") return s === "portal_own" ? { id: { in: actor.clientIds } } : { id: NONE };
  if (actor.kind === "SYSTEM") return {};
  if (s === "team") return teamClientWhere(actor.userId);
  if (s === "assigned" || s === "granted") return assignedClientWhere(actor.userId);
  return { id: NONE };
}

export function engagementWhere(actor: Actor, scope: Scope): Prisma.EngagementWhereInput {
  const s = base(scope);
  if (s === "firm" || actor.kind === "SYSTEM") return {};
  if (actor.kind === "PORTAL") return s === "portal_own" ? { clientId: { in: actor.clientIds } } : { id: NONE };
  if (s === "team") return { OR: [{ managerId: actor.userId }, { partnerId: actor.userId }, { client: teamClientWhere(actor.userId) }] };
  if (s === "assigned") return assignedEngagementWhere(actor.userId);
  return { id: NONE };
}

export function taskWhere(actor: Actor, scope: Scope): Prisma.TaskWhereInput {
  const s = base(scope);
  if (s === "firm" || actor.kind === "SYSTEM") return {};
  if (actor.kind === "PORTAL") return s === "portal_own" ? { clientId: { in: actor.clientIds } } : { id: NONE };
  if (s === "team") return { client: teamClientWhere(actor.userId) };
  if (s === "assigned") return assignedTaskWhere(actor.userId);
  return { id: NONE };
}

export function userWhere(actor: Actor, scope: Scope): Prisma.UserWhereInput {
  const s = base(scope);
  if (s === "firm" || actor.kind === "SYSTEM") return { isSystem: false };
  if (actor.kind === "PORTAL") return { id: NONE };
  if (s === "team") return teamPeopleWhere(actor.userId);
  if (s === "self") return { id: actor.userId };
  return { id: NONE };
}

export function workEntryWhere(actor: Actor, scope: Scope): Prisma.WorkEntryWhereInput {
  const s = base(scope);
  if (s === "firm" || actor.kind === "SYSTEM") return {};
  if (actor.kind === "PORTAL") return { id: NONE };
  if (s === "team") return { user: teamPeopleWhere(actor.userId) };
  if (s === "self") return { userId: actor.userId };
  return { id: NONE };
}

/** Assert the actor may act on one client under a capability (record-level check). */
export async function assertClientAccess(actor: Actor, cap: Capability, clientId: string) {
  const scope = authorize(actor, cap);
  const n = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere(actor, scope)] } });
  if (n === 0) {
    const exists = await db().client.count({ where: { id: clientId } });
    throw exists ? forbidden() : notFound("Client");
  }
  return scope;
}

export async function assertEngagementAccess(actor: Actor, cap: Capability, engagementId: string) {
  const scope = authorize(actor, cap);
  const n = await db().engagement.count({ where: { AND: [{ id: engagementId }, engagementWhere(actor, scope)] } });
  if (n === 0) {
    const exists = await db().engagement.count({ where: { id: engagementId } });
    throw exists ? forbidden() : notFound("Engagement");
  }
  return scope;
}

export async function assertUserAccess(actor: Actor, cap: Capability, userId: string) {
  const scope = authorize(actor, cap);
  const n = await db().user.count({ where: { AND: [{ id: userId }, userWhere(actor, scope)] } });
  if (n === 0) {
    const exists = await db().user.count({ where: { id: userId } });
    throw exists ? forbidden() : notFound("User");
  }
  return scope;
}
