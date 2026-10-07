import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeClient } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { decrypt } from "@/server/lib/crypto";
import { currentTotp } from "@/server/services/auth/totp";
import { portalLogin, staffLogin } from "@/server/services/auth/login";
import { resolveSession } from "@/server/services/auth/sessions";
import {
  invitePortalUser, regeneratePortalInvite, inviteInfo, acceptPortalInvite, linkPortalUserClient, unlinkPortalUserClient,
  setPortalUserActive, resetPortalTotp, listPortalUsers, beginPortalTotp, confirmPortalTotp, disablePortalTotp, hashInviteToken,
} from "@/server/services/portal/accounts";
import { portalClients, assertPortalClient } from "@/server/services/portal/service";
import type { PortalActor } from "@/server/permissions/actor";

let w: Awaited<ReturnType<typeof buildWorld>>;
const PW = "Portal-pass-2026";

async function setSetting(key: string, value: unknown) {
  await db().setting.upsert({ where: { key }, create: { key, valueJson: JSON.stringify(value) }, update: { valueJson: JSON.stringify(value) } });
}
async function portalActorFor(sessionId: string): Promise<PortalActor> {
  const s = await resolveSession(sessionId);
  if (s?.actor.kind !== "PORTAL") throw new Error("not a portal session");
  return s.actor;
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});

describe("invite links (P4-02)", () => {
  let token: string;
  let portalUserId: string;

  it("only a Partner or the Practice Admin invites; the link token is stored only as a hash", async () => {
    for (const u of [w.m1, w.s1, w.hr, w.a1]) {
      await expect(invitePortalUser(actorOf(u), { clientId: w.c2.id, name: "Asha Rao", email: "asha@c2.example.com" })).rejects.toThrow(/access/);
    }
    await expect(invitePortalUser(w.portal, { clientId: w.c2.id, name: "Asha Rao", email: "asha@c2.example.com" })).rejects.toThrow(/access/);
    const r = await invitePortalUser(actorOf(w.pa), { clientId: w.c2.id, name: "Asha Rao", email: " Asha@C2.example.com ", mobile: "98290 12345" });
    token = r.token;
    portalUserId = r.portalUserId;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const inv = await db().portalInvite.findFirstOrThrow({ where: { portalUserId } });
    expect(inv.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(await db().portalInvite.findMany())).not.toContain(token);
    expect(JSON.stringify(await db().auditLog.findMany({ where: { entityType: { startsWith: "Portal" } } }))).not.toContain(token);
    // Expiry from the setting (7 days by default).
    const days = (inv.expiresAt.getTime() - inv.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    expect((await db().client.findUniqueOrThrow({ where: { id: w.c2.id } })).portalEnabled).toBe(true);
    expect(await inviteInfo(token)).toEqual({ name: "Asha Rao", email: "asha@c2.example.com", firstTime: true });
  });

  it("refuses the firm's own record and closed clients", async () => {
    const firm = await makeClient({ name: "The Firm" });
    await db().client.update({ where: { id: firm.id }, data: { isFirm: true } });
    await expect(invitePortalUser(actorOf(w.pa), { clientId: firm.id, name: "X Y", email: "x@firm.example.com" })).rejects.toThrow(/firm's own/);
    const closed = await makeClient();
    await db().client.update({ where: { id: closed.id }, data: { status: "DISCONTINUED_CLOSED" } });
    await expect(invitePortalUser(actorOf(w.pa), { clientId: closed.id, name: "X Y", email: "x@closed.example.com" })).rejects.toThrow(/closed/);
  });

  it("cannot sign in before setting a password; weak or mismatched passwords are refused", async () => {
    expect((await portalLogin({ email: "asha@c2.example.com", password: "anything-1" })).status).toBe("INVALID");
    await expect(acceptPortalInvite(token, "short1", "short1")).rejects.toThrow(/10 characters/);
    await expect(acceptPortalInvite(token, PW, PW + "x")).rejects.toThrow(/do not match/);
  });

  it("the link sets the password once; a second use and bad tokens fail with one message", async () => {
    await acceptPortalInvite(token, PW, PW);
    await expect(acceptPortalInvite(token, PW, PW)).rejects.toThrow(/no longer valid/);
    expect(await inviteInfo(token)).toBeNull();
    expect(await inviteInfo("not-a-real-token-at-all-xxxxxxxxxx")).toBeNull();
    expect(await inviteInfo("../../etc")).toBeNull();
  });

  it("an expired link and a replaced link stop working", async () => {
    const t1 = await regeneratePortalInvite(actorOf(w.partner), portalUserId);
    const t2 = await regeneratePortalInvite(actorOf(w.partner), portalUserId);
    expect(await inviteInfo(t1)).toBeNull(); // replaced by t2
    await db().portalInvite.updateMany({ where: { tokenHash: hashInviteToken(t2) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await inviteInfo(t2)).toBeNull();
    const rows = await listPortalUsers(actorOf(w.pa), { clientId: w.c2.id });
    expect(rows.map((r) => [r.email, r.linkStatus, r.hasPassword])).toEqual([["asha@c2.example.com", "EXPIRED", true]]);
    expect(JSON.stringify(rows)).not.toMatch(/passwordHash|totpSecret|tokenHash/);
  });

  it("logs in with email + password; the session is a PORTAL actor scoped to its clients; staff login does not accept it", async () => {
    const r = await portalLogin({ email: "ASHA@c2.example.com", password: PW }, { ip: "10.0.0.9" });
    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    const actor = await portalActorFor(r.sessionId);
    expect(actor.clientIds).toEqual([w.c2.id]);
    expect((await portalClients(actor)).map((c) => c.id)).toEqual([w.c2.id]);
    expect(() => assertPortalClient(actor, w.c1.id)).toThrow();
    expect((await staffLogin({ username: "asha@c2.example.com", password: PW })).status).toBe("INVALID");
    expect(await db().loginAttempt.count({ where: { realm: "PORTAL", username: "asha@c2.example.com", success: true } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityType: "PortalUser", entityId: actor.portalUserId, action: "LOGIN", actorType: "PORTAL" } })).toBe(1);
  });

  it("a new link resets the password and signs out existing sessions", async () => {
    const r = await portalLogin({ email: "asha@c2.example.com", password: PW });
    if (r.status !== "OK") throw new Error("login failed");
    const t = await regeneratePortalInvite(actorOf(w.pa), portalUserId);
    expect(await inviteInfo(t)).toMatchObject({ firstTime: false });
    await acceptPortalInvite(t, "New-pass-2027", "New-pass-2027");
    expect(await resolveSession(r.sessionId)).toBeNull();
    expect((await portalLogin({ email: "asha@c2.example.com", password: PW })).status).toBe("INVALID");
    expect((await portalLogin({ email: "asha@c2.example.com", password: "New-pass-2027" })).status).toBe("OK");
    await db().portalUser.update({ where: { id: portalUserId }, data: { failedLogins: 0 } });
  });

  it("locks after repeated failures, like staff", async () => {
    await setSetting("login.maxFailures", 3);
    for (let i = 0; i < 3; i++) await portalLogin({ email: "asha@c2.example.com", password: "wrong-pass-1" });
    expect((await portalLogin({ email: "asha@c2.example.com", password: "New-pass-2027" })).status).toBe("LOCKED");
    await db().portalUser.update({ where: { id: portalUserId }, data: { failedLogins: 0, lockedUntil: null } });
    await setSetting("login.maxFailures", 5);
  });
});

describe("group users and deactivation", () => {
  it("one email can hold several clients; each is linked once; the session sees the new client at once", async () => {
    const a = await invitePortalUser(actorOf(w.pa), { clientId: w.c1.id, name: "Group CFO", email: "cfo@group.example.com" });
    await acceptPortalInvite(a.token, PW, PW);
    const login = await portalLogin({ email: "cfo@group.example.com", password: PW });
    if (login.status !== "OK") throw new Error("login failed");
    const again = await invitePortalUser(actorOf(w.pa), { clientId: w.c2.id, name: "Ignored Name", email: "cfo@group.example.com" });
    expect(again).toMatchObject({ portalUserId: a.portalUserId, reusedExisting: true });
    await linkPortalUserClient(actorOf(w.pa), a.portalUserId, w.c2.id); // idempotent
    expect(await db().portalUserClient.count({ where: { portalUserId: a.portalUserId } })).toBe(2);
    expect((await portalActorFor(login.sessionId)).clientIds.sort()).toEqual([w.c1.id, w.c2.id].sort());

    await expect(unlinkPortalUserClient(actorOf(w.pa), a.portalUserId, w.c2.id, "")).rejects.toThrow(/reason/);
    await unlinkPortalUserClient(actorOf(w.pa), a.portalUserId, w.c2.id, "Entity sold");
    expect((await portalActorFor(login.sessionId)).clientIds).toEqual([w.c1.id]);
    // Removing the last client deactivates the user and ends the session.
    await unlinkPortalUserClient(actorOf(w.pa), a.portalUserId, w.c1.id, "Left the group");
    expect(await resolveSession(login.sessionId)).toBeNull();
    expect((await db().portalUser.findUniqueOrThrow({ where: { id: a.portalUserId } })).active).toBe(false);
  });

  it("deactivation signs out, voids open links and blocks login; reactivation restores login", async () => {
    const a = await invitePortalUser(actorOf(w.partner), { clientId: w.c1.id, name: "Kiran Mehta", email: "kiran@c1.example.com" });
    await acceptPortalInvite(a.token, PW, PW);
    const login = await portalLogin({ email: "kiran@c1.example.com", password: PW });
    if (login.status !== "OK") throw new Error("login failed");
    const open = await regeneratePortalInvite(actorOf(w.pa), a.portalUserId);
    await expect(setPortalUserActive(actorOf(w.m1), a.portalUserId, false, "Left")).rejects.toThrow(/access/);
    await setPortalUserActive(actorOf(w.pa), a.portalUserId, false, "Left the company");
    expect(await resolveSession(login.sessionId)).toBeNull();
    expect(await inviteInfo(open)).toBeNull();
    expect((await portalLogin({ email: "kiran@c1.example.com", password: PW })).status).toBe("INVALID");
    await expect(invitePortalUser(actorOf(w.pa), { clientId: w.c1.id, name: "Kiran", email: "kiran@c1.example.com" })).rejects.toThrow(/deactivated/);
    await setPortalUserActive(actorOf(w.pa), a.portalUserId, true, "Rejoined");
    expect((await portalLogin({ email: "kiran@c1.example.com", password: PW })).status).toBe("OK");
  });
});

describe("portal two-factor login (Q-07)", () => {
  let actor: PortalActor;
  let userId: string;

  beforeAll(async () => {
    const a = await invitePortalUser(actorOf(w.pa), { clientId: w.c1.id, name: "Two Factor", email: "tf@c1.example.com" });
    userId = a.portalUserId;
    await acceptPortalInvite(a.token, PW, PW);
    const r = await portalLogin({ email: "tf@c1.example.com", password: PW });
    if (r.status !== "OK") throw new Error("login failed");
    actor = await portalActorFor(r.sessionId);
  });

  it("optional by default; when the firm makes it mandatory the session needs enrolment", async () => {
    const r = await portalLogin({ email: "tf@c1.example.com", password: PW });
    if (r.status !== "OK") throw new Error("login failed");
    expect((await resolveSession(r.sessionId))!.needsTotpEnrolment).toBe(false);
    await setSetting("portal.totpMandatory", true);
    expect((await resolveSession(r.sessionId))!.needsTotpEnrolment).toBe(true);
    await setSetting("portal.totpMandatory", false);
  });

  it("enrols with a correct code; login then asks for it; wrong codes count as failures", async () => {
    await beginPortalTotp(actor);
    await expect(confirmPortalTotp(actor, "000000")).rejects.toThrow(/not right/);
    const secret = decrypt((await db().portalUser.findUniqueOrThrow({ where: { id: userId } })).totpSecretEnc!, "VAULT");
    await confirmPortalTotp(actor, await currentTotp(secret));
    expect((await portalLogin({ email: "tf@c1.example.com", password: PW })).status).toBe("NEED_TOTP");
    expect((await portalLogin({ email: "tf@c1.example.com", password: PW, totp: "123456" })).status).toBe("INVALID");
    expect((await portalLogin({ email: "tf@c1.example.com", password: PW, totp: await currentTotp(secret) })).status).toBe("OK");
  });

  it("cannot be turned off while mandatory; off needs a current code; an admin can reset it", async () => {
    const secret = decrypt((await db().portalUser.findUniqueOrThrow({ where: { id: userId } })).totpSecretEnc!, "VAULT");
    await setSetting("portal.totpMandatory", true);
    await expect(disablePortalTotp(actor, await currentTotp(secret))).rejects.toThrow(/requires/);
    await setSetting("portal.totpMandatory", false);
    await expect(disablePortalTotp(actor, "000000")).rejects.toThrow(/not right/);
    await disablePortalTotp(actor, await currentTotp(secret));
    expect((await portalLogin({ email: "tf@c1.example.com", password: PW })).status).toBe("OK");
    await beginPortalTotp(actor);
    const s2 = decrypt((await db().portalUser.findUniqueOrThrow({ where: { id: userId } })).totpSecretEnc!, "VAULT");
    await confirmPortalTotp(actor, await currentTotp(s2));
    await expect(resetPortalTotp(actorOf(w.m1), userId)).rejects.toThrow(/access/);
    await resetPortalTotp(actorOf(w.pa), userId);
    expect((await portalLogin({ email: "tf@c1.example.com", password: PW })).status).toBe("OK");
  });
});
