// Async SQL layer with two interchangeable backends:
//   - SQLite (better-sqlite3)  — local-only / self-hosted (default)
//   - MySQL / MariaDB (mysql2) — e.g. a Hostinger database, used by the Vercel deployment
// All SQL in the app uses `?` placeholders and syntax both engines accept; the few
// differences are expressed through the helpers exported here.
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';

export type Dialect = 'sqlite' | 'mysql';
export interface RunResult { changes: number; insertId: number }
type Row = Record<string, any>;

interface Backend {
  dialect: Dialect;
  all(sql: string, params: unknown[], conn?: unknown): Promise<Row[]>;
  run(sql: string, params: unknown[], conn?: unknown): Promise<RunResult>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const txStore = new AsyncLocalStorage<{ conn: unknown }>();

// ---------------- SQLite ----------------
async function sqliteBackend(file: string): Promise<Backend> {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(file);
  try { fs.chmodSync(file, 0o600); } catch { /* not supported on this FS */ }
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  // One connection: serialise transactions so concurrent requests never interleave inside one.
  let lock: Promise<void> = Promise.resolve();
  const waitIfLocked = async () => { if (!txStore.getStore()) await lock; };
  const norm = (p: unknown[]) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  return {
    dialect: 'sqlite',
    async all(sql, params) { await waitIfLocked(); return db.prepare(sql).all(...norm(params)) as Row[]; },
    async run(sql, params) {
      await waitIfLocked();
      const r = db.prepare(sql).run(...norm(params));
      return { changes: r.changes, insertId: Number(r.lastInsertRowid) };
    },
    async tx(fn) {
      if (txStore.getStore()) return fn();
      let release!: () => void;
      const prev = lock;
      lock = new Promise<void>((r) => (release = r));
      await prev;
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = await txStore.run({ conn: db }, fn);
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally { release(); }
    },
    async close() { db.close(); },
  };
}

// ---------------- MySQL / MariaDB ----------------
async function mysqlBackend(url: string): Promise<Backend> {
  const mysql = await import('mysql2/promise');
  const u = new URL(url);
  const sslMode = (u.searchParams.get('ssl') || process.env.PPM_DB_SSL || 'preferred').toLowerCase();
  const base = {
    host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')), charset: 'utf8mb4', timezone: 'Z', dateStrings: true,
    connectionLimit: Number(process.env.PPM_DB_POOL || 4), maxIdle: 2, idleTimeout: 30_000, enableKeepAlive: true, connectTimeout: 15_000,
    supportBigNumbers: true, bigNumberStrings: false,
  };
  const make = (ssl: boolean) => mysql.createPool({ ...base, ...(ssl ? { ssl: { rejectUnauthorized: sslMode === 'verify', minVersion: 'TLSv1.2' } } : {}) });
  let pool = make(sslMode !== 'off');
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    // 'preferred': fall back to an unencrypted connection only if the server has no TLS.
    if (sslMode === 'preferred' && /ssl|tls|secure/i.test(String((e as Error).message))) {
      await pool.end().catch(() => {});
      pool = make(false);
      await pool.query('SELECT 1');
      console.warn('Database connection is NOT encrypted (server does not offer TLS). Set PPM_DB_SSL=required to refuse this.');
    } else throw e;
  }
  const norm = (p: unknown[]) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  const target = () => (txStore.getStore()?.conn as any) ?? pool;
  return {
    dialect: 'mysql',
    async all(sql, params) { const [rows] = await target().query(sql, norm(params)); return rows as Row[]; },
    async run(sql, params) { const [r] = await target().query(sql, norm(params)); return { changes: (r as any).affectedRows ?? 0, insertId: Number((r as any).insertId ?? 0) }; },
    async tx(fn) {
      if (txStore.getStore()) return fn();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await txStore.run({ conn }, fn);
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally { conn.release(); }
    },
    async close() { await pool.end(); },
  };
}

// ---------------- Public API ----------------
let backend: Backend | null = null;
let ready: Promise<Backend> | null = null;
let lastOpts: { url?: string; sqliteFile: string } | null = null;

/** Connect lazily; a failed connection is retried on the next query instead of crashing the process. */
export function connect(opts: { url?: string; sqliteFile: string }) {
  lastOpts = opts;
  if (!ready) {
    ready = (async () => (backend = opts.url && /^mysql|^mariadb/.test(opts.url) ? await mysqlBackend(opts.url.replace(/^mariadb/, 'mysql')) : await sqliteBackend(opts.sqliteFile)))();
    ready.catch(() => { ready = null; backend = null; });
  }
  return ready;
}
const b = async () => {
  if (backend) return backend;
  if (!ready && !lastOpts) throw new Error('Database connection is closed');
  return ready ?? connect(lastOpts!);
};

export const dialect = () => backend?.dialect ?? 'sqlite';
export const isMysql = () => dialect() === 'mysql';

export const q = {
  all: async <T = Row>(sql: string, ...params: unknown[]) => (await (await b()).all(sql, params)) as T[],
  get: async <T = Row>(sql: string, ...params: unknown[]) => ((await (await b()).all(sql, params))[0] as T | undefined),
  run: async (sql: string, ...params: unknown[]) => (await b()).run(sql, params),
  /** Run each `;`-terminated statement (no params). */
  exec: async (sqlText: string) => { for (const s of sqlText.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) await (await b()).run(s.replace(/;$/, ''), []); },
  tx: async <T>(fn: () => Promise<T>) => (await b()).tx(fn),
  inTx: () => !!txStore.getStore(),
  close: async () => { const cur = backend ?? (ready ? await ready.catch(() => null) : null); lastOpts = null; backend = null; ready = null; if (cur) await cur.close(); },
};

/** INSERT ... or update the non-key columns when the key already exists. */
export function upsertSql(table: string, cols: string[], keys: string[]) {
  const ph = cols.map(() => '?').join(',');
  const upd = cols.filter((c) => !keys.includes(c));
  if (isMysql()) return `INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) ON DUPLICATE KEY UPDATE ${upd.length ? upd.map((c) => `${c}=VALUES(${c})`).join(',') : `${keys[0]}=${keys[0]}`}`;
  return `INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) ON CONFLICT(${keys.join(',')}) DO ${upd.length ? `UPDATE SET ${upd.map((c) => `${c}=excluded.${c}`).join(',')}` : 'NOTHING'}`;
}
export const insertIgnore = () => (isMysql() ? 'INSERT IGNORE' : 'INSERT OR IGNORE');
export const forUpdate = () => (isMysql() ? ' FOR UPDATE' : '');
