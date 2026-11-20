import type { FastifyInstance } from 'fastify';
import { q, now, uuid, UUID_RE, getRow, insertRow, patchRow, fromDb, currentRev, getEpoch, getSettings } from './db';
import { ENTITIES, ENTITY_NAMES, DEFAULTS, type EntityName, type FieldType } from '../shared/schema';
import { mergeVariableMeta } from '../shared/variables';
import { logActivity, projectOf } from './activity';
import { reindex } from './search';
import { deleteBlobsForFile } from './storage';
import { config } from './config';

export class MutationError extends Error { constructor(msg: string, public code = 'invalid') { super(msg); } }

const ENUMS: Record<string, string[]> = {
  status: ['not_started', 'in_progress', 'completed'],
  type: ['mandatory', 'optional'],
  category: ['reference', 'additional', 'output'],
  priority: ['', 'low', 'medium', 'high'],
  workflow_status: ['idle', 'running', 'done'],
};
const LONG_TEXT = new Set(['content', 'body', 'instructions', 'description']);

function validateValue(_entity: EntityName, field: string, t: FieldType, v: unknown): unknown {
  if (v === null) {
    if (['name', 'title', 'content', 'project_id', 'collection_id', 'prompt_id'].includes(field)) throw new MutationError(`${field} is required`);
    return null;
  }
  switch (t) {
    case 'text': {
      if (typeof v !== 'string') throw new MutationError(`${field} must be text`);
      if (field === 'avatar') {
        if (v.length > 400_000) throw new MutationError('The display picture is too large');
        if (v && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new MutationError('The display picture must be a PNG, JPEG or WebP image');
        return v;
      }
      const max = LONG_TEXT.has(field) ? 500_000 : field.endsWith('_id') ? 64 : 2_000;
      if (v.length > max) throw new MutationError(`${field} is too long`);
      if (ENUMS[field] && !ENUMS[field].includes(v)) throw new MutationError(`${field} has an invalid value`);
      if (field.endsWith('_id') && v && !UUID_RE.test(v)) throw new MutationError(`${field} is not a valid id`);
      return v;
    }
    case 'int': case 'real':
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new MutationError(`${field} must be a number`);
      return t === 'int' ? Math.trunc(v) : v;
    case 'bool':
      if (typeof v !== 'boolean') throw new MutationError(`${field} must be true/false`);
      return v;
    case 'json': {
      if (field === 'tags') {
        if (!Array.isArray(v) || v.length > 50 || !v.every((x) => typeof x === 'string' && x.length <= 50)) throw new MutationError('Invalid tags');
        return [...new Set(v.map((x: string) => x.trim()).filter(Boolean))];
      }
      if (field === 'prompt_ids') {
        if (!Array.isArray(v) || v.length > 500 || !v.every((x) => typeof x === 'string' && UUID_RE.test(x))) throw new MutationError('Invalid prompt links');
        return [...new Set(v)];
      }
      if (field === 'variables') {
        if (!Array.isArray(v) || v.length > 200) throw new MutationError('Invalid variables');
        return v.map((m: any) => ({ name: String(m?.name ?? '').replace(/[{}]/g, '').trim().slice(0, 64), required: !!m?.required, description: String(m?.description ?? '').slice(0, 500), declared: !!m?.declared })).filter((m) => m.name);
      }
      if (field === 'variable_values') {
        if (typeof v !== 'object' || Array.isArray(v)) throw new MutationError('Invalid variable values');
        const out: Record<string, string> = {};
        for (const [k, val] of Object.entries(v as object).slice(0, 300)) if (typeof val === 'string') out[k.slice(0, 64)] = val.slice(0, 20_000);
        return out;
      }
      return v;
    }
  }
}

function cleanData(entity: EntityName, data: Record<string, unknown>) {
  const def = ENTITIES[entity];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!(def.writable as string[]).includes(k)) continue;
    out[k] = validateValue(entity, k, (def.fields as Record<string, FieldType>)[k], v);
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function requireParent(entity: EntityName, id: string | null | undefined, label: string) {
  if (!id) throw new MutationError(`${label} is required`);
  const r = await getRow<any>(entity, id);
  if (!r || r.deleted === 2) throw new MutationError(`${label} no longer exists`, 'parent_missing');
  return r;
}

const PROMPT_VERSIONED = ['title', 'content', 'description', 'purpose', 'type', 'tags', 'instructions'];

export async function snapshotPrompt(p: any, note: string) {
  await insertRow('prompt_versions', {
    id: uuid(), prompt_id: p.id, version_no: p.version_no, title: p.title, content: p.content, description: p.description,
    purpose: p.purpose, type: p.type, tags: p.tags, instructions: p.instructions, change_note: note.slice(0, 500),
  });
}

async function nextSort(entity: EntityName, key: string, parent: string) {
  const r = await q.get<{ m: number | null }>(`SELECT MAX(sort) AS m FROM ${ENTITIES[entity].table} WHERE ${key}=? AND deleted=0`, parent);
  return Number(r?.m ?? 0) + 1;
}

// ---------- Create ----------
export async function createRecord(entity: EntityName, id: string, raw: Record<string, unknown>, opts: { note?: string; silent?: boolean; extra?: Record<string, unknown> } = {}) {
  const def = ENTITIES[entity];
  const data = { ...(DEFAULTS[entity] as object), ...cleanData(entity, raw), ...(opts.extra || {}) } as Record<string, any>;
  switch (entity) {
    case 'projects':
      if (!data.name?.trim()) throw new MutationError('Name is required');
      if (data.parent_id) {
        const parent = await requireParent('projects', data.parent_id, 'Parent project');
        if (parent.parent_id) throw new MutationError('Subprojects cannot contain further subprojects');
      }
      break;
    case 'prompts':
      await requireParent('projects', data.project_id, 'Project');
      if (!data.title?.trim()) throw new MutationError('Prompt title is required');
      if (!data.content?.trim()) throw new MutationError('Prompt content is required');
      data.variables = mergeVariableMeta(data.content, data.variables, data.instructions);
      data.version_no = 1;
      if (raw.sort === undefined) data.sort = await nextSort('prompts', 'project_id', data.project_id);
      break;
    case 'templates':
      if (!data.title?.trim()) throw new MutationError('Template title is required');
      if (!data.content?.trim()) throw new MutationError('Template content is required');
      data.variables = mergeVariableMeta(data.content, data.variables, data.instructions);
      break;
    case 'collections':
      await requireParent('projects', data.project_id, 'Project');
      if (!data.name?.trim()) throw new MutationError('Collection name is required');
      break;
    case 'collection_steps':
      await requireParent('collections', data.collection_id, 'Collection');
      await requireParent('prompts', data.prompt_id, 'Prompt');
      if (raw.sort === undefined) data.sort = await nextSort('collection_steps', 'collection_id', data.collection_id);
      break;
    case 'tasks':
      await requireParent('projects', data.project_id, 'Project');
      if (!data.title?.trim()) throw new MutationError('Task title is required');
      if (data.done && !data.completed_at) data.completed_at = now();
      if (raw.sort === undefined) data.sort = await nextSort('tasks', 'project_id', data.project_id);
      break;
    case 'notes':
      await requireParent('projects', data.project_id, 'Project');
      data.title = (data.title || '').trim() || 'Untitled note';
      break;
    case 'tags':
      if (!data.name?.trim()) throw new MutationError('Tag name is required');
      data.name = data.name.trim();
      if (await q.get(`SELECT 1 AS x FROM tags WHERE lower(name)=lower(?) AND deleted=0`, data.name)) throw new MutationError('That tag already exists', 'duplicate');
      break;
    case 'files':
      throw new MutationError('Files are created by uploading', 'invalid');
  }
  const row = await insertRow<any>(entity, { ...data, id });
  if (entity === 'prompts') await snapshotPrompt(row, opts.note || 'Created');
  if (!opts.silent && entity !== 'tags') {
    const title = def.titleField ? row[def.titleField] : '';
    await logActivity(await projectOf(entity, row), entity, id, 'created', `${def.label} created${title ? `: ${title}` : ''}`);
  }
  await reindex(entity, id);
  if (entity === 'collection_steps') await reindex('collections', row.collection_id);
  return row;
}

// ---------- Update ----------
const QUIET_FIELDS = new Set(['sort', 'last_accessed_at', 'variable_values', 'current_step_id']);

export async function updateRecord(entity: EntityName, id: string, raw: Record<string, unknown>, base?: Record<string, unknown>, changeNote?: string) {
  const def = ENTITIES[entity];
  const current = await getRow<any>(entity, id);
  if (!current || current.deleted === 2) throw new MutationError(`${def.label} no longer exists`, 'gone');
  const data = cleanData(entity, raw) as Record<string, any>;
  if (current.deleted === 1) {
    // Edited on one device after being deleted on another: keep the edit, surface as a conflict.
    const cid = await recordConflict(entity, id, Object.keys(data), {}, data, 'deleted');
    return { row: current, conflictId: cid, conflictFields: Object.keys(data) };
  }
  // Field-level conflict detection against what the client last saw.
  const conflictFields: string[] = [];
  if (base) {
    for (const f of def.conflictFields as string[]) {
      if (!(f in data) || !(f in base)) continue;
      if (!same(current[f], base[f]) && !same(current[f], data[f])) conflictFields.push(f);
    }
  }
  const apply: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) if (!conflictFields.includes(k) && !same(current[k], v)) apply[k] = v;

  if (entity === 'projects' && 'parent_id' in apply && apply.parent_id) {
    if (apply.parent_id === id) throw new MutationError('A project cannot be its own parent');
    const parent = await requireParent('projects', apply.parent_id, 'Parent project');
    if (parent.parent_id) throw new MutationError('Subprojects cannot contain further subprojects');
    if (await q.get(`SELECT 1 AS x FROM projects WHERE parent_id=? AND deleted=0`, id)) throw new MutationError('A project with subprojects cannot become a subproject');
  }
  if (entity === 'prompts' && 'project_id' in apply) await requireParent('projects', apply.project_id, 'Project');
  if (entity === 'tasks' && 'done' in apply) apply.completed_at = apply.done ? now() : null;
  if (entity === 'collection_steps' && 'completed' in apply) apply.completed_at = apply.completed ? now() : null;
  if ((entity === 'prompts' || entity === 'templates') && ('content' in apply || 'instructions' in apply || 'variables' in apply)) {
    apply.variables = mergeVariableMeta(apply.content ?? current.content, apply.variables ?? current.variables, apply.instructions ?? current.instructions);
  }
  if ((entity === 'prompts' || entity === 'templates') && 'content' in apply && !String(apply.content).trim()) throw new MutationError('Prompt content cannot be empty');
  if ('name' in apply && !String(apply.name).trim()) throw new MutationError('Name cannot be empty');
  if ('title' in apply && entity !== 'notes' && !String(apply.title).trim()) throw new MutationError('Title cannot be empty');

  let row = current;
  if (Object.keys(apply).length) {
    const versioned = entity === 'prompts' && PROMPT_VERSIONED.some((f) => f in apply);
    if (versioned) apply.version_no = current.version_no + 1;
    const quiet = Object.keys(apply).every((k) => QUIET_FIELDS.has(k));
    row = await patchRow<any>(entity, id, apply, !quiet);
    if (versioned) await snapshotPrompt(row, changeNote || 'Edited');
    if (!quiet && entity !== 'tags') {
      const title = def.titleField ? row[def.titleField] : '';
      let summary = `${def.label} updated${title ? `: ${title}` : ''}`;
      if (entity === 'tasks' && 'done' in apply) summary = `Task ${apply.done ? 'completed' : 'reopened'}: ${row.title}`;
      if (entity === 'projects' && 'status' in apply) summary = `Status changed to ${String(apply.status).replace('_', ' ')}: ${row.name}`;
      if (entity === 'collection_steps' && 'completed' in apply) summary = `Workflow step ${apply.completed ? 'completed' : 'reopened'}`;
      await logActivity(await projectOf(entity, row), entity, id, 'updated', summary);
    }
    await reindex(entity, id);
  }
  let conflictId: string | undefined;
  if (conflictFields.length) {
    const serverVals: Record<string, unknown> = {}; const clientVals: Record<string, unknown> = {};
    for (const f of conflictFields) { serverVals[f] = current[f]; clientVals[f] = data[f]; }
    conflictId = await recordConflict(entity, id, conflictFields, serverVals, clientVals, 'edit');
  }
  return { row, conflictId, conflictFields };
}

async function recordConflict(entity: EntityName, entityId: string, fields: string[], serverVals: Record<string, unknown>, clientVals: Record<string, unknown>, kind: string) {
  const id = uuid();
  await q.run(`INSERT INTO conflicts (id, entity, entity_id, fields, server_values, client_values, created_at, resolution) VALUES (?,?,?,?,?,?,?,?)`,
    id, entity, entityId, JSON.stringify(fields), JSON.stringify(serverVals), JSON.stringify(clientVals), now(), kind === 'deleted' ? 'pending:deleted' : null);
  return id;
}

// ---------- Delete (soft, cascading, restorable) ----------
const ids = async (sql: string, ...p: unknown[]) => (await q.all<{ id: string }>(sql, ...p)).map((r) => r.id);

async function childrenOf(entity: EntityName, id: string): Promise<[EntityName, string][]> {
  const out: [EntityName, string][] = [];
  if (entity === 'projects') {
    const projects = [id, ...(await ids(`SELECT id FROM projects WHERE parent_id=? AND deleted=0`, id))];
    for (const pid of projects) {
      if (pid !== id) out.push(['projects', pid]);
      for (const t of ['prompts', 'collections', 'files', 'tasks', 'notes'] as EntityName[]) {
        for (const cid of await ids(`SELECT id FROM ${t} WHERE project_id=? AND deleted=0`, pid)) {
          out.push([t, cid]);
          if (t === 'collections') for (const s of await ids(`SELECT id FROM collection_steps WHERE collection_id=? AND deleted=0`, cid)) out.push(['collection_steps', s]);
        }
      }
    }
  }
  if (entity === 'collections') for (const s of await ids(`SELECT id FROM collection_steps WHERE collection_id=? AND deleted=0`, id)) out.push(['collection_steps', s]);
  if (entity === 'prompts') for (const s of await ids(`SELECT id FROM collection_steps WHERE prompt_id=? AND deleted=0`, id)) out.push(['collection_steps', s]);
  return out;
}

export async function deleteRecord(entity: EntityName, id: string) {
  const def = ENTITIES[entity];
  const current = await getRow<any>(entity, id);
  if (!current || current.deleted) return current;
  const batch = uuid();
  const t = now();
  const items: [EntityName, string][] = [[entity, id], ...(await childrenOf(entity, id))];
  // Steps referencing deleted prompts inside a project cascade too.
  if (entity === 'projects') for (const [e, pid] of [...items]) if (e === 'prompts') for (const c of await childrenOf('prompts', pid)) if (!items.some(([, x]) => x === c[1])) items.push(c);
  for (const [e, rid] of items) {
    // Tags are not restorable; remove them outright (deleted=2) and strip from records.
    await patchRow(e, rid, { deleted: e === 'tags' ? 2 : 1, deleted_at: t, delete_batch: batch }, false);
    await reindex(e, rid);
  }
  if (entity === 'tags') await stripTag(current.name);
  const title = def.titleField ? current[def.titleField] : '';
  if (entity !== 'tags' && entity !== 'collection_steps') await logActivity(await projectOf(entity, current), entity, id, 'deleted', `${def.label} moved to trash${title ? `: ${title}` : ''}`);
  return getRow(entity, id);
}

const TAGGED: EntityName[] = ['projects', 'prompts', 'templates', 'files'];
export async function stripTag(name: string, replacement?: string) {
  for (const e of TAGGED) {
    const rows = await q.all<{ id: string; tags: string }>(`SELECT id, tags FROM ${ENTITIES[e].table} WHERE tags LIKE ?`, `%${JSON.stringify(name).slice(1, -1)}%`);
    for (const r of rows) {
      const tags: string[] = JSON.parse(r.tags || '[]');
      if (!tags.includes(name)) continue;
      const next = [...new Set(tags.map((t) => (t === name ? replacement : t)).filter(Boolean) as string[])];
      await patchRow(e, r.id, { tags: next }, false);
      await reindex(e, r.id);
    }
  }
}

export async function restoreBatch(batch: string) {
  let n = 0;
  for (const e of ENTITY_NAMES) {
    for (const id of await ids(`SELECT id FROM ${ENTITIES[e].table} WHERE delete_batch=? AND deleted=1`, batch)) {
      await patchRow(e, id, { deleted: 0, deleted_at: null, delete_batch: null }, false);
      await reindex(e, id);
      n++;
    }
  }
  return n;
}

export async function purgeBatch(batch: string) {
  for (const e of ENTITY_NAMES) {
    for (const id of await ids(`SELECT id FROM ${ENTITIES[e].table} WHERE delete_batch=? AND deleted=1`, batch)) {
      if (e === 'files') await deleteBlobsForFile(id);
      // Keep a minimal tombstone so other devices learn about the removal.
      const blank: Record<string, unknown> = { deleted: 2 };
      for (const f of ['content', 'body', 'description', 'instructions']) if (f in ENTITIES[e].fields) blank[f] = '';
      await patchRow(e, id, blank, false);
      if (e === 'prompts') for (const v of await ids(`SELECT id FROM prompt_versions WHERE prompt_id=?`, id)) await patchRow('prompt_versions', v, { deleted: 2, content: '' }, false);
    }
  }
}

async function deletedBatches(where = 'deleted=1', ...params: unknown[]) {
  const batches = new Set<string>();
  for (const e of ENTITY_NAMES) for (const r of await q.all<{ b: string }>(`SELECT DISTINCT delete_batch AS b FROM ${ENTITIES[e].table} WHERE ${where}`, ...params)) if (r.b) batches.add(r.b);
  return batches;
}

export async function purgeExpiredTrash() {
  const days = (await getSettings()).trash_retention_days;
  const cut = new Date(Date.now() - days * 86400_000).toISOString();
  for (const b of await deletedBatches('deleted=1 AND deleted_at < ?', cut)) await q.tx(() => purgeBatch(b));
}

// ---------- Mutation dispatcher ----------
export interface Mutation { mid: string; entity: EntityName; op: 'create' | 'update' | 'delete'; id: string; data?: Record<string, unknown>; base?: Record<string, unknown>; note?: string }

export async function applyMutation(m: Mutation) {
  if (typeof m.mid !== 'string' || m.mid.length > 64) return { status: 'error', error: 'Invalid mutation id' };
  const prior = await q.get<{ result: string }>(`SELECT result FROM mutations WHERE mid=?`, m.mid);
  if (prior) return JSON.parse(prior.result);
  let result: Record<string, unknown>;
  try {
    if (!ENTITY_NAMES.includes(m.entity) || !ENTITIES[m.entity].clientWritable) throw new MutationError('This item cannot be changed directly');
    if (!UUID_RE.test(m.id)) throw new MutationError('Invalid id');
    result = await q.tx(async () => {
      let r: Record<string, unknown>;
      if (m.op === 'create') {
        const existing = await getRow<any>(m.entity, m.id);
        r = existing ? { status: 'ok', row: existing } : { status: 'ok', row: await createRecord(m.entity, m.id, m.data || {}, { note: m.note }) };
      } else if (m.op === 'update') {
        const u = await updateRecord(m.entity, m.id, m.data || {}, m.base, m.note);
        r = u.conflictId ? { status: 'conflict', row: u.row, conflictId: u.conflictId, fields: u.conflictFields } : { status: 'ok', row: u.row };
      } else if (m.op === 'delete') r = { status: 'ok', row: await deleteRecord(m.entity, m.id) };
      else throw new MutationError('Unknown operation');
      // Recorded in the same transaction so a retried mutation is never applied twice.
      await q.run(`INSERT INTO mutations (mid, result, created_at) VALUES (?,?,?)`, m.mid, JSON.stringify({ ...r, row: undefined, replay: true }), now());
      return r;
    });
  } catch (e) {
    if (!(e instanceof MutationError)) throw e;
    result = { status: 'error', error: e.message, code: e.code, row: (await getRow(m.entity, m.id)) ?? null };
  }
  return result;
}

// ---------- Routes ----------
const PULL_BYTE_BUDGET = config.serverless ? 2_500_000 : 20_000_000;

export async function syncRoutes(app: FastifyInstance) {
  app.get('/api/sync/pull', async (req) => {
    const qp = req.query as { since?: string; limit?: string };
    const since = Math.max(0, Number(qp.since) || 0);
    const limit = Math.min(Math.max(Number(qp.limit) || 4000, 50), 10000);
    const top = await currentRev();
    // Candidates in rev order across tables (only committed rows up to `top` are visible).
    const cand: { e: EntityName; row: Record<string, unknown>; rev: number; size: number }[] = [];
    for (const e of ENTITY_NAMES) {
      for (const r of await q.all(`SELECT * FROM ${ENTITIES[e].table} WHERE rev > ? AND rev <= ? ORDER BY rev LIMIT ?`, since, top, limit)) {
        const row = fromDb(e, r)!;
        cand.push({ e, row, rev: Number(r.rev), size: JSON.stringify(row).length });
      }
    }
    cand.sort((a, b) => a.rev - b.rev);
    const changes: Record<string, unknown[]> = {};
    let bytes = 0; let count = 0; let last = since;
    for (const c of cand) {
      if (count >= limit || (count > 0 && bytes + c.size > PULL_BYTE_BUDGET)) break;
      (changes[c.e] ??= []).push(c.row);
      bytes += c.size; count++; last = c.rev;
    }
    const more = count < cand.length || (count >= limit);
    const rev = more ? last : top;
    const conflicts = Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM conflicts WHERE resolved_at IS NULL`))?.n ?? 0);
    return { epoch: await getEpoch(), rev, more: more && last < top, count, changes, conflicts };
  });

  app.post('/api/sync/push', { bodyLimit: 20 * 1024 * 1024 }, async (req, reply) => {
    const body = req.body as { mutations?: Mutation[] };
    if (!Array.isArray(body?.mutations) || body.mutations.length > 500) return reply.code(400).send({ error: 'Invalid batch' });
    const results = [];
    for (const m of body.mutations) results.push({ mid: m.mid, ...(await applyMutation(m)) });
    return { results, rev: await currentRev() };
  });

  // Conflicts
  app.get('/api/conflicts', async () => {
    const rows = await q.all(`SELECT * FROM conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC`);
    return Promise.all(rows.map(async (r) => ({ ...r, fields: JSON.parse(r.fields), server_values: JSON.parse(r.server_values), client_values: JSON.parse(r.client_values), current: await getRow(r.entity, r.entity_id) })));
  });

  app.post('/api/conflicts/:id/resolve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { choice } = req.body as { choice: 'server' | 'client' | 'both' };
    const c = await q.get(`SELECT * FROM conflicts WHERE id=? AND resolved_at IS NULL`, id);
    if (!c) return reply.code(404).send({ error: 'Conflict not found or already resolved' });
    const entity = c.entity as EntityName;
    const clientVals = JSON.parse(c.client_values);
    try {
      await q.tx(async () => {
        const row = await getRow<any>(entity, c.entity_id);
        if (choice === 'client') {
          if (row?.deleted === 1) await restoreBatch(row.delete_batch);
          await updateRecord(entity, c.entity_id, clientVals, undefined, 'Conflict resolved: kept this device’s version');
        } else if (choice === 'both') {
          if (!row) throw new MutationError('Original item is gone');
          const copy: Record<string, unknown> = {};
          for (const f of ENTITIES[entity].writable as string[]) copy[f] = row[f];
          Object.assign(copy, clientVals);
          const tf = ENTITIES[entity].titleField;
          if (tf) copy[tf] = `${clientVals[tf] ?? row[tf]} (conflicted copy)`;
          await createRecord(entity, uuid(), copy, { note: 'Created from conflicting edit' });
        }
        await q.run(`UPDATE conflicts SET resolved_at=?, resolution=? WHERE id=?`, now(), choice, id);
      });
    } catch (e) {
      if (e instanceof MutationError) return reply.code(400).send({ error: e.message });
      throw e;
    }
    return { ok: true };
  });

  // Trash
  app.get('/api/trash', async () => {
    const out: any[] = [];
    for (const e of ENTITY_NAMES) {
      const def = ENTITIES[e];
      if (!def.clientWritable || e === 'collection_steps' || e === 'tags') continue;
      for (const r of await q.all(`SELECT * FROM ${def.table} WHERE deleted=1 ORDER BY deleted_at DESC`)) {
        out.push({ entity: e, id: r.id, title: def.titleField ? r[def.titleField] : def.label, batch: r.delete_batch, deleted_at: r.deleted_at, project_id: r.project_id ?? r.parent_id ?? null });
      }
    }
    // One entry per batch: the root item is the one whose parent was not deleted with it.
    const groups = new Map<string, any[]>();
    for (const r of out) { const g = groups.get(r.batch) ?? []; g.push(r); groups.set(r.batch, g); }
    const roots = [...groups.values()].map((items) => {
      const set = new Set(items.map((i) => i.id));
      const root = items.find((i) => i.entity === 'projects' && !set.has(i.project_id)) ?? items.find((i) => !i.project_id || !set.has(i.project_id)) ?? items[0];
      return { ...root, count: items.length };
    });
    return roots.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
  });
  app.post('/api/trash/:batch/restore', async (req) => ({ restored: await q.tx(() => restoreBatch((req.params as any).batch)) }));
  app.post('/api/trash/:batch/purge', async (req) => { await q.tx(() => purgeBatch((req.params as any).batch)); return { ok: true }; });
  app.post('/api/trash/empty', async () => {
    const batches = await deletedBatches();
    for (const b of batches) await q.tx(() => purgeBatch(b));
    return { purged: batches.size };
  });

  // Tags: rename across all records.
  app.post('/api/tags/rename', async (req, reply) => {
    const { from, to } = req.body as { from: string; to: string };
    const next = (to || '').trim();
    if (!from || !next || next.length > 50) return reply.code(400).send({ error: 'Enter a tag name' });
    await q.tx(async () => {
      const tag = await q.get<{ id: string }>(`SELECT id FROM tags WHERE name=? AND deleted=0`, from);
      if (tag) await patchRow('tags', tag.id, { name: next });
      await stripTag(from, next);
    });
    return { ok: true };
  });

  app.get('/api/import-jobs/:id/records', async (req) => q.all(`SELECT row_no, status, title, reason FROM import_records WHERE job_id=? ORDER BY row_no`, (req.params as any).id));
}
