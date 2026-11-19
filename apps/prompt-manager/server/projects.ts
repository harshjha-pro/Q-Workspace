import type { FastifyInstance } from 'fastify';
import Papa from 'papaparse';
import { db, uuid, UUID_RE, getRow, insertRow, fromDb, getSettings, setSetting, SETTING_DEFAULTS, now, type Settings } from './db';
import { createRecord, updateRecord, MutationError } from './sync';
import { logActivity } from './activity';
import { reindex } from './search';
import { fillVariables } from '../shared/variables';
import { ENTITIES, ENTITY_NAMES, type Prompt, type Project, type Template, type FileRec, type FileVersion } from '../shared/schema';
import { storageInfo, startMigration } from './storage';
import { config, s3Configured } from './config';

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

function duplicateProject(srcId: string, parentId: string | null, name: string, includeFiles: boolean, map = new Map<string, string>()): string {
  const src = getRow<Project>('projects', srcId)!;
  const newId = uuid();
  map.set(srcId, newId);
  createRecord('projects', newId, { ...pick(src, ENTITIES.projects.writable), parent_id: parentId, name, favourite: false, pinned: false, archived: false, last_accessed_at: null }, { silent: true });
  const promptMap = new Map<string, string>();
  for (const p of db.prepare(`SELECT * FROM prompts WHERE project_id=? AND deleted=0 ORDER BY sort`).all(srcId).map((r: any) => fromDb<Prompt>('prompts', r)!)) {
    const id = uuid(); promptMap.set(p.id, id);
    createRecord('prompts', id, { ...pick(p, ENTITIES.prompts.writable), project_id: newId }, { silent: true, note: `Duplicated from “${src.name}”` });
  }
  for (const c of db.prepare(`SELECT * FROM collections WHERE project_id=? AND deleted=0`).all(srcId) as any[]) {
    const cid = uuid();
    createRecord('collections', cid, { project_id: newId, name: c.name, description: c.description, sort: c.sort }, { silent: true });
    for (const s of db.prepare(`SELECT * FROM collection_steps WHERE collection_id=? AND deleted=0 ORDER BY sort`).all(c.id) as any[]) {
      const pid = promptMap.get(s.prompt_id);
      if (pid) createRecord('collection_steps', uuid(), { collection_id: cid, prompt_id: pid, sort: s.sort, instructions: s.instructions }, { silent: true });
    }
  }
  for (const t of db.prepare(`SELECT * FROM tasks WHERE project_id=? AND deleted=0`).all(srcId) as any[]) {
    createRecord('tasks', uuid(), { project_id: newId, title: t.title, description: t.description, priority: t.priority, due_date: t.due_date, sort: t.sort, done: false }, { silent: true });
  }
  for (const n of db.prepare(`SELECT * FROM notes WHERE project_id=? AND deleted=0`).all(srcId) as any[]) {
    createRecord('notes', uuid(), { project_id: newId, title: n.title, body: n.body, pinned: !!n.pinned, sort: n.sort }, { silent: true });
  }
  if (includeFiles) {
    // File records are copied; content blobs are shared (reference-counted), so no extra storage is used.
    for (const f of db.prepare(`SELECT * FROM files WHERE project_id=? AND deleted=0`).all(srcId).map((r: any) => fromDb<FileRec>('files', r)!)) {
      const fid = uuid();
      const versions = db.prepare(`SELECT * FROM file_versions WHERE file_id=? AND deleted=0 ORDER BY major, minor`).all(f.id).map((r: any) => fromDb<FileVersion>('file_versions', r)!);
      insertRow('files', { ...f, id: fid, project_id: newId, prompt_ids: f.prompt_ids.map((x) => promptMap.get(x)).filter(Boolean), latest_version_id: null });
      let latest: string | null = null;
      for (const v of versions) {
        const vid = uuid();
        insertRow('file_versions', { ...v, id: vid, file_id: fid });
        const key = (db.prepare(`SELECT storage_key FROM version_blobs WHERE version_id=?`).get(v.id) as any)?.storage_key;
        if (key) db.prepare(`INSERT INTO version_blobs (version_id, storage_key) VALUES (?,?)`).run(vid, key);
        const dt = db.prepare(`SELECT text, preview FROM doc_text WHERE version_id=?`).get(v.id) as any;
        if (dt) db.prepare(`INSERT INTO doc_text (version_id, file_id, text, preview) VALUES (?,?,?,?)`).run(vid, fid, dt.text, dt.preview);
        if (v.id === f.latest_version_id) latest = vid;
      }
      db.prepare(`UPDATE files SET latest_version_id=? WHERE id=?`).run(latest, fid);
      reindex('files', fid);
    }
  }
  if (!parentId) for (const sub of db.prepare(`SELECT id, name FROM projects WHERE parent_id=? AND deleted=0 ORDER BY sort`).all(srcId) as any[]) duplicateProject(sub.id, newId, sub.name, includeFiles, map);
  return newId;
}

const SETTINGS_VALIDATORS: { [K in keyof Settings]?: (v: unknown) => Settings[K] } = {
  session_idle_minutes: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 5 || n > 1440) throw new MutationError('Idle timeout must be 5–1440 minutes'); return n; },
  session_max_days: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 90) throw new MutationError('Session lifetime must be 1–90 days'); return n; },
  upload_max_mb: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 1024) throw new MutationError('Upload limit must be 1–1024 MB'); return n; },
  sync_interval_seconds: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 10 || n > 3600) throw new MutationError('Sync interval must be 10–3600 seconds'); return n; },
  backup_schedule: (v) => { if (!['off', 'daily', 'weekly'].includes(v as string)) throw new MutationError('Invalid schedule'); return v as Settings['backup_schedule']; },
  backup_keep: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 100) throw new MutationError('Keep 1–100 backups'); return n; },
  ocr_enabled: (v) => !!v,
  encrypt_files: (v) => !!v,
  trash_retention_days: (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 365) throw new MutationError('Trash retention must be 1–365 days'); return n; },
  app_prefs: (v) => { if (typeof v !== 'object' || !v || Array.isArray(v)) throw new MutationError('Invalid preferences'); return { ...SETTING_DEFAULTS.app_prefs, ...(v as object) }; },
};

export async function projectRoutes(app: FastifyInstance) {
  app.post('/api/projects/:id/duplicate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as { name?: string; includeFiles?: boolean };
    const src = getRow<Project>('projects', id);
    if (!src || src.deleted) return reply.code(404).send({ error: 'Project not found' });
    const name = (body.name || `${src.name} (copy)`).trim().slice(0, 200);
    const newId = db.transaction(() => duplicateProject(id, src.parent_id, name, body.includeFiles !== false))();
    logActivity(newId, 'projects', newId, 'created', `${src.parent_id ? 'Subproject' : 'Project'} duplicated from “${src.name}”`);
    return { id: newId };
  });

  app.post('/api/templates/:id/insert', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { project_id: string; values?: Record<string, string>; fill?: boolean; title?: string; type?: 'mandatory' | 'optional'; prompt_id?: string };
    const t = getRow<Template>('templates', id);
    if (!t || t.deleted) return reply.code(404).send({ error: 'Template not found' });
    if (!b.project_id || !UUID_RE.test(b.project_id)) return reply.code(400).send({ error: 'Choose a project or subproject' });
    const values = b.values || {};
    const content = b.fill ? fillVariables(t.content, values) : t.content;
    const pid = b.prompt_id && UUID_RE.test(b.prompt_id) ? b.prompt_id : uuid();
    try {
      const row = db.transaction(() => {
        const p = createRecord('prompts', pid, {
          project_id: b.project_id, title: (b.title || t.title).slice(0, 300), content, description: t.description, purpose: t.purpose,
          type: b.type || t.type, tags: t.tags, instructions: b.fill ? fillVariables(t.instructions, values) : t.instructions, variables: t.variables, source_template_id: t.id,
        }, { note: `Created from template “${t.title}”` });
        // Remember filled values on the project so prompt packs reuse them.
        const proj = getRow<Project>('projects', b.project_id)!;
        const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v && v.trim()));
        if (Object.keys(filled).length) updateRecord('projects', proj.id, { variable_values: { ...proj.variable_values, ...filled } });
        return p;
      })();
      return { prompt: row };
    } catch (e) {
      if (e instanceof MutationError) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  app.post('/api/prompts/:id/save-as-template', async (req, reply) => {
    const p = getRow<Prompt>('prompts', (req.params as any).id);
    if (!p || p.deleted) return reply.code(404).send({ error: 'Prompt not found' });
    const tid = uuid();
    const t = createRecord('templates', tid, { ...pick(p, ['title', 'content', 'description', 'purpose', 'type', 'tags', 'instructions', 'variables']) });
    logActivity(p.project_id, 'templates', tid, 'created', `Saved “${p.title}” as a reusable template`);
    return { template: t };
  });

  app.post('/api/prompts/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { version_no } = req.body as { version_no: number };
    const v = db.prepare(`SELECT * FROM prompt_versions WHERE prompt_id=? AND version_no=?`).get(id, version_no) as any;
    if (!v) return reply.code(404).send({ error: 'Version not found' });
    const vr = fromDb<any>('prompt_versions', v)!;
    try {
      const r = db.transaction(() => updateRecord('prompts', id, pick(vr, ['title', 'content', 'description', 'purpose', 'type', 'tags', 'instructions']), undefined, `Restored from version ${version_no}`))();
      return { prompt: r.row };
    } catch (e) {
      if (e instanceof MutationError) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  // ---------- Settings ----------
  app.get('/api/settings', async () => getSettings());
  app.patch('/api/settings', async (req, reply) => {
    const body = (req.body || {}) as Record<string, unknown>;
    try {
      for (const [k, v] of Object.entries(body)) {
        const val = SETTINGS_VALIDATORS[k as keyof Settings];
        if (!val) continue; // storage_mode / blob_driver go through /api/storage/mode
        setSetting(k as keyof Settings, val(v) as never);
      }
    } catch (e) {
      if (e instanceof MutationError) return reply.code(400).send({ error: e.message });
      throw e;
    }
    return getSettings();
  });

  app.get('/api/storage', async () => storageInfo());
  app.post('/api/storage/mode', async (req, reply) => {
    const { mode, confirm } = req.body as { mode: Settings['storage_mode']; confirm?: boolean };
    if (!['local', 'self_hosted', 'cloud'].includes(mode)) return reply.code(400).send({ error: 'Unknown storage mode' });
    const s = getSettings();
    if (mode === 'cloud' && !s3Configured()) return reply.code(400).send({ error: 'Private cloud storage is not configured. Set the PPM_S3_* variables on the server first (see the installation guide).' });
    const targetDriver = mode === 'cloud' ? 's3' : 'disk';
    const pendingOnOther = (db.prepare(`SELECT COUNT(*) AS n FROM blobs WHERE driver<>?`).get(targetDriver) as { n: number }).n;
    if (!confirm) return { needsConfirm: true, migrate: pendingOnOther > 0, files: pendingOnOther, from: s.blob_driver, to: targetDriver };
    setSetting('storage_mode', mode);
    let jobId: string | null = null;
    if (pendingOnOther > 0) jobId = startMigration(targetDriver);
    else setSetting('blob_driver', targetDriver);
    logActivity(null, 'settings', 'storage', 'updated', `Storage mode changed to ${mode.replace('_', '-')}`);
    return { ok: true, jobId };
  });
  app.post('/api/storage/retry', async () => ({ jobId: startMigration(getSettings().storage_mode === 'cloud' ? 's3' : 'disk') }));

  // ---------- Export ----------
  app.get('/api/export', async (req, reply) => {
    const out: Record<string, unknown> = { app: 'prompt-manager', exported_at: now(), schema: 1 };
    for (const e of ENTITY_NAMES) out[e] = (db.prepare(`SELECT * FROM ${ENTITIES[e].table} WHERE deleted=0`).all() as any[]).map((r) => fromDb(e, r));
    reply.header('Content-Type', 'application/json').header('Content-Disposition', `attachment; filename="prompt-manager-export-${now().slice(0, 10)}.json"`).header('Cache-Control', 'no-store');
    return reply.send(JSON.stringify(out, null, 2));
  });

  /** Export a project's prompts in the bulk-import format (round-trippable). */
  app.get('/api/projects/:id/export-prompts', async (req, reply) => {
    const { id } = req.params as { id: string };
    const format = (req.query as any).format === 'csv' ? 'csv' : 'json';
    const project = getRow<Project>('projects', id);
    if (!project) return reply.code(404).send({ error: 'Not found' });
    const prompts = db.prepare(`SELECT * FROM prompts WHERE project_id=? AND deleted=0 ORDER BY sort`).all(id).map((r: any) => fromDb<Prompt>('prompts', r)!);
    const stepInfo = new Map<string, { c: string; s: number }>();
    for (const c of db.prepare(`SELECT id, name FROM collections WHERE project_id=? AND deleted=0`).all(id) as any[]) {
      (db.prepare(`SELECT prompt_id FROM collection_steps WHERE collection_id=? AND deleted=0 ORDER BY sort`).all(c.id) as any[]).forEach((s, i) => { if (!stepInfo.has(s.prompt_id)) stepInfo.set(s.prompt_id, { c: c.name, s: i + 1 }); });
    }
    const rows = prompts.map((p) => ({ title: p.title, content: p.content, type: p.type, description: p.description, tags: p.tags, collection: stepInfo.get(p.id)?.c ?? '', sequence: stepInfo.get(p.id)?.s ?? null, variables: p.variables.map((v) => v.name + (v.required ? '' : '?')) }));
    const safe = project.name.replace(/[^\w-]+/g, '-').slice(0, 60);
    if (format === 'csv') {
      const csv = Papa.unparse([['Prompt Title', 'Prompt Content', 'Prompt Type', 'Description', 'Tags', 'Collection', 'Sequence', 'Variables'],
        ...rows.map((r) => [r.title, r.content, r.type === 'mandatory' ? 'Mandatory' : 'Optional', r.description, r.tags.join(','), r.collection, r.sequence ?? '', r.variables.join(',')])], { newline: '\r\n' });
      reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${safe}-prompts.csv"`);
      return reply.send('﻿' + csv);
    }
    reply.header('Content-Type', 'application/json').header('Content-Disposition', `attachment; filename="${safe}-prompts.json"`);
    return reply.send(JSON.stringify({ prompts: rows }, null, 2));
  });

  app.get('/api/about', async () => ({ version: '1.0.0', node: process.version, basePath: config.basePath, dataDir: config.dataDir }));
}
