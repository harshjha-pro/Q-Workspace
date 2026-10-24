import type { CollectionName, DBState, ID } from '@/types/models';
import { buildSeed, DB_VERSION } from '@/data/seed';
import { safeStorage } from '@/utils/storage';

/**
 * Local demo data adapter. Holds the whole demo database in memory, persists non-sensitive
 * demo records to localStorage, and notifies subscribers. In production, replace the
 * repository functions below with calls to the backend (see services/backend.ts) — feature
 * code only talks to `repo`, never to localStorage directly.
 */
const KEY = 'one-bhilwara:db:v1';
type Listener = () => void;

function load(): DBState {
  const raw = safeStorage.get(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DBState;
      if (parsed.version === DB_VERSION) return { ...buildSeedShape(), ...parsed };
    } catch {
      /* corrupted — reseed */
    }
  }
  return buildSeed();
}

/** Ensures newly added collections exist when loading an older saved state. */
function buildSeedShape(): DBState {
  return buildSeed();
}

let state: DBState = load();
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => safeStorage.set(KEY, JSON.stringify(state)), 150);
}

function emit() {
  listeners.forEach((l) => l());
}

export const store = {
  getState: () => state,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Immutable update: return the next state. */
  set(next: DBState) {
    state = next;
    persist();
    emit();
  },
  update(fn: (s: DBState) => Partial<DBState>) {
    store.set({ ...state, ...fn(state) });
  },
  reset() {
    state = buildSeed();
    safeStorage.set(KEY, JSON.stringify(state));
    emit();
  }
};

if (typeof window !== 'undefined') {
  // Keep multiple open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue) as DBState;
        emit();
      } catch {
        /* ignore */
      }
    }
  });
}

type Item<C extends CollectionName> = DBState[C][number];

/** Generic repository over the collections. */
export const repo = {
  list<C extends CollectionName>(c: C): DBState[C] {
    return state[c];
  },
  get<C extends CollectionName>(c: C, id: ID): Item<C> | undefined {
    return (state[c] as Array<{ id: ID }>).find((x) => x.id === id) as Item<C> | undefined;
  },
  insert<C extends CollectionName>(c: C, rec: Item<C>, atStart = true) {
    const arr = state[c] as Array<Item<C>>;
    store.update(() => ({ [c]: atStart ? [rec, ...arr] : [...arr, rec] }) as Partial<DBState>);
    return rec;
  },
  patch<C extends CollectionName>(c: C, id: ID, patch: Partial<Item<C>>) {
    repo.at(c).mutate(id, () => patch);
  },
  /**
   * Collection-bound helpers. `repo.at('jobs').mutate(id, cur => ({...}))` — binding the
   * collection first lets TypeScript type the updater's return value precisely.
   */
  at<C extends CollectionName>(c: C) {
    return {
      mutate(id: ID, fn: (cur: Item<C>) => Partial<Item<C>>) {
        const arr = state[c] as unknown as Array<Item<C> & { id: ID }>;
        store.update(() => ({
          [c]: arr.map((x) => (x.id === id ? { ...x, ...fn(x), updatedAt: new Date().toISOString() } : x))
        }) as Partial<DBState>);
      }
    };
  },
  remove<C extends CollectionName>(c: C, id: ID) {
    const arr = state[c] as Array<{ id: ID }>;
    store.update(() => ({ [c]: arr.filter((x) => x.id !== id) }) as Partial<DBState>);
  }
};
