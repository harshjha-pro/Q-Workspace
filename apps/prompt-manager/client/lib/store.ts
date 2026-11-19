import { useSyncExternalStore } from 'react';
import { ENTITIES, ENTITY_NAMES, DEFAULTS, type EntityName, type RowMap } from '../../shared/schema';
import { api, ApiError, isNetworkError, hasCsrf } from './api';
import { idb, metaGet, metaSet } from './idb';
import { seal, open, type Sealed } from './crypto';

type Row = Record<string, any>;
export interface OutboxItem { seq?: number; mid: string; entity: EntityName; op: 'create' | 'update' | 'delete'; id: string; data?: Row; base?: Row; note?: string; at: string; inflight?: boolean }
export interface PendingFile { id: string; versionId: string; project_id: string; category: string; name: string; description: string; size: number; mime: string; ext: string; prompt_ids: string[]; target_file_id?: string; note?: string; bump?: string; status: 'queued' | 'uploading' | 'error'; progress: number; error?: string; created_at: string }

export interface SyncStatus {
  online: boolean; syncing: boolean; lastSyncAt: string | null; error: string | null; conflicts: number;
  pending: number; uploads: number; authRequired: boolean; loaded: boolean; progress: number | null;
}
type Evt = { type: 'conflict'; entity: EntityName; id: string } | { type: 'error'; message: string } | { type: 'restored' } | { type: 'synced'; count: number };

export const uuid = () => crypto.randomUUID();
const PROMPT_VERSIONED = ['title', 'content', 'description', 'purpose', 'type', 'tags', 'instructions'];
const nowIso = () => new Date().toISOString();
const emptyMaps = () => Object.fromEntries(ENTITY_NAMES.map((e) => [e, new Map<string, Row>()])) as Record<EntityName, Map<string, Row>>;

class Store {
  key: CryptoKey | null = null;
  server = emptyMaps();
  view = emptyMaps();
  outbox: OutboxItem[] = [];
  pendingFiles = new Map<string, PendingFile>();
  status: SyncStatus = { online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false, lastSyncAt: null, error: null, conflicts: 0, pending: 0, uploads: 0, authRequired: false, loaded: false, progress: null };
  version = 0;
  private listeners = new Set<() => void>();
  private evtListeners = new Set<(e: Evt) => void>();
  private cursor = 0;
  private epoch: string | null = null;
  private dirty = new Set<EntityName>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private pulling: Promise<void> | null = null;
  private backoff = 2000;
  syncIntervalSec = 30;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  onEvent = (l: (e: Evt) => void) => { this.evtListeners.add(l); return () => { this.evtListeners.delete(l); }; };
  emit(e: Evt) { this.evtListeners.forEach((l) => l(e)); }
  notify() {
    this.version++;
    this.status = { ...this.status, pending: this.outbox.length, uploads: this.pendingFiles.size };
    this.listeners.forEach((l) => l());
  }
  setStatus(p: Partial<SyncStatus>) { this.status = { ...this.status, ...p }; this.notify(); }

  // ---------- Lifecycle ----------
  async load(key: CryptoKey) {
    this.key = key;
    this.server = emptyMaps();
    const db = await idb();
    for (const e of ENTITY_NAMES) {
      const s = (await db.get('snap', e)) as Sealed | undefined;
      if (!s) continue;
      try { for (const r of await open<Row[]>(key, s)) this.server[e].set(r.id, r); } catch { /* corrupt snapshot: will re-pull */ this.cursor = 0; }
    }
    this.outbox = [];
    for (const item of (await db.getAll('outbox')) as (Sealed & { seq: number })[]) {
      try { this.outbox.push({ ...(await open<OutboxItem>(key, item)), seq: item.seq, inflight: false }); } catch { /* skip */ }
    }
    this.cursor = (await metaGet<number>('cursor')) ?? 0;
    this.epoch = (await metaGet<string>('epoch')) ?? null;
    this.status.lastSyncAt = (await metaGet<string>('lastSyncAt')) ?? null;
    this.rebuild();
    this.status.loaded = true;
    this.notify();
    this.startAuto();
  }

  unload() {
    this.stopAuto();
    this.key = null;
    this.server = emptyMaps();
    this.view = emptyMaps();
    this.outbox = [];
    this.pendingFiles.clear();
    this.status = { ...this.status, loaded: false, syncing: false };
    this.notify();
  }

  private onOnline = () => { this.setStatus({ online: true }); this.backoff = 2000; void this.sync(); };
  private onOffline = () => this.setStatus({ online: false });
  private onVisible = () => { if (document.visibilityState === 'visible') void this.sync(); };
  private onSwMessage = (e: MessageEvent) => { if (e.data?.type === 'ppm-sync') void this.sync(); };
  startAuto() {
    this.stopAuto();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    navigator.serviceWorker?.addEventListener('message', this.onSwMessage);
    this.interval = setInterval(() => { if (document.visibilityState === 'visible') void this.sync(); }, this.syncIntervalSec * 1000);
  }
  stopAuto() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisible);
    navigator.serviceWorker?.removeEventListener('message', this.onSwMessage);
    if (this.interval) clearInterval(this.interval);
  }
  setSyncInterval(sec: number) { this.syncIntervalSec = sec; if (this.key) this.startAuto(); }

  // ---------- View = server rows + pending local changes ----------
  rebuild() {
    const v = emptyMaps();
    for (const e of ENTITY_NAMES) for (const [id, r] of this.server[e]) v[e].set(id, r);
    for (const it of this.outbox) this.applyLocal(v, it);
    this.view = v;
  }

  private applyLocal(v: Record<EntityName, Map<string, Row>>, it: OutboxItem) {
    const map = v[it.entity];
    const cur = map.get(it.id);
    if (it.op === 'create') {
      map.set(it.id, { ...(DEFAULTS[it.entity] as Row), ...(cur || {}), ...it.data, id: it.id, rev: cur?.rev ?? 0, deleted: 0, created_at: cur?.created_at ?? it.at, updated_at: it.at, _local: true });
    } else if (it.op === 'update' && cur) {
      map.set(it.id, { ...cur, ...it.data, updated_at: it.at, _local: true });
    } else if (it.op === 'delete' && cur) {
      for (const [e, id] of this.cascade(v, it.entity, it.id)) v[e].delete(id);
    }
  }

  /** Items that disappear locally along with a deleted record. */
  private cascade(v: Record<EntityName, Map<string, Row>>, entity: EntityName, id: string): [EntityName, string][] {
    const out: [EntityName, string][] = [[entity, id]];
    const projectIds = new Set<string>();
    if (entity === 'projects') {
      projectIds.add(id);
      for (const p of v.projects.values()) if (p.parent_id === id) { projectIds.add(p.id); out.push(['projects', p.id]); }
      const promptIds = new Set<string>();
      for (const e of ['prompts', 'collections', 'files', 'tasks', 'notes'] as EntityName[]) for (const r of v[e].values()) if (projectIds.has(r.project_id)) { out.push([e, r.id]); if (e === 'prompts') promptIds.add(r.id); }
      const collIds = new Set(out.filter(([e]) => e === 'collections').map(([, x]) => x));
      for (const s of v.collection_steps.values()) if (collIds.has(s.collection_id) || promptIds.has(s.prompt_id)) out.push(['collection_steps', s.id]);
    }
    if (entity === 'collections') for (const s of v.collection_steps.values()) if (s.collection_id === id) out.push(['collection_steps', s.id]);
    if (entity === 'prompts') for (const s of v.collection_steps.values()) if (s.prompt_id === id) out.push(['collection_steps', s.id]);
    return out;
  }

  // ---------- Reads ----------
  get<K extends EntityName>(e: K, id: string | null | undefined): RowMap[K] | undefined {
    if (!id) return undefined;
    const r = this.view[e].get(id);
    return r && !r.deleted ? (r as RowMap[K]) : undefined;
  }
  all<K extends EntityName>(e: K): RowMap[K][] {
    const out: RowMap[K][] = [];
    for (const r of this.view[e].values()) if (!r.deleted) out.push(r as RowMap[K]);
    return out;
  }
  isLocal(e: EntityName, id: string) { return this.outbox.some((o) => o.entity === e && o.id === id); }

  // ---------- Writes ----------
  create<K extends EntityName>(e: K, data: Partial<RowMap[K]>, opts: { id?: string; note?: string } = {}): RowMap[K] {
    const id = opts.id || uuid();
    this.enqueue({ mid: uuid(), entity: e, op: 'create', id, data: data as Row, note: opts.note, at: nowIso() });
    return this.view[e].get(id) as RowMap[K];
  }
  update<K extends EntityName>(e: K, id: string, patch: Partial<RowMap[K]>, opts: { note?: string } = {}) {
    const data = patch as Row;
    const srv = this.server[e].get(id);
    const base: Row = {};
    if (srv) for (const f of ENTITIES[e].conflictFields) if (f in data) base[f] = srv[f];
    this.enqueue({ mid: uuid(), entity: e, op: 'update', id, data, base, note: opts.note, at: nowIso() });
  }
  remove(e: EntityName, id: string) {
    this.enqueue({ mid: uuid(), entity: e, op: 'delete', id, at: nowIso() });
  }

  private persistChain: Promise<void> = Promise.resolve();

  private async persistItem(it: OutboxItem) {
    if (!this.key || !this.outbox.includes(it)) return;
    const db = await idb();
    const { inflight: _i, seq: _s, ...payload } = it;
    const sealed = await seal(this.key, payload);
    if (it.seq == null) it.seq = (await db.add('outbox', sealed as any)) as number;
    else await db.put('outbox', { ...sealed, seq: it.seq });
  }

  /** Apply a change to memory synchronously, then persist it to the encrypted outbox. */
  private enqueue(item: OutboxItem) {
    if (!this.key) throw new Error('Workspace is locked');
    const same = (o: OutboxItem) => o.entity === item.entity && o.id === item.id && !o.inflight;
    const last = [...this.outbox].reverse().find((o) => o.entity === item.entity && o.id === item.id);
    let persist: () => Promise<void>;
    // Each saved edit to a prompt's versioned fields stays a separate change so the
    // server records one version per save (also when saved offline).
    const versioned = item.entity === 'prompts' && item.op === 'update' && Object.keys(item.data || {}).some((k) => PROMPT_VERSIONED.includes(k));
    if (!versioned && last && !last.inflight && item.op === 'update' && (last.op === 'create' || last.op === 'update') && (!item.note || !last.note || last.op === 'create')) {
      // Coalesce with a pending change to the same record (keeps the earliest base).
      last.data = { ...last.data, ...item.data };
      last.base = { ...(item.base || {}), ...(last.base || {}) };
      last.at = item.at;
      last.note = last.note || item.note;
      persist = () => this.persistItem(last);
    } else if (item.op === 'delete' && this.outbox.some((o) => same(o) && o.op === 'create') && !this.server[item.entity].has(item.id)) {
      // Never reached the server: just drop it locally.
      const removed = this.outbox.filter(same);
      this.outbox = this.outbox.filter((o) => !same(o));
      persist = async () => { const db = await idb(); for (const o of removed) if (o.seq != null) await db.delete('outbox', o.seq); };
    } else {
      this.outbox.push(item);
      persist = () => this.persistItem(item);
    }
    this.rebuild();
    this.notify();
    this.persistChain = this.persistChain.then(persist).then(async () => { await metaSet('pendingCount', this.outbox.length); }).catch(() => {});
    void this.persistChain.then(() => this.scheduleFlush());
    void (async () => { try { const reg: any = navigator.serviceWorker?.controller ? await navigator.serviceWorker.ready : null; await reg?.sync?.register('ppm-sync'); } catch { /* Background Sync unsupported or disabled: interval/online fallback handles it */ } })();
  }

  scheduleFlush(delay = 250) {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.sync(), delay);
  }

  // ---------- Sync ----------
  async sync() {
    if (!this.key || this.status.authRequired) return;
    if (!navigator.onLine) { if (this.status.online) this.setStatus({ online: false }); return; }
    if (hasCsrf()) await this.flush();
    await this.pull();
  }

  private setServerRow(e: EntityName, r: Row | null | undefined) {
    if (!r) return;
    const cur = this.server[e].get(r.id);
    if (cur && cur.rev > r.rev) return;
    if (r.deleted) this.server[e].delete(r.id); else this.server[e].set(r.id, r);
    this.dirty.add(e);
  }

  async flush() {
    if (this.flushing || !this.key) return;
    await this.persistChain;
    const batch = this.outbox.filter((o) => !o.inflight).slice(0, 200);
    if (!batch.length) return;
    this.flushing = true;
    batch.forEach((b) => (b.inflight = true));
    this.setStatus({ syncing: true });
    try {
      const res = await api<{ results: (Row & { mid: string; status: string })[] }>('/api/sync/push', {
        body: { mutations: batch.map(({ mid, entity, op, id, data, base, note }) => ({ mid, entity, op, id, data, base, note })) },
      });
      const db = await idb();
      const byMid = new Map(res.results.map((r) => [r.mid, r]));
      const done: OutboxItem[] = [];
      for (const b of batch) {
        const r = byMid.get(b.mid);
        if (!r) { b.inflight = false; continue; }
        if (r.row !== undefined) this.setServerRow(b.entity, r.row);
        if (r.status === 'conflict') this.emit({ type: 'conflict', entity: b.entity, id: b.id });
        if (r.status === 'error') this.emit({ type: 'error', message: `${ENTITIES[b.entity].label}: ${r.error}` });
        done.push(b);
      }
      // Persist the confirmed rows before dropping the outbox entries, so a reload
      // or crash in between can never lose a change locally.
      await this.persist();
      for (const b of done) await db.delete('outbox', b.seq!);
      this.outbox = this.outbox.filter((o) => !done.includes(o));
      await metaSet('pendingCount', this.outbox.length);
      this.backoff = 2000;
      this.rebuild();
      this.setStatus({ online: true, error: null });
      if (this.outbox.some((o) => !o.inflight)) this.scheduleFlush(50);
    } catch (e) {
      batch.forEach((b) => (b.inflight = false));
      this.handleSyncError(e);
    } finally {
      this.flushing = false;
      this.setStatus({ syncing: false });
    }
  }

  private handleSyncError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) this.setStatus({ authRequired: true, error: 'Sign in to sync your changes.' });
    else if (isNetworkError(e)) {
      this.setStatus({ online: navigator.onLine && false, error: null });
      this.scheduleFlush(this.backoff);
      this.backoff = Math.min(this.backoff * 2, 60_000);
    } else this.setStatus({ error: (e as Error).message });
  }

  pull(): Promise<void> {
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      if (!this.key) return;
      this.setStatus({ syncing: true });
      let total = 0;
      try {
        for (let page = 0; page < 1000; page++) {
          const r = await api<{ epoch: string; rev: number; more: boolean; count: number; changes: Record<string, Row[]>; conflicts: number }>(`/api/sync/pull?since=${this.cursor}`);
          if (this.epoch && r.epoch !== this.epoch) {
            // Server data was restored from a backup: rebuild the local copy from scratch.
            this.epoch = r.epoch;
            this.cursor = 0;
            this.server = emptyMaps();
            ENTITY_NAMES.forEach((e) => this.dirty.add(e));
            await metaSet('epoch', r.epoch);
            this.emit({ type: 'restored' });
            continue;
          }
          this.epoch = r.epoch;
          for (const [e, rows] of Object.entries(r.changes)) for (const row of rows) this.setServerRow(e as EntityName, row);
          total += r.count;
          this.cursor = r.rev;
          this.status.conflicts = r.conflicts;
          if (r.more) this.setStatus({ progress: page });
          if (!r.more) break;
        }
        // Snapshot first, cursor second: the cursor must never run ahead of saved data.
        await this.persist();
        await metaSet('cursor', this.cursor);
        await metaSet('epoch', this.epoch);
        const t = nowIso();
        await metaSet('lastSyncAt', t);
        if (total) this.rebuild();
        this.setStatus({ online: true, lastSyncAt: t, error: null, progress: null });
        if (total) this.emit({ type: 'synced', count: total });
      } catch (e) {
        this.handleSyncError(e);
      } finally {
        this.setStatus({ syncing: false, progress: null });
        this.pulling = null;
      }
    })();
    return this.pulling;
  }

  /** Apply rows returned by server endpoints (e.g. upload, import) immediately. */
  ingest(e: EntityName, rows: Row[]) {
    rows.forEach((r) => this.setServerRow(e, r));
    this.rebuild();
    this.schedulePersist();
    this.notify();
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), 400);
  }
  private persisting: Promise<void> = Promise.resolve();
  persist(): Promise<void> {
    this.persisting = this.persisting.then(async () => {
      if (!this.key || !this.dirty.size) return;
      const key = this.key;
      const db = await idb();
      const ents = [...this.dirty];
      this.dirty.clear();
      for (const e of ents) await db.put('snap', await seal(key, [...this.server[e].values()]), e);
    }).catch(() => {});
    return this.persisting;
  }

  async resetCursor() { this.cursor = 0; await metaSet('cursor', 0); }
  markAuthOk() { if (this.status.authRequired) { this.setStatus({ authRequired: false, error: null }); void this.sync(); } }
}

export const store = new Store();

/** Re-render when the store changes. */
export function useStoreVersion() {
  return useSyncExternalStore(store.subscribe, () => store.version);
}
export function useSyncStatus() {
  useSyncExternalStore(store.subscribe, () => store.version);
  return store.status;
}
