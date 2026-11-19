import { ALLOWED_EXTENSIONS, type FileCategory } from '../../shared/schema';
import { api, apiBlob, uploadForm, ApiError, isNetworkError } from './api';
import { idb, metaGet, metaSet } from './idb';
import { seal, open, sealBytes, openBytes, type Sealed } from './crypto';
import { store, uuid, type PendingFile } from './store';
import { getPrefs } from './prefs';

export const ACCEPT = Object.keys(ALLOWED_EXTENSIONS).map((e) => '.' + e).join(',');
export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

export interface UploadRequest {
  file: File; project_id?: string; category?: FileCategory; description?: string; prompt_ids?: string[];
  target_file_id?: string; note?: string; bump?: 'minor' | 'major'; name?: string;
}

export function validateLocalFile(f: File, maxMb: number): string | null {
  const ext = extOf(f.name);
  if (!ALLOWED_EXTENSIONS[ext]) return `.${ext || '?'} files are not supported.`;
  if (f.size === 0) return 'The file is empty.';
  if (f.size > maxMb * 1024 * 1024) return `Larger than the ${maxMb} MB limit.`;
  return null;
}

/** Queue an upload. Works offline: the file is kept encrypted on this device until it can be sent. */
export async function queueUpload(r: UploadRequest): Promise<PendingFile> {
  const key = store.key; if (!key) throw new Error('Workspace is locked');
  const ext = extOf(r.file.name);
  const p: PendingFile = {
    id: r.target_file_id || uuid(), versionId: uuid(), project_id: r.project_id || '', category: r.category || 'reference',
    name: r.name || r.file.name, description: r.description || '', size: r.file.size, mime: ALLOWED_EXTENSIONS[ext] || r.file.type, ext,
    prompt_ids: r.prompt_ids || [], target_file_id: r.target_file_id, note: r.note, bump: r.bump, status: 'queued', progress: 0, created_at: new Date().toISOString(),
  };
  const bytes = await r.file.arrayBuffer();
  const db = await idb();
  await db.put('uploads', { id: p.versionId, meta: await seal(key, p), blob: await sealBytes(key, bytes), original: await seal(key, r.file.name) });
  store.pendingFiles.set(p.versionId, p);
  store.notify();
  void processUploads();
  return p;
}

export async function restorePendingUploads() {
  const key = store.key; if (!key) return;
  const db = await idb();
  for (const u of await db.getAll('uploads')) {
    try { const p = await open<PendingFile>(key, u.meta); store.pendingFiles.set(p.versionId, { ...p, status: 'queued', progress: 0 }); } catch { /* skip */ }
  }
  store.notify();
  void processUploads();
}

let processing = false;
let again = false;
export async function processUploads(): Promise<void> {
  if (processing) { again = true; return; }
  processing = true;
  let networkDown = false;
  try {
    for (const p of [...store.pendingFiles.values()]) {
      if (p.status === 'error' || !navigator.onLine || !store.key) continue;
      const key = store.key;
      const db = await idb();
      const rec = await db.get('uploads', p.versionId);
      if (!rec) { store.pendingFiles.delete(p.versionId); continue; }
      const bytes = await openBytes(key, rec.blob as Sealed);
      const original = await open<string>(key, rec.original);
      const form = new FormData();
      form.append('version_id', p.versionId);
      if (p.target_file_id) { form.append('target_file_id', p.target_file_id); form.append('bump', p.bump || 'minor'); }
      else { form.append('file_id', p.id); form.append('project_id', p.project_id); form.append('category', p.category); form.append('name', p.name); form.append('description', p.description); form.append('prompt_ids', JSON.stringify(p.prompt_ids)); }
      if (p.note) form.append('note', p.note);
      form.append('file', new Blob([bytes], { type: p.mime }), original);
      p.status = 'uploading'; store.notify();
      try {
        const res = await uploadForm<{ file: any; version: any }>('/api/files/upload', form, (f) => { p.progress = f; store.notify(); });
        store.ingest('files', [res.file]);
        store.ingest('file_versions', [res.version]);
        await cacheBlob(res.version.id, bytes, true);
        await db.delete('uploads', p.versionId);
        store.pendingFiles.delete(p.versionId);
        store.notify();
      } catch (e) {
        if (isNetworkError(e) || (e instanceof ApiError && e.status === 401)) { p.status = 'queued'; p.progress = 0; store.notify(); networkDown = true; break; }
        p.status = 'error'; p.error = (e as Error).message; store.notify();
      }
    }
  } finally { processing = false; }
  // Files queued while this pass was running are picked up by another pass.
  const waiting = [...store.pendingFiles.values()].some((p) => p.status === 'queued');
  if (again && waiting && !networkDown) { again = false; return processUploads(); }
  again = false;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => void processUploads());

export async function retryUpload(versionId: string) { const p = store.pendingFiles.get(versionId); if (p) { p.status = 'queued'; p.error = undefined; store.notify(); void processUploads(); } }
export async function cancelUpload(versionId: string) { await (await idb()).delete('uploads', versionId); store.pendingFiles.delete(versionId); store.notify(); }

// ---------- Encrypted offline cache for file contents and previews ----------
interface BlobEntry { sealed: Sealed; size: number; at: number; pinned?: boolean }

async function cacheBlob(versionId: string, bytes: ArrayBuffer, pinned = false) {
  const key = store.key; if (!key) return;
  const prefs = getPrefs();
  if (!pinned && !prefs.cacheViewedFiles) return;
  const limit = prefs.offlineCacheMb * 1024 * 1024;
  if (bytes.byteLength > limit) return;
  const db = await idb();
  await db.put('blobs', { sealed: await sealBytes(key, bytes), size: bytes.byteLength, at: Date.now(), pinned } satisfies BlobEntry, versionId);
  await evict(limit);
}

async function evict(limit: number) {
  const db = await idb();
  const keys = (await db.getAllKeys('blobs')) as string[];
  const entries: [string, BlobEntry][] = [];
  for (const k of keys) entries.push([k, await db.get('blobs', k)]);
  let total = entries.reduce((s, [, e]) => s + e.size, 0);
  const pinnedIds = new Set((await metaGet<string[]>('offlineFiles')) ?? []);
  for (const [k, e] of entries.sort((a, b) => a[1].at - b[1].at)) {
    if (total <= limit) break;
    if (pinnedIds.has(k)) continue;
    await db.delete('blobs', k); total -= e.size;
  }
}

export async function getVersionBlob(versionId: string, mime: string): Promise<Blob> {
  const key = store.key; if (!key) throw new Error('Workspace is locked');
  const db = await idb();
  const hit = (await db.get('blobs', versionId)) as BlobEntry | undefined;
  if (hit) {
    try { const b = await openBytes(key, hit.sealed); void db.put('blobs', { ...hit, at: Date.now() }, versionId); return new Blob([b], { type: mime }); } catch { /* stale key */ }
  }
  // Pending (not yet uploaded) file: read from the upload queue.
  const up = await db.get('uploads', versionId);
  if (up) return new Blob([await openBytes(key, up.blob)], { type: mime });
  if (!navigator.onLine) throw new Error('This file is not available offline yet. Open it once while online, or mark it “Available offline”.');
  const blob = await apiBlob(`/api/files/versions/${versionId}/download`);
  void cacheBlob(versionId, await blob.arrayBuffer());
  return new Blob([blob], { type: mime });
}

export async function isCached(versionId: string) { return !!(await (await idb()).getKey('blobs', versionId)); }

export async function setAvailableOffline(versionIds: string[], on: boolean, mimes: Record<string, string> = {}) {
  const cur = new Set((await metaGet<string[]>('offlineFiles')) ?? []);
  for (const v of versionIds) {
    if (on) { cur.add(v); const b = await getVersionBlob(v, mimes[v] || 'application/octet-stream'); await cacheBlob(v, await b.arrayBuffer(), true); }
    else cur.delete(v);
  }
  await metaSet('offlineFiles', [...cur]);
}
export async function offlineFileIds() { return new Set((await metaGet<string[]>('offlineFiles')) ?? []); }

async function cachedJson<T>(cacheKey: string, path: string, ready: (v: T) => boolean): Promise<T> {
  const key = store.key; if (!key) throw new Error('Workspace is locked');
  const db = await idb();
  if (navigator.onLine) {
    try {
      const v = await api<T>(path);
      if (ready(v)) await db.put('previews', await seal(key, v), cacheKey);
      return v;
    } catch (e) { if (!isNetworkError(e)) throw e; }
  }
  const hit = await db.get('previews', cacheKey);
  if (hit) return open<T>(key, hit);
  throw new Error('Preview not available offline yet.');
}

export const getPreview = (vid: string) => cachedJson<{ status: string; preview: any; textLength: number }>(`p:${vid}`, `/api/files/versions/${vid}/preview`, (v) => v.status !== 'pending');
export const getText = (vid: string) => cachedJson<{ status: string; text: string }>(`t:${vid}`, `/api/files/versions/${vid}/text`, (v) => v.status !== 'pending');

export async function cacheUsage() {
  const db = await idb();
  let bytes = 0; let n = 0;
  for (const k of await db.getAllKeys('blobs')) { const e = (await db.get('blobs', k)) as BlobEntry; bytes += e.size; n++; }
  return { bytes, files: n };
}
export async function clearFileCache() { const db = await idb(); await db.clear('blobs'); await db.clear('previews'); await metaSet('offlineFiles', []); }
