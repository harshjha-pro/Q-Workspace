import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { db, transaction } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { notFound, ruleViolation, forbidden } from "../../lib/errors";
import { backupDir, createBackupFile, currentSchemaVersion, restoreBackupIntoLive, readManifest, safeName, sha256OfFile, verifyBackup, type BackupKind } from "./archive";
import { getSettingNumber } from "../settings/service";
import { logger } from "../../lib/logger";

async function record(fileName: string, kind: BackupKind, createdById: string | null) {
  const m = readManifest(fileName);
  const size = fs.statSync(path.join(backupDir(), fileName)).size;
  return db().backupRecord.create({
    data: { fileName, sizeBytes: size, sha256: sha256OfFile(fileName), kind, schemaVersion: m.schemaVersion, createdById },
  });
}

/** "Back up now" — Partner or Practice Admin. */
export async function backupNow(actor: Actor) {
  authorize(actor, "backup.restore.request");
  const name = await createBackupFile("MANUAL");
  const rec = await record(name, "MANUAL", idOf(actor));
  await transaction((tx) => writeAudit(tx, actor, { entityType: "BackupRecord", entityId: rec.id, action: "BACKUP", after: { fileName: name } }));
  return rec;
}

/** Nightly job: automatic backup + keep only the newest N automatic ones. */
export async function automaticBackup() {
  const name = await createBackupFile("AUTO");
  const rec = await record(name, "AUTO", null);
  const keep = await getSettingNumber("backup.keepAuto", 14);
  const autos = await db().backupRecord.findMany({ where: { kind: "AUTO", status: "OK" }, orderBy: { createdAt: "desc" } });
  for (const old of autos.slice(keep)) {
    fs.rmSync(path.join(backupDir(), old.fileName), { force: true });
    await db().backupRecord.update({ where: { id: old.id }, data: { status: "MISSING", note: "Removed by retention" } });
  }
  return rec;
}

export async function listBackups(actor: Actor) {
  authorize(actor, "backup.restore.request");
  const rows = await db().backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => ({ ...r, exists: fs.existsSync(path.join(backupDir(), r.fileName)) }));
}

/** Full export download — Partner only (spec 14.5). Returns the absolute path for the route to stream. */
export async function backupFileForDownload(actor: Actor, backupId: string) {
  authorize(actor, "backup.download");
  const rec = await db().backupRecord.findUnique({ where: { id: backupId } });
  if (!rec) throw notFound("Backup");
  const abs = path.join(backupDir(), safeName(rec.fileName));
  if (!fs.existsSync(abs)) throw notFound("Backup file");
  await transaction((tx) => writeAudit(tx, actor, { entityType: "BackupRecord", entityId: rec.id, action: "DOWNLOAD", after: { fileName: rec.fileName } }));
  return { abs, fileName: rec.fileName };
}

/** Bring in a backup zip from another machine; validated before it can be restored. */
export async function uploadBackup(actor: Actor, originalName: string, data: Buffer) {
  authorize(actor, "backup.download");
  fs.mkdirSync(backupDir(), { recursive: true });
  const name = `uploaded-${Date.now()}-${safeName(/\.(zip|qbk)$/.test(originalName) ? originalName : `${originalName}.zip`)}`;
  fs.writeFileSync(path.join(backupDir(), name), data);
  try {
    verifyBackup(name);
  } catch (e) {
    fs.rmSync(path.join(backupDir(), name), { force: true });
    throw ruleViolation(e instanceof Error ? e.message : "Invalid backup");
  }
  const rec = await record(name, "UPLOADED", idOf(actor));
  await transaction((tx) => writeAudit(tx, actor, { entityType: "BackupRecord", entityId: rec.id, action: "UPLOAD", after: { fileName: name } }));
  return rec;
}

export async function requestRestore(actor: Actor, backupId: string, note: string) {
  authorize(actor, "backup.restore.request");
  const rec = await db().backupRecord.findUnique({ where: { id: backupId } });
  if (!rec || rec.status === "MISSING") throw notFound("Backup");
  verifyBackup(rec.fileName);
  const updated = await db().backupRecord.update({
    where: { id: backupId },
    data: { status: "RESTORE_REQUESTED", restoreRequestedById: idOf(actor), restoreRequestedAt: new Date(), note },
  });
  await transaction((tx) => writeAudit(tx, actor, { entityType: "BackupRecord", entityId: backupId, action: "RESTORE_REQUESTED", reason: note }));
  return updated;
}

/**
 * Partner approval performs the restore: integrity check → automatic PRE_RESTORE backup →
 * disconnect → swap DB + storage → reconnect → apply any newer migrations → audit in the restored DB.
 * A Practice Admin's request must be approved by a Partner; a Partner may confirm their own request.
 */
export async function approveAndRestore(actor: Actor, backupId: string) {
  authorize(actor, "backup.restore.approve");
  const rec = await db().backupRecord.findUnique({ where: { id: backupId } });
  if (!rec) throw notFound("Backup");
  if (rec.status !== "RESTORE_REQUESTED") throw ruleViolation("Request the restore first.");
  const requester = rec.restoreRequestedById ? await db().user.findUnique({ where: { id: rec.restoreRequestedById } }) : null;
  if (requester && requester.role !== "PARTNER" && requester.id === idOf(actor)) throw forbidden();

  const manifest = verifyBackup(rec.fileName);
  if (manifest.schemaVersion !== "unknown" && manifest.schemaVersion > currentSchemaVersion()) {
    throw ruleViolation("This backup is from a newer version of the app. Update the app first.");
  }
  const preRestore = await createBackupFile("PRE_RESTORE");
  const requestedBy = rec.restoreRequestedById;
  logger().warn({ backup: rec.fileName, preRestore, by: idOf(actor) }, "restore starting");

  // An older backup may predate later migrations: it is brought up to the current schema first (never a reset).
  await restoreBackupIntoLive(rec.fileName, (file) =>
    execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: `file:${file}` } }),
  );

  await record(preRestore, "PRE_RESTORE", idOf(actor));
  await transaction((tx) =>
    writeAudit(tx, actor, {
      entityType: "BackupRecord",
      entityId: rec.id,
      action: "RESTORED",
      after: { restoredFrom: rec.fileName, preRestoreBackup: preRestore, requestedBy, approvedBy: idOf(actor) },
    }),
  );
  logger().warn({ backup: rec.fileName }, "restore finished");
  return { restoredFrom: rec.fileName, preRestoreBackup: preRestore };
}

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
