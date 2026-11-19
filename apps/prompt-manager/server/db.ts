import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config, ensureDirs } from './config';
import { ENTITIES, ENTITY_NAMES, type EntityName, type FieldType } from '../shared/schema';

ensureDirs();
export const db = new Database(config.dbPath);
try { fs.chmodSync(config.dbPath, 0o600); } catch { /* not supported on this FS */ }
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

const sqlType = (t: FieldType) => (t === 'int' || t === 'bool' ? 'INTEGER' : t === 'real' ? 'REAL' : 'TEXT');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1, password_changed_at TEXT, created_at TEXT NOT NULL,
      security_stamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, last_seen TEXT NOT NULL,
      expires_at TEXT NOT NULL, ua_hash TEXT NOT NULL, ip TEXT, local_key TEXT NOT NULL, csrf TEXT NOT NULL,
      security_stamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_attempts (k TEXT PRIMARY KEY, failures INTEGER NOT NULL, first_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0, lockouts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mutations (mid TEXT PRIMARY KEY, result TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, fields TEXT NOT NULL,
      server_values TEXT NOT NULL, client_values TEXT NOT NULL, created_at TEXT NOT NULL,
      resolved_at TEXT, resolution TEXT
    );
    CREATE TABLE IF NOT EXISTS import_records (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, row_no INTEGER NOT NULL, status TEXT NOT NULL,
      title TEXT, reason TEXT, prompt_id TEXT, raw TEXT
    );
    CREATE INDEX IF NOT EXISTS import_records_job ON import_records(job_id);
    CREATE TABLE IF NOT EXISTS import_previews (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blobs (
      key TEXT PRIMARY KEY, driver TEXT NOT NULL, size INTEGER NOT NULL, stored_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL, encrypted INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS doc_text (version_id TEXT PRIMARY KEY, file_id TEXT NOT NULL, text TEXT NOT NULL, preview TEXT);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, detail TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
      kind UNINDEXED, ref_id UNINDEXED, project_id UNINDEXED, updated_at UNINDEXED, title, body,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
  for (const name of ENTITY_NAMES) {
    const def = ENTITIES[name];
    const cols = Object.entries(def.fields).map(([f, t]) => (f === 'id' ? 'id TEXT PRIMARY KEY' : `${f} ${sqlType(t as FieldType)}`));
    db.exec(`CREATE TABLE IF NOT EXISTS ${def.table} (${cols.join(', ')})`);
    // Additive migrations: add any new columns.
    const existing = new Set((db.prepare(`PRAGMA table_info(${def.table})`).all() as { name: string }[]).map((r) => r.name));
    for (const [f, t] of Object.entries(def.fields)) if (!existing.has(f)) db.exec(`ALTER TABLE ${def.table} ADD COLUMN ${f} ${sqlType(t as FieldType)}`);
    db.exec(`CREATE INDEX IF NOT EXISTS ${def.table}_rev ON ${def.table}(rev)`);
    if ('project_id' in def.fields) db.exec(`CREATE INDEX IF NOT EXISTS ${def.table}_project ON ${def.table}(project_id)`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS prompt_versions_prompt ON prompt_versions(prompt_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS file_versions_file ON file_versions(file_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS steps_collection ON collection_steps(collection_id)`);
  db.prepare(`INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', '0')`).run();
  db.prepare(`INSERT OR IGNORE INTO meta (k, v) VALUES ('epoch', ?)`).run(crypto.randomUUID());
  db.prepare(`INSERT OR IGNORE INTO meta (k, v) VALUES ('schema', '1')`).run();
}
migrate();

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function nextRev(): number {
  const r = db.prepare(`UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'rev' RETURNING v`).get() as { v: string };
  return Number(r.v);
}
export const currentRev = () => Number((db.prepare(`SELECT v FROM meta WHERE k='rev'`).get() as { v: string }).v);
export const getEpoch = () => (db.prepare(`SELECT v FROM meta WHERE k='epoch'`).get() as { v: string }).v;
export const resetEpoch = () => db.prepare(`UPDATE meta SET v=? WHERE k='epoch'`).run(crypto.randomUUID());

// ---------- Row (de)serialisation ----------
export function toDb(entity: EntityName, row: Record<string, unknown>) {
  const fields = ENTITIES[entity].fields as Record<string, FieldType>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const t = fields[k];
    if (!t) continue;
    if (v === undefined) continue;
    if (t === 'json') out[k] = v === null ? null : JSON.stringify(v);
    else if (t === 'bool') out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}

export function fromDb<T = Record<string, unknown>>(entity: EntityName, row: Record<string, unknown> | undefined): T | undefined {
  if (!row) return undefined;
  const fields = ENTITIES[entity].fields as Record<string, FieldType>;
  const out: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(fields)) {
    const v = row[k];
    if (t === 'json') {
      try { out[k] = v == null ? (k.endsWith('values') ? {} : []) : JSON.parse(v as string); } catch { out[k] = []; }
    } else if (t === 'bool') out[k] = !!v;
    else out[k] = v ?? null;
  }
  return out as T;
}

export function getRow<T = Record<string, unknown>>(entity: EntityName, id: string): T | undefined {
  return fromDb<T>(entity, db.prepare(`SELECT * FROM ${ENTITIES[entity].table} WHERE id = ?`).get(id) as Record<string, unknown>);
}

/** Insert a full row (server-side creation). Assigns rev + timestamps. */
export function insertRow<T = Record<string, unknown>>(entity: EntityName, row: Record<string, unknown>): T {
  const ts = now();
  const full = { created_at: ts, updated_at: ts, deleted: 0, deleted_at: null, delete_batch: null, ...row, rev: nextRev() };
  const data = toDb(entity, full);
  const keys = Object.keys(data);
  db.prepare(`INSERT INTO ${ENTITIES[entity].table} (${keys.join(',')}) VALUES (${keys.map((k) => '@' + k).join(',')})`).run(data);
  return getRow<T>(entity, row.id as string)!;
}

/** Patch columns on a row; assigns a new rev. */
export function patchRow<T = Record<string, unknown>>(entity: EntityName, id: string, patch: Record<string, unknown>, touch = true): T {
  const data = toDb(entity, { ...patch, ...(touch ? { updated_at: now() } : {}), rev: nextRev() });
  const keys = Object.keys(data);
  db.prepare(`UPDATE ${ENTITIES[entity].table} SET ${keys.map((k) => `${k}=@${k}`).join(',')} WHERE id=@__id`).run({ ...data, __id: id });
  return getRow<T>(entity, id)!;
}

// ---------- Settings ----------
export const SETTING_DEFAULTS = {
  session_idle_minutes: 30,
  session_max_days: 30,
  upload_max_mb: 50,
  storage_mode: 'local' as 'local' | 'self_hosted' | 'cloud',
  blob_driver: 'disk' as 'disk' | 's3',
  encrypt_files: true,
  sync_interval_seconds: 30,
  backup_schedule: 'off' as 'off' | 'daily' | 'weekly',
  backup_keep: 7,
  backup_last_at: '' as string,
  backup_last_status: '' as string,
  ocr_enabled: false,
  trash_retention_days: 30,
  app_prefs: { default_project_view: 'list', default_prompt_type: 'optional', date_format: 'relative' } as Record<string, unknown>,
};
export type Settings = typeof SETTING_DEFAULTS;

export function getSettings(): Settings {
  const rows = db.prepare(`SELECT k, v FROM settings`).all() as { k: string; v: string }[];
  const s: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.k in SETTING_DEFAULTS) { try { s[r.k] = JSON.parse(r.v); } catch { /* ignore */ } }
  return s as Settings;
}
export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  db.prepare(`INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, JSON.stringify(v));
}
