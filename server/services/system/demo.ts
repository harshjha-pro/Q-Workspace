import { createClient } from "@libsql/client";
import fs from "node:fs";
import { db, dialect } from "../../lib/db";
import { isDemoMode } from "../../lib/env";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { ruleViolation } from "../../lib/errors";
import { dbFile } from "../backup/archive";
import { seedReference } from "../../../prisma/seed/reference";
import { seedDemo } from "../../../prisma/seed/demo";

/**
 * Wipe every table's rows (schema kept) and reload reference + demo data.
 * Only ever in demo mode — the button is hidden and this refuses otherwise (brief §12).
 */
export async function resetDemoData(actor?: Actor) {
  if (actor) authorize(actor, "demo.reset");
  if (!isDemoMode()) throw ruleViolation("Reset is available only in demo mode.");
  if (dialect() === "mysql") await wipeMysql();
  else await wipeSqlite();
  fs.rmSync(process.env.STORAGE_DIR ?? "./storage", { recursive: true, force: true });
  fs.mkdirSync(process.env.STORAGE_DIR ?? "./storage", { recursive: true });
  await seedReference(db());
  await seedDemo(db());
}

/** MySQL/MariaDB (web, D-98): delete every row with foreign-key checks off on one connection. */
async function wipeMysql() {
  await db().$transaction(async (tx) => {
    const tables = await tx.$queryRawUnsafe<{ t: string }[]>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'");
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const { t } of tables) await tx.$executeRawUnsafe(`DELETE FROM \`${t}\``);
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  }, { timeout: 120_000 });
}

async function wipeSqlite() {
  const c = createClient({ url: `file:${dbFile()}` });
  try {
    await c.execute("PRAGMA busy_timeout=10000");
    const tables = await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'");
    await c.execute("PRAGMA foreign_keys=OFF");
    for (const row of tables.rows) await c.execute(`DELETE FROM "${String(row.name)}"`);
    await c.execute("PRAGMA foreign_keys=ON");
  } finally {
    c.close();
  }
}
