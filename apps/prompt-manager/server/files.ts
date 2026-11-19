import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from './config';
import { db, getRow, insertRow, patchRow, uuid, UUID_RE, getSettings } from './db';
import { ALLOWED_EXTENSIONS, FILE_CATEGORIES, type FileRec, type FileVersion } from '../shared/schema';
import { storeBlob, readBlob, readBlobBuffer, blobKeyForVersion } from './storage';
import { validateContent, scanFile, extract } from './extract';
import { logActivity } from './activity';
import { reindex } from './search';

const SAFE_INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain']);

function cleanName(n: string) {
  // Keep original filename as metadata only; strip path components and control chars.
  return path.basename(n.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'file';
}

// ---------- Background extraction queue ----------
const queue: string[] = [];
let running = false;
export function queueExtraction(versionId: string) { queue.push(versionId); void drain(); }
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const vid = queue.shift()!;
    try {
      const v = getRow<FileVersion>('file_versions', vid);
      const key = v && blobKeyForVersion(vid);
      if (!v || !key) continue;
      const buf = await readBlobBuffer(key);
      const { text, preview } = await extract(buf, v.ext, getSettings().ocr_enabled);
      db.prepare(`INSERT OR REPLACE INTO doc_text (version_id, file_id, text, preview) VALUES (?,?,?,?)`).run(vid, v.file_id, text, JSON.stringify(preview));
      patchRow('file_versions', vid, { extract_status: text ? 'done' : preview.kind !== 'none' ? 'done' : 'none' }, false);
      reindex('files', v.file_id);
    } catch {
      patchRow('file_versions', vid, { extract_status: 'error' }, false);
    }
  }
  running = false;
}

export function resumeExtraction() {
  for (const r of db.prepare(`SELECT id FROM file_versions WHERE extract_status='pending' AND deleted=0`).all() as { id: string }[]) queueExtraction(r.id);
}

function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function sendVersion(reply: FastifyReply, v: FileVersion, inline: boolean, displayName?: string) {
  const key = blobKeyForVersion(v.id);
  if (!key) return reply.code(404).send({ error: 'File content not found' });
  const stream = await readBlob(key);
  const mime = v.mime || 'application/octet-stream';
  const canInline = inline && SAFE_INLINE.has(mime);
  const base = displayName ? displayName.replace(/\.[^.]+$/, '') : v.original_name.replace(/\.[^.]+$/, '');
  const name = `${base}${v.label && displayName ? ` v${v.label}` : ''}.${v.ext}`;
  reply
    .header('Content-Type', canInline ? mime : 'application/octet-stream')
    .header('Content-Disposition', contentDisposition(canInline ? 'inline' : 'attachment', name))
    .header('Content-Length', String(v.size))
    .header('Cache-Control', 'private, no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  return reply.send(stream);
}

export async function fileRoutes(app: FastifyInstance) {
  app.post('/api/files/upload', async (req, reply) => {
    const maxBytes = getSettings().upload_max_mb * 1024 * 1024;
    const part = await req.file({ limits: { fileSize: maxBytes, files: 1, fields: 20, fieldSize: 100_000 } });
    if (!part) return reply.code(400).send({ error: 'No file received' });
    const f = Object.fromEntries(Object.entries(part.fields).filter(([, v]: any) => v && v.type === 'field').map(([k, v]: any) => [k, String(v.value)]));
    const original = cleanName(part.filename);
    const ext = (original.split('.').pop() || '').toLowerCase();
    const tmp = path.join(config.tmpDir, uuid());
    try {
      if (!ALLOWED_EXTENSIONS[ext]) { part.file.resume(); return reply.code(415).send({ error: `.${ext || '?'} files are not supported.` }); }
      await pipeline(part.file, fs.createWriteStream(tmp, { mode: 0o600 }));
      if (part.file.truncated) return reply.code(413).send({ error: `File is larger than the ${getSettings().upload_max_mb} MB limit.` });
      const size = (await fsp.stat(tmp)).size;
      if (!size) return reply.code(400).send({ error: 'The file is empty.' });

      const versionId = f.version_id && UUID_RE.test(f.version_id) ? f.version_id : uuid();
      const existingV = getRow<FileVersion>('file_versions', versionId);
      if (existingV) return { file: getRow('files', existingV.file_id), version: existingV, duplicate: true };

      const valid = await validateContent(tmp, ext);
      if (!valid.ok) return reply.code(415).send({ error: valid.reason });
      const scan = await scanFile(tmp);
      if (scan === 'infected') return reply.code(422).send({ error: 'This file was flagged by the malware scanner and was not saved.' });

      let file: FileRec | undefined;
      const targetId = f.target_file_id;
      if (targetId) {
        file = getRow<FileRec>('files', targetId);
        if (!file || file.deleted) return reply.code(404).send({ error: 'The file you are adding a version to no longer exists.' });
      } else {
        const project = f.project_id && getRow<any>('projects', f.project_id);
        if (!project || project.deleted) return reply.code(400).send({ error: 'Choose a project or subproject for this file.' });
        if (!FILE_CATEGORIES.includes(f.category as any)) return reply.code(400).send({ error: 'Choose a file category.' });
      }

      const blob = await storeBlob(tmp);
      const mime = ALLOWED_EXTENSIONS[ext];
      const result = db.transaction(() => {
        let major = 1, minor = 0;
        if (file) {
          const last = db.prepare(`SELECT major, minor FROM file_versions WHERE file_id=? AND deleted=0 ORDER BY major DESC, minor DESC LIMIT 1`).get(file.id) as { major: number; minor: number } | undefined;
          if (last) { if (f.bump === 'major') { major = last.major + 1; minor = 0; } else { major = last.major; minor = last.minor + 1; } }
        } else {
          const fileId = f.file_id && UUID_RE.test(f.file_id) ? f.file_id : uuid();
          let promptIds: string[] = [];
          try { promptIds = JSON.parse(f.prompt_ids || '[]').filter((x: string) => UUID_RE.test(x)); } catch { /* ignore */ }
          file = insertRow<FileRec>('files', {
            id: fileId, project_id: f.project_id, category: f.category, name: (f.name || original).slice(0, 200),
            description: (f.description || '').slice(0, 5000), prompt_ids: promptIds, tags: [], latest_version_id: null, version_count: 0, size, mime, ext,
          });
        }
        const version = insertRow<FileVersion>('file_versions', {
          id: versionId, file_id: file!.id, label: `${major}.${minor}`, major, minor, original_name: original, size, mime, ext,
          sha256: blob.sha256, note: (f.note || (file!.version_count ? '' : 'Initial upload')).slice(0, 1000), extract_status: 'pending', scan_status: scan,
        });
        db.prepare(`INSERT INTO version_blobs (version_id, storage_key) VALUES (?,?)`).run(versionId, blob.key);
        const updated = patchRow<FileRec>('files', file!.id, { latest_version_id: versionId, version_count: file!.version_count + 1, size, mime, ext });
        logActivity(updated.project_id, 'files', updated.id, file!.version_count ? 'version' : 'created',
          file!.version_count ? `New version ${version.label} of ${updated.name}` : `File uploaded: ${updated.name}`);
        return { file: updated, version };
      })();
      queueExtraction(versionId);
      return result;
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  });

  app.get('/api/files/versions/:vid/download', async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = getRow<FileVersion>('file_versions', vid);
    if (!v || v.deleted === 2) return reply.code(404).send({ error: 'Not found' });
    const file = getRow<FileRec>('files', v.file_id);
    return sendVersion(reply, v, (req.query as any).inline === '1', file?.name);
  });

  app.get('/api/files/versions/:vid/preview', async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = getRow<FileVersion>('file_versions', vid);
    if (!v) return reply.code(404).send({ error: 'Not found' });
    const r = db.prepare(`SELECT preview, length(text) AS len FROM doc_text WHERE version_id=?`).get(vid) as { preview: string; len: number } | undefined;
    reply.header('Cache-Control', 'private, no-store');
    return { status: v.extract_status, preview: r?.preview ? JSON.parse(r.preview) : { kind: 'none' }, textLength: r?.len ?? 0 };
  });

  app.get('/api/files/versions/:vid/text', async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = getRow<FileVersion>('file_versions', vid);
    if (!v) return reply.code(404).send({ error: 'Not found' });
    const r = db.prepare(`SELECT text FROM doc_text WHERE version_id=?`).get(vid) as { text: string } | undefined;
    reply.header('Cache-Control', 'private, no-store');
    return { status: v.extract_status, text: r?.text ?? '' };
  });

  /** Client-side OCR results (e.g. scanned PDFs rendered in the browser) can be saved as the searchable text. */
  app.post('/api/files/versions/:vid/text', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = getRow<FileVersion>('file_versions', vid);
    if (!v) return reply.code(404).send({ error: 'Not found' });
    const text = String((req.body as any)?.text ?? '').slice(0, 2_000_000);
    const prev = db.prepare(`SELECT preview FROM doc_text WHERE version_id=?`).get(vid) as { preview: string } | undefined;
    db.prepare(`INSERT OR REPLACE INTO doc_text (version_id, file_id, text, preview) VALUES (?,?,?,?)`).run(vid, v.file_id, text, prev?.preview ?? JSON.stringify({ kind: 'none' }));
    patchRow('file_versions', vid, { extract_status: 'done' }, false);
    reindex('files', v.file_id);
    return { ok: true };
  });

  app.post('/api/files/versions/:vid/reextract', async (req) => {
    const { vid } = req.params as { vid: string };
    patchRow('file_versions', vid, { extract_status: 'pending' }, false);
    queueExtraction(vid);
    return { ok: true };
  });
}
