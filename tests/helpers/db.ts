import fs from "node:fs";
import { disconnectDb } from "@/server/lib/db";

/** Fresh copy of the template DB for this test file. */
export async function resetDb() {
  await disconnectDb();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`tests/.tmp/test.db${suffix}`, { force: true });
  fs.copyFileSync("tests/.tmp/template.db", "tests/.tmp/test.db");
}
