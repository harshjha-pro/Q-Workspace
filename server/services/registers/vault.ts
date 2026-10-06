import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, scopeOf } from "../../permissions/guards";
import { assertClientAccess, clientWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { encrypt, decrypt, encryptOpt } from "../../lib/crypto";
import { diffDays, todayIst } from "../../lib/dates";
import { getSettingNumber } from "../settings/service";
import { idOf } from "./common";

export const PORTALS = ["INCOME_TAX", "GST", "TRACES", "MCA", "EPFO", "ESIC", "PT", "OTHER"] as const;
const credInput = z.object({
  clientId: z.string().min(1),
  portal: z.enum(PORTALS),
  label: z.string().trim().default(""),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  extra: z.string().optional(),
  changePeriodically: z.boolean().default(false),
  lastChangedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/**
 * Who may open a credential (D-38, Q-06): Partners/PA firm-wide, Managers for their team's clients,
 * Staff and Articles only with an explicit live grant AND a current assignment on that client.
 */
async function mayView(actor: Actor, credential: { id: string; clientId: string }) {
  const scope = authorize(actor, "vault.view");
  if (actor.kind !== "USER") return scope === "firm";
  if (scope === "firm") return true;
  const inScope = await db().client.count({ where: { AND: [{ id: credential.clientId }, clientWhere(actor, scope === "granted" ? "assigned" : scope)] } });
  if (!inScope) return false;
  if (scope !== "granted") return true;
  const grant = await db().credentialGrant.count({ where: { userId: actor.userId, clientId: credential.clientId, revokedAt: null, OR: [{ credentialId: null }, { credentialId: credential.id }] } });
  return grant > 0;
}

export async function addCredential(actor: Actor, input: z.input<typeof credInput>) {
  const d = parse(credInput, input);
  await assertClientAccess(actor, "vault.manage", d.clientId);
  return transaction(async (tx) => {
    const c = await tx.credential.create({
      data: {
        clientId: d.clientId, portal: d.portal, label: d.label, usernameEnc: encrypt(d.username, "VAULT"), passwordEnc: encrypt(d.password, "VAULT"),
        extraEnc: encryptOpt(d.extra, "VAULT"), changePeriodically: d.changePeriodically, lastChangedOn: d.lastChangedOn ?? todayIst(), createdById: idOf(actor),
      },
    });
    // Never write secrets into the audit trail.
    await writeAudit(tx, actor, { entityType: "Credential", entityId: c.id, action: "CREATE", after: { clientId: d.clientId, portal: d.portal, label: d.label } });
    return { id: c.id };
  });
}

export async function changePassword(actor: Actor, id: string, password: string, username?: string) {
  const c = await db().credential.findUnique({ where: { id } });
  if (!c) throw notFound("Credential");
  await assertClientAccess(actor, "vault.manage", c.clientId);
  if (!password) throw new DomainError("VALIDATION", "Enter the new password.", { password: "Required" });
  await transaction(async (tx) => {
    await tx.credential.update({ where: { id }, data: { passwordEnc: encrypt(password, "VAULT"), ...(username ? { usernameEnc: encrypt(username, "VAULT") } : {}), lastChangedOn: todayIst(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Credential", entityId: id, action: "PASSWORD_CHANGED" });
  });
}

export async function deactivateCredential(actor: Actor, id: string) {
  const c = await db().credential.findUnique({ where: { id } });
  if (!c) throw notFound("Credential");
  await assertClientAccess(actor, "vault.manage", c.clientId);
  await transaction(async (tx) => {
    await tx.credential.update({ where: { id }, data: { active: false, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Credential", entityId: id, action: "DEACTIVATE" });
  });
}

/** List shows portal, label and change status only — never the secret (spec 6.4). */
export async function listCredentials(actor: Actor, clientId: string) {
  const all = await db().credential.findMany({ where: { clientId, active: true }, orderBy: { portal: "asc" } });
  const out = [];
  const days = await getSettingNumber("credentials.changeAfterDays", 90);
  for (const c of all) {
    if (!(await mayView(actor, c))) continue;
    out.push({ id: c.id, portal: c.portal, label: c.label, lastChangedOn: c.lastChangedOn, hasExtra: !!c.extraEnc, changeDue: c.changePeriodically && (!c.lastChangedOn || diffDays(c.lastChangedOn, todayIst()) > days) });
  }
  return out;
}

/** Reveal one field: decrypted on demand, every view logged with who, when and which field. */
export async function revealCredential(actor: Actor, id: string, field: "USERNAME" | "PASSWORD" | "EXTRA") {
  const c = await db().credential.findUnique({ where: { id } });
  if (!c || !c.active) throw notFound("Credential");
  if (!(await mayView(actor, c))) throw forbidden("You need a grant from the Partner or Manager to see this credential.");
  const value = field === "USERNAME" ? decrypt(c.usernameEnc, "VAULT") : field === "PASSWORD" ? decrypt(c.passwordEnc, "VAULT") : c.extraEnc ? decrypt(c.extraEnc, "VAULT") : "";
  await transaction(async (tx) => {
    await tx.credentialViewLog.create({ data: { credentialId: id, userId: idOf(actor) ?? "system", field, ip: actor.kind === "SYSTEM" ? null : actor.ip ?? null } });
    await logSensitiveView(actor, "CREDENTIAL", "Credential", id, field, tx);
  });
  return value;
}

/** Grants go only to people currently assigned to the client (Q-06). */
export async function grantAccess(actor: Actor, clientId: string, userId: string, credentialId?: string | null) {
  await assertClientAccess(actor, "vault.grant", clientId);
  if (actor.kind === "USER" && actor.userId === userId) throw ruleViolation("You cannot grant access to yourself.");
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user?.active) throw notFound("User");
  if (scopeOf({ kind: "USER", userId, role: user.role as never, isSenior: user.isSenior, displayName: user.displayName }, "vault.view") !== "granted") throw ruleViolation(`${user.displayName} already sees credentials through their role.`);
  const assigned = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere({ kind: "USER", userId, role: user.role as never, isSenior: user.isSenior, displayName: user.displayName }, "assigned")] } });
  if (!assigned) throw ruleViolation(`${user.displayName} is not assigned to this client.`);
  if (credentialId && !(await db().credential.count({ where: { id: credentialId, clientId } }))) throw notFound("Credential");
  const existing = await db().credentialGrant.findFirst({ where: { userId, clientId, credentialId: credentialId ?? null, revokedAt: null } });
  if (existing) return existing;
  return transaction(async (tx) => {
    const g = await tx.credentialGrant.create({ data: { userId, clientId, credentialId: credentialId ?? null, grantedById: idOf(actor) ?? "system", createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "CredentialGrant", entityId: g.id, action: "GRANT", after: { userId, clientId, credentialId } });
    return g;
  });
}

/** People who may receive a grant for this client: Staff/Articles currently assigned to it (Q-06). */
export async function grantCandidates(actor: Actor, clientId: string) {
  await assertClientAccess(actor, "vault.grant", clientId);
  const users = await db().user.findMany({ where: { active: true, role: { in: ["STAFF", "ARTICLE"] } }, select: { id: true, displayName: true, role: true, isSenior: true } });
  const out = [];
  for (const u of users) {
    const n = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere({ kind: "USER", userId: u.id, role: u.role as never, isSenior: u.isSenior, displayName: u.displayName }, "assigned")] } });
    if (n) out.push({ id: u.id, displayName: u.displayName, role: u.role });
  }
  return out;
}

export async function revokeGrant(actor: Actor, grantId: string, reason = "Revoked") {
  const g = await db().credentialGrant.findUnique({ where: { id: grantId } });
  if (!g || g.revokedAt) throw notFound("Grant");
  await assertClientAccess(actor, "vault.grant", g.clientId);
  await transaction(async (tx) => {
    await tx.credentialGrant.update({ where: { id: grantId }, data: { revokedAt: new Date(), revokedReason: reason } });
    await writeAudit(tx, actor, { entityType: "CredentialGrant", entityId: grantId, action: "REVOKE", reason });
  });
}

export async function grantsFor(actor: Actor, clientId: string) {
  await assertClientAccess(actor, "vault.grant", clientId);
  return db().credentialGrant.findMany({ where: { clientId, revokedAt: null }, orderBy: { grantedAt: "desc" } });
}

export async function viewLog(actor: Actor, credentialId: string) {
  const c = await db().credential.findUnique({ where: { id: credentialId } });
  if (!c) throw notFound("Credential");
  await assertClientAccess(actor, "vault.manage", c.clientId);
  return db().credentialViewLog.findMany({ where: { credentialId }, orderBy: { viewedAt: "desc" }, take: 200 });
}
