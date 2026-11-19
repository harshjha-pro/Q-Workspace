import type { FastifyInstance } from 'fastify';
import { q, getRow } from './db';
import { isMysql } from './sql';
import type { EntityName } from '../shared/schema';

type Kind = 'project' | 'prompt' | 'template' | 'collection' | 'file' | 'note' | 'task';
const KIND_OF: Partial<Record<EntityName, Kind>> = { projects: 'project', prompts: 'prompt', templates: 'template', collections: 'collection', files: 'file', notes: 'note', tasks: 'task' };
const MAX_BODY = 1_500_000;

async function writeIndex(kind: Kind, id: string, projectId: string | null, updated: string, title: string, body: string) {
  body = body.slice(0, MAX_BODY);
  if (isMysql()) await q.run(`INSERT INTO search_index (kind, ref_id, project_id, updated_at, title, body) VALUES (?,?,?,?,?,?)`, kind, id, projectId, updated, title, body);
  else await q.run(`INSERT INTO search_fts (kind, ref_id, project_id, updated_at, title, body) VALUES (?,?,?,?,?,?)`, kind, id, projectId, updated, title, body);
}

/** Keep the full-text index in step with a record. Safe to call for any entity. */
export async function reindex(entity: EntityName, id: string) {
  const kind = KIND_OF[entity];
  if (!kind) return;
  await q.run(`DELETE FROM ${isMysql() ? 'search_index' : 'search_fts'} WHERE kind=? AND ref_id=?`, kind, id);
  const r = await getRow<Record<string, any>>(entity, id);
  if (!r || r.deleted) return;
  const tags = (r.tags || []).join(' ');
  switch (kind) {
    case 'project': return writeIndex(kind, id, id, r.updated_at, r.name, [r.description, tags].join('\n'));
    case 'prompt': return writeIndex(kind, id, r.project_id, r.updated_at, r.title, [r.content, r.description, r.purpose, r.instructions, tags].join('\n'));
    case 'template': return writeIndex(kind, id, null, r.updated_at, r.title, [r.content, r.description, r.purpose, r.instructions, tags].join('\n'));
    case 'collection': return writeIndex(kind, id, r.project_id, r.updated_at, r.name, r.description || '');
    case 'note': return writeIndex(kind, id, r.project_id, r.updated_at, r.title, r.body || '');
    case 'task': return writeIndex(kind, id, r.project_id, r.updated_at, r.title, r.description || '');
    case 'file': {
      const t = r.latest_version_id ? await q.get<{ text: string }>(`SELECT text FROM doc_text WHERE version_id=?`, r.latest_version_id) : undefined;
      return writeIndex(kind, id, r.project_id, r.updated_at, r.name, [r.description, tags, t?.text || ''].join('\n'));
    }
  }
}

export async function rebuildIndex() {
  await q.run(`DELETE FROM ${isMysql() ? 'search_index' : 'search_fts'}`);
  for (const e of ['projects', 'prompts', 'templates', 'collections', 'files', 'notes', 'tasks'] as EntityName[]) {
    for (const { id } of await q.all<{ id: string }>(`SELECT id FROM ${e} WHERE deleted=0`)) await reindex(e, id);
  }
}
export async function indexIsEmpty() {
  return !Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${isMysql() ? 'search_index' : 'search_fts'}`))?.n);
}

const tokensOf = (s: string) => s.normalize('NFKC').split(/[^\p{L}\p{N}_]+/u).filter(Boolean).slice(0, 12);

/** Build a safe FTS5 query: every token is quoted and prefix-matched. */
export const ftsQuery = (s: string) => tokensOf(s).map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');

/** MySQL boolean-mode query; very short words are optional (below the engine's minimum token size). */
const mysqlQuery = (s: string) => tokensOf(s).map((t) => (t.length >= 3 ? `+${t}*` : `${t}*`)).join(' ');

function snippetOf(text: string, terms: string[], width: number) {
  if (!text) return '';
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = lower.indexOf(t.toLowerCase()); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at < 0 ? 0 : at - Math.floor(width / 3));
  let seg = text.slice(start, start + width).replace(/\s+/g, ' ');
  for (const t of terms) seg = seg.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `[[${m}]]`);
  return (start > 0 ? '…' : '') + seg + (start + width < text.length ? '…' : '');
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/search', async (req) => {
    const p = req.query as { q?: string; kinds?: string; project?: string; category?: string; from?: string; to?: string; limit?: string; offset?: string };
    const terms = tokensOf(p.q || '');
    if (!terms.length) return { total: 0, results: [] };
    const limit = Math.min(Number(p.limit) || 30, 100);
    const offset = Number(p.offset) || 0;
    const P = isMysql() ? 's' : 'search_fts';
    const where: string[] = []; const params: unknown[] = [];
    const kinds = (p.kinds || '').split(',').filter((k) => /^(project|prompt|template|collection|file|note|task)$/.test(k));
    if (kinds.length) { where.push(`${P}.kind IN (${kinds.map(() => '?').join(',')})`); params.push(...kinds); }
    if (p.project) {
      // The project and all of its subprojects.
      const ids = [p.project, ...(await q.all<{ id: string }>(`SELECT id FROM projects WHERE parent_id=? AND deleted=0`, p.project)).map((r) => r.id)];
      where.push(`${P}.project_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids);
    }
    if (p.from) { where.push(`${P}.updated_at >= ?`); params.push(p.from); }
    if (p.to) { where.push(`${P}.updated_at <= ?`); params.push(p.to + 'T23:59:59.999Z'); }
    let join = '';
    if (p.category) { join = `JOIN files f ON f.id = ${P}.ref_id AND ${P}.kind = 'file' AND f.category = ?`; }
    const extra = where.length ? ` AND ${where.join(' AND ')}` : '';

    if (isMysql()) {
      const mq = mysqlQuery(p.q || '');
      const base = `FROM search_index s ${join} WHERE MATCH(s.title, s.body) AGAINST (? IN BOOLEAN MODE)${extra}`;
      const args = [...(p.category ? [p.category] : []), mq, ...params];
      let total = Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n ${base}`, ...args))?.n ?? 0);
      let rows = await q.all(`SELECT s.kind, s.ref_id, s.project_id, s.updated_at, s.title, SUBSTRING(s.body, 1, 200000) AS body, MATCH(s.title, s.body) AGAINST (? IN BOOLEAN MODE) AS score ${base} ORDER BY score DESC LIMIT ? OFFSET ?`, mq, ...args, limit, offset);
      if (!rows.length) {
        // Fallback for words the full-text engine ignores (stopwords, very short tokens).
        const likes = terms.map(() => `(s.title LIKE ? OR s.body LIKE ?)`).join(' AND ');
        const largs = [...(p.category ? [p.category] : []), ...terms.flatMap((t) => [`%${t}%`, `%${t}%`]), ...params];
        const lbase = `FROM search_index s ${join} WHERE ${likes}${extra}`;
        total = Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n ${lbase}`, ...largs))?.n ?? 0);
        rows = await q.all(`SELECT s.kind, s.ref_id, s.project_id, s.updated_at, s.title, SUBSTRING(s.body, 1, 200000) AS body ${lbase} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`, ...largs, limit, offset);
      }
      return { total, results: rows.map((r) => ({ kind: r.kind, ref_id: r.ref_id, project_id: r.project_id, updated_at: r.updated_at, title: r.title, title_snip: snippetOf(r.title, terms, 120), snip: snippetOf(r.body || '', terms, 160) })) };
    }

    const match = ftsQuery(p.q || '');
    const base = `FROM search_fts ${join} WHERE search_fts MATCH ?${extra}`;
    const args = [...(p.category ? [p.category] : []), match, ...params];
    const total = Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n ${base}`, ...args))?.n ?? 0);
    const results = await q.all(`SELECT search_fts.kind, search_fts.ref_id, search_fts.project_id, search_fts.updated_at, search_fts.title,
        snippet(search_fts, 4, '[[', ']]', '…', 12) AS title_snip, snippet(search_fts, 5, '[[', ']]', '…', 18) AS snip,
        bm25(search_fts, 0,0,0,0, 6.0, 1.0) AS score ${base} ORDER BY score LIMIT ? OFFSET ?`, ...args, limit, offset);
    return { total, results };
  });
}
