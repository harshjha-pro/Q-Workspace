import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { DBState } from '@/types/models';
import { store } from '@/services/store';
import { sessionStore } from '@/services/session';
import { dictionaries, type TKey } from '@/i18n/dictionary';
import { ROLES } from '@/config/catalog';

/** Subscribe to the demo database. The selector runs during render (outside getSnapshot), so derived arrays can't cause update loops. */
export function useDB<T>(selector: (s: DBState) => T): T {
  const s = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return selector(s);
}

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
}

export function useCurrentUser() {
  const { userId } = useSession();
  return useDB((s) => (userId ? s.users.find((u) => u.id === userId) : undefined));
}

export function useRole() {
  const { role } = useSession();
  return { role, label: ROLES.find((r) => r.id === role)?.label ?? role };
}

export function useT() {
  const { prefs } = useSession();
  const dict = dictionaries[prefs.lang];
  return useCallback((k: TKey) => dict[k] ?? dictionaries.en[k], [dict]);
}

export function useLang() {
  return useSession().prefs.lang;
}

/** Simulated network latency so loading skeletons are exercised; real adapters replace this. */
export function useLoading(ms = 350) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Re-renders every `ms` so countdowns and reveal times update. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · One Bhilwara` : 'One Bhilwara — One City. Everything Connected.';
  }, [title]);
}
