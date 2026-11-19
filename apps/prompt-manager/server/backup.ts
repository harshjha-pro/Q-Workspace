import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import type { FastifyInstance } from 'fastify';
import { config, s3Configured } from './config';
import { db, now, uuid, getSettings, setSetting, resetEpoch, currentRev } from './db';
import { ENTITIES, ENTITY_NAMES } from '../shared/schema';
import { readBlob, storeBlob, sha256File, EncryptStream, DecryptStream, deriveKey, getMasterKey } from './storage';
import { rebuildIndex } from './search';
import { logActivity } from './activity';

// File header: "PPMBAK01" | mode (1 = passphrase, 2 = server master key) | salt(16) | encrypted zip stream
const BAK_MAGIC = Buffer.from('PPMBAK01');
const NAME_RE = /^[a-z0-9-]+\.(zip|ppmbak)$/;

const RESTORE_TABLES = [...ENTITY_NAMES.map((e) => ENTITIES[e].table), 'conflicts', 'import_records', 'doc_text', 'version_blobs'];
const KEEP_SETTINGS = new Set(['storage_mode', 'blob_driver', 'backup_last_at', 'backup_last_status']);

export async function createBackup(opts: { passphrase?: string; useMasterKey?: boolean; label?: string }) {
  const id = `${opts.label || 'backup'}-${now().replace(/[:.]/g, '-').replace(/z$/i, '').toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`;
  const work = path.join(config.tmpDir, uuid());
  await fsp.mkdir(work, { recursive: true, mode: 0o700 });
  try {
    const dbCopy = path.join(work, 'ppm.sqlite');
    await db.backup(dbCopy);
    const blobs = db.prepare(`SELECT DISTINCT storage_key AS key FROM version_blobs`).all() as { key: string }[];
    const manifest = { app: 'prompt-manager', format: 1, created_at: now(), rev: currentRev(), db_sha256: await sha256File(dbCopy), files: [] as { key: string; sha256: string; size: number }[] };
    const zipPath = path.join(work, 'backup.zip');
    const out = fs.createWriteStream(zipPath, { mode: 0o600 });
    const zip = new ZipArchive({ zlib: { level: 6 } });
    const done = new Promise<void>((res, rej) => { out.on('close', () => res()); zip.on('error', rej); out.on('error', rej); });
    zip.pipe(out);
    zip.file(dbCopy, { name: 'ppm.sqlite' });
    for (const b of blobs) {
      // Blobs are stored decrypted inside the archive so it can be restored on any server;
      // the archive itself is encrypted below.
      const tmp = path.join(work, 'b-' + uuid());
      try {
        await pipeline(await readBlob(b.key), fs.createWriteStream(tmp, { mode: 0o600 }));
        const st = await fsp.stat(tmp);
        manifest.files.push({ key: b.key, sha256: await sha256File(tmp), size: st.size });
        zip.file(tmp, { name: `blobs/${b.key}` });
      } catch { /* missing blob: recorded by absence in manifest */ }
    }
    zip.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    await zip.finalize();
    await done;
    let final: string;
    if (opts.passphrase || opts.useMasterKey) {
      const salt = crypto.randomBytes(16);
      const key = opts.passphrase ? deriveKey(opts.passphrase, salt) : getMasterKey();
      final = path.join(config.backupDir, id + '.ppmbak');
      const ws = fs.createWriteStream(final, { mode: 0o600 });
      ws.write(Buffer.concat([BAK_MAGIC, Buffer.from([opts.passphrase ? 1 : 2]), salt]));
      await pipeline(fs.createReadStream(zipPath), new EncryptStream(key), ws);
    } else {
      final = path.join(config.backupDir, id + '.zip');
      await fsp.copyFile(zipPath, final);
      await fsp.chmod(final, 0o600);
    }
    const size = (await fsp.stat(final)).size;
    if (s3Configured() && getSettings().storage_mode === 'cloud') await uploadBackupToCloud(final).catch(() => {});
    setSetting('backup_last_at', now());
    setSetting('backup_last_status', `ok:${path.basename(final)}`);
    return { name: path.basename(final), size, files: manifest.files.length, encrypted: !!(opts.passphrase || opts.useMasterKey) };
  } catch (e) {
    setSetting('backup_last_status', `error:${(e as Error).message}`);
    throw e;
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

async function uploadBackupToCloud(file: string) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const c = new S3Client({ region: config.s3.region, endpoint: config.s3.endpoint || undefined, forcePathStyle: config.s3.forcePathStyle, credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey } });
  const st = await fsp.stat(file);
  await c.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: `${config.s3.prefix}backups/${path.basename(file)}`, Body: fs.createReadStream(file), ContentLength: st.size, ServerSideEncryption: 'AES256' }));
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((res, rej) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (e, z) => (e ? rej(e) : res(z!))));
}
async function extractZip(file: string, dest: string) {
  const zip = await openZip(file);
  await new Promise<void>((res, rej) => {
    zip.on('error', rej);
    zip.on('end', () => res());
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName;
      // Directory traversal protection.
      if (name.endsWith('/') || name.includes('..') || path.isAbsolute(name) || !/^(manifest\.json|ppm\.sqlite|blobs\/[a-z0-9/-]+)$/.test(name)) { zip.readEntry(); return; }
      const target = path.join(dest, name);
      if (!target.startsWith(dest + path.sep)) { zip.readEntry(); return; }
      zip.openReadStream(entry, async (err, rs) => {
        if (err) return rej(err);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        rs!.pipe(fs.createWriteStream(target, { mode: 0o600 })).on('finish', () => zip.readEntry()).on('error', rej);
      });
    });
    zip.readEntry();
  });
  zip.close();
}

export async function restoreBackup(file: string, passphrase?: string) {
  const work = path.join(config.tmpDir, uuid());
  await fsp.mkdir(work, { recursive: true, mode: 0o700 });
  try {
    // 1. Decrypt if needed.
    const fd = await fsp.open(file, 'r');
    const head = Buffer.alloc(25);
    await fd.read(head, 0, 25, 0);
    await fd.close();
    let zipPath = file;
    if (head.subarray(0, 8).equals(BAK_MAGIC)) {
      const mode = head[8];
      const salt = head.subarray(9, 25);
      if (mode === 1 && !passphrase) throw Object.assign(new Error('This backup is protected. Enter its passphrase.'), { code: 'passphrase_required' });
      const key = mode === 1 ? deriveKey(passphrase!, salt) : getMasterKey();
      zipPath = path.join(work, 'backup.zip');
      try {
        await pipeline(fs.createReadStream(file, { start: 25 }), new DecryptStream(key), fs.createWriteStream(zipPath, { mode: 0o600 }));
      } catch {
        throw Object.assign(new Error(mode === 1 ? 'Wrong passphrase, or the backup file is damaged.' : 'This backup was encrypted with a different server key.'), { code: 'decrypt_failed' });
      }
    }
    // 2. Extract and verify every checksum before touching live data.
    const ex = path.join(work, 'x');
    await fsp.mkdir(ex, { recursive: true });
    try { await extractZip(zipPath, ex); } catch { throw new Error('This is not a valid backup file.'); }
    let manifest: any;
    try { manifest = JSON.parse(await fsp.readFile(path.join(ex, 'manifest.json'), 'utf8')); } catch { throw new Error('The backup has no manifest.'); }
    if (manifest.app !== 'prompt-manager') throw new Error('This backup is from a different application.');
    if (await sha256File(path.join(ex, 'ppm.sqlite')) !== manifest.db_sha256) throw new Error('Database checksum mismatch: the backup is damaged.');
    for (const f of manifest.files) {
      const p = path.join(ex, 'blobs', f.key);
      if (!fs.existsSync(p) || (await sha256File(p)) !== f.sha256) throw new Error(`File checksum mismatch (${f.key}): the backup is damaged.`);
    }
    // 3. Safety net: back up the current state first.
    const safety = await createBackup({ useMasterKey: true, label: 'pre-restore' });
    // 4. Replace data tables (credentials and sessions are kept as they are).
    db.exec(`ATTACH DATABASE '${path.join(ex, 'ppm.sqlite').replace(/'/g, "''")}' AS r`);
    try {
      db.transaction(() => {
        for (const t of RESTORE_TABLES) {
          const has = db.prepare(`SELECT 1 FROM r.sqlite_master WHERE type='table' AND name=?`).get(t);
          db.exec(`DELETE FROM main.${t}`);
          if (!has) continue;
          const cols = (db.prepare(`PRAGMA main.table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
          const rcols = new Set((db.prepare(`PRAGMA r.table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
          const common = cols.filter((c) => rcols.has(c));
          db.exec(`INSERT INTO main.${t} (${common.join(',')}) SELECT ${common.join(',')} FROM r.${t}`);
        }
        for (const s of db.prepare(`SELECT k, v FROM r.settings`).all() as { k: string; v: string }[]) {
          if (!KEEP_SETTINGS.has(s.k)) db.prepare(`INSERT OR REPLACE INTO main.settings (k, v) VALUES (?, ?)`).run(s.k, s.v);
        }
        const maxRev = Math.max(currentRev(), Number((db.prepare(`SELECT v FROM r.meta WHERE k='rev'`).get() as any)?.v || 0));
        db.prepare(`UPDATE main.meta SET v=? WHERE k='rev'`).run(String(maxRev + 1));
        db.exec(`DELETE FROM main.mutations; DELETE FROM main.blobs;`);
      })();
    } finally {
      db.exec(`DETACH DATABASE r`);
    }
    // 5. Re-store file contents into the active storage (re-encrypted with this server's key).
    for (const f of manifest.files) await storeBlob(path.join(ex, 'blobs', f.key), f.key);
    rebuildIndex();
    resetEpoch(); // every device re-downloads its local copy
    logActivity(null, 'backup', 'restore', 'restored', `Backup restored (${manifest.files.length} files, created ${manifest.created_at}). Previous state saved as ${safety.name}.`);
    return { ok: true, files: manifest.files.length, createdAt: manifest.created_at, safetyBackup: safety.name };
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir).filter((n) => NAME_RE.test(n)).map((n) => {
    const st = fs.statSync(path.join(config.backupDir, n));
    return { name: n, size: st.size, created_at: st.mtime.toISOString(), encrypted: n.endsWith('.ppmbak'), kind: n.startsWith('scheduled') ? 'scheduled' : n.startsWith('pre-restore') ? 'safety' : 'manual' };
  }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function runScheduledBackup() {
  const s = getSettings();
  if (s.backup_schedule === 'off') return;
  const last = listBackups().find((b) => b.kind === 'scheduled');
  const interval = s.backup_schedule === 'daily' ? 86400_000 : 7 * 86400_000;
  if (last && Date.now() - new Date(last.created_at).getTime() < interval - 600_000) return;
  await createBackup({ useMasterKey: true, label: 'scheduled' });
  const scheduled = listBackups().filter((b) => b.kind === 'scheduled');
  for (const old of scheduled.slice(s.backup_keep)) await fsp.rm(path.join(config.backupDir, old.name), { force: true });
}

export async function backupRoutes(app: FastifyInstance) {
  app.get('/api/backups', async () => ({ backups: listBackups(), settings: (({ backup_schedule, backup_keep, backup_last_at, backup_last_status }) => ({ backup_schedule, backup_keep, backup_last_at, backup_last_status }))(getSettings()) }));

  app.post('/api/backups', async (req, reply) => {
    const { passphrase } = (req.body || {}) as { passphrase?: string };
    if (passphrase !== undefined && passphrase !== '' && passphrase.length < 8) return reply.code(400).send({ error: 'Use a passphrase of at least 8 characters.' });
    try {
      const r = await createBackup({ passphrase: passphrase || undefined, useMasterKey: !passphrase });
      logActivity(null, 'backup', r.name, 'created', `Backup created (${r.files} files)`);
      return r;
    } catch (e) { return reply.code(500).send({ error: `Backup failed: ${(e as Error).message}` }); }
  });

  app.get('/api/backups/:name/download', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'Invalid name' });
    const p = path.join(config.backupDir, name);
    if (!fs.existsSync(p)) return reply.code(404).send({ error: 'Backup not found' });
    reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="${name}"`).header('Cache-Control', 'no-store');
    return reply.send(fs.createReadStream(p));
  });

  app.delete('/api/backups/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'Invalid name' });
    await fsp.rm(path.join(config.backupDir, name), { force: true });
    return { ok: true };
  });

  /** Restore from an uploaded file or from a backup stored on the server. */
  app.post('/api/backups/restore', async (req, reply) => {
    let file: string | null = null; let passphrase: string | undefined; let cleanup = false;
    try {
      if (req.isMultipart()) {
        const part = await req.file({ limits: { fileSize: 20 * 1024 * 1024 * 1024 } });
        if (!part) return reply.code(400).send({ error: 'No file received' });
        passphrase = (part.fields.passphrase as any)?.value || undefined;
        file = path.join(config.tmpDir, uuid() + '.upload');
        cleanup = true;
        await pipeline(part.file, fs.createWriteStream(file, { mode: 0o600 }));
      } else {
        const b = req.body as { name: string; passphrase?: string };
        if (!NAME_RE.test(b?.name || '')) return reply.code(400).send({ error: 'Invalid backup name' });
        file = path.join(config.backupDir, b.name);
        passphrase = b.passphrase || undefined;
        if (!fs.existsSync(file)) return reply.code(404).send({ error: 'Backup not found' });
      }
      return await restoreBackup(file, passphrase);
    } catch (e) {
      const err = e as Error & { code?: string };
      return reply.code(400).send({ error: err.message, code: err.code });
    } finally {
      if (cleanup && file) await fsp.rm(file, { force: true });
    }
  });

  app.patch('/api/backups/settings', async (req, reply) => {
    const b = req.body as { backup_schedule?: string; backup_keep?: number };
    if (b.backup_schedule !== undefined) {
      if (!['off', 'daily', 'weekly'].includes(b.backup_schedule)) return reply.code(400).send({ error: 'Invalid schedule' });
      setSetting('backup_schedule', b.backup_schedule as any);
    }
    if (b.backup_keep !== undefined) {
      const n = Number(b.backup_keep);
      if (!Number.isInteger(n) || n < 1 || n > 100) return reply.code(400).send({ error: 'Keep between 1 and 100 backups' });
      setSetting('backup_keep', n);
    }
    return { ok: true };
  });
}

export { Readable };
