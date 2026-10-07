import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor, PortalActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { encrypt, decrypt } from "../../lib/crypto";
import { getSetting, getSettingNumber } from "../settings/service";
import { hashPassword, passwordProblem } from "../auth/password";
import { newTotpSecret, totpQrDataUrl, verifyTotp } from "../auth/totp";

/**
 * Client portal accounts (spec 12, P4-02). There is no email or SMS service, so access starts from an
 * admin-generated invite link that the firm sends itself (D-78):
 * - the link carries a random one-time token; only its SHA-256 is stored, it expires after
 *   `portal.inviteDays`, and a newer link revokes older unused ones;
 * - opening it sets the password, so the same link doubles as a password reset and signs out other sessions;
 * - one portal user (keyed by email) can be linked to several clients — a group's accountant sees each.
 */
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

const nameOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

function assertAccountsAdmin(actor: Actor) {
  authorize(actor, "portal.accounts.manage");
}

const inviteInput = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(2, "Enter the person's name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  mobile: z.preprocess((v) => (v === "" ? null : v), z.string().trim().regex(/^[0-9+\- ]{8,16}$/, "Enter a valid mobile").nullable().optional()),
  contactId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
});
export type PortalInviteInput = z.input<typeof inviteInput>;

async function portalClient(clientId: string) {
  const c = await db().client.findUnique({ where: { id: clientId } });
  if (!c) throw notFound("Client");
  if (c.isFirm) throw ruleViolation("The firm's own record has no client portal.");
  if (c.status === "DISCONTINUED_CLOSED") throw ruleViolation("This client is closed.");
  return c;
}

/** Create (or reuse, by email) a portal user, link them to the client and return a fresh one-time link token. */
export async function invitePortalUser(actor: Actor, input: PortalInviteInput) {
  assertAccountsAdmin(actor);
  const d = parse(inviteInput, input);
  const client = await portalClient(d.clientId);
  if (d.contactId && !(await db().contact.findFirst({ where: { id: d.contactId, clientId: client.id } })))
    throw new DomainError("VALIDATION", "That contact is not on this client.", { contactId: "Choose a contact of this client" });
  const existing = await db().portalUser.findUnique({ where: { email: d.email } });
  if (existing && !existing.active) throw ruleViolation("This portal user is deactivated. Reactivate them first.");
  const days = await getSettingNumber("portal.inviteDays", 7);
  return transaction(async (tx) => {
    const user =
      existing ??
      (await tx.portalUser.create({ data: { name: d.name, email: d.email, mobile: d.mobile ?? null, contactId: d.contactId ?? null, createdById: nameOf(actor), updatedById: nameOf(actor) } }));
    if (!existing) await writeAudit(tx, actor, { entityType: "PortalUser", entityId: user.id, action: "CREATE", after: user });
    const link = await tx.portalUserClient.findUnique({ where: { portalUserId_clientId: { portalUserId: user.id, clientId: client.id } } });
    if (!link) {
      const row = await tx.portalUserClient.create({ data: { portalUserId: user.id, clientId: client.id, createdById: nameOf(actor), updatedById: nameOf(actor) } });
      await writeAudit(tx, actor, { entityType: "PortalUserClient", entityId: row.id, action: "CREATE", after: row, reason: `Portal access to ${client.name}` });
    }
    if (!client.portalEnabled) {
      await tx.client.update({ where: { id: client.id }, data: { portalEnabled: true, updatedById: nameOf(actor) } });
      await writeAudit(tx, actor, { entityType: "Client", entityId: client.id, action: "UPDATE", before: { portalEnabled: false }, after: { portalEnabled: true } });
    }
    const token = await issueInvite(tx, actor, user.id, days);
    return { portalUserId: user.id, token, reusedExisting: !!existing };
  });
}

/** A new link for an existing user: first login, lost password, or an expired link. */
export async function regeneratePortalInvite(actor: Actor, portalUserId: string) {
  assertAccountsAdmin(actor);
  const user = await db().portalUser.findUnique({ where: { id: portalUserId } });
  if (!user) throw notFound("Portal user");
  if (!user.active) throw ruleViolation("This portal user is deactivated.");
  const days = await getSettingNumber("portal.inviteDays", 7);
  return transaction((tx) => issueInvite(tx, actor, user.id, days));
}

/** `days` is read by the caller before the transaction: a db() read inside it would wait on the held connection. */
async function issueInvite(tx: Parameters<Parameters<typeof transaction>[0]>[0], actor: Actor, portalUserId: string, days: number) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await tx.portalInvite.updateMany({ where: { portalUserId, usedAt: null, revokedAt: null }, data: { revokedAt: now, updatedById: nameOf(actor) } });
  const invite = await tx.portalInvite.create({
    data: { portalUserId, tokenHash: hashInviteToken(token), expiresAt: new Date(now.getTime() + days * 86_400_000), createdById: nameOf(actor), updatedById: nameOf(actor) },
  });
  await writeAudit(tx, actor, { entityType: "PortalInvite", entityId: invite.id, action: "CREATE", after: { portalUserId, expiresAt: invite.expiresAt.toISOString() } });
  return token;
}

/** Give an existing portal user access to one more client of the same group. */
export async function linkPortalUserClient(actor: Actor, portalUserId: string, clientId: string) {
  assertAccountsAdmin(actor);
  const user = await db().portalUser.findUnique({ where: { id: portalUserId } });
  if (!user) throw notFound("Portal user");
  const client = await portalClient(clientId);
  return transaction(async (tx) => {
    const found = await tx.portalUserClient.findUnique({ where: { portalUserId_clientId: { portalUserId, clientId } } });
    if (found) return found;
    const row = await tx.portalUserClient.create({ data: { portalUserId, clientId, createdById: nameOf(actor), updatedById: nameOf(actor) } });
    if (!client.portalEnabled) await tx.client.update({ where: { id: clientId }, data: { portalEnabled: true, updatedById: nameOf(actor) } });
    await writeAudit(tx, actor, { entityType: "PortalUserClient", entityId: row.id, action: "CREATE", after: row, reason: `Portal access to ${client.name}` });
    return row;
  });
}

/** Remove one client from a portal user; takes effect on their next request (sessions re-read the links). */
export async function unlinkPortalUserClient(actor: Actor, portalUserId: string, clientId: string, reason: string) {
  assertAccountsAdmin(actor);
  if (reason.trim().length < 3) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  const row = await db().portalUserClient.findUnique({ where: { portalUserId_clientId: { portalUserId, clientId } } });
  if (!row) throw notFound("Portal access");
  return transaction(async (tx) => {
    await tx.portalUserClient.delete({ where: { id: row.id } });
    await writeAudit(tx, actor, { entityType: "PortalUserClient", entityId: row.id, action: "DELETE", before: row, reason });
    const left = await tx.portalUserClient.count({ where: { portalUserId } });
    if (!left) await deactivateTx(tx, actor, portalUserId, "No clients left");
  });
}

async function deactivateTx(tx: Parameters<Parameters<typeof transaction>[0]>[0], actor: Actor, portalUserId: string, reason: string) {
  const now = new Date();
  await tx.portalUser.update({ where: { id: portalUserId }, data: { active: false, sessionEpoch: { increment: 1 }, updatedById: nameOf(actor) } });
  await tx.userSession.updateMany({ where: { portalUserId, revokedAt: null }, data: { revokedAt: now, revokeReason: "DEACTIVATED" } });
  await tx.portalInvite.updateMany({ where: { portalUserId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
  await writeAudit(tx, actor, { entityType: "PortalUser", entityId: portalUserId, action: "DEACTIVATE", before: { active: true }, after: { active: false }, reason });
}

/** Deactivating signs the user out everywhere and voids open links at once. */
export async function setPortalUserActive(actor: Actor, portalUserId: string, active: boolean, reason: string) {
  assertAccountsAdmin(actor);
  const user = await db().portalUser.findUnique({ where: { id: portalUserId } });
  if (!user) throw notFound("Portal user");
  if (user.active === active) return user;
  if (!active && reason.trim().length < 3) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  await transaction(async (tx) => {
    if (!active) return deactivateTx(tx, actor, portalUserId, reason);
    await tx.portalUser.update({ where: { id: portalUserId }, data: { active: true, failedLogins: 0, lockedUntil: null, updatedById: nameOf(actor) } });
    await writeAudit(tx, actor, { entityType: "PortalUser", entityId: portalUserId, action: "REACTIVATE", before: { active: false }, after: { active: true }, reason });
  });
  return db().portalUser.findUniqueOrThrow({ where: { id: portalUserId } });
}

/** Clears a portal user's TOTP (lost phone); they enrol again on next login if the firm requires it. */
export async function resetPortalTotp(actor: Actor, portalUserId: string) {
  assertAccountsAdmin(actor);
  const user = await db().portalUser.findUnique({ where: { id: portalUserId } });
  if (!user) throw notFound("Portal user");
  await transaction(async (tx) => {
    await tx.portalUser.update({ where: { id: portalUserId }, data: { totpEnabled: false, totpSecretEnc: null, updatedById: nameOf(actor) } });
    await writeAudit(tx, actor, { entityType: "PortalUser", entityId: portalUserId, action: "TOTP_RESET" });
  });
}

/** Portal users, optionally for one client, with their link status. Never returns hashes or secrets. */
export async function listPortalUsers(actor: Actor, opts: { clientId?: string } = {}) {
  assertAccountsAdmin(actor);
  const users = await db().portalUser.findMany({
    where: opts.clientId ? { clients: { some: { clientId: opts.clientId } } } : {},
    include: { clients: true, invites: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { name: "asc" },
  });
  const clientIds = [...new Set(users.flatMap((u) => u.clients.map((c) => c.clientId)))];
  const clients = new Map((await db().client.findMany({ where: { id: { in: clientIds } }, select: { id: true, code: true, name: true } })).map((c) => [c.id, c]));
  const now = new Date();
  return users.map((u) => {
    const inv = u.invites[0];
    const linkStatus: "NONE" | "USED" | "REVOKED" | "EXPIRED" | "OPEN" = !inv ? "NONE" : inv.usedAt ? "USED" : inv.revokedAt ? "REVOKED" : inv.expiresAt <= now ? "EXPIRED" : "OPEN";
    return {
      id: u.id, name: u.name, email: u.email, mobile: u.mobile, active: u.active, totpEnabled: u.totpEnabled, hasPassword: !!u.passwordHash,
      lastLoginAt: u.lastLoginAt, lockedUntil: u.lockedUntil && u.lockedUntil > now ? u.lockedUntil : null,
      clients: u.clients.map((c) => clients.get(c.clientId)).filter((c): c is NonNullable<typeof c> => !!c),
      linkStatus, linkExpiresAt: inv && linkStatus === "OPEN" ? inv.expiresAt : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------
// The invite link itself (no session yet)
// ---------------------------------------------------------------------------------------------------------

async function openInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const inv = await db().portalInvite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { portalUser: true } });
  if (!inv || inv.usedAt || inv.revokedAt || inv.expiresAt <= new Date() || !inv.portalUser.active) return null;
  return inv;
}

/** What the invite page shows. Null for an unknown, used, revoked or expired link (one message for all). */
export async function inviteInfo(token: string) {
  const inv = await openInvite(token);
  return inv ? { name: inv.portalUser.name, email: inv.portalUser.email, firstTime: !inv.portalUser.passwordHash } : null;
}

/** Sets the password from a valid link, uses the link up and signs the user out of other sessions. */
export async function acceptPortalInvite(token: string, password: string, confirm: string) {
  const inv = await openInvite(token);
  if (!inv) throw ruleViolation("This link is no longer valid. Ask the firm for a new one.");
  if (password !== confirm) throw new DomainError("VALIDATION", "The two passwords do not match.", { confirm: "Does not match" });
  const problem = passwordProblem(password);
  if (problem) throw new DomainError("VALIDATION", problem, { password: problem });
  const hash = await hashPassword(password);
  const actor: PortalActor = { kind: "PORTAL", portalUserId: inv.portalUserId, role: "PORTAL", clientIds: [], displayName: inv.portalUser.name };
  await transaction(async (tx) => {
    // Conditional update: two tabs racing on one link — only the first wins.
    const used = await tx.portalInvite.updateMany({ where: { id: inv.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) throw ruleViolation("This link is no longer valid. Ask the firm for a new one.");
    await tx.portalUser.update({ where: { id: inv.portalUserId }, data: { passwordHash: hash, failedLogins: 0, lockedUntil: null, sessionEpoch: { increment: 1 } } });
    await tx.userSession.updateMany({ where: { portalUserId: inv.portalUserId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "PASSWORD_SET" } });
    await writeAudit(tx, actor, { entityType: "PortalUser", entityId: inv.portalUserId, action: inv.portalUser.passwordHash ? "PASSWORD_RESET" : "PASSWORD_SET" });
  });
  return { email: inv.portalUser.email };
}

// ---------------------------------------------------------------------------------------------------------
// The portal user's own two-factor set-up (Q-07: optional unless the firm makes it mandatory)
// ---------------------------------------------------------------------------------------------------------

export async function portalTotpMandatory() {
  return (await getSetting<boolean>("portal.totpMandatory", false)) === true;
}

export async function beginPortalTotp(actor: PortalActor) {
  const user = await db().portalUser.findUniqueOrThrow({ where: { id: actor.portalUserId } });
  if (user.totpEnabled) throw ruleViolation("Two-factor login is already on.");
  const secret = newTotpSecret();
  await db().portalUser.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret, "VAULT") } });
  return { qrDataUrl: await totpQrDataUrl(secret, user.email, "QEPEX Client Portal"), secret };
}

export async function confirmPortalTotp(actor: PortalActor, code: string) {
  const user = await db().portalUser.findUniqueOrThrow({ where: { id: actor.portalUserId } });
  if (user.totpEnabled) return;
  if (!user.totpSecretEnc) throw ruleViolation("Start the set-up first.");
  if (!(await verifyTotp(decrypt(user.totpSecretEnc, "VAULT"), code))) throw new DomainError("VALIDATION", "That code is not right. Try the current one.", { code: "Wrong code" });
  await transaction(async (tx) => {
    await tx.portalUser.update({ where: { id: user.id }, data: { totpEnabled: true } });
    await writeAudit(tx, actor, { entityType: "PortalUser", entityId: user.id, action: "TOTP_ENABLED" });
  });
}

/** Turning it off needs a current code, and is not allowed while the firm requires it. */
export async function disablePortalTotp(actor: PortalActor, code: string) {
  if (await portalTotpMandatory()) throw forbidden("The firm requires two-factor login for the portal.");
  const user = await db().portalUser.findUniqueOrThrow({ where: { id: actor.portalUserId } });
  if (!user.totpEnabled || !user.totpSecretEnc) return;
  if (!(await verifyTotp(decrypt(user.totpSecretEnc, "VAULT"), code))) throw new DomainError("VALIDATION", "That code is not right.", { code: "Wrong code" });
  await transaction(async (tx) => {
    await tx.portalUser.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEnc: null } });
    await writeAudit(tx, actor, { entityType: "PortalUser", entityId: user.id, action: "TOTP_DISABLED" });
  });
}

export async function portalAccount(actor: PortalActor) {
  const u = await db().portalUser.findUniqueOrThrow({ where: { id: actor.portalUserId } });
  return { name: u.name, email: u.email, mobile: u.mobile, totpEnabled: u.totpEnabled, mandatory: await portalTotpMandatory(), lastLoginAt: u.lastLoginAt };
}

/** Clients a portal user can be invited to (everything but the firm's own record and closed clients). */
export async function portalInviteClients(actor: Actor) {
  assertAccountsAdmin(actor);
  return db().client.findMany({ where: { isFirm: false, status: { not: "DISCONTINUED_CLOSED" } }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
}
