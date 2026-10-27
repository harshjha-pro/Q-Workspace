import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EMPTY_PROFILE, hasPreferences, type Profile } from './personalise';

// All user data is stored locally on the device (localStorage, namespaced to
// this app). There is no account and nothing is sent to a server.

const NS = 'fivew-oneh:';

export type SavedType = 'product' | 'ingredient' | 'article' | 'topic' | 'comparison';

export interface SavedItem {
  type: SavedType;
  id: string;
  savedAt: string;
  label?: string;
}

export interface SavedComparison {
  id: string;
  mode: 'products' | 'ingredients';
  ids: string[];
  label: string;
  savedAt: string;
}

export interface RoutineStep {
  id: string;
  text: string;
  productId?: string;
}

export interface Routine {
  id: string;
  name: string;
  time: 'morning' | 'evening' | 'weekly' | 'other';
  reminder?: string; // "HH:MM" — shown in-app only
  steps: RoutineStep[];
  createdAt: string;
}

export interface RecentItem {
  type: 'product' | 'ingredient' | 'article' | 'topic';
  id: string;
  label: string;
  href: string;
  at: string;
}

interface State {
  profile: Profile;
  personalise: boolean;
  saved: SavedItem[];
  comparisons: SavedComparison[];
  owned: string[];
  routines: Routine[];
  history: string[];
  recent: RecentItem[];
  compareTray: string[];
}

const DEFAULT: State = {
  profile: EMPTY_PROFILE,
  personalise: true,
  saved: [],
  comparisons: [],
  owned: [],
  routines: [],
  history: [],
  recent: [],
  compareTray: [],
};

function load(): State {
  try {
    const raw = localStorage.getItem(`${NS}state`);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed, profile: { ...EMPTY_PROFILE, ...(parsed.profile ?? {}) } };
  } catch {
    return DEFAULT;
  }
}

function persist(s: State) {
  try {
    localStorage.setItem(`${NS}state`, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode / quota) — app keeps working in memory */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);

interface Store extends State {
  /** Profile to apply to results — null when personalisation is off or empty. */
  activeProfile: Profile | null;
  setProfile: (p: Profile) => void;
  setPersonalise: (on: boolean) => void;
  clearProfile: () => void;
  isSaved: (type: SavedType, id: string) => boolean;
  toggleSaved: (type: SavedType, id: string, label?: string) => void;
  saveComparison: (c: Omit<SavedComparison, 'id' | 'savedAt'>) => void;
  removeComparison: (id: string) => void;
  toggleOwned: (productId: string) => void;
  upsertRoutine: (r: Routine) => void;
  removeRoutine: (id: string) => void;
  addHistory: (q: string) => void;
  removeHistory: (q: string) => void;
  clearHistory: () => void;
  addRecent: (r: Omit<RecentItem, 'at'>) => void;
  clearRecent: () => void;
  setCompareTray: (ids: string[]) => void;
  clearAll: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);
  useEffect(() => {
    persist(state);
  }, [state]);

  const update = useCallback((fn: (s: State) => State) => setState((s) => fn(s)), []);

  const store = useMemo<Store>(() => {
    const now = () => new Date().toISOString();
    return {
      ...state,
      activeProfile: state.personalise && hasPreferences(state.profile) ? state.profile : null,
      setProfile: (profile) => update((s) => ({ ...s, profile })),
      setPersonalise: (personalise) => update((s) => ({ ...s, personalise })),
      clearProfile: () => update((s) => ({ ...s, profile: EMPTY_PROFILE })),
      isSaved: (type, id) => state.saved.some((x) => x.type === type && x.id === id),
      toggleSaved: (type, id, label) =>
        update((s) => {
          const exists = s.saved.some((x) => x.type === type && x.id === id);
          return { ...s, saved: exists ? s.saved.filter((x) => !(x.type === type && x.id === id)) : [{ type, id, label, savedAt: now() }, ...s.saved] };
        }),
      saveComparison: (c) =>
        update((s) => {
          const key = `${c.mode}:${[...c.ids].sort().join(',')}`;
          if (s.comparisons.some((x) => `${x.mode}:${[...x.ids].sort().join(',')}` === key)) return s;
          return { ...s, comparisons: [{ ...c, id: uid(), savedAt: now() }, ...s.comparisons] };
        }),
      removeComparison: (id) => update((s) => ({ ...s, comparisons: s.comparisons.filter((c) => c.id !== id) })),
      toggleOwned: (pid) => update((s) => ({ ...s, owned: s.owned.includes(pid) ? s.owned.filter((x) => x !== pid) : [...s.owned, pid] })),
      upsertRoutine: (r) => update((s) => ({ ...s, routines: s.routines.some((x) => x.id === r.id) ? s.routines.map((x) => (x.id === r.id ? r : x)) : [...s.routines, r] })),
      removeRoutine: (id) => update((s) => ({ ...s, routines: s.routines.filter((r) => r.id !== id) })),
      addHistory: (q) =>
        update((s) => {
          const t = q.trim();
          if (!t) return s;
          return { ...s, history: [t, ...s.history.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, 12) };
        }),
      removeHistory: (q) => update((s) => ({ ...s, history: s.history.filter((h) => h !== q) })),
      clearHistory: () => update((s) => ({ ...s, history: [] })),
      addRecent: (r) => update((s) => ({ ...s, recent: [{ ...r, at: now() }, ...s.recent.filter((x) => !(x.type === r.type && x.id === r.id))].slice(0, 10) })),
      clearRecent: () => update((s) => ({ ...s, recent: [] })),
      setCompareTray: (ids) => update((s) => ({ ...s, compareTray: ids })),
      clearAll: () => {
        try {
          localStorage.removeItem(`${NS}state`);
        } catch {
          /* ignore */
        }
        setState(DEFAULT);
      },
    };
  }, [state, update]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
