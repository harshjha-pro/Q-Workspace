/**
 * npm run setup — safe to run any number of times.
 *  1. Creates .env from .env.example and generates missing keys (never overwrites existing keys).
 *  2. Creates data folders.
 *  3. Backs up an existing database, then applies pending migrations (`migrate deploy` — never a reset).
 *  4. Loads reference data; loads the demo firm only in demo mode on an empty database.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);

function ensureEnv() {
  if (!fs.existsSync(".env")) {
    fs.copyFileSync(".env.example", ".env");
    console.log("• Created .env from .env.example");
  }
  let text = fs.readFileSync(".env", "utf8");
  for (const key of ["VAULT_KEY", "PII_KEY", "BACKUP_KEY", "AUTH_SECRET"]) {
    const re = new RegExp(`^${key}="?([^"\\n]*)"?$`, "m");
    const m = re.exec(text);
    if (m && m[1]) continue;
    const value = randomBytes(32).toString("base64");
    text = m ? text.replace(re, `${key}="${value}"`) : `${text.trimEnd()}\n${key}="${value}"\n`;
    console.log(`• Generated ${key}`);
  }
  fs.writeFileSync(".env", text);
}

function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
  }
}

function dbFilePath() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/data/qepex.db";
  return path.resolve(url.replace(/^file:/, ""));
}

async function main() {
  ensureEnv();
  loadEnv();
  for (const dir of [path.dirname(dbFilePath()), process.env.STORAGE_DIR ?? "./storage", process.env.BACKUP_DIR ?? "./backups", process.env.LOG_DIR ?? "./logs"]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dbFile = dbFilePath();
  if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) {
    const { createBackupFile } = await import("../server/services/backup/archive");
    const file = await createBackupFile("PRE_MIGRATION");
    console.log(`• Backed up existing database to ${file}`);
    // The backup opened the database (WAL); prisma migrate deploy fails with "SQLite database error" while
    // that connection is held, so release it first.
    const { disconnectDb } = await import("../server/lib/db");
    await disconnectDb();
  }

  // Nothing leaves this machine: switch off Next.js anonymous telemetry (decisions D-34).
  try {
    execSync("npx next telemetry disable", { stdio: "ignore" });
  } catch {
    /* not fatal */
  }

  console.log("• Applying migrations (prisma migrate deploy)…");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });

  const { createPrisma } = await import("../server/lib/db");
  const db = createPrisma(process.env.DATABASE_URL ?? "file:./prisma/data/qepex.db");
  const { seedReference } = await import("../prisma/seed/reference");
  await seedReference(db);
  console.log("• Reference data loaded");

  const people = await db.user.count({ where: { isSystem: false } });
  if (process.env.DEMO_MODE === "true") {
    if (people === 0) {
      const { seedDemo } = await import("../prisma/seed/demo");
      await seedDemo(db);
      console.log("• Demo firm loaded — logins are listed in README.md");
    } else {
      console.log("• Database already has users; demo data not reloaded (use Reset demo data in the app or npm run demo:reset)");
    }
  } else if (people === 0) {
    const { createFirstPartner } = await import("../prisma/seed/first-partner");
    const { username, password } = await createFirstPartner(db);
    console.log(`\n  First Partner login created:\n    username: ${username}\n    temporary password: ${password}\n  Change it at first login and set up two-factor login.\n`);
  }
  await db.$disconnect();
  console.log("\nDone. Start the app with: npm run dev\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
