import type { ID, ModerationCase, NotificationItem } from '@/types/models';
import { repo, store } from '@/services/store';
import { sessionStore } from '@/services/session';
import { nowIso, uid } from '@/utils/ids';

export const currentUserId = () => sessionStore.get().userId;
export const currentUser = () => {
  const id = currentUserId();
  return id ? repo.get('users', id) : undefined;
};

/** In-app notification (push delivery would be server-side). */
export function notify(userId: ID | 'all', type: string, title: string, body: string, link: string) {
  const n: NotificationItem = { id: uid('nt'), userId, type, title, body, link, read: false, createdAt: nowIso(), demo: true };
  repo.insert('notifications', n);
}

export function audit(action: string, target: string, details?: string) {
  const u = currentUser();
  store.update((s) => ({ audit: [{ id: uid('au'), at: nowIso(), actorId: u?.id ?? 'anonymous', actorName: u?.name ?? 'Anonymous', action, target, details }, ...s.audit] }));
}

/** Points are engagement credits only — not money, not redeemable for cash. */
export function awardPoints(action: string, note: string) {
  const userId = currentUserId();
  if (!userId) return 0;
  const pts = store.getState().settings.pointsRules[action] ?? 0;
  if (pts <= 0) return 0;
  store.update((s) => ({ points: [{ id: uid('pt'), userId, action, points: pts, at: nowIso(), note }, ...s.points] }));
  return pts;
}

export const pointsTotal = (userId: ID | null) =>
  userId ? store.getState().points.filter((p) => p.userId === userId).reduce((a, p) => a + p.points, 0) : 0;

export function isSaved(type: string, id: ID) {
  const userId = currentUserId();
  return !!userId && store.getState().saved.some((s) => s.userId === userId && s.type === type && s.id === id);
}

export function toggleSave(type: string, id: ID): boolean {
  const userId = currentUserId();
  if (!userId) return false;
  const saved = isSaved(type, id);
  store.update((s) => ({
    saved: saved ? s.saved.filter((x) => !(x.userId === userId && x.type === type && x.id === id)) : [{ userId, type, id, at: nowIso() }, ...s.saved]
  }));
  return !saved;
}

export function fileReport(kind: ModerationCase['kind'], targetType: string, targetId: ID, targetTitle: string, reason: string, details: string) {
  const c: ModerationCase = { id: uid('cs'), kind, targetType, targetId, targetTitle, reason, details: sanitize(details, 1000), reporterId: currentUserId() ?? 'anonymous', status: 'open', createdAt: nowIso(), demo: true };
  repo.insert('cases', c);
  return c;
}

export function addRecentSearch(q: string) {
  const v = q.trim();
  if (!v) return;
  store.update((s) => ({ searches: [v, ...s.searches.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8) }));
}

/** Basic text hygiene for user input. React escapes output; this trims, strips control chars and caps length. */
export function sanitize(text: string, max = 2000) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/**
 * DEMO: account ids the current user "acts as" for dashboards. Switching to a business role
 * also links the seeded sample account for that role so dashboards have data to manage.
 * Production ownership comes from the server (e.g. business_members table + RLS).
 */
const DEMO_ROLE_ACCOUNTS: Record<string, string> = { business: 'u-3', employer: 'u-6', owner: 'u-8', provider: 'u-5' };
export function actorIds(userId: ID | null, role: string): ID[] {
  if (!userId) return [];
  const linked = DEMO_ROLE_ACCOUNTS[role];
  return linked ? [userId, linked] : role === 'admin' ? [userId, ...Object.values(DEMO_ROLE_ACCOUNTS)] : [userId];
}
