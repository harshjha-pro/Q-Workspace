import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf, makeClient } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { backupNow, requestRestore, approveAndRestore, listBackups, backupFileForDownload, automaticBackup } from "@/server/services/backup/service";
import { backupDir, verifyBackup } from "@/server/services/backup/archive";
import { storeFile } from "@/server/lib/storage";

beforeAll(async () => {
  await resetDb();
  fs.rmSync("tests/.tmp/backups", { recursive: true, force: true });
  fs.rmSync("tests/.tmp/storage", { recursive: true, force: true });
});

describe("backup and restore (P1-14, P2-36)", () => {
  it("backup → change data → restore with Partner approval brings the data back; pre-restore backup kept", async () => {
    const partner = await makeUser("PARTNER");
    const pa = await makeUser("PRACTICE_ADMIN");
    const kept = await makeClient({ name: "Kept Client" });
    await storeFile(["CL-T", "EN-T"], "kept.pdf", Buffer.from("%PDF-1.4 kept"));
    const backup = await backupNow(actorOf(pa));
    expect(backup.kind).toBe("MANUAL");

    await makeClient({ name: "Added After Backup" });
    await db().client.update({ where: { id: kept.id }, data: { name: "Renamed After Backup" } });

    // Practice Admin requests; cannot approve; Partner approves.
    await requestRestore(actorOf(pa), backup.id, "Accidental bulk edit");
    await expect(approveAndRestore(actorOf(pa), backup.id)).rejects.toThrow(/access/);
    const r = await approveAndRestore(actorOf(partner), backup.id);
    expect(r.preRestoreBackup).toMatch(/pre_restore/);

    expect((await db().client.findUniqueOrThrow({ where: { id: kept.id } })).name).toBe("Kept Client");
    expect(await db().client.count({ where: { name: "Added After Backup" } })).toBe(0);
    expect(await db().auditLog.count({ where: { action: "RESTORED" } })).toBe(1);
    expect(fs.existsSync(path.join(backupDir(), r.preRestoreBackup))).toBe(true);
    const stored = fs.readdirSync("tests/.tmp/storage/CL-T/EN-T");
    expect(stored).toHaveLength(1);
  });

  it("restore must be requested first; download is Partner-only", async () => {
    const partner = await makeUser("PARTNER");
    const pa = await makeUser("PRACTICE_ADMIN");
    const b = await backupNow(actorOf(pa));
    await expect(approveAndRestore(actorOf(partner), b.id)).rejects.toThrow(/Request the restore first/);
    await expect(backupFileForDownload(actorOf(pa), b.id)).rejects.toThrow(/access/);
    const dl = await backupFileForDownload(actorOf(partner), b.id);
    expect(fs.existsSync(dl.abs)).toBe(true);
    const staff = await makeUser("STAFF");
    await expect(listBackups(actorOf(staff))).rejects.toThrow(/access/);
  });

  it("a corrupted backup is refused", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const b = await backupNow(actorOf(pa));
    fs.writeFileSync(path.join(backupDir(), b.fileName), "not a zip");
    await expect(requestRestore(actorOf(pa), b.id, "x")).rejects.toThrow();
  });

  it("backups are encrypted with BACKUP_KEY and refuse a different key (Q-27)", async () => {
    const pa = await makeUser("PRACTICE_ADMIN");
    const b = await backupNow(actorOf(pa));
    expect(b.fileName.endsWith(".qbk")).toBe(true);
    const bytes = fs.readFileSync(path.join(backupDir(), b.fileName));
    expect(bytes.subarray(0, 8).toString()).toBe("QEPEXBK1");
    expect(bytes.includes(Buffer.from("SQLite format 3"))).toBe(false);
    expect(bytes.includes(Buffer.from("manifest.json"))).toBe(false);
    expect(verifyBackup(b.fileName).app).toBe("qepex-work-tracker");
    const key = process.env.BACKUP_KEY;
    process.env.BACKUP_KEY = Buffer.alloc(32, 1).toString("base64");
    try {
      expect(() => verifyBackup(b.fileName)).toThrow(/different BACKUP_KEY/);
    } finally {
      process.env.BACKUP_KEY = key;
    }
  });

  it("automatic backups are recorded", async () => {
    const rec = await automaticBackup();
    expect(rec.kind).toBe("AUTO");
  });
});
