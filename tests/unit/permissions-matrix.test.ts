import { describe, expect, it } from "vitest";
import { MATRIX, type Capability } from "@/server/permissions/matrix";
import { can, scopeOf } from "@/server/permissions/guards";
import { ROLES } from "@/server/domain/enums";
import type { Actor } from "@/server/permissions/actor";

const actor = (role: (typeof ROLES)[number], isSenior = false): Actor =>
  role === "PORTAL"
    ? { kind: "PORTAL", portalUserId: "p", role: "PORTAL", clientIds: [], displayName: "p" }
    : { kind: "USER", userId: "u", role, isSenior, displayName: "u" };

describe("permission matrix", () => {
  it("defines every role for every capability", () => {
    for (const [cap, row] of Object.entries(MATRIX)) {
      for (const role of ROLES) expect(row[role], `${cap}/${role}`).toBeDefined();
    }
  });

  it("can() agrees with the matrix for every role × capability", () => {
    for (const cap of Object.keys(MATRIX) as Capability[]) {
      for (const role of ROLES) {
        const expected = MATRIX[cap][role] !== "none" && !(cap === "review.check" && role === "STAFF");
        expect(can(actor(role), cap), `${cap}/${role}`).toBe(expected);
      }
    }
  });

  it("Seniors may review; plain Staff and Articles may not (invariants 2, 3)", () => {
    expect(can(actor("STAFF", true), "review.check")).toBe(true);
    expect(can(actor("STAFF", false), "review.check")).toBe(false);
    expect(can(actor("ARTICLE", true), "review.check")).toBe(false);
  });

  it("billing is never visible to Staff or Articles (brief §7)", () => {
    for (const cap of ["billing.view", "billing.raise", "billing.receipt.record", "billing.approve"] as Capability[]) {
      expect(can(actor("STAFF", true), cap)).toBe(false);
      expect(can(actor("ARTICLE"), cap)).toBe(false);
    }
  });

  it("HR Admin has no client data (spec 3.6)", () => {
    for (const cap of ["client.view", "engagement.view", "task.view", "vault.view", "billing.view", "notice.view", "dms.view"] as Capability[]) {
      expect(can(actor("HR_ADMIN"), cap), cap).toBe(false);
    }
  });

  it("salary is visible only to Partner, HR Admin and the employee themself", () => {
    expect(scopeOf(actor("PARTNER"), "salary.view")).toBe("firm");
    expect(scopeOf(actor("HR_ADMIN"), "salary.view")).toBe("firm");
    for (const r of ["MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN"] as const) expect(scopeOf(actor(r), "salary.view")).toBe("self");
    expect(scopeOf(actor("PORTAL"), "salary.view")).toBe("none");
  });

  it("only Partners give final sign-off, EQR, approve payroll and restore backups", () => {
    for (const cap of ["signoff.final", "eqr.perform", "payroll.approve", "backup.restore.approve", "proposal.approve"] as Capability[]) {
      for (const role of ROLES) expect(can(actor(role), cap), `${cap}/${role}`).toBe(role === "PARTNER");
    }
  });

  it("portal users can use only portal-scoped capabilities", () => {
    const allowed = (Object.keys(MATRIX) as Capability[]).filter((c) => can(actor("PORTAL"), c));
    for (const c of allowed) expect(MATRIX[c].PORTAL).toBe("portal_own");
  });

  it("the SYSTEM actor (scheduled jobs) has firm scope", () => {
    const sys: Actor = { kind: "SYSTEM", role: "SYSTEM", userId: "system", displayName: "System" };
    expect(scopeOf(sys, "task.view")).toBe("firm");
    expect(can(sys, "signoff.final")).toBe(true);
  });
});
