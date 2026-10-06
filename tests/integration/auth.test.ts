import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf, TEST_PASSWORD } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { staffLogin } from "@/server/services/auth/login";
import { resolveSession } from "@/server/services/auth/sessions";
import { beginTotpEnrolment, confirmTotpEnrolment, changeOwnPassword, deactivateUser } from "@/server/services/users/service";
import { currentTotp } from "@/server/services/auth/totp";

beforeAll(resetDb);

describe("login", () => {
  it("logs in with username + password and creates a session", async () => {
    const u = await makeUser("STAFF");
    const r = await staffLogin({ username: u.username, password: TEST_PASSWORD });
    expect(r.status).toBe("OK");
    const s = await resolveSession((r as { sessionId: string }).sessionId);
    expect(s?.actor).toMatchObject({ kind: "USER", userId: u.id, role: "STAFF" });
    expect(await db().auditLog.count({ where: { entityId: u.id, action: "LOGIN" } })).toBe(1);
  });

  it("username is case-insensitive; unknown user and wrong password give the same answer", async () => {
    const u = await makeUser("STAFF");
    expect((await staffLogin({ username: u.username.toUpperCase(), password: TEST_PASSWORD })).status).toBe("OK");
    expect((await staffLogin({ username: "nobody", password: "x" })).status).toBe("INVALID");
    expect((await staffLogin({ username: u.username, password: "wrong" })).status).toBe("INVALID");
  });

  it("locks the account after 5 failures", async () => {
    const u = await makeUser("STAFF");
    for (let i = 0; i < 5; i++) await staffLogin({ username: u.username, password: "wrong" });
    const r = await staffLogin({ username: u.username, password: TEST_PASSWORD });
    expect(r.status).toBe("LOCKED");
  });

  it("inactive users cannot log in", async () => {
    const u = await makeUser("STAFF");
    await db().user.update({ where: { id: u.id }, data: { active: false } });
    expect((await staffLogin({ username: u.username, password: TEST_PASSWORD })).status).toBe("INVALID");
  });
});

describe("TOTP 2FA", () => {
  it("mandatory roles must enrol before using the app; after enrolment a code is required", async () => {
    const m = await makeUser("MANAGER");
    const first = await staffLogin({ username: m.username, password: TEST_PASSWORD });
    const s = await resolveSession((first as { sessionId: string }).sessionId);
    expect(s?.needsTotpEnrolment).toBe(true);

    const { secret, qrDataUrl } = await beginTotpEnrolment(actorOf(m));
    expect(qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    await expect(confirmTotpEnrolment(actorOf(m), "000000")).rejects.toThrow(/did not match/);
    await confirmTotpEnrolment(actorOf(m), await currentTotp(secret));

    expect((await staffLogin({ username: m.username, password: TEST_PASSWORD })).status).toBe("NEED_TOTP");
    expect((await staffLogin({ username: m.username, password: TEST_PASSWORD, totp: "123456" })).status).not.toBe("OK");
    const ok = await staffLogin({ username: m.username, password: TEST_PASSWORD, totp: await currentTotp(secret) });
    expect(ok.status).toBe("OK");
    expect((await resolveSession((ok as { sessionId: string }).sessionId))?.needsTotpEnrolment).toBe(false);
  });

  it("the TOTP secret is stored encrypted", async () => {
    const p = await makeUser("PARTNER");
    const { secret } = await beginTotpEnrolment(actorOf(p));
    const row = await db().user.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.totpSecretEnc).toMatch(/^v1:/);
    expect(row.totpSecretEnc).not.toContain(secret);
  });

  it("2FA is optional for Staff and Articles", async () => {
    const a = await makeUser("ARTICLE");
    const r = await staffLogin({ username: a.username, password: TEST_PASSWORD });
    expect((await resolveSession((r as { sessionId: string }).sessionId))?.needsTotpEnrolment).toBe(false);
  });
});

describe("sessions", () => {
  it("expire after the idle timeout", async () => {
    const u = await makeUser("STAFF");
    const r = (await staffLogin({ username: u.username, password: TEST_PASSWORD })) as { sessionId: string };
    const later = new Date(Date.now() + 31 * 60_000);
    expect(await resolveSession(r.sessionId, later)).toBeNull();
    expect((await db().userSession.findUniqueOrThrow({ where: { id: r.sessionId } })).revokeReason).toBe("IDLE_TIMEOUT");
  });

  it("are revoked immediately on deactivation (offboarding)", async () => {
    const p = await makeUser("PARTNER");
    const u = await makeUser("STAFF");
    const r = (await staffLogin({ username: u.username, password: TEST_PASSWORD })) as { sessionId: string };
    await deactivateUser(actorOf(p), u.id, "Resigned");
    expect(await resolveSession(r.sessionId)).toBeNull();
  });

  it("password change clears the must-change flag and enforces the policy", async () => {
    const u = await makeUser("STAFF");
    await db().user.update({ where: { id: u.id }, data: { mustChangePassword: true } });
    await expect(changeOwnPassword(actorOf(u), TEST_PASSWORD, "short")).rejects.toThrow();
    await expect(changeOwnPassword(actorOf(u), "wrong", "LongEnough123")).rejects.toThrow(/Current password/);
    await changeOwnPassword(actorOf(u), TEST_PASSWORD, "LongEnough123");
    expect((await db().user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
  });
});
