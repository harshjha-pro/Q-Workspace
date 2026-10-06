import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import AdmZip from "adm-zip";
import { createClient } from "@libsql/client";

/**
 * Backup archive = consistent SQLite snapshot (VACUUM INTO) + the /storage folder + manifest.
 * Kept free of Prisma so `npm run setup` can back up a database before migrating it.
 */
export type BackupKind = "AUTO" | "MANUAL" | "PRE_RESTORE" | "PRE_MIGRATION" | "UPLOADED";
export type Manifest = { app: "qepex-work-tracker"; createdAt: string; kind: BackupKind; schemaVersion: string; dbSha256: string; storageFiles: number };

export const backupDir = () => path.resolve(process.env.BACKUP_DIR ?? "./backups");
const storageDir = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");
export const dbFile = () => path.resolve((process.env.DATABASE_URL ?? "file:./prisma/data/qepex.db").replace(/^file:/, ""));

/** Name of the newest migration folder — the schema version a backup was taken at. */
export function currentSchemaVersion(): string {
  const dir = path.resolve("prisma/migrations");
  if (!fs.existsSync(dir)) return "unknown";
  const names = fs.readdirSync(dir).filter((n) => /^\d{14}_/.test(n)).sort();
  return names.at(-1) ?? "unknown";
}

async function schemaVersionOfDb(file: string): Promise<string> {
  const c = createClient({ url: `file:${file}` });
  try {
    const r = await c.execute("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1");
    return String(r.rows[0]?.migration_name ?? "unknown");
  } catch {
    return "unknown";
  } finally {
    c.close();
  }
}

function addDirToZip(zip: AdmZip, dir: string, zipRoot: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) n += addDirToZip(zip, abs, `${zipRoot}/${entry.name}`);
    else {
      zip.addLocalFile(abs, zipRoot);
      n += 1;
    }
  }
  return n;
}

/** Create a backup zip and return its file name (inside BACKUP_DIR). */
export async function createBackupFile(kind: BackupKind): Promise<string> {
  fs.mkdirSync(backupDir(), { recursive: true });
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\.(\d+)Z$/, "$1")}-${randomBytes(2).toString("hex")}`;
  const snapshot = path.join(backupDir(), `.snapshot-${stamp}-${process.pid}.db`);
  const source = createClient({ url: `file:${dbFile()}` });
  try {
    await source.execute(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  } finally {
    source.close();
  }
  const dbBytes = fs.readFileSync(snapshot);
  const zip = new AdmZip();
  zip.addFile("qepex.db", dbBytes);
  const storageFiles = addDirToZip(zip, storageDir(), "storage");
  const manifest: Manifest = {
    app: "qepex-work-tracker",
    createdAt: new Date().toISOString(),
    kind,
    schemaVersion: await schemaVersionOfDb(snapshot),
    dbSha256: createHash("sha256").update(dbBytes).digest("hex"),
    storageFiles,
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  const name = `qepex-${stamp}-${kind.toLowerCase()}.zip`;
  zip.writeZip(path.join(backupDir(), name));
  fs.rmSync(snapshot, { force: true });
  return name;
}

export function readManifest(fileName: string): Manifest {
  const zip = new AdmZip(path.join(backupDir(), safeName(fileName)));
  const entry = zip.getEntry("manifest.json");
  if (!entry) throw new Error("Not a QEPEX backup (manifest missing).");
  const m = JSON.parse(entry.getData().toString("utf8")) as Manifest;
  if (m.app !== "qepex-work-tracker") throw new Error("Not a QEPEX backup.");
  return m;
}

/** Check integrity: the DB inside the zip must match the manifest hash. */
export function verifyBackup(fileName: string): Manifest {
  const zip = new AdmZip(path.join(backupDir(), safeName(fileName)));
  const m = readManifest(fileName);
  const dbEntry = zip.getEntry("qepex.db");
  if (!dbEntry) throw new Error("Backup has no database.");
  const sha = createHash("sha256").update(dbEntry.getData()).digest("hex");
  if (sha !== m.dbSha256) throw new Error("Backup is corrupted (checksum mismatch).");
  return m;
}

/**
 * Restore = copy the backup's rows into the live database through SQLite itself (ATTACH + one
 * transaction), then swap the storage folder. The live DB file is never replaced on disk, because
 * open connections would keep using the old file (decisions D-22).
 * The backup DB is first brought to the current schema with `migrate` so the columns match.
 */
export async function restoreBackupIntoLive(fileName: string, migrate: (dbFilePath: string) => void) {
  const zip = new AdmZip(path.join(backupDir(), safeName(fileName)));
  const work = path.join(backupDir(), `.restore-${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });
  const tmpDb = path.join(work, "restore.db");
  fs.writeFileSync(tmpDb, zip.getEntry("qepex.db")!.getData());
  migrate(tmpDb);

  const live = createClient({ url: `file:${dbFile()}` });
  try {
    await live.execute("PRAGMA busy_timeout=10000");
    await live.execute(`ATTACH DATABASE '${tmpDb.replace(/'/g, "''")}' AS bk`);
    const tables = (await live.execute("SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'")).rows.map((r) => String(r.name));
    const stmts: string[] = ["PRAGMA defer_foreign_keys=ON"];
    for (const t of tables) {
      const liveCols = (await live.execute(`PRAGMA main.table_info("${t}")`)).rows.map((r) => String(r.name));
      const bkCols = new Set((await live.execute(`PRAGMA bk.table_info("${t}")`)).rows.map((r) => String(r.name)));
      const cols = liveCols.filter((c) => bkCols.has(c)).map((c) => `"${c}"`).join(", ");
      stmts.push(`DELETE FROM main."${t}"`);
      if (bkCols.size > 0) stmts.push(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM bk."${t}"`);
    }
    await live.batch(stmts, "write");
    await live.execute("DETACH DATABASE bk");
  } finally {
    live.close();
  }

  const storage = storageDir();
  const newStorage = path.join(work, "storage");
  fs.mkdirSync(newStorage, { recursive: true });
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith("storage/") || entry.isDirectory) continue;
    const target = path.resolve(newStorage, entry.entryName.slice("storage/".length));
    if (!target.startsWith(newStorage + path.sep)) continue; // zip-slip guard
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
  }
  fs.rmSync(storage, { recursive: true, force: true });
  fs.renameSync(newStorage, storage);
  fs.rmSync(work, { recursive: true, force: true });
}

export function safeName(fileName: string): string {
  const base = path.basename(fileName);
  if (!/^[A-Za-z0-9._-]+\.zip$/.test(base)) throw new Error("Invalid backup file name.");
  return base;
}

export function sha256OfFile(fileName: string) {
  return createHash("sha256").update(fs.readFileSync(path.join(backupDir(), safeName(fileName)))).digest("hex");
}
