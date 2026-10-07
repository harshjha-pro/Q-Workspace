import { db } from "../../lib/db";
import { verifyPassword } from "./password";
import { verifyTotp } from "./totp";
import { decrypt } from "../../lib/crypto";
import { createSession } from "./sessions";
import { getSettingNumber } from "../settings/service";
import { writeAudit } from "../../audit";

export type LoginResult =
  | { status: "OK"; sessionId: string; userId: string }
  | { status: "NEED_TOTP" }
  | { status: "INVALID" }
  | { status: "LOCKED"; until: Date };

/**
 * Staff login: username + password, then TOTP if the user has enrolled.
 * Generic "INVALID" for unknown user / wrong password so usernames are not revealed.
 */
export async function staffLogin(
  input: { username: string; password: string; totp?: string },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<LoginResult> {
  const username = input.username.trim().toLowerCase();
  const user = await db().user.findUnique({ where: { username } });
  const record = (success: boolean, reason: string) =>
    db().loginAttempt.create({ data: { username, realm: "STAFF", success, reason, ip: meta.ip ?? null } });

  if (!user || !user.active || user.isSystem) {
    await record(false, "UNKNOWN_OR_INACTIVE");
    return { status: "INVALID" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await record(false, "LOCKED");
    return { status: "LOCKED", until: user.lockedUntil };
  }
  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    await registerFailure(user.id, user.failedLogins);
    await record(false, "BAD_PASSWORD");
    return { status: "INVALID" };
  }
  if (user.totpEnabled && user.totpSecretEnc) {
    if (!input.totp) return { status: "NEED_TOTP" };
    const ok = await verifyTotp(decrypt(user.totpSecretEnc, "VAULT"), input.totp);
    if (!ok) {
      await registerFailure(user.id, user.failedLogins);
      await record(false, "BAD_TOTP");
      return { status: "INVALID" };
    }
  }
  await db().user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const session = await createSession({ userId: user.id }, meta);
  await record(true, "OK");
  await db().$transaction((tx) =>
    writeAudit(
      tx,
      { kind: "USER", userId: user.id, role: user.role as never, isSenior: user.isSenior, displayName: user.displayName, ip: meta.ip },
      { entityType: "User", entityId: user.id, action: "LOGIN" },
    ),
  );
  return { status: "OK", sessionId: session.id, userId: user.id };
}

async function registerFailure(userId: string, previousFailures: number) {
  const max = await getSettingNumber("login.maxFailures", 5);
  const lockMinutes = await getSettingNumber("login.lockMinutes", 15);
  const failures = previousFailures + 1;
  await db().user.update({
    where: { id: userId },
    data: { failedLogins: failures, lockedUntil: failures >= max ? new Date(Date.now() + lockMinutes * 60_000) : null },
  });
}

export type PortalLoginResult =
  | { status: "OK"; sessionId: string; portalUserId: string }
  | { status: "NEED_TOTP" }
  | { status: "INVALID" }
  | { status: "LOCKED"; until: Date };

/**
 * Portal login (P4-02): email + password, then TOTP when the user has enrolled. Same lockout settings and the
 * same generic "INVALID" as staff; attempts are recorded with realm PORTAL and each login is audited.
 */
export async function portalLogin(
  input: { email: string; password: string; totp?: string },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<PortalLoginResult> {
  const email = input.email.trim().toLowerCase();
  const user = await db().portalUser.findUnique({ where: { email }, include: { clients: true } });
  const record = (success: boolean, reason: string) =>
    db().loginAttempt.create({ data: { username: email, realm: "PORTAL", success, reason, ip: meta.ip ?? null } });

  if (!user || !user.active || !user.passwordHash || !user.clients.length) {
    await record(false, "UNKNOWN_OR_INACTIVE");
    return { status: "INVALID" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await record(false, "LOCKED");
    return { status: "LOCKED", until: user.lockedUntil };
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await registerPortalFailure(user.id, user.failedLogins);
    await record(false, "BAD_PASSWORD");
    return { status: "INVALID" };
  }
  if (user.totpEnabled && user.totpSecretEnc) {
    if (!input.totp) return { status: "NEED_TOTP" };
    if (!(await verifyTotp(decrypt(user.totpSecretEnc, "VAULT"), input.totp))) {
      await registerPortalFailure(user.id, user.failedLogins);
      await record(false, "BAD_TOTP");
      return { status: "INVALID" };
    }
  }
  await db().portalUser.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const session = await createSession({ portalUserId: user.id }, meta);
  await record(true, "OK");
  await db().$transaction((tx) =>
    writeAudit(
      tx,
      { kind: "PORTAL", portalUserId: user.id, role: "PORTAL", clientIds: user.clients.map((c) => c.clientId), displayName: user.name, ip: meta.ip },
      { entityType: "PortalUser", entityId: user.id, action: "LOGIN" },
    ),
  );
  return { status: "OK", sessionId: session.id, portalUserId: user.id };
}

async function registerPortalFailure(portalUserId: string, previousFailures: number) {
  const max = await getSettingNumber("login.maxFailures", 5);
  const lockMinutes = await getSettingNumber("login.lockMinutes", 15);
  const failures = previousFailures + 1;
  await db().portalUser.update({
    where: { id: portalUserId },
    data: { failedLogins: failures, lockedUntil: failures >= max ? new Date(Date.now() + lockMinutes * 60_000) : null },
  });
}
