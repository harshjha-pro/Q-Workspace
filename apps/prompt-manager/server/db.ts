import crypto from 'node:crypto';
import { config, ensureDirs } from './config';
import { connect, q, isMysql, upsertSql, forUpdate } from './sql';
import { ENTITIES, ENTITY_NAMES, type EntityName, type FieldType } from '../shared/schema';

export { q };
ensureDirs();
// On serverless hosting a database URL is mandatory (checked in buildApp); never open a throwaway SQLite file there.
if (!config.serverless || config.databaseUrl) void connect({ url: config.databaseUrl, sqliteFile: config.dbPath }).catch(() => {});

const SCHEMA_VERSION = '3';

// ---------- Portable column types ----------
type Col = 'id' | 'key' | 'ts' | 'text' | 'long' | 'int' | 'real' | 'blob';
const colType = (t: Col) => isMysql()
  ? ({ id: 'VARCHAR(64)', key: 'VARCHAR(191)', ts: 'VARCHAR(40)', text: 'TEXT', long: 'MEDIUMTEXT', int: 'BIGINT', real: 'DOUBLE', blob: 'LONGBLOB' })[t]
  : ({ id: 'TEXT', key: 'TEXT', ts: 'TEXT', text: 'TEXT', long: 'TEXT', int: 'INTEGER', real: 'REAL', blob: 'BLOB' })[t];

const LONG_FIELDS = new Set(['content', 'body', 'instructions', 'description', 'tags', 'variables', 'variable_values', 'prompt_ids', 'summary']);
function entityCol(field: string, t: FieldType): Col {
  if (t === 'int' || t === 'bool') return 'int';
  if (t === 'real') return 'real';
  if (field === 'id' || field.endsWith('_id') || field === 'delete_batch') return 'id';
  if (field.endsWith('_at') || field === 'due_date') return 'ts';
  if (t === 'json' || LONG_FIELDS.has(field)) return 'long';
  return 'text';
}

interface TableDef { name: string; cols: [string, Col, string?][]; pk: string[]; indexes?: string[][] }
const SYSTEM_TABLES: TableDef[] = [
  { name: 'meta', cols: [['k', 'key', 'NOT NULL'], ['v', 'text', 'NOT NULL']], pk: ['k'] },
  { name: 'users', cols: [['id', 'id', 'NOT NULL'], ['username', 'key', 'NOT NULL'], ['password_hash', 'text', 'NOT NULL'], ['must_change_password', 'int', 'NOT NULL DEFAULT 1'], ['password_changed_at', 'ts'], ['created_at', 'ts', 'NOT NULL'], ['security_stamp', 'id', 'NOT NULL']], pk: ['id'], indexes: [['username']] },
  { name: 'sessions', cols: [['id_hash', 'id', 'NOT NULL'], ['user_id', 'id', 'NOT NULL'], ['created_at', 'ts', 'NOT NULL'], ['last_seen', 'ts', 'NOT NULL'], ['expires_at', 'ts', 'NOT NULL'], ['ua_hash', 'id', 'NOT NULL'], ['ip', 'text'], ['local_key', 'id', 'NOT NULL'], ['csrf', 'id', 'NOT NULL'], ['security_stamp', 'id', 'NOT NULL']], pk: ['id_hash'] },
  { name: 'login_attempts', cols: [['k', 'key', 'NOT NULL'], ['failures', 'int', 'NOT NULL'], ['first_at', 'int', 'NOT NULL'], ['locked_until', 'int', 'NOT NULL DEFAULT 0'], ['lockouts', 'int', 'NOT NULL DEFAULT 0']], pk: ['k'] },
  { name: 'settings', cols: [['k', 'key', 'NOT NULL'], ['v', 'long', 'NOT NULL']], pk: ['k'] },
  { name: 'mutations', cols: [['mid', 'id', 'NOT NULL'], ['result', 'long', 'NOT NULL'], ['created_at', 'ts', 'NOT NULL']], pk: ['mid'] },
  { name: 'conflicts', cols: [['id', 'id', 'NOT NULL'], ['entity', 'id', 'NOT NULL'], ['entity_id', 'id', 'NOT NULL'], ['fields', 'text', 'NOT NULL'], ['server_values', 'long', 'NOT NULL'], ['client_values', 'long', 'NOT NULL'], ['created_at', 'ts', 'NOT NULL'], ['resolved_at', 'ts'], ['resolution', 'text']], pk: ['id'] },
  { name: 'import_records', cols: [['id', 'id', 'NOT NULL'], ['job_id', 'id', 'NOT NULL'], ['row_no', 'int', 'NOT NULL'], ['status', 'id', 'NOT NULL'], ['title', 'text'], ['reason', 'text'], ['prompt_id', 'id'], ['raw', 'long']], pk: ['id'], indexes: [['job_id']] },
  { name: 'import_previews', cols: [['id', 'id', 'NOT NULL'], ['payload', 'long', 'NOT NULL'], ['created_at', 'int', 'NOT NULL']], pk: ['id'] },
  { name: 'blobs', cols: [['blob_key', 'key', 'NOT NULL'], ['driver', 'id', 'NOT NULL'], ['size', 'int', 'NOT NULL'], ['stored_size', 'int', 'NOT NULL'], ['sha256', 'id', 'NOT NULL'], ['encrypted', 'int', 'NOT NULL'], ['created_at', 'ts', 'NOT NULL']], pk: ['blob_key'] },
  { name: 'blob_frames', cols: [['blob_key', 'key', 'NOT NULL'], ['idx', 'int', 'NOT NULL'], ['data', 'blob', 'NOT NULL']], pk: ['blob_key', 'idx'] },
  { name: 'version_blobs', cols: [['version_id', 'id', 'NOT NULL'], ['storage_key', 'key', 'NOT NULL']], pk: ['version_id'], indexes: [['storage_key']] },
  { name: 'upload_parts', cols: [['upload_id', 'id', 'NOT NULL'], ['n', 'int', 'NOT NULL'], ['data', 'blob', 'NOT NULL'], ['created_at', 'int', 'NOT NULL']], pk: ['upload_id', 'n'] },
  { name: 'backups', cols: [['name', 'key', 'NOT NULL'], ['size', 'int', 'NOT NULL'], ['created_at', 'ts', 'NOT NULL'], ['encrypted', 'int', 'NOT NULL'], ['kind', 'id', 'NOT NULL'], ['blob_key', 'key', 'NOT NULL']], pk: ['name'] },
  { name: 'doc_text', cols: [['version_id', 'id', 'NOT NULL'], ['file_id', 'id', 'NOT NULL'], ['text', 'long', 'NOT NULL'], ['preview', 'long']], pk: ['version_id'] },
  { name: 'jobs', cols: [['id', 'id', 'NOT NULL'], ['kind', 'id', 'NOT NULL'], ['status', 'id', 'NOT NULL'], ['progress', 'real', 'NOT NULL DEFAULT 0'], ['detail', 'long'], ['created_at', 'ts', 'NOT NULL'], ['updated_at', 'ts', 'NOT NULL']], pk: ['id'] },
];
const ENTITY_TABLES: TableDef[] = ENTITY_NAMES.map((e) => {
  const def = ENTITIES[e];
  const cols = Object.entries(def.fields).map(([f, t]) => [f, entityCol(f, t as FieldType), f === 'id' ? 'NOT NULL' : undefined] as [string, Col, string?]);
  const indexes = [['rev']];
  for (const k of ['project_id', 'prompt_id', 'file_id', 'collection_id', 'delete_batch']) if (k in def.fields) indexes.push([k]);
  return { name: def.table, cols, pk: ['id'], indexes };
});
export const DATA_TABLES = [...ENTITY_TABLES.map((t) => t.name), 'conflicts', 'import_records', 'doc_text', 'version_blobs'];

async function tableColumns(table: string): Promise<Set<string> | null> {
  const rows = isMysql()
    ? await q.all<{ c: string }>(`SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, table)
    : await q.all<{ c: string }>(`SELECT name AS c FROM pragma_table_info(?)`, table);
  return rows.length ? new Set(rows.map((r) => r.c)) : null;
}

async function ensureTable(t: TableDef) {
  const existing = await tableColumns(t.name);
  if (!existing) {
    const cols = t.cols.map(([n, ty, extra]) => `${n} ${colType(ty)}${extra ? ' ' + extra : ''}`);
    const engine = isMysql() ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    await q.run(`CREATE TABLE IF NOT EXISTS ${t.name} (${cols.join(', ')}, PRIMARY KEY (${t.pk.join(',')}))${engine}`);
  } else {
    if (t.name === 'blobs' && existing.has('key') && !existing.has('blob_key')) await q.run(`ALTER TABLE blobs RENAME COLUMN key TO blob_key`);
    for (const [n, ty] of t.cols) if (!existing.has(n) && !(t.name === 'blobs' && n === 'blob_key')) await q.run(`ALTER TABLE ${t.name} ADD COLUMN ${n} ${colType(ty)}`);
  }
  for (const ix of t.indexes ?? []) {
    const name = `${t.name}_${ix.join('_')}`;
    if (isMysql()) {
      const has = await q.get(`SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, t.name, name);
      if (!has) await q.run(`CREATE INDEX ${name} ON ${t.name} (${ix.join(',')})`);
    } else await q.run(`CREATE INDEX IF NOT EXISTS ${name} ON ${t.name} (${ix.join(',')})`);
  }
}

async function ensureSearchIndex() {
  if (isMysql()) {
    await ensureTable({ name: 'search_index', cols: [['kind', 'id', 'NOT NULL'], ['ref_id', 'id', 'NOT NULL'], ['project_id', 'id'], ['updated_at', 'ts'], ['title', 'text'], ['body', 'long']], pk: ['kind', 'ref_id'] });
    const has = await q.get(`SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'search_index' AND INDEX_NAME = 'search_ft'`);
    if (!has) await q.run(`ALTER TABLE search_index ADD FULLTEXT INDEX search_ft (title, body)`);
  } else {
    await q.run(`CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(kind UNINDEXED, ref_id UNINDEXED, project_id UNINDEXED, updated_at UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2')`);
  }
}

let migrated: Promise<void> | null = null;
/** Create/upgrade the schema. Skipped quickly when the stored schema version is current. */
export function migrate() {
  migrated ??= (async () => {
    try {
      const v = await q.get<{ v: string }>(`SELECT v FROM meta WHERE k = 'schema'`);
      if (v?.v === SCHEMA_VERSION) return;
    } catch { /* first run: meta does not exist */ }
    for (const t of [...SYSTEM_TABLES, ...ENTITY_TABLES]) await ensureTable(t);
    await ensureSearchIndex();
    const ins = isMysql() ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await q.run(`${ins} INTO meta (k, v) VALUES ('rev', '0')`);
    await q.run(`${ins} INTO meta (k, v) VALUES ('epoch', ?)`, crypto.randomUUID());
    await q.run(upsertSql('meta', ['k', 'v'], ['k']), 'schema', SCHEMA_VERSION);
  })().catch((e) => { migrated = null; throw e; });
  return migrated;
}

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Next change number. Runs inside a transaction and locks the counter row, so writers are
 * serialised and revisions become visible in order (no change can be skipped by a sync pull).
 */
export function nextRev(): Promise<number> {
  return q.tx(async () => {
    const r = await q.get<{ v: string }>(`SELECT v FROM meta WHERE k = 'rev'${forUpdate()}`);
    const n = Number(r?.v ?? 0) + 1;
    await q.run(`UPDATE meta SET v = ? WHERE k = 'rev'`, String(n));
    return n;
  });
}
export const currentRev = async () => Number((await q.get<{ v: string }>(`SELECT v FROM meta WHERE k='rev'`))?.v ?? 0);
export const getEpoch = async () => (await q.get<{ v: string }>(`SELECT v FROM meta WHERE k='epoch'`))!.v;
export const resetEpoch = () => q.run(`UPDATE meta SET v=? WHERE k='epoch'`, crypto.randomUUID());

// ---------- Row (de)serialisation ----------
export function toDb(entity: EntityName, row: Record<string, unknown>) {
  const fields = ENTITIES[entity].fields as Record<string, FieldType>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const t = fields[k];
    if (!t || v === undefined) continue;
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
    } else if (t === 'bool') out[k] = !!Number(v);
    else if (t === 'int' || t === 'real') out[k] = v == null ? null : Number(v);
    else out[k] = v ?? null;
  }
  return out as T;
}

export async function getRow<T = Record<string, unknown>>(entity: EntityName, id: string): Promise<T | undefined> {
  return fromDb<T>(entity, await q.get(`SELECT * FROM ${ENTITIES[entity].table} WHERE id = ?`, id));
}
export async function allRows<T = Record<string, unknown>>(entity: EntityName, where: string, ...params: unknown[]): Promise<T[]> {
  return (await q.all(`SELECT * FROM ${ENTITIES[entity].table} WHERE ${where}`, ...params)).map((r) => fromDb<T>(entity, r)!);
}

/** Insert a full row (server-side creation). Assigns rev + timestamps. */
export function insertRow<T = Record<string, unknown>>(entity: EntityName, row: Record<string, unknown>): Promise<T> {
  return q.tx(async () => {
    const ts = now();
    const full = { created_at: ts, updated_at: ts, deleted: 0, deleted_at: null, delete_batch: null, ...row, rev: await nextRev() };
    const data = toDb(entity, full);
    const keys = Object.keys(data);
    await q.run(`INSERT INTO ${ENTITIES[entity].table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => data[k]));
    return (await getRow<T>(entity, row.id as string))!;
  });
}

/** Patch columns on a row; assigns a new rev. */
export function patchRow<T = Record<string, unknown>>(entity: EntityName, id: string, patch: Record<string, unknown>, touch = true): Promise<T> {
  return q.tx(async () => {
    const data = toDb(entity, { ...patch, ...(touch ? { updated_at: now() } : {}), rev: await nextRev() });
    const keys = Object.keys(data);
    await q.run(`UPDATE ${ENTITIES[entity].table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => data[k]), id);
    return (await getRow<T>(entity, id))!;
  });
}

// ---------- Settings ----------
export const SETTING_DEFAULTS = {
  session_idle_minutes: 30,
  session_max_days: 30,
  upload_max_mb: 50,
  storage_mode: (config.serverless ? 'cloud' : 'local') as 'local' | 'self_hosted' | 'cloud',
  blob_driver: (config.serverless || config.databaseUrl ? 'db' : 'disk') as 'disk' | 's3' | 'db',
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

let settingsCache: { at: number; v: Settings } | null = null;
export async function getSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < 3000) return settingsCache.v;
  const rows = await q.all<{ k: string; v: string }>(`SELECT k, v FROM settings`);
  const s: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.k in SETTING_DEFAULTS) { try { s[r.k] = JSON.parse(r.v); } catch { /* ignore */ } }
  if (config.serverless) { s.storage_mode = 'cloud'; s.blob_driver = 'db'; }
  settingsCache = { at: Date.now(), v: s as Settings };
  return s as Settings;
}
export async function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  await q.run(upsertSql('settings', ['k', 'v'], ['k']), k, JSON.stringify(v));
  settingsCache = null;
}
export const invalidateSettings = () => { settingsCache = null; };
