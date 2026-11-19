import { useSyncExternalStore } from 'react';
import { api, ApiError, isNetworkError, setCsrf, onAuthEvent, hasCsrf } from './api';
import { metaGet, metaSet, metaDel, wipeLocalData, clearReplica, idb } from './idb';
import { generateDek, wrapWithPassword, unwrapWithPassword, wrapWithSession, unwrapWithSession, type Wrapped } from './crypto';
import { store } from './store';
import { restorePendingUploads } from './files';

export type Phase = 'boot' | 'login' | 'change_password' | 'unlock' | 'ready';
interface SessionState {
  phase: Phase;
  username: string;
  idleMinutes: number;
  offline: boolean;
  /** Unlock needs the previous password (changed on another device, unsynced changes on this one). */
  needOldPassword: boolean;
  reauth: boolean;
  message: string | null;
  storageMode: string;
}
interface ServerSession { authenticated: boolean; user?: { username: string }; mustChangePassword?: boolean; csrf?: string; localKey?: string; idleMinutes?: number; storageMode?: string }

let state: SessionState = { phase: 'boot', username: '', idleMinutes: 30, offline: false, needOldPassword: false, reauth: false, message: null, storageMode: 'local' };
const subs = new Set<() => void>();
const set = (p: Partial<SessionState>) => { state = { ...state, ...p }; subs.forEach((s) => s()); };
export const useSession = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => state);
export const getSession = () => state;

let dek: CryptoKey | null = null;
let pendingPassword: string | null = null; // only held between login and forced password change

function applyServer(s: ServerSession) {
  if (s.csrf) setCsrf(s.csrf);
  set({ username: s.user?.username ?? state.username, idleMinutes: s.idleMinutes ?? state.idleMinutes, storageMode: s.storageMode ?? state.storageMode });
  if (s.user?.username) void metaSet('username', s.user.username);
  if (s.idleMinutes) void metaSet('idleMinutes', s.idleMinutes);
}

async function openWith(key: CryptoKey) {
  dek = key;
  await store.load(key);
  await restorePendingUploads();
  set({ phase: 'ready', needOldPassword: false, message: null, reauth: false });
  startIdleWatch();
  store.markAuthOk();
  void store.sync();
}

/** After a successful server sign-in: unlock (or create) the local encrypted workspace. */
async function openWorkspace(password: string, localKey: string) {
  const wrapPw = await metaGet<Wrapped>('wrap_pw');
  let key: CryptoKey | null = null;
  if (wrapPw) {
    try { key = await unwrapWithPassword(wrapPw, password); }
    catch {
      // Password was changed on another device. Unsynced local changes need the old password.
      const pending = (await metaGet<number>('pendingCount')) ?? 0;
      if (pending > 0) { set({ phase: 'unlock', needOldPassword: true, message: null }); pendingPassword = password; return; }
      await clearReplica();
      const db = await idb(); await db.clear('outbox'); await db.clear('uploads');
    }
  }
  if (!key) { key = await generateDek(); await clearReplica(); }
  await metaSet('wrap_pw', await wrapWithPassword(key, password));
  await metaSet('wrap_session', await wrapWithSession(key, localKey));
  await openWith(key);
}

export async function boot() {
  const username = (await metaGet<string>('username')) ?? '';
  const idle = (await metaGet<number>('idleMinutes')) ?? 30;
  set({ username, idleMinutes: idle });
  const hasLocal = !!(await metaGet('wrap_pw'));
  let s: ServerSession;
  try { s = await api<ServerSession>('/api/auth/session'); }
  catch (e) {
    if (isNetworkError(e) || (e instanceof ApiError && e.status >= 500)) { set({ phase: hasLocal ? 'unlock' : 'login', offline: true, message: hasLocal ? null : 'You are offline. Connect once to sign in on this device.' }); return; }
    set({ phase: 'login', message: (e as Error).message }); return;
  }
  set({ offline: false });
  if (!s.authenticated) { set({ phase: 'login' }); return; }
  applyServer(s);
  if (s.mustChangePassword) { set({ phase: 'change_password' }); return; }
  const wrapS = await metaGet<Wrapped>('wrap_session');
  if (wrapS && s.localKey) {
    try { await openWith(await unwrapWithSession(wrapS, s.localKey)); return; } catch { /* session changed */ }
  }
  set({ phase: 'unlock' });
}

export async function login(username: string, password: string) {
  const s = await api<ServerSession>('/api/auth/login', { body: { username, password } });
  applyServer(s);
  set({ offline: false });
  if (s.mustChangePassword) { pendingPassword = password; set({ phase: 'change_password' }); return; }
  await openWorkspace(password, s.localKey!);
}

export async function changePassword(current: string, next: string) {
  const s = await api<ServerSession>('/api/auth/change-password', { body: { current, next } });
  applyServer(s);
  let key = dek;
  if (!key) {
    const w = await metaGet<Wrapped>('wrap_pw');
    if (w) { try { key = await unwrapWithPassword(w, current); } catch { key = null; } }
  }
  if (!key) { key = await generateDek(); await clearReplica(); }
  await metaSet('wrap_pw', await wrapWithPassword(key, next));
  await metaSet('wrap_session', await wrapWithSession(key, s.localKey!));
  pendingPassword = null;
  if (state.phase === 'ready' && dek) return;
  await openWith(key);
}
export const getPendingPassword = () => pendingPassword;

let failedUnlocks = 0;
export async function unlock(password: string) {
  if (failedUnlocks >= 3) await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** (failedUnlocks - 3))));
  if (state.needOldPassword) {
    const w = await metaGet<Wrapped>('wrap_pw');
    let key: CryptoKey;
    try { key = await unwrapWithPassword(w!, password); } catch { failedUnlocks++; throw new Error('That is not your previous password.'); }
    const s = await api<ServerSession>('/api/auth/session');
    await metaSet('wrap_pw', await wrapWithPassword(key, pendingPassword!));
    await metaSet('wrap_session', await wrapWithSession(key, s.localKey!));
    pendingPassword = null; failedUnlocks = 0;
    await openWith(key);
    return;
  }
  // Prefer a real server sign-in; fall back to offline unlock with the local key.
  try {
    await login(state.username, password);
    failedUnlocks = 0;
    return;
  } catch (e) {
    if (!isNetworkError(e)) { failedUnlocks++; throw e; }
  }
  const w = await metaGet<Wrapped>('wrap_pw');
  if (!w) throw new Error('You are offline. Connect to sign in.');
  try {
    const key = await unwrapWithPassword(w, password);
    failedUnlocks = 0;
    set({ offline: true });
    await openWith(key);
    if (navigator.onLine) void refreshSession();
  } catch {
    failedUnlocks++;
    throw new Error('Incorrect password.');
  }
}

export async function discardLocalChangesAndContinue() {
  const db = await idb();
  await db.clear('outbox'); await db.clear('uploads');
  await metaSet('pendingCount', 0);
  await metaDel('wrap_pw');
  const pw = pendingPassword!;
  const s = await api<ServerSession>('/api/auth/session');
  set({ needOldPassword: false });
  await openWorkspace(pw, s.localKey!);
}

export async function reauthenticate(password: string) {
  const s = await api<ServerSession>('/api/auth/login', { body: { username: state.username, password } });
  applyServer(s);
  if (dek) await metaSet('wrap_session', await wrapWithSession(dek, s.localKey!));
  set({ reauth: false, offline: false });
  store.markAuthOk();
}

export async function lock(reason = 'Locked after a period of inactivity.') {
  if (state.phase !== 'ready') return;
  await store.persist().catch(() => {});
  store.unload();
  dek = null;
  await metaDel('wrap_session');
  stopIdleWatch();
  set({ phase: 'unlock', message: reason });
}

export async function logout(wipe: boolean) {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* offline: local sign-out still happens */ }
  await store.persist().catch(() => {});
  store.unload();
  dek = null;
  stopIdleWatch();
  if (wipe) await wipeLocalData(); else await metaDel('wrap_session');
  setCsrf('');
  set({ phase: 'login', message: wipe ? 'Signed out and removed offline data from this device.' : 'You have been signed out.' });
}

export function setIdleMinutes(m: number) { set({ idleMinutes: m }); void metaSet('idleMinutes', m); }

// ---------- Idle lock ----------
let last = Date.now();
let idleTimer: ReturnType<typeof setInterval> | null = null;
const bump = () => { last = Date.now(); };
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
function checkIdle() { if (state.phase === 'ready' && Date.now() - last > state.idleMinutes * 60_000) void lock(); }
function startIdleWatch() {
  stopIdleWatch();
  last = Date.now();
  EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', checkIdle);
  idleTimer = setInterval(checkIdle, 20_000);
}
function stopIdleWatch() {
  EVENTS.forEach((e) => window.removeEventListener(e, bump, { capture: true } as any));
  document.removeEventListener('visibilitychange', checkIdle);
  if (idleTimer) clearInterval(idleTimer);
}

/** Re-validate the server session after an offline period (fetches a fresh CSRF token). */
let refreshing: Promise<void> | null = null;
export function refreshSession() {
  refreshing ??= (async () => {
    try {
      const s = await api<ServerSession>('/api/auth/session');
      if (!s.authenticated) { if (state.phase === 'ready') set({ reauth: true }); return; }
      applyServer(s);
      if (dek && s.localKey) await metaSet('wrap_session', await wrapWithSession(dek, s.localKey));
      set({ offline: false });
      store.markAuthOk();
      void store.sync();
    } catch { /* still offline */ } finally { refreshing = null; }
  })();
  return refreshing;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (state.phase === 'ready' && (state.offline || !hasCsrf())) void refreshSession(); });

onAuthEvent((e) => {
  if (e.type === 'csrf' && state.phase === 'ready') void refreshSession();
  if (e.type === 'unauthenticated' && state.phase === 'ready') set({ reauth: true });
  if (e.type === 'must_change_password') set({ phase: 'change_password' });
});
