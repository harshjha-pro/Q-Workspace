import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import { assertUserAccess, userWhere } from "../../permissions/scopes";
import type { Actor, StaffActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { revokeAllUserSessions } from "../auth/sessions";
import { newTotpSecret, totpQrDataUrl, verifyTotp } from "../auth/totp";
import { encrypt, decrypt, randomToken } from "../../lib/crypto";
import { LOCATIONS, zStaffRole, type Role } from "../../domain/enums";
import { toSearch } from "../../lib/codes";
import { todayIst } from "../../lib/dates";

/** Roles only a Partner may grant: they control money, people or the firm's configuration. */
const PARTNER_ONLY_ROLES: Role[] = ["PARTNER", "PRACTICE_ADMIN", "HR_ADMIN"];

const userInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "3–40 letters, numbers, dot, dash or underscore"),
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
  mobile: z.string().trim().regex(/^[6-9][0-9]{9}$/, "10-digit Indian mobile").optional().nullable().or(z.literal("").transform(() => null)),
  role: zStaffRole,
  isSenior: z.boolean().default(false),
  designationId: z.string().optional().nullable(),
  reportingManagerId: z.string().optional().nullable(),
  defaultLocation: z.enum(LOCATIONS).default("OFFICE"),
  locationChangeable: z.boolean().default(true),
});
export type UserInput = z.input<typeof userInput>;

function assertRoleGrant(actor: StaffActor | Actor, role: Role) {
  if (PARTNER_ONLY_ROLES.includes(role) && actor.role !== "PARTNER" && actor.kind !== "SYSTEM") {
    throw forbidden("Only a Partner can assign the Partner, Practice Admin or HR Admin role.");
  }
}

export async function listUsers(actor: Actor, opts: { q?: string; includeInactive?: boolean } = {}) {
  const scope = can(actor, "users.manage") ? authorize(actor, "users.manage") : authorize(actor, "hr.records.view");
  return db().user.findMany({
    where: {
      AND: [
        userWhere(actor, scope),
        opts.includeInactive ? {} : { active: true },
        opts.q ? { searchName: { contains: opts.q.toLowerCase() } } : {},
      ],
    },
    select: {
      id: true, username: true, displayName: true, email: true, mobile: true, role: true, isSenior: true, active: true,
      totpEnabled: true, lastLoginAt: true, defaultLocation: true, locationChangeable: true,
      designation: { select: { name: true } }, reportingManager: { select: { id: true, displayName: true } },
    },
    orderBy: [{ active: "desc" }, { displayName: "asc" }],
  });
}

/** Lightweight list for pickers (assignees, managers). Never includes sensitive fields. */
export async function listUserOptions(actor: Actor, roles?: Role[]) {
  if (actor.kind === "PORTAL") throw forbidden();
  return db().user.findMany({
    where: { active: true, isSystem: false, ...(roles ? { role: { in: roles } } : {}) },
    select: { id: true, displayName: true, role: true, isSenior: true },
    orderBy: { displayName: "asc" },
  });
}

export async function getUser(actor: Actor, userId: string) {
  const scope = can(actor, "users.manage") ? authorize(actor, "users.manage") : authorize(actor, "hr.records.view");
  const user = await db().user.findFirst({
    where: { AND: [{ id: userId }, userWhere(actor, scope)] },
    include: {
      designation: true,
      reportingManager: { select: { id: true, displayName: true } },
      teamMemberships: { where: { toDate: null }, include: { team: true } },
    },
  });
  if (!user) throw notFound("User");
  const { passwordHash: _p, totpSecretEnc: _t, ...safe } = user;
  return safe;
}

/** Create a login. Returns a one-time temporary password the admin passes on; it must be changed at first login. */
export async function createUser(actor: Actor, input: UserInput) {
  authorize(actor, "users.manage");
  const data = parse(userInput, input);
  assertRoleGrant(actor, data.role);
  if (data.role === "ARTICLE" && data.isSenior) throw ruleViolation("Article Assistants cannot be Seniors (never final checkers).");
  const tempPassword = `Tmp-${randomToken(6)}9`;
  return transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { username: data.username } })) {
      throw new DomainError("CONFLICT", "That username is taken.", { username: "Already in use" });
    }
    const user = await tx.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        searchName: toSearch(data.displayName, data.username),
        createdById: actorId(actor),
        updatedById: actorId(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "User", entityId: user.id, action: "CREATE", after: { ...data } });
    return { user, tempPassword };
  });
}

export async function updateUser(actor: Actor, userId: string, input: Partial<UserInput>) {
  authorize(actor, "users.manage");
  const data = parsePartial(userInput.omit({ username: true }), input);
  return transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before || before.isSystem) throw notFound("User");
    if (data.role && data.role !== before.role) {
      assertRoleGrant(actor, data.role);
      assertRoleGrant(actor, before.role as Role);
    }
    const role = (data.role ?? before.role) as Role;
    if (role === "ARTICLE" && (data.isSenior ?? before.isSenior)) throw ruleViolation("Article Assistants cannot be Seniors.");
    if (data.reportingManagerId === userId) throw ruleViolation("A person cannot report to themselves.");
    const after = await tx.user.update({
      where: { id: userId },
      data: { ...data, searchName: toSearch(data.displayName ?? before.displayName, before.username), updatedById: actorId(actor) },
    });
    // A role change can widen or narrow access, so end existing sessions.
    if (data.role && data.role !== before.role) {
      await tx.user.update({ where: { id: userId }, data: { sessionEpoch: { increment: 1 } } });
      await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "ROLE_CHANGED" } });
    }
    await writeAudit(tx, actor, { entityType: "User", entityId: userId, action: "UPDATE", before, after });
    return after;
  });
}

export async function adminResetPassword(actor: Actor, userId: string) {
  authorize(actor, "users.manage");
  const target = await db().user.findUnique({ where: { id: userId } });
  if (!target || target.isSystem) throw notFound("User");
  assertRoleGrant(actor, target.role as Role);
  const tempPassword = `Tmp-${randomToken(6)}9`;
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedById: actorId(actor) },
    });
    await writeAudit(tx, actor, { entityType: "User", entityId: userId, action: "PASSWORD_RESET" });
  });
  await revokeAllUserSessions(userId, "PASSWORD_RESET");
  return { tempPassword };
}

/** Clears a lost authenticator so the person can enrol again at next login. */
export async function adminResetTotp(actor: Actor, userId: string) {
  authorize(actor, "users.manage");
  const target = await db().user.findUnique({ where: { id: userId } });
  if (!target || target.isSystem) throw notFound("User");
  assertRoleGrant(actor, target.role as Role);
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, totpEnrolledAt: null } });
    await writeAudit(tx, actor, { entityType: "User", entityId: userId, action: "TOTP_RESET" });
  });
  await revokeAllUserSessions(userId, "TOTP_RESET");
}

// ---------------------------------------------------------------------------
// Self-service security
// ---------------------------------------------------------------------------

export async function changeOwnPassword(actor: StaffActor, current: string, next: string) {
  const user = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new DomainError("VALIDATION", "Current password is wrong.", { current: "Wrong password" });
  }
  const problem = passwordProblem(next);
  if (problem) throw new DomainError("VALIDATION", problem, { next: problem });
  if (await verifyPassword(next, user.passwordHash)) throw new DomainError("VALIDATION", "Choose a new password.", { next: "Same as current" });
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
    await writeAudit(tx, actor, { entityType: "User", entityId: user.id, action: "PASSWORD_CHANGED" });
  });
}

/** Step 1 of enrolment: store a pending secret and return the QR. Not active until confirmed. */
export async function beginTotpEnrolment(actor: StaffActor) {
  const user = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (user.totpEnabled) throw ruleViolation("Two-factor login is already set up. Ask an admin to reset it if you lost your phone.");
  const secret = newTotpSecret();
  await db().user.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret, "VAULT") } });
  return { qrDataUrl: await totpQrDataUrl(secret, user.username), secret };
}

/** Step 2: confirm with a code from the app; only then is 2FA switched on. */
export async function confirmTotpEnrolment(actor: StaffActor, code: string) {
  const user = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!user.totpSecretEnc) throw ruleViolation("Start the set-up first.");
  if (!(await verifyTotp(decrypt(user.totpSecretEnc, "VAULT"), code))) {
    throw new DomainError("VALIDATION", "That code did not match. Check the time on your phone and try again.", { code: "Wrong code" });
  }
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpEnrolledAt: new Date() } });
    await writeAudit(tx, actor, { entityType: "User", entityId: user.id, action: "TOTP_ENROLLED" });
  });
}

// ---------------------------------------------------------------------------
// Offboarding (spec 3.9, 11.1; P1-15)
// ---------------------------------------------------------------------------

export type CustodyReport = {
  dscs: { id: string; holderName: string; expiryDate: string }[];
  documents: { id: string; documentDesc: string; clientId: string }[];
  assets: { id: string; tag: string; kind: string }[];
  openTasks: { id: string; title: string; effectiveDueDate: string | null }[];
  activeEngagements: { id: string; name: string; code: string }[];
};

export async function custodyReport(actor: Actor, userId: string): Promise<CustodyReport> {
  await assertUserAccess(actor, "users.manage", userId);
  const [dscs, documents, assets, openTasks, activeEngagements] = await Promise.all([
    db().dSC.findMany({ where: { custodianUserId: userId, custody: "STAFF", active: true }, select: { id: true, holderName: true, expiryDate: true } }),
    db().inwardOutward.findMany({ where: { custodianUserId: userId, returnedAt: null }, select: { id: true, documentDesc: true, clientId: true } }),
    db().assetAssignment
      .findMany({ where: { userId, returnedAt: null }, include: { asset: true } })
      .then((rows) => rows.map((r) => ({ id: r.asset.id, tag: r.asset.tag, kind: r.asset.kind }))),
    db().task.findMany({
      where: { assignments: { some: { userId, toDate: null } }, status: { notIn: ["FILED", "FILED_LATE", "NOT_APPLICABLE"] } },
      select: { id: true, title: true, effectiveDueDate: true },
    }),
    db().engagement.findMany({
      where: { assignments: { some: { userId, toDate: null } }, status: "ACTIVE" },
      select: { id: true, name: true, code: true },
    }),
  ]);
  return { dscs, documents, assets, openTasks, activeEngagements };
}

/**
 * Deactivate a person. Access is revoked at once (sessions, team memberships, vault grants,
 * portal threads); history stays attributed; custody items are returned in the report so the
 * admin can chase DSCs, documents and assets.
 */
export async function deactivateUser(actor: Actor, userId: string, reason: string) {
  authorize(actor, "users.manage");
  if (actor.kind === "USER" && actor.userId === userId) throw ruleViolation("You cannot deactivate yourself.");
  const target = await db().user.findUnique({ where: { id: userId } });
  if (!target || target.isSystem) throw notFound("User");
  if (!target.active) throw ruleViolation("Already inactive.");
  assertRoleGrant(actor, target.role as Role);
  if (target.role === "PARTNER") {
    const partners = await db().user.count({ where: { role: "PARTNER", active: true } });
    if (partners <= 1) throw ruleViolation("The last active Partner cannot be deactivated.");
  }
  const today = todayIst();
  const now = new Date();
  await transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { active: false, deactivatedAt: now, deactivatedById: actorId(actor), sessionEpoch: { increment: 1 } },
    });
    await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revokeReason: "DEACTIVATED" } });
    await tx.clientTeamMember.updateMany({ where: { userId, toDate: null }, data: { toDate: today } });
    await tx.credentialGrant.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revokedReason: "OFFBOARDED" } });
    await tx.messageThreadParticipant.updateMany({ where: { userId, removedAt: null }, data: { removedAt: now } });
    await writeAudit(tx, actor, { entityType: "User", entityId: userId, action: "DEACTIVATE", reason, before: { active: true }, after: { active: false } });
  });
  return custodyReport(actor, userId);
}

export async function reactivateUser(actor: Actor, userId: string) {
  authorize(actor, "users.manage");
  const target = await db().user.findUnique({ where: { id: userId } });
  if (!target || target.isSystem) throw notFound("User");
  assertRoleGrant(actor, target.role as Role);
  await transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active: true, deactivatedAt: null, deactivatedById: null, mustChangePassword: true } });
    await writeAudit(tx, actor, { entityType: "User", entityId: userId, action: "REACTIVATE" });
  });
}

function actorId(actor: Actor): string | null {
  return actor.kind === "PORTAL" ? null : actor.userId;
}
