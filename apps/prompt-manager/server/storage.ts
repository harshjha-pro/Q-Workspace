import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config, s3Configured } from './config';
import { db, now, uuid, getSettings, setSetting } from './db';

// ======================= Encryption (AES-256-GCM, chunked) =======================
// Format: "PPMENC01" | chunkSize(u32) | then repeated [nonce(12) | len(u32) | ciphertext(len) | tag(16)]
const MAGIC = Buffer.from('PPMENC01');
const CHUNK = 64 * 1024;

let masterKey: Buffer | null = null;
export function getMasterKey(): Buffer {
  if (masterKey) return masterKey;
  const env = process.env.PPM_MASTER_KEY;
  if (env) {
    const k = /^[0-9a-f]{64}$/i.test(env) ? Buffer.from(env, 'hex') : Buffer.from(env, 'base64');
    if (k.length !== 32) throw new Error('PPM_MASTER_KEY must be 32 bytes (64 hex chars or base64)');
    return (masterKey = k);
  }
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

// ======================= Drivers =======================
export interface Driver {
  name: 'disk' | 's3';
  putFile(key: string, file: string, size: number): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const safeKey = (k: string) => { if (!/^[a-z0-9/-]{8,120}$/.test(k) || k.includes('..')) throw new Error('Invalid storage key'); return k; };

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

export const driverByName = (n: string): Driver => (n === 's3' ? s3Driver : diskDriver);
export const activeDriver = () => driverByName(getSettings().blob_driver);

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
  const encrypt = getSettings().encrypt_files;
  let toUpload = plainFile;
  if (encrypt) {
    toUpload = path.join(config.tmpDir, uuid() + '.enc');
    await pipeline(fs.createReadStream(plainFile), new EncryptStream(getMasterKey()), fs.createWriteStream(toUpload, { mode: 0o600 }));
  }
  const stored = (await fsp.stat(toUpload)).size;
  const driver = activeDriver();
  try {
    await driver.putFile(key, toUpload, stored);
  } finally {
    if (toUpload !== plainFile) await fsp.rm(toUpload, { force: true });
  }
  db.prepare(`INSERT OR REPLACE INTO blobs (key, driver, size, stored_size, sha256, encrypted, created_at) VALUES (?,?,?,?,?,?,?)`).run(key, driver.name, size, stored, sha, encrypt ? 1 : 0, now());
  return { key, sha256: sha, size };
}

export async function readBlob(key: string): Promise<Readable> {
  const b = db.prepare(`SELECT * FROM blobs WHERE key=?`).get(key) as { driver: string; encrypted: number } | undefined;
  if (!b) throw new Error('File content not found');
  const raw = await driverByName(b.driver).get(key);
  return b.encrypted ? raw.pipe(new DecryptStream(getMasterKey())) : raw;
}

export async function readBlobBuffer(key: string, max = 60 * 1024 * 1024): Promise<Buffer> {
  const s = await readBlob(key);
  const parts: Buffer[] = []; let n = 0;
  for await (const c of s) { n += c.length; if (n > max) { s.destroy(); throw new Error('File too large to process'); } parts.push(c as Buffer); }
  return Buffer.concat(parts);
}

export async function deleteBlobsForFile(fileId: string) {
  const keys = db.prepare(`SELECT id FROM file_versions WHERE file_id=?`).all(fileId) as { id: string }[];
  for (const v of keys) {
    const sk = (db.prepare(`SELECT storage_key FROM version_blobs WHERE version_id=?`).get(v.id) as { storage_key: string } | undefined)?.storage_key;
    if (!sk) continue;
    db.prepare(`DELETE FROM version_blobs WHERE version_id=?`).run(v.id);
    // Blobs can be shared by duplicated projects: only remove when unreferenced.
    const stillUsed = db.prepare(`SELECT 1 FROM version_blobs WHERE storage_key=? LIMIT 1`).get(sk);
    if (!stillUsed) {
      const b = db.prepare(`SELECT driver FROM blobs WHERE key=?`).get(sk) as { driver: string } | undefined;
      if (b) await driverByName(b.driver).delete(sk).catch(() => {});
      db.prepare(`DELETE FROM blobs WHERE key=?`).run(sk);
    }
    db.prepare(`DELETE FROM doc_text WHERE version_id=?`).run(v.id);
  }
}

// Storage keys are deliberately kept out of synced rows.
db.exec(`CREATE TABLE IF NOT EXISTS version_blobs (version_id TEXT PRIMARY KEY, storage_key TEXT NOT NULL)`);
export const blobKeyForVersion = (versionId: string) => (db.prepare(`SELECT storage_key FROM version_blobs WHERE version_id=?`).get(versionId) as { storage_key: string } | undefined)?.storage_key;

// ======================= Storage info & migration =======================
export function storageInfo() {
  const s = getSettings();
  const totals = db.prepare(`SELECT driver, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes, COALESCE(SUM(stored_size),0) AS stored FROM blobs GROUP BY driver`).all() as { driver: string; n: number; bytes: number; stored: number }[];
  let dbBytes = 0;
  try { dbBytes = fs.statSync(config.dbPath).size + (fs.existsSync(config.dbPath + '-wal') ? fs.statSync(config.dbPath + '-wal').size : 0); } catch { /* ignore */ }
  let disk: { total: number; free: number } | null = null;
  try { const st = fs.statfsSync(config.dataDir); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch { /* ignore */ }
  const job = db.prepare(`SELECT * FROM jobs WHERE kind='storage_migration' ORDER BY created_at DESC LIMIT 1`).get();
  return {
    mode: s.storage_mode, driver: s.blob_driver, encrypted: s.encrypt_files, s3Configured: s3Configured(),
    s3: s3Configured() ? { bucket: config.s3.bucket, endpoint: config.s3.endpoint || 'AWS S3', prefix: config.s3.prefix } : null,
    totals, dbBytes, disk, job, host: config.host, dataDir: config.dataDir,
  };
}

let migrating = false;
export async function migrateBlobs(target: 'disk' | 's3', jobId: string) {
  if (migrating) throw new Error('A migration is already running');
  migrating = true;
  const setJob = (status: string, progress: number, detail: unknown) =>
    db.prepare(`UPDATE jobs SET status=?, progress=?, detail=?, updated_at=? WHERE id=?`).run(status, progress, JSON.stringify(detail), now(), jobId);
  try {
    const dst = driverByName(target);
    const pending = db.prepare(`SELECT * FROM blobs WHERE driver<>?`).all(target) as { key: string; driver: string; stored_size: number }[];
    let done = 0; const failures: string[] = [];
    for (const b of pending) {
      const tmp = path.join(config.tmpDir, uuid());
      try {
        const src = driverByName(b.driver);
        await pipeline(await src.get(b.key), fs.createWriteStream(tmp, { mode: 0o600 }));
        const srcHash = await sha256File(tmp);
        await dst.putFile(b.key, tmp, b.stored_size);
        // Verify by reading the copy back and comparing checksums.
        const verifyTmp = tmp + '.v';
        await pipeline(await dst.get(b.key), fs.createWriteStream(verifyTmp, { mode: 0o600 }));
        const dstHash = await sha256File(verifyTmp);
        await fsp.rm(verifyTmp, { force: true });
        if (srcHash !== dstHash) throw new Error('checksum mismatch');
        db.prepare(`UPDATE blobs SET driver=? WHERE key=?`).run(target, b.key); // source copy is kept
      } catch (e) {
        failures.push(`${b.key}: ${(e as Error).message}`);
      } finally {
        await fsp.rm(tmp, { force: true });
      }
      done++;
      setJob('running', pending.length ? done / pending.length : 1, { done, total: pending.length, failures: failures.slice(0, 20) });
    }
    if (failures.length) {
      setJob('failed', 1, { done, total: pending.length, failures: failures.slice(0, 50), message: 'Some files could not be copied. The active storage was not changed and no data was removed.' });
    } else {
      setSetting('blob_driver', target);
      setJob('completed', 1, { done, total: pending.length, message: `All ${pending.length} files copied and verified. Original copies were kept.` });
    }
  } catch (e) {
    setJob('failed', 1, { message: (e as Error).message });
  } finally {
    migrating = false;
  }
}

export function startMigration(target: 'disk' | 's3') {
  const id = uuid();
  db.prepare(`INSERT INTO jobs (id, kind, status, progress, detail, created_at, updated_at) VALUES (?, 'storage_migration', 'running', 0, ?, ?, ?)`).run(id, JSON.stringify({ target }), now(), now());
  void migrateBlobs(target, id);
  return id;
}
