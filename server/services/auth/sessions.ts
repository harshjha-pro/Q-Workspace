import { db } from "../../lib/db";
import { getSettingNumber } from "../settings/service";
import type { Actor } from "../../permissions/actor";
import type { Role } from "../../domain/enums";
import { MANDATORY_2FA_ROLES } from "../../domain/enums";

const ABSOLUTE_HOURS_DEFAULT = 12;

export async function createSession(owner: { userId?: string; portalUserId?: string }, meta: { ip?: string; userAgent?: string } = {}) {
  const hours = await getSettingNumber("session.absoluteHours", ABSOLUTE_HOURS_DEFAULT);
  return db().userSession.create({
    data: {
      userId: owner.userId ?? null,
      portalUserId: owner.portalUserId ?? null,
      expiresAt: new Date(Date.now() + hours * 3600_000),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
}

export async function revokeSession(sessionId: string, reason = "LOGOUT") {
  await db().userSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}

/** Revoke every session of a user — used at offboarding and password reset. */
export async function revokeAllUserSessions(userId: string, reason: string) {
  await db().userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}

export type ResolvedSession = { actor: Actor; needsTotpEnrolment: boolean; mustChangePassword: boolean };

/**
 * Turn a session id into an actor. Checks, on every request: not revoked, not past the
 * absolute expiry, not idle longer than the idle timeout, and the user is still active.
 * This is what makes offboarding take effect immediately (decisions D-09).
 */
export async function resolveSession(sessionId: string, now = new Date()): Promise<ResolvedSession | null> {
  const s = await db().userSession.findUnique({ where: { id: sessionId }, include: { user: true, portalUser: { include: { clients: true } } } });
  if (!s || s.revokedAt || s.expiresAt <= now) return null;
  const idleMinutes = await getSettingNumber("session.idleMinutes", 30);
  if (now.getTime() - s.lastSeenAt.getTime() > idleMinutes * 60_000) {
    await revokeSession(s.id, "IDLE_TIMEOUT");
    return null;
  }
  // Throttle the "last seen" write to once a minute.
  if (now.getTime() - s.lastSeenAt.getTime() > 60_000) {
    await db().userSession.update({ where: { id: s.id }, data: { lastSeenAt: now } });
  }
  if (s.user) {
    if (!s.user.active) return null;
    const role = s.user.role as Exclude<Role, "PORTAL">;
    return {
      actor: { kind: "USER", userId: s.user.id, role, isSenior: s.user.isSenior, displayName: s.user.displayName, sessionId: s.id, ip: s.ip ?? undefined },
      needsTotpEnrolment: MANDATORY_2FA_ROLES.includes(role) && !s.user.totpEnabled,
      mustChangePassword: s.user.mustChangePassword,
    };
  }
  if (s.portalUser) {
    if (!s.portalUser.active) return null;
    return {
      actor: {
        kind: "PORTAL",
        portalUserId: s.portalUser.id,
        role: "PORTAL",
        clientIds: s.portalUser.clients.map((c) => c.clientId),
        displayName: s.portalUser.name,
        sessionId: s.id,
        ip: s.ip ?? undefined,
      },
      needsTotpEnrolment: false,
      mustChangePassword: false,
    };
  }
  return null;
}
