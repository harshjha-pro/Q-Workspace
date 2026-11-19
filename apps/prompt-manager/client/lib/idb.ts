import { openDB, deleteDB, type IDBPDatabase } from 'idb';

// Database name is namespaced so it never collides with other apps on the same origin.
export const DB_NAME = 'ppm-workspace-v1';

export type Stores = 'meta' | 'snap' | 'outbox' | 'uploads' | 'blobs' | 'previews';
let dbp: Promise<IDBPDatabase> | null = null;

export function idb() {
  dbp ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('snap');
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      db.createObjectStore('uploads', { keyPath: 'id' });
      db.createObjectStore('blobs');
      db.createObjectStore('previews');
    },
    blocked() { /* another tab holds an old version */ },
  });
  return dbp;
}

export const metaGet = async <T = any>(k: string): Promise<T | undefined> => (await idb()).get('meta', k);
export const metaSet = async (k: string, v: unknown) => (await idb()).put('meta', v, k);
export const metaDel = async (k: string) => (await idb()).delete('meta', k);

export async function wipeLocalData() {
  if (dbp) { (await dbp).close(); dbp = null; }
  await deleteDB(DB_NAME);
}

/** Clear the cached workspace but keep wrapped keys and identity (used after a server restore). */
export async function clearReplica() {
  const db = await idb();
  await Promise.all([db.clear('snap'), db.clear('previews'), db.clear('blobs')]);
  await metaDel('cursor');
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return undefined; }
}
