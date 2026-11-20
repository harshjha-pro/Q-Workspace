import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config, s3Configured } from './config';
import { q, now, uuid, getSettings, setSetting } from './db';
import { isMysql, binaryBudget } from './sql';

// ======================= Encryption (AES-256-GCM, chunked) =======================
// Format: "PPMENC01" | chunkSize(u32) | then repeated [nonce(12) | len(u32) | ciphertext(len) | tag(16)]
const MAGIC = Buffer.from('PPMENC01');
const CHUNK = 64 * 1024;

let masterKey: Buffer | null = null;
export function getMasterKey(): Buffer {
  if (masterKey) return masterKey;
  const env = process.env.PPM_MASTER_KEY;
  if (env) {
    // 64 hex chars or 32-byte base64 are used directly; any other value (32+ characters) is
    // stretched into a key, so a long random password works too.
    let k: Buffer | null = null;
    if (/^[0-9a-f]{64}$/i.test(env)) k = Buffer.from(env, 'hex');
    else if (/^[A-Za-z0-9+/]{43}=$/.test(env)) k = Buffer.from(env, 'base64');
    else if (env.length >= 32) k = crypto.scryptSync(env, 'ppm-master-key-v1', 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (!k || k.length !== 32) throw new Error('PPM_MASTER_KEY must be at least 32 characters long');
    return (masterKey = k);
  }
  if (config.serverless) throw new Error('PPM_MASTER_KEY must be set (a random value of at least 32 characters) on serverless deployments.');
  if (!fs.existsSync(config.keyFile)) {
    fs.mkdirSync(path.dirname(config.keyFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(config.keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return (masterKey = Buffer.from(fs.readFileSync(config.keyFile, 'utf8').trim(), 'hex'));
}

export class EncryptStream extends Transform {
  private buf = Buffer.alloc(0);
  private started = false;
  constructor(private key: Buffer) { super(); }
  private emitChunk(chunk: Buffer) {
    const nonce = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, nonce);
    const ct = Buffer.concat([c.update(chunk), c.final()]);
    const len = Buffer.alloc(4); len.writeUInt32BE(ct.length);
    this.push(Buffer.concat([nonce, len, ct, c.getAuthTag()]));
  }
  _transform(data: Buffer, _e: BufferEncoding, cb: TransformCallback) {
    if (!this.started) { const h = Buffer.alloc(4); h.writeUInt32BE(CHUNK); this.push(Buffer.concat([MAGIC, h])); this.started = true; }
    this.buf = Buffer.concat([this.buf, data]);
    while (this.buf.length >= CHUNK) { this.emitChunk(this.buf.subarray(0, CHUNK)); this.buf = this.buf.subarray(CHUNK); }
    cb();
  }
  _flush(cb: TransformCallback) {
    if (!this.started) { const h = Buffer.alloc(4); h.writeUInt32BE(CHUNK); this.push(Buffer.concat([MAGIC, h])); }
    if (this.buf.length) this.emitChunk(this.buf);
    cb();
  }
}

export class DecryptStream extends Transform {
  private buf = Buffer.alloc(0);
  private headerDone = false;
  constructor(private key: Buffer) { super(); }
  _transform(data: Buffer, _e: BufferEncoding, cb: TransformCallback) {
    this.buf = Buffer.concat([this.buf, data]);
    try {
      if (!this.headerDone) {
        if (this.buf.length < 12) return cb();
        if (!this.buf.subarray(0, 8).equals(MAGIC)) throw new Error('Not an encrypted file');
        this.buf = this.buf.subarray(12); this.headerDone = true;
      }
      while (this.buf.length >= 16) {
        const len = this.buf.readUInt32BE(12);
        const total = 12 + 4 + len + 16;
        if (this.buf.length < total) break;
        const nonce = this.buf.subarray(0, 12);
        const ct = this.buf.subarray(16, 16 + len);
        const tag = this.buf.subarray(16 + len, total);
        const d = crypto.createDecipheriv('aes-256-gcm', this.key, nonce);
        d.setAuthTag(tag);
        this.push(Buffer.concat([d.update(ct), d.final()]));
        this.buf = this.buf.subarray(total);
      }
      cb();
    } catch (e) { cb(e as Error); }
  }
  _flush(cb: TransformCallback) { cb(this.buf.length ? new Error('Encrypted data is truncated or corrupted') : null); }
}

export function deriveKey(passphrase: string, salt: Buffer) {
  return crypto.scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export const ENC_CHUNK = CHUNK;
export const isEncMagic = (b: Buffer) => b.length >= 8 && b.subarray(0, 8).equals(MAGIC);
/** Decrypt one stored frame: nonce(12) | len(4) | ciphertext | tag(16). */
export function decryptFrame(key: Buffer, frame: Buffer) {
  const len = frame.readUInt32BE(12);
  const d = crypto.createDecipheriv('aes-256-gcm', key, frame.subarray(0, 12));
  d.setAuthTag(frame.subarray(16 + len, 16 + len + 16));
  return Buffer.concat([d.update(frame.subarray(16, 16 + len)), d.final()]);
}

// ======================= Drivers =======================
export interface Driver {
  name: 'disk' | 's3' | 'db';
  putFile(key: string, file: string, size: number): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const safeKey = (k: string) => { if (!/^[a-z0-9/-]{8,160}$/.test(k) || k.includes('..')) throw new Error('Invalid storage key'); return k; };

export const diskDriver: Driver = {
  name: 'disk',
  async putFile(key, file) {
    const dest = path.join(config.blobDir, safeKey(key));
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(file, dest);
  },
  async get(key) {
    const p = path.join(config.blobDir, safeKey(key));
    await fsp.access(p);
    return fs.createReadStream(p);
  },
  async delete(key) { await fsp.rm(path.join(config.blobDir, safeKey(key)), { force: true }); },
  async exists(key) { return fsp.access(path.join(config.blobDir, safeKey(key))).then(() => true, () => false); },
};

let s3Client: any = null;
async function s3() {
  if (!s3Configured()) throw new Error('Private cloud storage is not configured on the server (set PPM_S3_* environment variables).');
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: config.s3.region, endpoint: config.s3.endpoint || undefined, forcePathStyle: config.s3.forcePathStyle,
      credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
    });
  }
  return s3Client;
}
export const s3Driver: Driver = {
  name: 's3',
  async putFile(key, file, size) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: config.s3.prefix + safeKey(key), Body: fs.createReadStream(file), ContentLength: size, ServerSideEncryption: 'AES256' }));
  },
  async get(key) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const r = await (await s3()).send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: config.s3.prefix + safeKey(key) }));
    return r.Body as Readable;
  },
  async delete(key) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: config.s3.prefix + safeKey(key) }));
  },
  async exists(key) {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try { await (await s3()).send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: config.s3.prefix + safeKey(key) })); return true; } catch { return false; }
  },
};

/**
 * Database driver: stores file bytes inside the database, one row per 64 KB frame.
 * Encrypted files keep their frame boundaries (row 0 = header, row n = frame n-1), so any
 * byte range can be decrypted by loading only the rows it touches.
 */
const FRAMES_PER_INSERT = 12; // ~800 KB per statement, well under MySQL max_allowed_packet
export const dbDriver: Driver = {
  name: 'db',
  async putFile(key, file) {
    safeKey(key);
    const buf = await fsp.readFile(file);
    const rows: Buffer[] = [];
    if (isEncMagic(buf)) {
      rows.push(buf.subarray(0, 12));
      let o = 12;
      while (o < buf.length) { const len = buf.readUInt32BE(o + 12); const end = o + 16 + len + 16; rows.push(buf.subarray(o, end)); o = end; }
    } else for (let o = 0; o < buf.length; o += CHUNK) rows.push(buf.subarray(o, o + CHUNK));
    await q.run(`DELETE FROM blob_frames WHERE blob_key=?`, key);
    // As many frames per statement as the database's packet limit comfortably allows.
    const per = Math.max(1, Math.min(FRAMES_PER_INSERT, Math.floor((await binaryBudget()) / (CHUNK + 64))));
    for (let i = 0; i < rows.length; i += per) {
      const batch = rows.slice(i, i + per);
      await q.run(`INSERT INTO blob_frames (blob_key, idx, data) VALUES ${batch.map(() => '(?,?,?)').join(',')}`, ...batch.flatMap((d, j) => [key, i + j, d]));
    }
  },
  async get(key) {
    safeKey(key);
    const count = Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM blob_frames WHERE blob_key=?`, key))?.n ?? 0);
    if (!count) throw new Error('File content not found');
    let i = 0;
    return Readable.from((async function* () {
      while (i < count) {
        const rows = await q.all<{ data: Buffer }>(`SELECT data FROM blob_frames WHERE blob_key=? AND idx >= ? AND idx < ? ORDER BY idx`, key, i, i + 32);
        for (const r of rows) yield Buffer.from(r.data);
        i += 32;
      }
    })());
  },
  async delete(key) { await q.run(`DELETE FROM blob_frames WHERE blob_key=?`, key); },
  async exists(key) { return !!(await q.get(`SELECT 1 AS x FROM blob_frames WHERE blob_key=? LIMIT 1`, key)); },
};

export const driverByName = (n: string): Driver => (n === 's3' ? s3Driver : n === 'db' ? dbDriver : diskDriver);
export const activeDriver = async () => driverByName((await getSettings()).blob_driver);

// ======================= Blob API =======================
export async function sha256File(file: string) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

/** Store a plaintext temp file as a blob (encrypted at rest when enabled). Returns the blob key. */
export async function storeBlob(plainFile: string, fixedKey?: string): Promise<{ key: string; sha256: string; size: number }> {
  const key = fixedKey ? safeKey(fixedKey) : `${new Date().toISOString().slice(0, 7)}/${uuid()}`;
  const sha = await sha256File(plainFile);
  const size = (await fsp.stat(plainFile)).size;
  const encrypt = (await getSettings()).encrypt_files;
  let toUpload = plainFile;
  if (encrypt) {
    toUpload = path.join(config.tmpDir, uuid() + '.enc');
    await pipeline(fs.createReadStream(plainFile), new EncryptStream(getMasterKey()), fs.createWriteStream(toUpload, { mode: 0o600 }));
  }
  const stored = (await fsp.stat(toUpload)).size;
  const driver = await activeDriver();
  try {
    await driver.putFile(key, toUpload, stored);
  } finally {
    if (toUpload !== plainFile) await fsp.rm(toUpload, { force: true });
  }
  await q.run(`DELETE FROM blobs WHERE blob_key=?`, key);
  await q.run(`INSERT INTO blobs (blob_key, driver, size, stored_size, sha256, encrypted, created_at) VALUES (?,?,?,?,?,?,?)`, key, driver.name, size, stored, sha, encrypt ? 1 : 0, now());
  return { key, sha256: sha, size };
}

const blobMeta = (key: string) => q.get<{ driver: string; encrypted: number; size: number }>(`SELECT driver, encrypted, size FROM blobs WHERE blob_key=?`, key);

export async function readBlob(key: string): Promise<Readable> {
  const b = await blobMeta(key);
  if (!b) throw new Error('File content not found');
  const raw = await driverByName(b.driver).get(key);
  return Number(b.encrypted) ? raw.pipe(new DecryptStream(getMasterKey())) : raw;
}

export async function readBlobBuffer(key: string, max = 60 * 1024 * 1024): Promise<Buffer> {
  const s = await readBlob(key);
  const parts: Buffer[] = []; let n = 0;
  for await (const c of s) { n += c.length; if (n > max) { s.destroy(); throw new Error('File too large to process'); } parts.push(c as Buffer); }
  return Buffer.concat(parts);
}

/** Read plaintext bytes [start, end) of a blob. Efficient for the database driver. */
export async function readBlobRange(key: string, start: number, end: number): Promise<{ data: Buffer; total: number }> {
  const b = await blobMeta(key);
  if (!b) throw new Error('File content not found');
  const total = Number(b.size);
  end = Math.min(end, total);
  if (start >= end) return { data: Buffer.alloc(0), total };
  if (b.driver === 'db') {
    const first = Math.floor(start / CHUNK); const last = Math.floor((end - 1) / CHUNK);
    const enc = !!Number(b.encrypted);
    const off = enc ? 1 : 0; // encrypted blobs keep the header in row 0
    const rows = await q.all<{ idx: number; data: Buffer }>(`SELECT idx, data FROM blob_frames WHERE blob_key=? AND idx >= ? AND idx <= ? ORDER BY idx`, key, first + off, last + off);
    const plain = Buffer.concat(rows.map((r) => (enc ? decryptFrame(getMasterKey(), Buffer.from(r.data)) : Buffer.from(r.data))));
    const s = start - first * CHUNK;
    return { data: plain.subarray(s, s + (end - start)), total };
  }
  const stream = await readBlob(key);
  const parts: Buffer[] = []; let pos = 0;
  for await (const c of stream as AsyncIterable<Buffer>) {
    const cEnd = pos + c.length;
    if (cEnd > start && pos < end) parts.push(c.subarray(Math.max(0, start - pos), Math.min(c.length, end - pos)));
    pos = cEnd;
    if (pos >= end) { (stream as Readable).destroy(); break; }
  }
  return { data: Buffer.concat(parts), total };
}

export async function deleteBlob(key: string) {
  const b = await q.get<{ driver: string }>(`SELECT driver FROM blobs WHERE blob_key=?`, key);
  if (b) await driverByName(b.driver).delete(key).catch(() => {});
  await q.run(`DELETE FROM blobs WHERE blob_key=?`, key);
}

export async function deleteBlobsForFile(fileId: string) {
  for (const v of await q.all<{ id: string }>(`SELECT id FROM file_versions WHERE file_id=?`, fileId)) {
    const sk = (await q.get<{ storage_key: string }>(`SELECT storage_key FROM version_blobs WHERE version_id=?`, v.id))?.storage_key;
    if (!sk) continue;
    await q.run(`DELETE FROM version_blobs WHERE version_id=?`, v.id);
    // Blobs can be shared by duplicated projects: only remove when unreferenced.
    if (!(await q.get(`SELECT 1 AS x FROM version_blobs WHERE storage_key=? LIMIT 1`, sk))) await deleteBlob(sk);
    await q.run(`DELETE FROM doc_text WHERE version_id=?`, v.id);
  }
}

export const blobKeyForVersion = async (versionId: string) => (await q.get<{ storage_key: string }>(`SELECT storage_key FROM version_blobs WHERE version_id=?`, versionId))?.storage_key;

// ======================= Storage info & migration =======================
export async function storageInfo() {
  const s = await getSettings();
  const totals = (await q.all<{ driver: string; n: number; bytes: number; stored: number }>(`SELECT driver, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes, COALESCE(SUM(stored_size),0) AS stored FROM blobs GROUP BY driver`))
    .map((t) => ({ driver: t.driver, n: Number(t.n), bytes: Number(t.bytes), stored: Number(t.stored) }));
  let dbBytes = 0;
  if (isMysql()) dbBytes = Number((await q.get<{ b: number }>(`SELECT COALESCE(SUM(data_length + index_length), 0) AS b FROM information_schema.TABLES WHERE table_schema = DATABASE()`))?.b ?? 0);
  else { try { dbBytes = fs.statSync(config.dbPath).size + (fs.existsSync(config.dbPath + '-wal') ? fs.statSync(config.dbPath + '-wal').size : 0); } catch { /* ignore */ } }
  let disk: { total: number; free: number } | null = null;
  if (!config.serverless) { try { const st = fs.statfsSync(config.dataDir); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch { /* ignore */ } }
  const job = (await q.get(`SELECT * FROM jobs WHERE kind='storage_migration' ORDER BY created_at DESC LIMIT 1`)) ?? null;
  return {
    mode: s.storage_mode, driver: s.blob_driver, encrypted: s.encrypt_files, s3Configured: s3Configured(),
    s3: s3Configured() ? { bucket: config.s3.bucket, endpoint: config.s3.endpoint || 'AWS S3', prefix: config.s3.prefix } : null,
    totals, dbBytes, disk, job, host: config.host, dataDir: config.serverless ? '' : config.dataDir,
    serverless: config.serverless, database: config.databaseUrl ? 'mysql' : 'sqlite',
  };
}

let migrating = false;
export async function migrateBlobs(target: 'disk' | 's3' | 'db', jobId: string) {
  if (migrating) throw new Error('A migration is already running');
  migrating = true;
  const setJob = (status: string, progress: number, detail: unknown) =>
    q.run(`UPDATE jobs SET status=?, progress=?, detail=?, updated_at=? WHERE id=?`, status, progress, JSON.stringify(detail), now(), jobId);
  try {
    const dst = driverByName(target);
    const pending = await q.all<{ blob_key: string; driver: string; stored_size: number }>(`SELECT * FROM blobs WHERE driver<>?`, target);
    let done = 0; const failures: string[] = [];
    for (const b of pending) {
      const tmp = path.join(config.tmpDir, uuid());
      try {
        await pipeline(await driverByName(b.driver).get(b.blob_key), fs.createWriteStream(tmp, { mode: 0o600 }));
        const srcHash = await sha256File(tmp);
        await dst.putFile(b.blob_key, tmp, Number(b.stored_size));
        // Verify by reading the copy back and comparing checksums.
        const verifyTmp = tmp + '.v';
        await pipeline(await dst.get(b.blob_key), fs.createWriteStream(verifyTmp, { mode: 0o600 }));
        const dstHash = await sha256File(verifyTmp);
        await fsp.rm(verifyTmp, { force: true });
        if (srcHash !== dstHash) throw new Error('checksum mismatch');
        await q.run(`UPDATE blobs SET driver=? WHERE blob_key=?`, target, b.blob_key); // source copy is kept
      } catch (e) {
        failures.push(`${b.blob_key}: ${(e as Error).message}`);
      } finally {
        await fsp.rm(tmp, { force: true });
      }
      done++;
      await setJob('running', pending.length ? done / pending.length : 1, { done, total: pending.length, failures: failures.slice(0, 20) });
    }
    if (failures.length) await setJob('failed', 1, { done, total: pending.length, failures: failures.slice(0, 50), message: 'Some files could not be copied. The active storage was not changed and no data was removed.' });
    else { await setSetting('blob_driver', target); await setJob('completed', 1, { done, total: pending.length, message: `All ${pending.length} files copied and verified. Original copies were kept.` }); }
  } catch (e) {
    await setJob('failed', 1, { message: (e as Error).message });
  } finally {
    migrating = false;
  }
}

export async function startMigration(target: 'disk' | 's3' | 'db') {
  const id = uuid();
  await q.run(`INSERT INTO jobs (id, kind, status, progress, detail, created_at, updated_at) VALUES (?, 'storage_migration', 'running', 0, ?, ?, ?)`, id, JSON.stringify({ target }), now(), now());
  void migrateBlobs(target, id);
  return id;
}

export { Transform };
