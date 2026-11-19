import type { FastifyInstance } from 'fastify';
import Papa from 'papaparse';
import { q, uuid, UUID_RE, getRow, insertRow, now } from './db';
import { createRecord } from './sync';
import { logActivity } from './activity';
import { assembleUpload } from './files';
import fsp from 'node:fs/promises';
import { detectVariables } from '../shared/variables';

type PType = 'mandatory' | 'optional';
interface RawRec { title?: unknown; content?: unknown; type?: unknown; description?: unknown; tags?: unknown; collection?: unknown; sequence?: unknown; variables?: unknown }
export interface PreviewRow {
  row: number; title: string; content: string; type: PType; typeFromFile: boolean; description: string; tags: string[];
  collection: string; sequence: number | null; variables: { name: string; required: boolean }[];
  status: 'ok' | 'error' | 'duplicate'; errors: string[]; warnings: string[]; duplicateOf?: string;
}

const ALIASES: Record<keyof RawRec, string[]> = {
  title: ['prompttitle', 'title', 'name', 'promptname'],
  content: ['promptcontent', 'content', 'prompt', 'text', 'body', 'prompttext'],
  type: ['prompttype', 'type', 'classification', 'class'],
  description: ['description', 'desc', 'purpose'],
  tags: ['tags', 'tag', 'labels'],
  collection: ['collection', 'collectionname', 'workflow'],
  sequence: ['sequence', 'sequencenumber', 'seq', 'order', 'step', 'sequenceno'],
  variables: ['variables', 'vars', 'variable'],
};
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
function mapHeaders(headers: string[]) {
  const map: Partial<Record<keyof RawRec, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [k, list] of Object.entries(ALIASES) as [keyof RawRec, string[]][]) if (list.includes(n) && map[k] === undefined) map[k] = i;
  });
  return map;
}

const SIMPLE_SAMPLE = [
  ['Market Research', 'Conduct detailed market research for {company_name}.'],
  ['Competitor Analysis', 'Analyze the major competitors in {industry}.'],
  ['Business Strategy', 'Develop a comprehensive strategy for {company_name}.'],
];
const ADV_HEADERS = ['Prompt Title', 'Prompt Content', 'Prompt Type', 'Description', 'Tags', 'Collection', 'Sequence', 'Variables'];
const ADV_SAMPLE = [
  ['Market Research', 'Conduct detailed market research for {company_name}.', 'Mandatory', 'Market analysis', 'research,market', 'Business Research', '1', 'company_name'],
  ['Competitor Analysis', 'Analyze the major competitors in {industry}.', 'Mandatory', 'Competitor research', 'competitors,research', 'Business Research', '2', 'industry'],
  ['SWOT Analysis', 'Prepare a SWOT analysis for {company_name}.\nInclude:\n- Strengths\n- Weaknesses\n- Opportunities\n- Threats', 'Optional', 'Strategic analysis', 'strategy,swot', 'Business Research', '3', 'company_name'],
];

async function buildTemplate(kind: 'simple' | 'advanced', format: 'csv' | 'xlsx' | 'json'): Promise<{ body: Buffer; mime: string; name: string }> {
  const headers = kind === 'simple' ? ['Prompt Title', 'Prompt Content'] : ADV_HEADERS;
  const rows = kind === 'simple' ? SIMPLE_SAMPLE : ADV_SAMPLE;
  const name = `prompt-import-${kind}`;
  if (format === 'csv') return { body: Buffer.from('﻿' + Papa.unparse([headers, ...rows], { newline: '\r\n' })), mime: 'text/csv', name: name + '.csv' };
  if (format === 'json') {
    const prompts = rows.map((r) => kind === 'simple' ? { title: r[0], content: r[1] } : {
      title: r[0], content: r[1], type: r[2].toLowerCase(), description: r[3], tags: r[4].split(','), collection: r[5], sequence: Number(r[6]), variables: r[7].split(','),
    });
    return { body: Buffer.from(JSON.stringify({ prompts }, null, 2)), mime: 'application/json', name: name + '.json' };
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Prompts');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(kind === 'advanced' ? r.map((v, i) => (i === 6 ? Number(v) : v)) : r));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F51A3' } };
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 70 : i === 0 ? 28 : 18; c.alignment = { wrapText: true, vertical: 'top' }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (kind === 'advanced') {
    (ws as any).dataValidations?.add?.('C2:C5000', { type: 'list', allowBlank: true, formulae: ['"Mandatory,Optional"'] });
  }
  const help = wb.addWorksheet('How to use');
  const lines = [
    'Fill one prompt per row on the "Prompts" sheet. Keep the header row.',
    'Prompt Title and Prompt Content are required. Line breaks inside a cell are preserved.',
    'Use {variable_name} inside the content for fillable fields.',
    ...(kind === 'advanced' ? [
      'Prompt Type: Mandatory or Optional. Leave blank to use the default you choose during import.',
      'Tags: separate with commas. Collection: prompts with the same collection name are grouped.',
      'Sequence: a whole number setting the order inside the collection.',
      'Variables: optional, comma-separated. Add ? to mark a variable optional, e.g. "industry?".',
    ] : []),
    'Existing prompts are never overwritten. Duplicates are shown for review before import.',
  ];
  lines.forEach((l) => help.addRow([l]));
  help.getColumn(1).width = 110;
  return { body: Buffer.from(await wb.xlsx.writeBuffer()), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: name + '.xlsx' };
}

// ---------- Parsing ----------
function fromTable(rows: unknown[][]): { recs: RawRec[]; structure: string[] } {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? '').trim()));
  if (!nonEmpty.length) return { recs: [], structure: ['The file has no rows.'] };
  const headers = nonEmpty[0].map((c) => String(c ?? ''));
  const map = mapHeaders(headers);
  if (map.title === undefined || map.content === undefined) {
    return { recs: [], structure: [`Missing required columns. Expected "Prompt Title" and "Prompt Content" in the first row; found: ${headers.filter(Boolean).join(', ') || 'nothing'}.`] };
  }
  const recs = nonEmpty.slice(1).map((r) => {
    const o: RawRec = {};
    for (const [k, i] of Object.entries(map) as [keyof RawRec, number][]) o[k] = r[i];
    return o;
  });
  return { recs, structure: [] };
}

async function parseXlsx(buf: Buffer) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as any); } catch { return { recs: [], structure: ['This is not a valid Excel (.xlsx) file.'] }; }
  const ws = wb.getWorksheet('Prompts') ?? wb.worksheets[0];
  if (!ws) return { recs: [], structure: ['The workbook has no sheets.'] };
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    rows.push((row.values as unknown[]).slice(1).map((v: any) => {
      if (v == null) return '';
      if (typeof v === 'object') return v.richText ? v.richText.map((r: any) => r.text).join('') : v.text ?? v.result ?? (v instanceof Date ? v.toISOString() : '');
      return v;
    }));
  });
  return fromTable(rows);
}

function parseJson(text: string) {
  let data: any;
  try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { return { recs: [], structure: [`Invalid JSON: ${(e as Error).message}`] }; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.prompts) ? data.prompts : null;
  if (!list) return { recs: [], structure: ['JSON must be an array of prompts or an object with a "prompts" array.'] };
  const recs: RawRec[] = list.map((p: any) => {
    if (!p || typeof p !== 'object') return {};
    const g = (...keys: string[]) => { for (const k of Object.keys(p)) if (keys.includes(norm(k))) return p[k]; return undefined; };
    return { title: g(...ALIASES.title), content: g(...ALIASES.content), type: g(...ALIASES.type), description: g(...ALIASES.description), tags: g(...ALIASES.tags), collection: g(...ALIASES.collection), sequence: g(...ALIASES.sequence), variables: g(...ALIASES.variables) };
  });
  return { recs, structure: [] };
}

function parseCsv(text: string, delimiter?: string) {
  const r = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy', delimiter });
  if (r.errors.length && !r.data.length) return { recs: [], structure: [`Could not read the CSV: ${r.errors[0].message}`] };
  const out = fromTable(r.data);
  const bad = r.errors.filter((e) => e.type === 'Quotes');
  if (bad.length) out.structure.push(`Row ${bad[0].row! + 1}: unclosed quotes. Wrap content containing commas or line breaks in double quotes.`);
  return out;
}

/** Pasted text: spreadsheet copy (tab separated) or blocks separated by '---'. */
function parsePaste(text: string) {
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) return { recs: [], structure: ['Paste at least one prompt.'] };
  const firstLine = t.split('\n')[0];
  if (firstLine.includes('\t')) {
    const r = Papa.parse<string[]>(t, { delimiter: '\t', skipEmptyLines: 'greedy' });
    const map = mapHeaders(r.data[0] || []);
    if (map.title !== undefined && map.content !== undefined) return fromTable(r.data);
    return { recs: r.data.map((row) => ({ title: row[0], content: row.slice(1).join('\t') })), structure: [] };
  }
  const blocks = t.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim()).filter(Boolean);
  return {
    recs: blocks.map((b) => {
      const lines = b.split('\n');
      const title = lines[0].replace(/^#+\s*/, '').replace(/^title\s*:\s*/i, '').trim();
      return { title, content: lines.slice(1).join('\n').replace(/^content\s*:\s*/i, '').trim() };
    }),
    structure: [],
  };
}

// ---------- Validation ----------
const normText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const splitList = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : String(v ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);

async function validate(recs: RawRec[], defaultType: PType, destination: 'library' | 'project', projectId: string | null): Promise<PreviewRow[]> {
  const existing = destination === 'library'
    ? await q.all<{ title: string; content: string }>(`SELECT title, content FROM templates WHERE deleted=0`)
    : await q.all<{ title: string; content: string }>(`SELECT title, content FROM prompts WHERE project_id=? AND deleted=0`, projectId);
  const exTitles = new Map(existing.map((e) => [normText(e.title), e.title]));
  const exContent = new Map(existing.map((e) => [normText(e.content), e.title]));
  const seenTitles = new Map<string, number>();
  const seenContent = new Map<string, number>();
  const seqSeen = new Map<string, Set<number>>();
  return recs.slice(0, 5000).map((r, i) => {
    const row = i + 2; // header is row 1
    const errors: string[] = []; const warnings: string[] = [];
    const title = String(r.title ?? '').replace(/\r\n?/g, '\n').trim();
    const content = String(r.content ?? '').replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
    if (!title) errors.push('Missing prompt title');
    else if (title.length > 300) errors.push('Prompt title is longer than 300 characters');
    if (!content.trim()) errors.push('Empty prompt content');
    let type = defaultType; let typeFromFile = false;
    const rawType = String(r.type ?? '').trim().toLowerCase();
    if (rawType) {
      if (['mandatory', 'm', 'required'].includes(rawType)) { type = 'mandatory'; typeFromFile = true; }
      else if (['optional', 'o'].includes(rawType)) { type = 'optional'; typeFromFile = true; }
      else errors.push(`Invalid classification "${String(r.type)}" (use Mandatory or Optional)`);
    }
    const collection = String(r.collection ?? '').trim().slice(0, 200);
    let sequence: number | null = null;
    const rawSeq = String(r.sequence ?? '').trim();
    if (rawSeq) {
      const n = Number(rawSeq);
      if (!Number.isInteger(n) || n < 1 || n > 100000) errors.push(`Incorrect sequence "${rawSeq}" (use a whole number from 1)`);
      else {
        sequence = n;
        const key = collection.toLowerCase();
        const set = seqSeen.get(key) ?? new Set<number>();
        if (set.has(n)) warnings.push(`Sequence ${n} is used more than once${collection ? ` in "${collection}"` : ''}; row order will break the tie`);
        set.add(n); seqSeen.set(key, set);
      }
    }
    const detected = detectVariables(content);
    const listed = splitList(r.variables).map((v) => v.replace(/^\{|\}$/g, ''));
    const variables = detected.map((name) => ({ name, required: !listed.some((l) => l === name + '?') }));
    for (const l of listed) { const n = l.replace(/\?$/, ''); if (n && !detected.includes(n)) warnings.push(`Variable "${n}" is listed but not used in the content`); }
    const tags = splitList(r.tags).slice(0, 50).map((t) => t.slice(0, 50));
    let status: PreviewRow['status'] = errors.length ? 'error' : 'ok';
    let duplicateOf: string | undefined;
    if (!errors.length) {
      const nt = normText(title), nc = normText(content);
      if (exTitles.has(nt)) duplicateOf = `Same title as existing “${exTitles.get(nt)}”`;
      else if (exContent.has(nc)) duplicateOf = `Same content as existing “${exContent.get(nc)}”`;
      else if (seenTitles.has(nt)) duplicateOf = `Same title as row ${seenTitles.get(nt)} in this file`;
      else if (seenContent.has(nc)) duplicateOf = `Same content as row ${seenContent.get(nc)} in this file`;
      if (duplicateOf) status = 'duplicate';
      if (!seenTitles.has(nt)) seenTitles.set(nt, row);
      if (!seenContent.has(nc)) seenContent.set(nc, row);
    }
    return { row, title, content, type, typeFromFile, description: String(r.description ?? '').trim().slice(0, 5000), tags, collection, sequence, variables, status, errors, warnings, duplicateOf };
  });
}

// ---------- Routes ----------
export async function importRoutes(app: FastifyInstance) {
  app.get('/api/import/template', async (req, reply) => {
    const q = req.query as { kind?: string; format?: string };
    const kind = q.kind === 'advanced' ? 'advanced' : 'simple';
    const format = (['csv', 'xlsx', 'json'].includes(q.format || '') ? q.format : 'csv') as 'csv' | 'xlsx' | 'json';
    const t = await buildTemplate(kind, format);
    reply.header('Content-Type', t.mime).header('Content-Disposition', `attachment; filename="${t.name}"`).header('Cache-Control', 'no-store');
    return reply.send(t.body);
  });

  app.post('/api/import/preview', { bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => {
    let fields: Record<string, string> = {};
    let parsed: { recs: RawRec[]; structure: string[] };
    let filename = 'Pasted prompts';
    let format = 'paste';
    if (req.isMultipart()) {
      const part = await req.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
      if (!part) return reply.code(400).send({ error: 'No file received' });
      fields = Object.fromEntries(Object.entries(part.fields).filter(([, v]: any) => v?.type === 'field').map(([k, v]: any) => [k, String(v.value)]));
      const buf = await part.toBuffer();
      if (part.file.truncated) return reply.code(413).send({ error: 'Import files are limited to 10 MB.' });
      filename = part.filename.replace(/[\u0000-\u001f]/g, '').slice(0, 200);
      const ext = (filename.split('.').pop() || '').toLowerCase();
      format = ext;
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') parsed = parseCsv(buf.toString('utf8'), ext === 'tsv' ? '\t' : undefined);
      else if (ext === 'xlsx') parsed = await parseXlsx(buf);
      else if (ext === 'json') parsed = parseJson(buf.toString('utf8'));
      else if (ext === 'xls') return reply.code(415).send({ error: 'Old .xls workbooks are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx).' });
      else return reply.code(415).send({ error: 'Upload a .csv, .xlsx or .json file.' });
    } else if ((req.body as any)?.upload_id) {
      // File sent in parts (platforms that cap request size).
      fields = req.body as Record<string, string>;
      if (!UUID_RE.test(String(fields.upload_id))) return reply.code(400).send({ error: 'Invalid upload' });
      const a = await assembleUpload(String(fields.upload_id), Number(fields.parts), 25 * 1024 * 1024);
      try {
        filename = String(fields.filename || 'import').replace(/[\u0000-\u001f]/g, '').slice(0, 200);
        const ext = (filename.split('.').pop() || '').toLowerCase();
        format = ext;
        const buf = await fsp.readFile(a.file);
        if (ext === 'csv' || ext === 'tsv' || ext === 'txt') parsed = parseCsv(buf.toString('utf8'), ext === 'tsv' ? '\t' : undefined);
        else if (ext === 'xlsx') parsed = await parseXlsx(buf);
        else if (ext === 'json') parsed = parseJson(buf.toString('utf8'));
        else return reply.code(415).send({ error: 'Upload a .csv, .xlsx or .json file.' });
      } finally { await fsp.rm(a.file, { force: true }); }
    } else {
      fields = (req.body as Record<string, string>) || {};
      parsed = parsePaste(String(fields.paste || '').slice(0, 2_000_000));
    }
    const destination = fields.destination === 'library' ? 'library' : 'project';
    const projectId = destination === 'project' ? fields.project_id : null;
    if (destination === 'project') {
      const p = projectId && UUID_RE.test(projectId) ? await getRow<any>('projects', projectId) : null;
      if (!p || p.deleted) return reply.code(400).send({ error: 'Choose a project or subproject to import into.' });
    }
    const defaultType: PType = fields.default_type === 'mandatory' ? 'mandatory' : 'optional';
    const rows = parsed.structure.length && !parsed.recs.length ? [] : await validate(parsed.recs, defaultType, destination, projectId);
    if (!parsed.structure.length && !rows.length) parsed.structure.push('No prompts were found in the file.');
    if (parsed.recs.length > 5000) parsed.structure.push(`Only the first 5,000 of ${parsed.recs.length} records are shown.`);
    const id = uuid();
    await q.run(`DELETE FROM import_previews WHERE created_at < ?`, Date.now() - 24 * 3600_000);
    await q.run(`INSERT INTO import_previews (id, payload, created_at) VALUES (?,?,?)`, id, JSON.stringify({ rows, destination, projectId, defaultType, filename, format }), Date.now());
    const summary = { total: rows.length, valid: rows.filter((r) => r.status === 'ok').length, duplicates: rows.filter((r) => r.status === 'duplicate').length, errors: rows.filter((r) => r.status === 'error').length };
    return { previewId: id, filename, format, destination, projectId, defaultType, structureErrors: parsed.structure, rows, summary };
  });

  app.post('/api/import/commit', async (req, reply) => {
    const body = req.body as { previewId: string; decisions?: Record<string, 'import' | 'skip' | 'rename'>; renames?: Record<string, string>; overrides?: Record<string, { type?: PType }> };
    const p = await q.get<{ payload: string }>(`SELECT payload FROM import_previews WHERE id=?`, body.previewId);
    if (!p) return reply.code(410).send({ error: 'This preview has expired. Upload the file again.' });
    const { rows, destination, projectId, defaultType, filename, format } = JSON.parse(p.payload) as { rows: PreviewRow[]; destination: 'library' | 'project'; projectId: string | null; defaultType: PType; filename: string; format: string };
    const decisions = body.decisions || {}; const renames = body.renames || {}; const overrides = body.overrides || {};
    const jobId = uuid();
    const result = await q.tx(async () => {
      let imported = 0, skipped = 0, failed = 0, duplicates = 0;
      const records: { row: number; status: string; title: string; reason: string; prompt_id: string | null; raw: string }[] = [];
      const collCache = new Map<string, string>();
      const stepsToAdd: { coll: string; promptId: string; seq: number | null; row: number }[] = [];
      const ordered = [...rows].sort((a, b) => (a.sequence ?? 1e9) - (b.sequence ?? 1e9) || a.row - b.row);
      for (const r of ordered) {
        const raw = JSON.stringify({ title: r.title, content: r.content.slice(0, 2000) });
        if (r.status === 'error') { failed++; records.push({ row: r.row, status: 'failed', title: r.title, reason: r.errors.join('; '), prompt_id: null, raw }); continue; }
        const d = decisions[r.row] ?? (r.status === 'duplicate' ? 'skip' : 'import');
        if (r.status === 'duplicate') duplicates++;
        if (d === 'skip') { skipped++; records.push({ row: r.row, status: r.status === 'duplicate' ? 'skipped_duplicate' : 'skipped', title: r.title, reason: r.duplicateOf || 'Skipped by user', prompt_id: null, raw }); continue; }
        const title = d === 'rename' ? (renames[r.row] || `${r.title} (imported)`).trim().slice(0, 300) : r.title;
        const type = overrides[r.row]?.type ?? r.type;
        const id = uuid();
        try {
          if (destination === 'library') {
            const tags = [...new Set([...r.tags, ...(r.collection ? [r.collection] : [])])];
            await createRecord('templates', id, { title, content: r.content, type, description: r.description, tags, variables: r.variables }, { silent: true, extra: { import_job_id: jobId } });
          } else {
            await createRecord('prompts', id, { project_id: projectId, title, content: r.content, type, description: r.description, tags: r.tags, variables: r.variables }, { silent: true, note: `Imported from ${filename}`, extra: { import_job_id: jobId } });
            if (r.collection) stepsToAdd.push({ coll: r.collection, promptId: id, seq: r.sequence, row: r.row });
          }
          imported++;
          records.push({ row: r.row, status: 'imported', title, reason: '', prompt_id: id, raw });
        } catch (e) {
          failed++;
          records.push({ row: r.row, status: 'failed', title, reason: (e as Error).message, prompt_id: null, raw });
        }
      }
      for (const s of stepsToAdd) {
        const key = s.coll.toLowerCase();
        let cid = collCache.get(key);
        if (!cid) {
          const ex = await q.get<{ id: string }>(`SELECT id FROM collections WHERE project_id=? AND lower(name)=? AND deleted=0`, projectId, key);
          cid = ex?.id ?? ((await createRecord('collections', uuid(), { project_id: projectId, name: s.coll, description: `Created by import from ${filename}` }, { silent: true })).id as string);
          collCache.set(key, cid);
        }
        await createRecord('collection_steps', uuid(), { collection_id: cid, prompt_id: s.promptId }, { silent: true });
      }
      await insertRow('import_jobs', { id: jobId, destination, project_id: projectId, format, filename, default_type: defaultType, total: rows.length, imported, skipped, failed, duplicates, status: 'completed' });
      for (let i = 0; i < records.length; i += 50) {
        const batch = records.slice(i, i + 50);
        await q.run(`INSERT INTO import_records (id, job_id, row_no, status, title, reason, prompt_id, raw) VALUES ${batch.map(() => '(?,?,?,?,?,?,?,?)').join(',')}`,
          ...batch.flatMap((r) => [uuid(), jobId, r.row, r.status, r.title, r.reason, r.prompt_id, r.raw]));
      }
      await logActivity(projectId, destination === 'library' ? 'templates' : 'prompts', jobId, 'imported', `Imported ${imported} ${destination === 'library' ? 'template' : 'prompt'}${imported === 1 ? '' : 's'} from ${filename}${collCache.size ? ` into ${collCache.size} collection${collCache.size === 1 ? '' : 's'}` : ''}`);
      return { jobId, total: rows.length, imported, skipped, failed, duplicates, collections: collCache.size };
    });
    await q.run(`DELETE FROM import_previews WHERE id=?`, body.previewId);
    return result;
  });

  app.get('/api/import/:jobId/error-report', async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = await getRow<any>('import_jobs', jobId);
    if (!job) return reply.code(404).send({ error: 'Import not found' });
    const rows = await q.all<any>(`SELECT row_no, status, title, reason FROM import_records WHERE job_id=? AND status<>'imported' ORDER BY row_no`, jobId);
    const csv = Papa.unparse([['Row', 'Prompt Title', 'Result', 'Reason'], ...rows.map((r) => [r.row_no, r.title, r.status.replace('_', ' '), r.reason])], { newline: '\r\n' });
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="import-errors-${now().slice(0, 10)}.csv"`).header('Cache-Control', 'no-store');
    return reply.send('﻿' + csv);
  });
}
