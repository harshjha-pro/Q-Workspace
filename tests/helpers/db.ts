import fs from "node:fs";
import { disconnectDb } from "@/server/lib/db";

let n = 0;
/**
 * Fresh copy of the template DB for this test file. Each reset uses a new file name, because a
 * disconnected Prisma/libsql client can keep the previous file open (see decisions D-22).
 */
export async function resetDb() {
  await disconnectDb();
  n += 1;
  const file = `tests/.tmp/test-${process.pid}-${n}.db`;
  fs.copyFileSync("tests/.tmp/template.db", file);
  process.env.DATABASE_URL = `file:./${file}`;
}
