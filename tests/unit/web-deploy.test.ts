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
