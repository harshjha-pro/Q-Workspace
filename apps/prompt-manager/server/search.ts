import type { FastifyInstance } from 'fastify';
import { db, getRow } from './db';
import type { EntityName } from '../shared/schema';

type Kind = 'project' | 'prompt' | 'template' | 'collection' | 'file' | 'note' | 'task';
const KIND_OF: Partial<Record<EntityName, Kind>> = { projects: 'project', prompts: 'prompt', templates: 'template', collections: 'collection', files: 'file', notes: 'note', tasks: 'task' };

const del = db.prepare(`DELETE FROM search_fts WHERE kind=? AND ref_id=?`);
const ins = db.prepare(`INSERT INTO search_fts (kind, ref_id, project_id, updated_at, title, body) VALUES (?,?,?,?,?,?)`);

/** Keep the FTS index in step with a record. Safe to call for any entity. */
export function reindex(entity: EntityName, id: string) {
  const kind = KIND_OF[entity];
  if (!kind) return;
  del.run(kind, id);
  const r = getRow<Record<string, any>>(entity, id);
  if (!r || r.deleted) return;
  switch (kind) {
    case 'project': ins.run(kind, id, id, r.updated_at, r.name, [r.description, (r.tags || []).join(' ')].join('\n')); break;
    case 'prompt': ins.run(kind, id, r.project_id, r.updated_at, r.title, [r.content, r.description, r.purpose, r.instructions, (r.tags || []).join(' ')].join('\n')); break;
    case 'template': ins.run(kind, id, null, r.updated_at, r.title, [r.content, r.description, r.purpose, r.instructions, (r.tags || []).join(' ')].join('\n')); break;
    case 'collection': ins.run(kind, id, r.project_id, r.updated_at, r.name, r.description || ''); break;
    case 'note': ins.run(kind, id, r.project_id, r.updated_at, r.title, r.body || ''); break;
    case 'task': ins.run(kind, id, r.project_id, r.updated_at, r.title, r.description || ''); break;
    case 'file': {
      const t = r.latest_version_id ? (db.prepare(`SELECT text FROM doc_text WHERE version_id=?`).get(r.latest_version_id) as { text: string } | undefined) : undefined;
      ins.run(kind, id, r.project_id, r.updated_at, r.name, [r.description, (r.tags || []).join(' '), t?.text || ''].join('\n'));
      break;
    }
  }
}

export function rebuildIndex() {
  db.exec(`DELETE FROM search_fts`);
  const all: [EntityName, string][] = [['projects', 'projects'], ['prompts', 'prompts'], ['templates', 'templates'], ['collections', 'collections'], ['files', 'files'], ['notes', 'notes'], ['tasks', 'tasks']];
  db.transaction(() => {
    for (const [e, t] of all) for (const { id } of db.prepare(`SELECT id FROM ${t} WHERE deleted=0`).all() as { id: string }[]) reindex(e, id);
  })();
}

/** Build a safe FTS5 query: every token is quoted and prefix-matched. */
export function ftsQuery(q: string) {
  const tokens = q.normalize('NFKC').split(/[^\p{L}\p{N}_]+/u).filter(Boolean).slice(0, 12);
  return tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/search', async (req) => {
    const q = req.query as { q?: string; kinds?: string; project?: string; category?: string; from?: string; to?: string; limit?: string; offset?: string };
    const match = ftsQuery(q.q || '');
    if (!match) return { total: 0, results: [] };
    const where: string[] = ['search_fts MATCH @match'];
    const params: Record<string, unknown> = { match, limit: Math.min(Number(q.limit) || 30, 100), offset: Number(q.offset) || 0 };
    const kinds = (q.kinds || '').split(',').filter((k) => /^(project|prompt|template|collection|file|note|task)$/.test(k));
    if (kinds.length) { where.push(`kind IN (${kinds.map((_, i) => '@k' + i).join(',')})`); kinds.forEach((k, i) => (params['k' + i] = k)); }
    if (q.project) {
      // Include the project and all of its subprojects.
      const ids = [q.project, ...(db.prepare(`SELECT id FROM projects WHERE parent_id=? AND deleted=0`).all(q.project) as { id: string }[]).map((r) => r.id)];
      where.push(`project_id IN (${ids.map((_, i) => '@p' + i).join(',')})`); ids.forEach((id, i) => (params['p' + i] = id));
    }
    if (q.from) { where.push('updated_at >= @from'); params.from = q.from; }
    if (q.to) { where.push('updated_at <= @to'); params.to = q.to + 'T23:59:59.999Z'; }
    let sql = `SELECT kind, ref_id, project_id, updated_at, title,
        snippet(search_fts, 4, '[[', ']]', '…', 12) AS title_snip,
        snippet(search_fts, 5, '[[', ']]', '…', 18) AS snip, bm25(search_fts, 0,0,0,0, 6.0, 1.0) AS score
      FROM search_fts WHERE ${where.join(' AND ')}`;
    if (q.category) {
      sql = `SELECT s.* FROM (${sql}) s JOIN files f ON f.id = s.ref_id AND s.kind='file' WHERE f.category=@cat`;
      params.cat = q.category;
    }
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).get(params) as { n: number }).n;
    const results = db.prepare(`${sql} ORDER BY score LIMIT @limit OFFSET @offset`).all(params);
    return { total, results };
  });
}
