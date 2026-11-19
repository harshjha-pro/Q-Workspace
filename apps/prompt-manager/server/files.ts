import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config';
import { q, getRow, insertRow, patchRow, uuid, UUID_RE, getSettings } from './db';
import { ALLOWED_EXTENSIONS, FILE_CATEGORIES, type FileRec, type FileVersion } from '../shared/schema';
import { storeBlob, readBlob, readBlobBuffer, readBlobRange, blobKeyForVersion } from './storage';
import { validateContent, scanFile, extract } from './extract';
import { logActivity } from './activity';
import { reindex } from './search';

const SAFE_INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'text/plain']);

function cleanName(n: string) {
  // Keep original filename as metadata only; strip path components and control chars.
  return path.basename(n.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'file';
}

// ---------- Chunked uploads (platforms that cap request bodies, e.g. Vercel) ----------
export async function savePart(uploadId: string, n: number, data: Buffer) {
  await q.run(`DELETE FROM upload_parts WHERE upload_id=? AND n=?`, uploadId, n);
  await q.run(`INSERT INTO upload_parts (upload_id, n, data, created_at) VALUES (?,?,?,?)`, uploadId, n, data, Date.now());
}
/** Reassemble uploaded parts into a temp file; parts are removed afterwards. */
export async function assembleUpload(uploadId: string, parts: number, maxBytes: number): Promise<{ file: string; size: number }> {
  const file = path.join(config.tmpDir, uuid());
  const out = fs.createWriteStream(file, { mode: 0o600 });
  let size = 0;
  try {
    for (let n = 0; n < parts; n++) {
      const r = await q.get<{ data: Buffer }>(`SELECT data FROM upload_parts WHERE upload_id=? AND n=?`, uploadId, n);
      if (!r) throw Object.assign(new Error('Part of the upload is missing. Please try again.'), { statusCode: 400 });
      size += r.data.length;
      if (size > maxBytes) throw Object.assign(new Error(`File is larger than the ${Math.round(maxBytes / 1048576)} MB limit.`), { statusCode: 413 });
      if (!out.write(Buffer.from(r.data))) await new Promise((res) => out.once('drain', res));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    return { file, size };
  } catch (e) {
    out.destroy();
    await fsp.rm(file, { force: true });
    throw e;
  } finally {
    await q.run(`DELETE FROM upload_parts WHERE upload_id=?`, uploadId);
  }
}
export const purgeStaleParts = () => q.run(`DELETE FROM upload_parts WHERE created_at < ?`, Date.now() - 24 * 3600_000);

// ---------- Text extraction ----------
export async function extractVersion(vid: string) {
  try {
    const v = await getRow<FileVersion>('file_versions', vid);
    const key = v && (await blobKeyForVersion(vid));
    if (!v || !key) return;
    const buf = await readBlobBuffer(key);
    const { text, preview } = await extract(buf, v.ext, (await getSettings()).ocr_enabled);
    await q.run(`DELETE FROM doc_text WHERE version_id=?`, vid);
    await q.run(`INSERT INTO doc_text (version_id, file_id, text, preview) VALUES (?,?,?,?)`, vid, v.file_id, text, JSON.stringify(preview));
    await patchRow('file_versions', vid, { extract_status: text || preview.kind !== 'none' ? 'done' : 'none' }, false);
    await reindex('files', v.file_id);
  } catch {
    await patchRow('file_versions', vid, { extract_status: 'error' }, false).catch(() => {});
  }
}
const queue: string[] = [];
let running = false;
export async function queueExtraction(versionId: string) {
  // Serverless functions stop after responding, so extract before replying there.
  if (config.serverless) return extractVersion(versionId);
  queue.push(versionId);
  void drain();
}
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) await extractVersion(queue.shift()!);
  running = false;
}
export async function resumeExtraction(limit = 1000) {
  for (const r of await q.all<{ id: string }>(`SELECT id FROM file_versions WHERE extract_status='pending' AND deleted=0 LIMIT ?`, limit)) {
    if (config.serverless) await extractVersion(r.id); else void queueExtraction(r.id);
  }
}

function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function sendVersion(req: FastifyRequest, reply: FastifyReply, v: FileVersion, displayName?: string) {
  const key = await blobKeyForVersion(v.id);
  if (!key) return reply.code(404).send({ error: 'File content not found' });
  const query = req.query as { inline?: string; part?: string };
  const mime = v.mime || 'application/octet-stream';
  const canInline = query.inline === '1' && SAFE_INLINE.has(mime);
  const base = displayName ? displayName.replace(/\.[^.]+$/, '') : v.original_name.replace(/\.[^.]+$/, '');
  const name = `${base}${v.label && displayName ? ` v${v.label}` : ''}.${v.ext}`;
  reply
    .header('Content-Type', canInline ? mime : 'application/octet-stream')
    .header('Content-Disposition', contentDisposition(canInline ? 'inline' : 'attachment', name))
    .header('Cache-Control', 'private, no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  const chunk = config.transferChunk;
  if (query.part !== undefined && chunk) {
    // Partial transfer for platforms that cap response sizes.
    const n = Math.max(0, Number(query.part) || 0);
    const { data, total } = await readBlobRange(key, n * chunk, (n + 1) * chunk);
    return reply.header('X-PPM-Total', String(total)).header('X-PPM-Parts', String(Math.max(1, Math.ceil(total / chunk)))).header('Content-Length', String(data.length)).send(data);
  }
  reply.header('Content-Length', String(v.size));
  return reply.send(await readBlob(key));
}

interface UploadFields { [k: string]: string }

async function handleUpload(f: UploadFields, original: string, tmp: string, reply: FastifyReply) {
  const ext = (original.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS[ext]) return reply.code(415).send({ error: `.${ext || '?'} files are not supported.` });
  const size = (await fsp.stat(tmp)).size;
  if (!size) return reply.code(400).send({ error: 'The file is empty.' });

  const versionId = f.version_id && UUID_RE.test(f.version_id) ? f.version_id : uuid();
  const existingV = await getRow<FileVersion>('file_versions', versionId);
  if (existingV) return { file: await getRow('files', existingV.file_id), version: existingV, duplicate: true };

  const valid = await validateContent(tmp, ext);
  if (!valid.ok) return reply.code(415).send({ error: valid.reason });
  const scan = await scanFile(tmp);
  if (scan === 'infected') return reply.code(422).send({ error: 'This file was flagged by the malware scanner and was not saved.' });

  let file: FileRec | undefined;
  if (f.target_file_id) {
    file = await getRow<FileRec>('files', f.target_file_id);
    if (!file || file.deleted) return reply.code(404).send({ error: 'The file you are adding a version to no longer exists.' });
  } else {
    const project = f.project_id && UUID_RE.test(f.project_id) ? await getRow<any>('projects', f.project_id) : null;
    if (!project || project.deleted) return reply.code(400).send({ error: 'Choose a project or subproject for this file.' });
    if (!FILE_CATEGORIES.includes(f.category as any)) return reply.code(400).send({ error: 'Choose a file category.' });
  }

  const blob = await storeBlob(tmp);
  const mime = ALLOWED_EXTENSIONS[ext];
  const result = await q.tx(async () => {
    let major = 1, minor = 0;
    if (file) {
      const last = await q.get<{ major: number; minor: number }>(`SELECT major, minor FROM file_versions WHERE file_id=? AND deleted=0 ORDER BY major DESC, minor DESC LIMIT 1`, file.id);
      if (last) { if (f.bump === 'major') { major = Number(last.major) + 1; minor = 0; } else { major = Number(last.major); minor = Number(last.minor) + 1; } }
    } else {
      const fileId = f.file_id && UUID_RE.test(f.file_id) ? f.file_id : uuid();
      let promptIds: string[] = [];
      try { promptIds = JSON.parse(f.prompt_ids || '[]').filter((x: string) => UUID_RE.test(x)); } catch { /* ignore */ }
      file = await insertRow<FileRec>('files', {
        id: fileId, project_id: f.project_id, category: f.category, name: (f.name || original).slice(0, 200),
        description: (f.description || '').slice(0, 5000), prompt_ids: promptIds, tags: [], latest_version_id: null, version_count: 0, size, mime, ext,
      });
    }
    const version = await insertRow<FileVersion>('file_versions', {
      id: versionId, file_id: file!.id, label: `${major}.${minor}`, major, minor, original_name: original, size, mime, ext,
      sha256: blob.sha256, note: (f.note || (file!.version_count ? '' : 'Initial upload')).slice(0, 1000), extract_status: 'pending', scan_status: scan,
    });
    await q.run(`INSERT INTO version_blobs (version_id, storage_key) VALUES (?,?)`, versionId, blob.key);
    const updated = await patchRow<FileRec>('files', file!.id, { latest_version_id: versionId, version_count: file!.version_count + 1, size, mime, ext });
    await logActivity(updated.project_id, 'files', updated.id, file!.version_count ? 'version' : 'created',
      file!.version_count ? `New version ${version.label} of ${updated.name}` : `File uploaded: ${updated.name}`);
    return { file: updated, version };
  });
  await queueExtraction(versionId);
  if (config.serverless) return { file: await getRow('files', result.file.id), version: await getRow('file_versions', versionId) };
  return result;
}

export async function fileRoutes(app: FastifyInstance) {
  /** Upload one part of a file (raw bytes). Used when the platform caps request size. */
  app.put('/api/uploads/:uploadId/:n', { bodyLimit: (config.transferChunk || 8 * 1024 * 1024) + 65536 }, async (req, reply) => {
    const { uploadId, n } = req.params as { uploadId: string; n: string };
    const idx = Number(n);
    if (!UUID_RE.test(uploadId) || !Number.isInteger(idx) || idx < 0 || idx > 100_000) return reply.code(400).send({ error: 'Invalid upload part' });
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) return reply.code(400).send({ error: 'Empty upload part' });
    await savePart(uploadId, idx, body);
    return { ok: true };
  });

  app.post('/api/files/upload', async (req, reply) => {
    const maxBytes = (await getSettings()).upload_max_mb * 1024 * 1024;
    const tmp = path.join(config.tmpDir, uuid());
    let assembled: string | null = null;
    try {
      if (!req.isMultipart()) {
        // JSON finalise of a chunked upload: { upload_id, parts, filename, ...fields }
        const b = (req.body || {}) as Record<string, unknown>;
        if (typeof b.upload_id !== 'string' || !UUID_RE.test(b.upload_id) || !Number.isInteger(b.parts)) return reply.code(400).send({ error: 'Invalid upload' });
        const fields: UploadFields = Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 100_000)]));
        const a = await assembleUpload(b.upload_id, b.parts as number, maxBytes);
        assembled = a.file;
        return await handleUpload(fields, cleanName(String(b.filename || 'file')), a.file, reply);
      }
      const part = await req.file({ limits: { fileSize: maxBytes, files: 1, fields: 20, fieldSize: 100_000 } });
      if (!part) return reply.code(400).send({ error: 'No file received' });
      const f = Object.fromEntries(Object.entries(part.fields).filter(([, v]: any) => v && v.type === 'field').map(([k, v]: any) => [k, String(v.value)]));
      const original = cleanName(part.filename);
      const ext = (original.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_EXTENSIONS[ext]) { part.file.resume(); return reply.code(415).send({ error: `.${ext || '?'} files are not supported.` }); }
      await pipeline(part.file, fs.createWriteStream(tmp, { mode: 0o600 }));
      if (part.file.truncated) return reply.code(413).send({ error: `File is larger than the ${(await getSettings()).upload_max_mb} MB limit.` });
      return await handleUpload(f, original, tmp, reply);
    } finally {
      await fsp.rm(tmp, { force: true });
      if (assembled) await fsp.rm(assembled, { force: true });
    }
  });

  app.get('/api/files/versions/:vid/download', async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = await getRow<FileVersion>('file_versions', vid);
    if (!v || v.deleted === 2) return reply.code(404).send({ error: 'Not found' });
    const file = await getRow<FileRec>('files', v.file_id);
    return sendVersion(req, reply, v, file?.name);
  });

  app.get('/api/files/versions/:vid/preview', async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = await getRow<FileVersion>('file_versions', vid);
    if (!v) return reply.code(404).send({ error: 'Not found' });
    const r = await q.get<{ preview: string; len: number }>(`SELECT preview, LENGTH(text) AS len FROM doc_text WHERE version_id=?`, vid);
    reply.header('Cache-Control', 'private, no-store');
    return { status: v.extract_status, preview: r?.preview ? JSON.parse(r.preview) : { kind: 'none' }, textLength: Number(r?.len ?? 0) };
  });

  app.get('/api/files/versions/:vid/text', async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = await getRow<FileVersion>('file_versions', vid);
    if (!v) return reply.code(404).send({ error: 'Not found' });
    const r = await q.get<{ text: string }>(`SELECT text FROM doc_text WHERE version_id=?`, vid);
    reply.header('Cache-Control', 'private, no-store');
    return { status: v.extract_status, text: r?.text ?? '' };
  });

  /** Client-side OCR results (e.g. scanned PDFs rendered in the browser) can be saved as the searchable text. */
  app.post('/api/files/versions/:vid/text', { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { vid } = req.params as { vid: string };
    const v = await getRow<FileVersion>('file_versions', vid);
    if (!v) return reply.code(404).send({ error: 'Not found' });
    const text = String((req.body as any)?.text ?? '').slice(0, 2_000_000);
    const prev = await q.get<{ preview: string }>(`SELECT preview FROM doc_text WHERE version_id=?`, vid);
    await q.run(`DELETE FROM doc_text WHERE version_id=?`, vid);
    await q.run(`INSERT INTO doc_text (version_id, file_id, text, preview) VALUES (?,?,?,?)`, vid, v.file_id, text, prev?.preview ?? JSON.stringify({ kind: 'none' }));
    await patchRow('file_versions', vid, { extract_status: 'done' }, false);
    await reindex('files', v.file_id);
    return { ok: true };
  });

  app.post('/api/files/versions/:vid/reextract', async (req) => {
    const { vid } = req.params as { vid: string };
    await patchRow('file_versions', vid, { extract_status: 'pending' }, false);
    await queueExtraction(vid);
    return { ok: true };
  });
}
