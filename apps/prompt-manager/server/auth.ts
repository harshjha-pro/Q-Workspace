import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db, now, uuid, getSettings } from './db';
import { config } from './config';

// OWASP-recommended Argon2id parameters (64 MiB, 3 passes).
const ARGON = { algorithm: 2 /* Argon2id */, memoryCost: 65536, timeCost: 3, parallelism: 1 };
export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

const COMMON = new Set(['password', 'password1', 'password123', '123456789', '1234567890', 'qwertyuiop', 'iloveyou', 'admin12345', 'welcome123', 'letmein123', 'changeme123', 'ayush@123']);

export function passwordProblems(pw: string, username: string): string[] {
  const p: string[] = [];
  if (pw.length < 10) p.push('Use at least 10 characters.');
  if (pw.length > 256) p.push('Use at most 256 characters.');
  if (username && pw.toLowerCase().includes(username.toLowerCase())) p.push('Do not include your username.');
  if (COMMON.has(pw.toLowerCase())) p.push('This password is too common.');
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < 16 && classes < 3) p.push('Mix at least three of: lowercase, uppercase, numbers, symbols (or use 16+ characters).');
  return p;
}

export const SESSION_COOKIE = 'ppm_sid';
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const token = (n = 32) => crypto.randomBytes(n).toString('base64url');

export interface UserRow { id: string; username: string; password_hash: string; must_change_password: number; security_stamp: string; created_at: string; password_changed_at: string | null }
export interface SessionCtx { user: UserRow; sessionHash: string; csrf: string; localKey: string }

declare module 'fastify' {
  interface FastifyRequest { auth?: SessionCtx }
}

function isSecure(req: FastifyRequest) {
  if (config.cookieSecure === 'true') return true;
  if (config.cookieSecure === 'false') return false;
  return req.protocol === 'https';
}

function setSessionCookie(req: FastifyRequest, reply: FastifyReply, value: string, maxAgeSec: number) {
  reply.setCookie(SESSION_COOKIE, value, {
    path: config.basePath, httpOnly: true, sameSite: 'strict', secure: isSecure(req), maxAge: maxAgeSec,
  });
}

// ---------- Brute-force protection ----------
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_IP = 5;
const MAX_FAILS_USER = 8;

function lockState(k: string) {
  return db.prepare(`SELECT * FROM login_attempts WHERE k=?`).get(k) as { k: string; failures: number; first_at: number; locked_until: number; lockouts: number } | undefined;
}
function lockedFor(keys: string[]) {
  const t = Date.now();
  let until = 0;
  for (const k of keys) { const s = lockState(k); if (s && s.locked_until > t) until = Math.max(until, s.locked_until); }
  return until;
}
function recordFailure(k: string, limit: number) {
  const t = Date.now();
  const s = lockState(k);
  if (!s || t - s.first_at > WINDOW_MS) {
    db.prepare(`INSERT INTO login_attempts (k, failures, first_at, locked_until, lockouts) VALUES (?, 1, ?, 0, COALESCE((SELECT lockouts FROM login_attempts WHERE k=?), 0))
      ON CONFLICT(k) DO UPDATE SET failures=1, first_at=excluded.first_at, locked_until=0`).run(k, t, k);
    return;
  }
  const failures = s.failures + 1;
  if (failures >= limit) {
    // Exponential lockout: 1, 2, 4 ... capped at 60 minutes.
    const mins = Math.min(60, 2 ** s.lockouts);
    db.prepare(`UPDATE login_attempts SET failures=0, first_at=?, locked_until=?, lockouts=lockouts+1 WHERE k=?`).run(t, t + mins * 60_000, k);
  } else db.prepare(`UPDATE login_attempts SET failures=? WHERE k=?`).run(failures, k);
}
const clearFailures = (k: string) => db.prepare(`DELETE FROM login_attempts WHERE k=?`).run(k);

// A fixed dummy hash so unknown usernames take the same time as real ones.
let dummyHash: string | null = null;
const getDummy = async () => (dummyHash ??= await hashPassword(token()));

// ---------- Sessions ----------
function uaHash(req: FastifyRequest) { return sha(String(req.headers['user-agent'] || '')); }

function createSession(req: FastifyRequest, reply: FastifyReply, user: UserRow) {
  const s = getSettings();
  const raw = token(32);
  const csrf = token(24);
  const localKey = token(32);
  const t = now();
  const expires = new Date(Date.now() + s.session_max_days * 86400_000).toISOString();
  db.prepare(`INSERT INTO sessions (id_hash, user_id, created_at, last_seen, expires_at, ua_hash, ip, local_key, csrf, security_stamp) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(sha(raw), user.id, t, t, expires, uaHash(req), req.ip, localKey, csrf, user.security_stamp);
  setSessionCookie(req, reply, raw, s.session_max_days * 86400);
  return { csrf, localKey };
}

export function revokeSession(hash: string) { db.prepare(`DELETE FROM sessions WHERE id_hash=?`).run(hash); }

function loadSession(req: FastifyRequest): SessionCtx | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || raw.length > 128) return null;
  const h = sha(raw);
  const row = db.prepare(`SELECT * FROM sessions WHERE id_hash=?`).get(h) as
    | { id_hash: string; user_id: string; last_seen: string; expires_at: string; ua_hash: string; local_key: string; csrf: string; security_stamp: string } | undefined;
  if (!row) return null;
  const s = getSettings();
  const t = Date.now();
  const idleMs = s.session_idle_minutes * 60_000;
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(row.user_id) as UserRow | undefined;
  if (!user || new Date(row.expires_at).getTime() < t || t - new Date(row.last_seen).getTime() > idleMs ||
      row.ua_hash !== uaHash(req) || row.security_stamp !== user.security_stamp) {
    revokeSession(h);
    return null;
  }
  // Sliding idle window; write at most once a minute.
  if (t - new Date(row.last_seen).getTime() > 60_000) db.prepare(`UPDATE sessions SET last_seen=? WHERE id_hash=?`).run(now(), h);
  return { user, sessionHash: h, csrf: row.csrf, localKey: row.local_key };
}

export function purgeExpiredSessions() {
  const s = getSettings();
  const idleCut = new Date(Date.now() - s.session_idle_minutes * 60_000).toISOString();
  db.prepare(`DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?`).run(now(), idleCut);
  db.prepare(`DELETE FROM login_attempts WHERE locked_until < ? AND first_at < ?`).run(Date.now(), Date.now() - 24 * 3600_000);
}

const PUBLIC = new Set(['/api/auth/login', '/api/auth/session', '/api/health']);
const ALLOWED_WHEN_MUST_CHANGE = new Set(['/api/auth/change-password', '/api/auth/logout', '/api/auth/session']);

export async function authPlugin(app: FastifyInstance) {
  // Authenticate every API request; enforce CSRF on state-changing methods.
  app.addHook('preHandler', async (req, reply) => {
    const route = req.routeOptions.url || '';
    const p = route.startsWith(config.basePath) ? '/' + route.slice(config.basePath.length) : route;
    if (!p.startsWith('/api/')) return;
    const ctx = loadSession(req);
    if (ctx) req.auth = ctx;
    if (PUBLIC.has(p)) return;
    if (!ctx) return reply.code(401).send({ error: 'Your session has ended. Please sign in again.', code: 'unauthenticated' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const h = req.headers['x-ppm-csrf'];
      if (typeof h !== 'string' || h.length !== ctx.csrf.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(ctx.csrf))) {
        return reply.code(403).send({ error: 'Security check failed. Reload the page and try again.', code: 'csrf' });
      }
    }
    if (ctx.user.must_change_password && !ALLOWED_WHEN_MUST_CHANGE.has(p)) {
      return reply.code(403).send({ error: 'You must change your password first.', code: 'must_change_password' });
    }
  });

  const sessionPayload = (ctx: { user: UserRow; csrf: string; localKey: string }) => {
    const s = getSettings();
    return {
      authenticated: true,
      user: { id: ctx.user.id, username: ctx.user.username, passwordChangedAt: ctx.user.password_changed_at },
      mustChangePassword: !!ctx.user.must_change_password,
      csrf: ctx.csrf,
      localKey: ctx.localKey,
      idleMinutes: s.session_idle_minutes,
      storageMode: s.storage_mode,
    };
  };

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/auth/session', async (req) => {
    if (!req.auth) return { authenticated: false };
    return sessionPayload(req.auth);
  });

  app.post('/api/auth/login', {
    schema: { body: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 256 } } } },
  }, async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };
    const uname = username.trim().toLowerCase();
    const keys = [`ip:${req.ip}`, `user:${uname}`];
    const until = lockedFor(keys);
    if (until) {
      const mins = Math.ceil((until - Date.now()) / 60_000);
      return reply.code(429).send({ error: `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, code: 'locked' });
    }
    const user = db.prepare(`SELECT * FROM users WHERE username=?`).get(uname) as UserRow | undefined;
    const ok = user ? await verifyPassword(user.password_hash, password) : (await verifyPassword(await getDummy(), password), false);
    if (!user || !ok) {
      recordFailure(keys[0], MAX_FAILS_IP);
      recordFailure(keys[1], MAX_FAILS_USER);
      return reply.code(401).send({ error: 'Incorrect username or password.', code: 'invalid' });
    }
    keys.forEach(clearFailures);
    // Rotate: drop any session presented with this request (prevents fixation).
    if (req.auth) revokeSession(req.auth.sessionHash);
    const { csrf, localKey } = createSession(req, reply, user);
    return sessionPayload({ user, csrf, localKey });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) revokeSession(req.auth.sessionHash);
    reply.clearCookie(SESSION_COOKIE, { path: config.basePath });
    return { ok: true };
  });

  app.post('/api/auth/change-password', {
    schema: { body: { type: 'object', required: ['current', 'next'], properties: { current: { type: 'string', maxLength: 256 }, next: { type: 'string', maxLength: 256 } } } },
  }, async (req, reply) => {
    const ctx = req.auth!;
    const { current, next } = req.body as { current: string; next: string };
    if (!(await verifyPassword(ctx.user.password_hash, current))) {
      recordFailure(`user:${ctx.user.username}`, MAX_FAILS_USER);
      return reply.code(400).send({ error: 'Your current password is incorrect.', code: 'invalid_current' });
    }
    const problems = passwordProblems(next, ctx.user.username);
    if (current === next) problems.push('Choose a password different from the current one.');
    if (problems.length) return reply.code(400).send({ error: problems[0], problems, code: 'weak' });
    const stamp = uuid();
    db.prepare(`UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=?, security_stamp=? WHERE id=?`)
      .run(await hashPassword(next), now(), stamp, ctx.user.id);
    // Invalidate every session (including this one), then issue a fresh one.
    db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(ctx.user.id);
    const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(ctx.user.id) as UserRow;
    const { csrf, localKey } = createSession(req, reply, user);
    return sessionPayload({ user, csrf, localKey });
  });

  app.get('/api/auth/sessions', async (req) => {
    const rows = db.prepare(`SELECT id_hash, created_at, last_seen, ip FROM sessions WHERE user_id=? ORDER BY last_seen DESC`).all(req.auth!.user.id) as { id_hash: string; created_at: string; last_seen: string; ip: string }[];
    return rows.map((r) => ({ id: r.id_hash.slice(0, 12), createdAt: r.created_at, lastSeen: r.last_seen, ip: r.ip, current: r.id_hash === req.auth!.sessionHash }));
  });

  app.post('/api/auth/sessions/revoke-others', async (req) => {
    const r = db.prepare(`DELETE FROM sessions WHERE user_id=? AND id_hash<>?`).run(req.auth!.user.id, req.auth!.sessionHash);
    return { revoked: r.changes };
  });
}
