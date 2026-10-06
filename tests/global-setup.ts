import { execSync } from "node:child_process";
import fs from "node:fs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { seedReference } from "../prisma/seed/reference";

/** Build one migrated + reference-seeded template DB; each test file copies it (tests/helpers/db.ts). */
export default async function globalSetup() {
  fs.rmSync("tests/.tmp", { recursive: true, force: true });
  fs.mkdirSync("tests/.tmp", { recursive: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:./tests/.tmp/template.db" },
    stdio: "pipe",
  });
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: "file:./tests/.tmp/template.db" }) });
  await seedReference(db);
  await db.$disconnect();
}
