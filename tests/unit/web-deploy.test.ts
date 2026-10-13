import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { dueOnDay } from "@/server/scheduler/due";
import { JOBS } from "@/server/scheduler/jobs";
import { dialectOf } from "@/server/lib/db";

/** Web deployment (D-98, D-99): the daily cron dispatcher's day rule, the URL → database rule, and the schema mirror. */
describe("daily cron dispatcher", () => {
  const due = (day: string) => JOBS.filter((j) => dueOnDay(j.cron, day)).map((j) => j.code).sort();
  it("runs daily jobs every day, weekly ones on their weekday and the MIS on the 5th", () => {
    const monday5th = due("2026-10-05"); // Monday 5 Oct 2026
    expect(monday5th).toEqual(expect.arrayContaining(["COMPLIANCE_GENERATION", "REMINDERS", "WEEKLY_SUMMARY", "MONTHLY_MIS", "QC_FINDINGS", "MESSAGES_UNANSWERED"]));
    expect(monday5th).not.toContain("RETENTION_PROPOSALS"); // Sundays
    const sunday = due("2026-10-11");
    expect(sunday).toContain("RETENTION_PROPOSALS");
    expect(sunday).not.toContain("QC_FINDINGS"); // Mon–Sat
    expect(sunday).not.toContain("MESSAGES_UNANSWERED");
    expect(due("2026-10-06")).not.toContain("MONTHLY_MIS");
    expect(due("2026-10-06")).not.toContain("WEEKLY_SUMMARY");
  });
  it("handles lists, ranges, steps and both day fields", () => {
    expect(dueOnDay("0 9 1,15 * *", "2026-10-15")).toBe(true);
    expect(dueOnDay("0 9 */10 * *", "2026-10-11")).toBe(true);
    expect(dueOnDay("0 9 */10 * *", "2026-10-12")).toBe(false);
    expect(dueOnDay("0 9 * 4-6 *", "2026-10-12")).toBe(false);
    expect(dueOnDay("0 9 13 * 5", "2026-11-13")).toBe(true); // either day field
  });
});

describe("database by URL", () => {
  it("mysql:// and mariadb:// use MySQL; file: and libsql URLs use SQLite", () => {
    expect(dialectOf("mysql://u:p@srv.example:3306/db")).toBe("mysql");
    expect(dialectOf("mariadb://u:p@host/db")).toBe("mysql");
    expect(dialectOf("file:./prisma/data/qepex.db")).toBe("sqlite");
  });
  it("the committed MySQL schema matches the SQLite source of truth", () => {
    expect(() => execSync("npx tsx scripts/mysql-schema.ts --check", { stdio: "pipe" })).not.toThrow();
  });
});

describe("resolveDatabaseUrl (D-99)", () => {
  it("builds the URL from separate settings, encoding the password", async () => {
    const { resolveDatabaseUrl } = await import("@/server/lib/database-url");
    const url = new URL(resolveDatabaseUrl({ DB_HOST: " https://srv1.hstgr.io/ ", DB_USER: "u1_q", DB_PASSWORD: "P@ss#/1", DB_NAME: "u1_db", DATABASE_URL: "https://wrong" })!);
    expect([url.hostname, url.port, decodeURIComponent(url.password), url.pathname]).toEqual(["srv1.hstgr.io", "3306", "P@ss#/1", "/u1_db"]);
  });
  it("cleans a pasted DATABASE_URL", async () => {
    const { resolveDatabaseUrl } = await import("@/server/lib/database-url");
    expect(resolveDatabaseUrl({ DATABASE_URL: ' DATABASE_URL="mysql://u:p@h:3306/d" ' })).toBe("mysql://u:p@h:3306/d");
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });
});

describe("twoFactorSkipped (D-100)", () => {
  it("needs both DEMO_MODE and DEMO_SKIP_2FA", async () => {
    const { vi } = await import("vitest");
    const saved = { m: process.env.DEMO_MODE, s: process.env.DEMO_SKIP_2FA };
    const check = async (mode: string, skip: string | undefined) => {
      vi.resetModules();
      process.env.DEMO_MODE = mode;
      if (skip === undefined) delete process.env.DEMO_SKIP_2FA; else process.env.DEMO_SKIP_2FA = skip;
      return (await import("@/server/lib/env")).twoFactorSkipped();
    };
    try {
      expect(await check("true", "true")).toBe(true);
      expect(await check("false", "true")).toBe(false);
      expect(await check("true", undefined)).toBe(false);
      expect(await check("true", "yes")).toBe(false);
    } finally {
      if (saved.m === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved.m;
      if (saved.s === undefined) delete process.env.DEMO_SKIP_2FA; else process.env.DEMO_SKIP_2FA = saved.s;
      vi.resetModules();
    }
  });
});
