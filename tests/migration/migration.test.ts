import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";

/**
 * Brief §11 "no data loss on upgrade" + rule 7 "migrations only, never destructive resets".
 * 1) Every migration after the first must not contain destructive SQL unless explicitly marked.
 * 2) The Prisma schema and the migrations must match (no un-migrated schema change).
 * 3) Re-applying migrations to a populated database changes no row counts or data.
 */
const MIGRATIONS = path.resolve("prisma/migrations");

describe("migrations", () => {
  it("contain no destructive statements after the first (unless marked -- allow-destructive: <reason>)", () => {
    const dirs = fs.readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs.slice(1)) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, d, "migration.sql"), "utf8");
      // Prisma's SQLite "redefine table" copies data into a new table and drops the old one; that is safe.
      const withoutRedefine = sql.replace(/-- RedefineTables[\s\S]*?PRAGMA foreign_keys=ON;/g, "");
      const destructive = /\b(DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i.test(withoutRedefine);
      if (destructive) expect(sql, `${d} is destructive`).toMatch(/-- allow-destructive: .+/);
    }
  });

  it("schema.prisma matches the migrations (no drift)", () => {
    const out = execSync(
      "npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --script",
      { encoding: "utf8", env: { ...process.env, DATABASE_URL: "file:./tests/.tmp/drift.db" } },
    );
    expect(out.replace(/--.*$/gm, "").trim()).toBe("");
  });

  it("re-applying migrations to a populated database loses nothing", async () => {
    const file = path.resolve("tests/.tmp/upgrade.db");
    fs.copyFileSync("tests/.tmp/template.db", file);
    const c = createClient({ url: `file:${file}` });
    const tables = (await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'")).rows.map((r) => String(r.name));
    const snapshot = async () => {
      const counts: Record<string, number> = {};
      for (const t of tables) counts[t] = Number((await c.execute(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0]!.n);
      const roles = (await c.execute(`SELECT code, name FROM "Role" ORDER BY code`)).rows.map((r) => `${r.code}:${r.name}`);
      return { counts, roles };
    };
    const before = await snapshot();
    expect(before.counts.State).toBe(36);
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: `file:${file}` }, stdio: "pipe" });
    const after = await snapshot();
    expect(after).toEqual(before);
    c.close();
  });
});
