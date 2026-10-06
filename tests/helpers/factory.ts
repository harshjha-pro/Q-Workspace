import { db } from "@/server/lib/db";
import type { StaffActor, PortalActor } from "@/server/permissions/actor";
import { hashPassword } from "@/server/services/auth/password";
import type { Role } from "@/server/domain/enums";

let seq = 0;
export const TEST_PASSWORD = "Password123";

export async function makeUser(role: Exclude<Role, "PORTAL">, opts: { isSenior?: boolean; name?: string; reportingManagerId?: string } = {}) {
  seq += 1;
  return db().user.create({
    data: {
      username: `${role.toLowerCase()}${seq}`,
      displayName: opts.name ?? `${role} ${seq}`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role,
      isSenior: opts.isSenior ?? false,
      reportingManagerId: opts.reportingManagerId ?? null,
      searchName: `${role.toLowerCase()} ${seq}`,
    },
  });
}

export function actorOf(u: { id: string; role: string; isSenior: boolean; displayName: string }): StaffActor {
  return { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
}

export async function makeClient(opts: { teamId?: string; managerId?: string; partnerId?: string; constitution?: string; name?: string; pan?: string } = {}) {
  seq += 1;
  return db().client.create({
    data: {
      code: `CL-T${String(seq).padStart(4, "0")}`,
      name: opts.name ?? `Client ${seq}`,
      searchName: (opts.name ?? `client ${seq}`).toLowerCase(),
      constitution: opts.constitution ?? "PRIVATE_COMPANY",
      pan: opts.pan ?? null,
      teamId: opts.teamId ?? null,
      managerId: opts.managerId ?? null,
      partnerId: opts.partnerId ?? null,
    },
  });
}

export async function makeEngagement(clientId: string, opts: { assignUserIds?: string[] } = {}) {
  seq += 1;
  const e = await db().engagement.create({
    data: { code: `EN-T${String(seq).padStart(5, "0")}`, clientId, name: `Engagement ${seq}`, serviceLine: "GST", engagementType: "GST_RETURN", feePaise: 25_000_00 },
  });
  for (const userId of opts.assignUserIds ?? []) {
    await db().engagementAssignment.create({ data: { engagementId: e.id, userId, role: "MEMBER", fromDate: "2026-04-01" } });
  }
  return e;
}

/**
 * Standard permission fixture:
 *  team T1 led by manager M1 serves client C1 (engagement E1, staff S1 + article A1 assigned);
 *  team T2 led by manager M2 serves client C2 (engagement E2, nobody from T1 assigned).
 */
export async function buildWorld() {
  const partner = await makeUser("PARTNER");
  const m1 = await makeUser("MANAGER", { reportingManagerId: partner.id });
  const m2 = await makeUser("MANAGER", { reportingManagerId: partner.id });
  const s1 = await makeUser("STAFF", { reportingManagerId: m1.id });
  const senior = await makeUser("STAFF", { isSenior: true, reportingManagerId: m1.id });
  const a1 = await makeUser("ARTICLE", { reportingManagerId: m1.id });
  const s2 = await makeUser("STAFF", { reportingManagerId: m2.id });
  const pa = await makeUser("PRACTICE_ADMIN");
  const hr = await makeUser("HR_ADMIN");
  const t1 = await db().clientTeam.create({ data: { name: `T1-${seq}`, leadManagerId: m1.id } });
  const t2 = await db().clientTeam.create({ data: { name: `T2-${seq}`, leadManagerId: m2.id } });
  for (const [team, u] of [[t1, s1], [t1, senior], [t1, a1], [t2, s2]] as const) {
    await db().clientTeamMember.create({ data: { teamId: team.id, userId: u.id, fromDate: "2026-04-01" } });
  }
  const c1 = await makeClient({ teamId: t1.id, managerId: m1.id, partnerId: partner.id });
  const c2 = await makeClient({ teamId: t2.id, managerId: m2.id, partnerId: partner.id });
  const e1 = await makeEngagement(c1.id, { assignUserIds: [s1.id, a1.id] });
  const e2 = await makeEngagement(c2.id, { assignUserIds: [s2.id] });
  const portalUser = await db().portalUser.create({ data: { name: "CFO", email: `cfo${seq}@example.com`, clients: { create: { clientId: c1.id } } } });
  const portal: PortalActor = { kind: "PORTAL", portalUserId: portalUser.id, role: "PORTAL", clientIds: [c1.id], displayName: "CFO" };
  return { partner, m1, m2, s1, senior, a1, s2, pa, hr, t1, t2, c1, c2, e1, e2, portal };
}
