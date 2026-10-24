import type { ID, Preferences, Role } from '@/types/models';
import { safeStorage } from '@/utils/storage';
import { DEMO_USER_ID } from '@/data/seed';

/**
 * DEMO session. This is NOT authentication: anyone can switch roles in the browser.
 * In production, identity and role come from the auth provider (e.g. Supabase Auth) and
 * every privileged action is authorised on the server.
 */
export interface Session {
  userId: ID | null;
  role: Role;
  prefs: Preferences;
  demoBannerDismissed: boolean;
}

const KEY = 'one-bhilwara:session:v1';

export const defaultPrefs = (): Preferences => ({
  lang: 'en',
  localityId: 'shastri-nagar',
  localities: ['shastri-nagar'],
  interests: ['News', 'Jobs', 'Services', 'Events'],
  newsCategories: [],
  jobCategories: [],
  homeSections: ['alerts', 'news', 'community', 'services', 'jobs', 'property', 'marketplace', 'events', 'mandi', 'government', 'businesses', 'offers', 'recommended'],
  notifyCategories: ['alert', 'job', 'service', 'comment', 'event', 'news', 'property', 'poll', 'booking', 'business', 'job_match', 'campaign', 'account'],
  pushAsked: false
});

const initial = (): Session => ({ userId: DEMO_USER_ID, role: 'resident', prefs: defaultPrefs(), demoBannerDismissed: false });

function load(): Session {
  try {
    const raw = safeStorage.get(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Session;
      return { ...initial(), ...s, prefs: { ...defaultPrefs(), ...s.prefs } };
    }
  } catch {
    /* ignore */
  }
  return initial();
}

let session = load();
const listeners = new Set<() => void>();

export const sessionStore = {
  get: () => session,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(patch: Partial<Session>) {
    session = { ...session, ...patch };
    safeStorage.set(KEY, JSON.stringify(session));
    document.documentElement.lang = session.prefs.lang === 'hi' ? 'hi' : 'en';
    listeners.forEach((l) => l());
  },
  setPrefs(patch: Partial<Preferences>) {
    sessionStore.set({ prefs: { ...session.prefs, ...patch } });
  },
  reset() {
    session = initial();
    safeStorage.remove(KEY);
    listeners.forEach((l) => l());
  }
};
