/**
 * Offline work-entry queue (P2-38). Browser-only: entries saved while offline wait here until
 * /api/work/sync accepts them. IndexedDB first; localStorage when IndexedDB is unavailable
 * (private mode on some phones). Every entry carries a clientUuid so a retried upload is
 * idempotent on the server.
 */

/** The shape POSTed to /api/work/sync — mirrors the work service's EntryInput. */
export type QueuedEntryInput = {
  dates: string[];
  clientId?: string | null;
  engagementId?: string | null;
  taskId?: string | null;
  internalCategoryId?: string | null;
  stageIndex?: number | null;
  minutes: number;
  description: string;
  chips: string[];
  location?: string;
  clientSiteClientId?: string | null;
  outcomeType?: string | null;
  outcomeRef?: string | null;
  clientUuid: string;
};

export type QueuedEntry = {
  clientUuid: string;
  input: QueuedEntryInput;
  /** Human label shown in the "waiting to sync" list, e.g. "Sharma Traders · 1 hr". */
  label: string;
  queuedAt: string;
  /** Set when the server refused this entry (e.g. week locked); network failures leave it empty. */
  lastError?: string;
};

export const QUEUE_EVENT = "qepex:offline-queue";
const DB_NAME = "qepex-offline";
const STORE = "workEntries";
const LS_KEY = "qepex.offlineQueue";

/** UUID v4 even outside secure contexts (plain-http LAN installs lack crypto.randomUUID). */
export function newClientUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "clientUuid" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbRun<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function lsRead(): QueuedEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as QueuedEntry[]) : [];
  } catch {
    return [];
  }
}
function lsWrite(rows: QueuedEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    /* storage full or blocked: nothing more we can do on this device */
  }
}

function changed() {
  try {
    window.dispatchEvent(new Event(QUEUE_EVENT));
  } catch {
    /* not in a browser */
  }
}

export async function listQueued(): Promise<QueuedEntry[]> {
  const db = await openDb();
  if (db) {
    try {
      const rows = ((await idbRun(db, "readonly", (s) => s.getAll())) ?? []) as QueuedEntry[];
      return rows.concat(lsRead()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    } catch {
      /* fall through to localStorage */
    } finally {
      db.close();
    }
  }
  return lsRead();
}

export async function enqueue(entry: QueuedEntry): Promise<void> {
  const db = await openDb();
  let stored = false;
  if (db) {
    try {
      await idbRun(db, "readwrite", (s) => s.put(entry));
      stored = true;
    } catch {
      stored = false;
    } finally {
      db.close();
    }
  }
  if (!stored) lsWrite([...lsRead().filter((r) => r.clientUuid !== entry.clientUuid), entry]);
  changed();
}

export async function removeQueued(uuids: string[]): Promise<void> {
  if (uuids.length === 0) return;
  const set = new Set(uuids);
  const db = await openDb();
  if (db) {
    try {
      await idbRun(db, "readwrite", (s) => {
        for (const id of set) s.delete(id);
      });
    } catch {
      /* ignore */
    } finally {
      db.close();
    }
  }
  const ls = lsRead();
  if (ls.some((r) => set.has(r.clientUuid))) lsWrite(ls.filter((r) => !set.has(r.clientUuid)));
  changed();
}

async function markErrors(errors: Map<string, string>) {
  if (errors.size === 0) return;
  const rows = await listQueued();
  for (const r of rows) {
    const err = errors.get(r.clientUuid);
    if (err) await enqueueQuiet({ ...r, lastError: err });
  }
  changed();
}

async function enqueueQuiet(entry: QueuedEntry) {
  const db = await openDb();
  if (db) {
    try {
      await idbRun(db, "readwrite", (s) => s.put(entry));
      return;
    } catch {
      /* fall through */
    } finally {
      db.close();
    }
  }
  lsWrite([...lsRead().filter((r) => r.clientUuid !== entry.clientUuid), entry]);
}

export type SyncOutcome = { synced: number; failed: number; status: "ok" | "offline" | "signed-out" | "error" | "empty" };

let syncing: Promise<SyncOutcome> | null = null;

/** Upload everything queued; synced entries leave the queue, refused ones keep their error for the user. */
export function syncQueue(): Promise<SyncOutcome> {
  if (!syncing) syncing = doSync().finally(() => (syncing = null));
  return syncing;
}

async function doSync(): Promise<SyncOutcome> {
  const rows = await listQueued();
  if (rows.length === 0) return { synced: 0, failed: 0, status: "empty" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { synced: 0, failed: 0, status: "offline" };
  let res: Response;
  try {
    res = await fetch("/api/work/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: rows.map((r) => r.input) }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { synced: 0, failed: 0, status: "offline" };
  }
  if (res.status === 401) return { synced: 0, failed: 0, status: "signed-out" };
  if (!res.ok) return { synced: 0, failed: 0, status: "error" };
  const body = (await res.json().catch(() => null)) as { results?: { clientUuid: string | null; ok: boolean; error?: string }[] } | null;
  const results = body?.results ?? [];
  const done = results.filter((r) => r.ok && r.clientUuid).map((r) => r.clientUuid!);
  const errors = new Map(results.filter((r) => !r.ok && r.clientUuid).map((r) => [r.clientUuid!, r.error ?? "Could not be saved"]));
  await removeQueued(done);
  await markErrors(errors);
  return { synced: done.length, failed: errors.size, status: "ok" };
}

/** True when a thrown error looks like "the network is down" rather than a server refusal. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /network|fetch|load failed|offline/i.test(msg);
}
