import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf, buildWorld } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { createUser, updateUser, deactivateUser, custodyReport, adminResetPassword } from "@/server/services/users/service";
import { addTeamMember, removeTeamMember, createTeam } from "@/server/services/teams/service";
import { staffLogin } from "@/server/services/auth/login";

beforeAll(resetDb);

describe("users", () => {
  it("Practice Admin creates staff; temporary password must be changed", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const { user, tempPassword } = await createUser(actorOf(pa), { username: "Ravi.Kumar", displayName: "Ravi Kumar", role: "STAFF" });
    expect(user.username).toBe("ravi.kumar");
    expect(user.mustChangePassword).toBe(true);
    expect((await staffLogin({ username: "ravi.kumar", password: tempPassword })).status).toBe("OK");
    expect(await db().auditLog.count({ where: { entityId: user.id, action: "CREATE" } })).toBe(1);
  });

  it("only a Partner can grant Partner, Practice Admin or HR Admin roles", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const partner = await makeUser("PARTNER");
    await expect(createUser(actorOf(pa), { username: "newpartner", displayName: "New Partner", role: "PARTNER" })).rejects.toThrow(/Only a Partner/);
    const { user } = await createUser(actorOf(partner), { username: "newhr", displayName: "New HR", role: "HR_ADMIN" });
    expect(user.role).toBe("HR_ADMIN");
  });

  it("staff, managers and articles cannot manage users", async () => {
    for (const role of ["STAFF", "MANAGER", "ARTICLE"] as const) {
      const u = await makeUser(role);
      await expect(createUser(actorOf(u), { username: `x${role}`, displayName: "X Y", role: "STAFF" })).rejects.toThrow(/access/);
    }
  });

  it("articles cannot be Seniors", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    await expect(createUser(actorOf(pa), { username: "art1", displayName: "Art One", role: "ARTICLE", isSenior: true })).rejects.toThrow(/Seniors/);
  });

  it("role change ends existing sessions", async () => {
    const partner = await makeUser("PARTNER");
    const u = await makeUser("STAFF");
    await staffLogin({ username: u.username, password: "Password123" });
    await updateUser(actorOf(partner), u.id, { role: "MANAGER" });
    expect(await db().userSession.count({ where: { userId: u.id, revokedAt: null } })).toBe(0);
  });

  it("admin password reset revokes sessions", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const u = await makeUser("STAFF");
    await staffLogin({ username: u.username, password: "Password123" });
    const { tempPassword } = await adminResetPassword(actorOf(pa), u.id);
    expect(tempPassword).toMatch(/^Tmp-/);
    expect(await db().userSession.count({ where: { userId: u.id, revokedAt: null } })).toBe(0);
  });
});

describe("offboarding (P1-15)", () => {
  it("revokes access at once, lists custody items and keeps history attributed", async () => {
    const w = await buildWorld();
    const cred = await db().credential.create({ data: { clientId: w.c1.id, portal: "GST", usernameEnc: "v1:a:b:c", passwordEnc: "v1:a:b:c" } });
    await db().credentialGrant.create({ data: { credentialId: cred.id, clientId: w.c1.id, userId: w.s1.id, grantedById: w.m1.id } });
    await db().dSC.create({ data: { holderName: "Director A", expiryDate: "2027-05-01", custody: "STAFF", custodianUserId: w.s1.id } });
    const asset = await db().asset.create({ data: { tag: "LAP-001", kind: "LAPTOP", status: "ASSIGNED" } });
    await db().assetAssignment.create({ data: { assetId: asset.id, userId: w.s1.id, issuedAt: "2026-04-01" } });
    await db().workEntry.create({ data: { userId: w.s1.id, date: "2026-10-01", clientId: w.c1.id, engagementId: w.e1.id, minutes: 120 } });

    const report = await deactivateUser(actorOf(w.pa), w.s1.id, "Resigned");
    expect(report.dscs).toHaveLength(1);
    expect(report.assets.map((a) => a.tag)).toEqual(["LAP-001"]);
    expect(report.activeEngagements.map((e) => e.id)).toContain(w.e1.id);
    expect(await db().clientTeamMember.count({ where: { userId: w.s1.id, toDate: null } })).toBe(0);
    expect(await db().credentialGrant.count({ where: { userId: w.s1.id, revokedAt: null } })).toBe(0);
    // History stays attributed.
    expect(await db().workEntry.count({ where: { userId: w.s1.id } })).toBe(1);
    const again = await custodyReport(actorOf(w.pa), w.s1.id);
    expect(again.assets).toHaveLength(1);
  });

  it("cannot deactivate yourself or the last Partner", async () => {
    const p = await makeUser("PARTNER");
    await expect(deactivateUser(actorOf(p), p.id, "x")).rejects.toThrow(/yourself/);
    await db().user.updateMany({ where: { role: "PARTNER", id: { not: p.id } }, data: { active: false } });
    const pa = await makeUser("PRACTICE_ADMIN");
    await expect(deactivateUser(actorOf(pa), p.id, "x")).rejects.toThrow();
  });

  it("leaving a team revokes vault grants for that team's clients", async () => {
    const w = await buildWorld();
    await db().credentialGrant.create({ data: { clientId: w.c1.id, userId: w.senior.id, grantedById: w.m1.id } });
    await removeTeamMember(actorOf(w.pa), w.t1.id, w.senior.id);
    expect(await db().credentialGrant.count({ where: { userId: w.senior.id, revokedAt: null } })).toBe(0);
  });

  it("HR Admin cannot join a client team", async () => {
    const w = await buildWorld();
    const team = await createTeam(actorOf(w.pa), { name: "Team HR test" });
    await expect(addTeamMember(actorOf(w.pa), team.id, w.hr.id)).rejects.toThrow(/HR Admin/);
  });
});
