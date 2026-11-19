import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import type { FastifyInstance } from 'fastify';
import { config } from './config';
import { q, now, uuid, getSettings, setSetting, resetEpoch, currentRev, DATA_TABLES, invalidateSettings } from './db';
import { readBlob, readBlobRange, storeBlob, sha256File, EncryptStream, DecryptStream, deriveKey, getMasterKey, activeDriver, deleteBlob } from './storage';
import { assembleUpload } from './files';
import { rebuildIndex } from './search';
import { logActivity } from './activity';

// Archive: "PPMBAK01" | mode (1 = passphrase, 2 = server master key) | salt(16) | encrypted zip
// Zip contents (format 2): manifest.json, data.jsonl (one {t, r} row per line), blobs/<key>
const BAK_MAGIC = Buffer.from('PPMBAK01');
const NAME_RE = /^[a-z0-9-]+\.ppmbak$/;
const KEEP_SETTINGS = new Set(['storage_mode', 'blob_driver', 'backup_last_at', 'backup_last_status']);

export interface BackupRow { name: string; size: number; created_at: string; encrypted: number; kind: string; blob_key: string }

export async function createBackup(opts: { passphrase?: string; label?: string }) {
  const label = opts.label || 'backup';
  const name = `${label}-${now().replace(/[:.]/g, '-').replace(/z$/i, '').toLowerCase()}-${crypto.randomBytes(3).toString('hex')}.ppmbak`;
  const work = path.join(config.tmpDir, uuid());
  await fsp.mkdir(work, { recursive: true, mode: 0o700 });
  try {
    // 1. Logical dump of every data table (engine-independent: SQLite ⇄ MySQL).
    const dataFile = path.join(work, 'data.jsonl');
    const out = fs.createWriteStream(dataFile, { mode: 0o600 });
    const write = (s: string) => new Promise<void>((res) => (out.write(s) ? res() : out.once('drain', () => res())));
    for (const t of [...DATA_TABLES, 'settings']) {
      let offset = 0;
      for (;;) {
        const rows = await q.all(`SELECT * FROM ${t} LIMIT 500 OFFSET ${offset}`);
        for (const r of rows) await write(JSON.stringify({ t, r }) + '\n');
        if (rows.length < 500) break;
        offset += 500;
      }
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    const manifest = { app: 'prompt-manager', format: 2, created_at: now(), rev: await currentRev(), data_sha256: await sha256File(dataFile), files: [] as { key: string; sha256: string; size: number }[] };

    // 2. Zip the dump plus every file version (decrypted, so it restores on any server).
    const zipPath = path.join(work, 'backup.zip');
    const zout = fs.createWriteStream(zipPath, { mode: 0o600 });
    const zip = new ZipArchive({ zlib: { level: 6 } });
    const done = new Promise<void>((res, rej) => { zout.on('close', () => res()); zip.on('error', rej); zout.on('error', rej); });
    zip.pipe(zout);
    zip.file(dataFile, { name: 'data.jsonl' });
    const keys = (await q.all<{ k: string }>(`SELECT DISTINCT storage_key AS k FROM version_blobs`)).map((r) => r.k);
    for (const key of keys) {
      const tmp = path.join(work, 'b-' + uuid());
      try {
        await pipeline(await readBlob(key), fs.createWriteStream(tmp, { mode: 0o600 }));
        const st = await fsp.stat(tmp);
        manifest.files.push({ key, sha256: await sha256File(tmp), size: st.size });
        zip.file(tmp, { name: `blobs/${key}` });
      } catch { /* missing blob: recorded by absence in manifest */ }
    }
    zip.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    await zip.finalize();
    await done;

    // 3. Encrypt (passphrase if given, otherwise the server key) and store via the active driver.
    const salt = crypto.randomBytes(16);
    const key = opts.passphrase ? deriveKey(opts.passphrase, salt) : getMasterKey();
    const final = path.join(work, name);
    const ws = fs.createWriteStream(final, { mode: 0o600 });
    ws.write(Buffer.concat([BAK_MAGIC, Buffer.from([opts.passphrase ? 1 : 2]), salt]));
    await pipeline(fs.createReadStream(zipPath), new EncryptStream(key), ws);
    const size = (await fsp.stat(final)).size;
    const blobKey = `backups/${name.replace(/\.ppmbak$/, '')}`;
    const driver = await activeDriver();
    await driver.putFile(blobKey, final, size);
    await q.run(`DELETE FROM blobs WHERE blob_key=?`, blobKey);
    await q.run(`INSERT INTO blobs (blob_key, driver, size, stored_size, sha256, encrypted, created_at) VALUES (?,?,?,?,?,?,?)`, blobKey, driver.name, size, size, await sha256File(final), 0, now());
    await q.run(`INSERT INTO backups (name, size, created_at, encrypted, kind, blob_key) VALUES (?,?,?,?,?,?)`, name, size, now(), 1, label === 'scheduled' ? 'scheduled' : label === 'pre-restore' ? 'safety' : 'manual', blobKey);
    await setSetting('backup_last_at', now());
    await setSetting('backup_last_status', `ok:${name}`);
    return { name, size, files: manifest.files.length, encrypted: true };
  } catch (e) {
    await setSetting('backup_last_status', `error:${(e as Error).message}`);
    throw e;
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
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
      if (name.endsWith('/') || name.includes('..') || path.isAbsolute(name) || !/^(manifest\.json|data\.jsonl|blobs\/[a-z0-9/-]+)$/.test(name)) { zip.readEntry(); return; }
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

async function tableCols(t: string) {
  const cols = config.databaseUrl
    ? (await q.all<{ c: string }>(`SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, t)).map((r) => r.c)
    : (await q.all<{ c: string }>(`SELECT name AS c FROM pragma_table_info(?)`, t)).map((r) => r.c);
  return new Set(cols);
}

export async function restoreBackup(file: string, passphrase?: string) {
  const work = path.join(config.tmpDir, uuid());
  await fsp.mkdir(work, { recursive: true, mode: 0o700 });
  try {
    // 1. Decrypt.
    const fd = await fsp.open(file, 'r');
    const head = Buffer.alloc(25);
    await fd.read(head, 0, 25, 0);
    await fd.close();
    if (!head.subarray(0, 8).equals(BAK_MAGIC)) throw new Error('This is not a Prompt Manager backup file.');
    const mode = head[8];
    const salt = head.subarray(9, 25);
    if (mode === 1 && !passphrase) throw Object.assign(new Error('This backup is protected. Enter its passphrase.'), { code: 'passphrase_required' });
    const key = mode === 1 ? deriveKey(passphrase!, salt) : getMasterKey();
    const zipPath = path.join(work, 'backup.zip');
    try {
      await pipeline(fs.createReadStream(file, { start: 25 }), new DecryptStream(key), fs.createWriteStream(zipPath, { mode: 0o600 }));
    } catch {
      throw Object.assign(new Error(mode === 1 ? 'Wrong passphrase, or the backup file is damaged.' : 'This backup was encrypted with a different server key.'), { code: 'decrypt_failed' });
    }
    // 2. Extract and verify every checksum before touching live data.
    const ex = path.join(work, 'x');
    await fsp.mkdir(ex, { recursive: true });
    try { await extractZip(zipPath, ex); } catch { throw new Error('This is not a valid backup file.'); }
    let manifest: any;
    try { manifest = JSON.parse(await fsp.readFile(path.join(ex, 'manifest.json'), 'utf8')); } catch { throw new Error('The backup has no manifest.'); }
    if (manifest.app !== 'prompt-manager') throw new Error('This backup is from a different application.');
    if (manifest.format !== 2) throw new Error('This backup was made by an older version and cannot be restored here.');
    const dataFile = path.join(ex, 'data.jsonl');
    if (await sha256File(dataFile) !== manifest.data_sha256) throw new Error('Data checksum mismatch: the backup is damaged.');
    for (const f of manifest.files) {
      const p = path.join(ex, 'blobs', f.key);
      if (!fs.existsSync(p) || (await sha256File(p)) !== f.sha256) throw new Error(`File checksum mismatch (${f.key}): the backup is damaged.`);
    }
    // 3. Safety net: back up the current state first.
    const safety = await createBackup({ label: 'pre-restore' });
    // 4. Replace data tables (credentials and sessions are kept as they are).
    await q.tx(async () => {
      for (const t of DATA_TABLES) await q.run(`DELETE FROM ${t}`);
      const colsCache = new Map<string, Set<string>>();
      const pending = new Map<string, Record<string, unknown>[]>();
      const flush = async (t: string) => {
        const rows = pending.get(t);
        if (!rows?.length) return;
        const cols = [...colsCache.get(t)!].filter((c) => c in rows[0]);
        await q.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES ${rows.map(() => `(${cols.map(() => '?').join(',')})`).join(',')}`, ...rows.flatMap((r) => cols.map((c) => r[c] ?? null)));
        pending.set(t, []);
      };
      const rl = readline.createInterface({ input: fs.createReadStream(dataFile), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line) continue;
        const { t, r } = JSON.parse(line) as { t: string; r: Record<string, unknown> };
        if (t === 'settings') { if (!KEEP_SETTINGS.has(String(r.k))) { await q.run(`DELETE FROM settings WHERE k=?`, r.k); await q.run(`INSERT INTO settings (k, v) VALUES (?,?)`, r.k, r.v); } continue; }
        if (!DATA_TABLES.includes(t)) continue;
        if (!colsCache.has(t)) colsCache.set(t, await tableCols(t));
        const list = pending.get(t) ?? [];
        list.push(r);
        pending.set(t, list);
        if (list.length >= 25) await flush(t);
      }
      for (const t of pending.keys()) await flush(t);
      const maxRev = Math.max(await currentRev(), Number(manifest.rev || 0));
      await q.run(`UPDATE meta SET v=? WHERE k='rev'`, String(maxRev + 1));
      await q.run(`DELETE FROM mutations`);
    });
    invalidateSettings();
    // 5. Re-store file contents with this server's key, then drop files nothing refers to any more
    //    (they remain inside the safety backup).
    for (const f of manifest.files) await storeBlob(path.join(ex, 'blobs', f.key), f.key);
    const referenced = new Set((await q.all<{ k: string }>(`SELECT DISTINCT storage_key AS k FROM version_blobs`)).map((r) => r.k));
    for (const { blob_key } of await q.all<{ blob_key: string }>(`SELECT blob_key FROM blobs WHERE blob_key NOT LIKE 'backups/%'`)) if (!referenced.has(blob_key)) await deleteBlob(blob_key);
    await rebuildIndex();
    await resetEpoch(); // every device re-downloads its local copy
    await logActivity(null, 'backup', 'restore', 'restored', `Backup restored (${manifest.files.length} files, created ${manifest.created_at}). Previous state saved as ${safety.name}.`);
    return { ok: true, files: manifest.files.length, createdAt: manifest.created_at, safetyBackup: safety.name };
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

export async function listBackups() {
  return (await q.all<BackupRow>(`SELECT * FROM backups ORDER BY created_at DESC`)).map((b) => ({ name: b.name, size: Number(b.size), created_at: b.created_at, encrypted: !!Number(b.encrypted), kind: b.kind }));
}

async function removeBackup(name: string) {
  const b = await q.get<BackupRow>(`SELECT * FROM backups WHERE name=?`, name);
  if (!b) return;
  await deleteBlob(b.blob_key);
  await q.run(`DELETE FROM backups WHERE name=?`, name);
}

export async function runScheduledBackup() {
  const s = await getSettings();
  if (s.backup_schedule === 'off') return;
  const last = (await listBackups()).find((b) => b.kind === 'scheduled');
  const interval = s.backup_schedule === 'daily' ? 86400_000 : 7 * 86400_000;
  if (last && Date.now() - new Date(last.created_at).getTime() < interval - 3600_000) return;
  await createBackup({ label: 'scheduled' });
  const scheduled = (await listBackups()).filter((b) => b.kind === 'scheduled');
  for (const old of scheduled.slice(s.backup_keep)) await removeBackup(old.name);
}

async function backupToTempFile(name: string) {
  const b = await q.get<BackupRow>(`SELECT * FROM backups WHERE name=?`, name);
  if (!b) return null;
  const file = path.join(config.tmpDir, uuid() + '.ppmbak');
  await pipeline(await readBlob(b.blob_key), fs.createWriteStream(file, { mode: 0o600 }));
  return file;
}

export async function backupRoutes(app: FastifyInstance) {
  app.get('/api/backups', async () => {
    const s = await getSettings();
    return { backups: await listBackups(), settings: { backup_schedule: s.backup_schedule, backup_keep: s.backup_keep, backup_last_at: s.backup_last_at, backup_last_status: s.backup_last_status } };
  });

  app.post('/api/backups', async (req, reply) => {
    const { passphrase } = (req.body || {}) as { passphrase?: string };
    if (passphrase !== undefined && passphrase !== '' && passphrase.length < 8) return reply.code(400).send({ error: 'Use a passphrase of at least 8 characters.' });
    try {
      const r = await createBackup({ passphrase: passphrase || undefined });
      await logActivity(null, 'backup', r.name, 'created', `Backup created (${r.files} files)`);
      return r;
    } catch (e) { return reply.code(500).send({ error: `Backup failed: ${(e as Error).message}` }); }
  });

  app.get('/api/backups/:name/download', async (req, reply) => {
    const { name } = req.params as { name: string };
    const part = (req.query as { part?: string }).part;
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'Invalid name' });
    const b = await q.get<BackupRow>(`SELECT * FROM backups WHERE name=?`, name);
    if (!b) return reply.code(404).send({ error: 'Backup not found' });
    reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="${name}"`).header('Cache-Control', 'no-store');
    if (part !== undefined && config.transferChunk) {
      const n = Math.max(0, Number(part) || 0);
      const { data, total } = await readBlobRange(b.blob_key, n * config.transferChunk, (n + 1) * config.transferChunk);
      return reply.header('X-PPM-Total', String(total)).header('X-PPM-Parts', String(Math.max(1, Math.ceil(total / config.transferChunk)))).send(data);
    }
    return reply.send(await readBlob(b.blob_key));
  });

  app.delete('/api/backups/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'Invalid name' });
    await removeBackup(name);
    return { ok: true };
  });

  /** Restore from a stored backup, an uploaded file, or a file sent in parts. */
  app.post('/api/backups/restore', async (req, reply) => {
    let file: string | null = null; let passphrase: string | undefined;
    try {
      if (req.isMultipart()) {
        const part = await req.file({ limits: { fileSize: 20 * 1024 * 1024 * 1024 } });
        if (!part) return reply.code(400).send({ error: 'No file received' });
        passphrase = (part.fields.passphrase as any)?.value || undefined;
        file = path.join(config.tmpDir, uuid() + '.upload');
        await pipeline(part.file, fs.createWriteStream(file, { mode: 0o600 }));
      } else {
        const b = req.body as { name?: string; passphrase?: string; upload_id?: string; parts?: number };
        passphrase = b?.passphrase || undefined;
        if (b?.upload_id) {
          file = (await assembleUpload(b.upload_id, Number(b.parts), 20 * 1024 * 1024 * 1024)).file;
        } else {
          if (!NAME_RE.test(b?.name || '')) return reply.code(400).send({ error: 'Invalid backup name' });
          file = await backupToTempFile(b.name!);
          if (!file) return reply.code(404).send({ error: 'Backup not found' });
        }
      }
      return await restoreBackup(file, passphrase);
    } catch (e) {
      const err = e as Error & { code?: string };
      return reply.code(400).send({ error: err.message, code: err.code });
    } finally {
      if (file) await fsp.rm(file, { force: true });
    }
  });

  app.patch('/api/backups/settings', async (req, reply) => {
    const b = req.body as { backup_schedule?: string; backup_keep?: number };
    if (b.backup_schedule !== undefined) {
      if (!['off', 'daily', 'weekly'].includes(b.backup_schedule)) return reply.code(400).send({ error: 'Invalid schedule' });
      await setSetting('backup_schedule', b.backup_schedule as any);
    }
    if (b.backup_keep !== undefined) {
      const n = Number(b.backup_keep);
      if (!Number.isInteger(n) || n < 1 || n > 100) return reply.code(400).send({ error: 'Keep between 1 and 100 backups' });
      await setSetting('backup_keep', n);
    }
    return { ok: true };
  });
}
