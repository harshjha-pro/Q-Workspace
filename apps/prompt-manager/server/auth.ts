import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { q, now, uuid, getSettings } from './db';
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
  reply.setCookie(SESSION_COOKIE, value, { path: config.basePath, httpOnly: true, sameSite: 'strict', secure: isSecure(req), maxAge: maxAgeSec });
}

// ---------- Brute-force protection ----------
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_IP = 5;
const MAX_FAILS_USER = 8;
interface Lock { k: string; failures: number; first_at: number; locked_until: number; lockouts: number }

const lockState = async (k: string) => {
  const r = await q.get<Lock>(`SELECT * FROM login_attempts WHERE k=?`, k);
  return r ? { ...r, failures: Number(r.failures), first_at: Number(r.first_at), locked_until: Number(r.locked_until), lockouts: Number(r.lockouts) } : undefined;
};
async function lockedFor(keys: string[]) {
  const t = Date.now();
  let until = 0;
  for (const k of keys) { const s = await lockState(k); if (s && s.locked_until > t) until = Math.max(until, s.locked_until); }
  return until;
}
async function recordFailure(k: string, limit: number) {
  const t = Date.now();
  const s = await lockState(k);
  if (!s) { await q.run(`INSERT INTO login_attempts (k, failures, first_at, locked_until, lockouts) VALUES (?, 1, ?, 0, 0)`, k, t); return; }
  if (t - s.first_at > WINDOW_MS) { await q.run(`UPDATE login_attempts SET failures=1, first_at=?, locked_until=0 WHERE k=?`, t, k); return; }
  const failures = s.failures + 1;
  if (failures >= limit) {
    // Exponential lockout: 1, 2, 4 ... capped at 60 minutes.
    const mins = Math.min(60, 2 ** s.lockouts);
    await q.run(`UPDATE login_attempts SET failures=0, first_at=?, locked_until=?, lockouts=lockouts+1 WHERE k=?`, t, t + mins * 60_000, k);
  } else await q.run(`UPDATE login_attempts SET failures=? WHERE k=?`, failures, k);
}
const clearFailures = (k: string) => q.run(`DELETE FROM login_attempts WHERE k=?`, k);

// A fixed dummy hash so unknown usernames take the same time as real ones.
let dummyHash: string | null = null;
const getDummy = async () => (dummyHash ??= await hashPassword(token()));

// ---------- Sessions ----------
const uaHash = (req: FastifyRequest) => sha(String(req.headers['user-agent'] || ''));

async function createSession(req: FastifyRequest, reply: FastifyReply, user: UserRow) {
  const s = await getSettings();
  const raw = token(32); const csrf = token(24); const localKey = token(32);
  const t = now();
  const expires = new Date(Date.now() + s.session_max_days * 86400_000).toISOString();
  await q.run(`INSERT INTO sessions (id_hash, user_id, created_at, last_seen, expires_at, ua_hash, ip, local_key, csrf, security_stamp) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    sha(raw), user.id, t, t, expires, uaHash(req), req.ip, localKey, csrf, user.security_stamp);
  setSessionCookie(req, reply, raw, s.session_max_days * 86400);
  return { csrf, localKey };
}

export const revokeSession = (h: string) => q.run(`DELETE FROM sessions WHERE id_hash=?`, h);

async function loadSession(req: FastifyRequest): Promise<SessionCtx | null> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw || raw.length > 128) return null;
  const h = sha(raw);
  const row = await q.get<{ id_hash: string; user_id: string; last_seen: string; expires_at: string; ua_hash: string; local_key: string; csrf: string; security_stamp: string }>(`SELECT * FROM sessions WHERE id_hash=?`, h);
  if (!row) return null;
  const s = await getSettings();
  const t = Date.now();
  const user = await q.get<UserRow>(`SELECT * FROM users WHERE id=?`, row.user_id);
  if (!user || new Date(row.expires_at).getTime() < t || t - new Date(row.last_seen).getTime() > s.session_idle_minutes * 60_000 ||
      row.ua_hash !== uaHash(req) || row.security_stamp !== user.security_stamp) {
    await revokeSession(h);
    return null;
  }
  // Sliding idle window; write at most once a minute.
  if (t - new Date(row.last_seen).getTime() > 60_000) await q.run(`UPDATE sessions SET last_seen=? WHERE id_hash=?`, now(), h);
  return { user: { ...user, must_change_password: Number(user.must_change_password) }, sessionHash: h, csrf: row.csrf, localKey: row.local_key };
}

export async function purgeExpiredSessions() {
  const s = await getSettings();
  const idleCut = new Date(Date.now() - s.session_idle_minutes * 60_000).toISOString();
  await q.run(`DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?`, now(), idleCut);
  await q.run(`DELETE FROM login_attempts WHERE locked_until < ? AND first_at < ?`, Date.now(), Date.now() - 24 * 3600_000);
}

export const userCount = async () => Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM users`))?.n ?? 0);

const PUBLIC = new Set(['/api/auth/login', '/api/auth/session', '/api/health', '/api/setup', '/api/cron']);
const ALLOWED_WHEN_MUST_CHANGE = new Set(['/api/auth/change-password', '/api/auth/logout', '/api/auth/session']);

export async function authPlugin(app: FastifyInstance) {
  // Authenticate every API request; enforce CSRF on state-changing methods.
  app.addHook('preHandler', async (req, reply) => {
    const route = req.routeOptions.url || '';
    const p = route.startsWith(config.basePath) ? '/' + route.slice(config.basePath.length) : route;
    if (!p.startsWith('/api/')) return;
    const ctx = await loadSession(req);
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

  const capabilities = () => ({ serverless: config.serverless, transferChunk: config.transferChunk, database: config.databaseUrl ? 'mysql' : 'sqlite' });
  const sessionPayload = async (ctx: { user: UserRow; csrf: string; localKey: string }) => {
    const s = await getSettings();
    return {
      authenticated: true,
      user: { id: ctx.user.id, username: ctx.user.username, passwordChangedAt: ctx.user.password_changed_at },
      mustChangePassword: !!Number(ctx.user.must_change_password),
      csrf: ctx.csrf, localKey: ctx.localKey, idleMinutes: s.session_idle_minutes, storageMode: s.storage_mode, capabilities: capabilities(),
    };
  };

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/auth/session', async (req) => {
    if (!req.auth) {
      const setupRequired = (await userCount()) === 0;
      return { authenticated: false, setupRequired, setupAvailable: setupRequired && !!config.setupToken, capabilities: capabilities() };
    }
    return sessionPayload(req.auth);
  });

  /**
   * One-time owner setup for deployments without a server terminal (e.g. Vercel).
   * Only works while no account exists and requires the PPM_SETUP_TOKEN environment secret.
   */
  app.post('/api/setup', {
    schema: { body: { type: 'object', required: ['token', 'username', 'password'], properties: { token: { type: 'string', maxLength: 256 }, username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 256 } } } },
  }, async (req, reply) => {
    const { token: t, username, password } = req.body as { token: string; username: string; password: string };
    const key = `setup:${req.ip}`;
    if (await lockedFor([key])) return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
    if (!config.setupToken || (await userCount()) > 0) return reply.code(404).send({ error: 'Setup is not available.' });
    const a = Buffer.from(sha(t)); const b = Buffer.from(sha(config.setupToken));
    if (!crypto.timingSafeEqual(a, b)) { await recordFailure(key, MAX_FAILS_IP); return reply.code(401).send({ error: 'The setup token is incorrect.' }); }
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,64}$/.test(uname)) return reply.code(400).send({ error: 'Username may contain a–z, 0–9, dot, dash and underscore (3–64 characters).' });
    const problems = passwordProblems(password, uname);
    if (problems.length) return reply.code(400).send({ error: problems[0], problems });
    const user: UserRow = { id: uuid(), username: uname, password_hash: await hashPassword(password), must_change_password: 0, created_at: now(), password_changed_at: now(), security_stamp: uuid() };
    const created = await q.tx(async () => {
      if ((await userCount()) > 0) return false; // lost a race: someone else completed setup
      await q.run(`INSERT INTO users (id, username, password_hash, must_change_password, created_at, password_changed_at, security_stamp) VALUES (?,?,?,?,?,?,?)`,
        user.id, user.username, user.password_hash, 0, user.created_at, user.password_changed_at, user.security_stamp);
      return true;
    });
    if (!created) return reply.code(409).send({ error: 'Setup was already completed.' });
    await clearFailures(key);
    const { csrf, localKey } = await createSession(req, reply, user);
    return sessionPayload({ user, csrf, localKey });
  });

  app.post('/api/auth/login', {
    schema: { body: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 256 } } } },
  }, async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };
    const uname = username.trim().toLowerCase();
    const keys = [`ip:${req.ip}`, `user:${uname}`];
    const until = await lockedFor(keys);
    if (until) {
      const mins = Math.ceil((until - Date.now()) / 60_000);
      return reply.code(429).send({ error: `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, code: 'locked' });
    }
    const user = await q.get<UserRow>(`SELECT * FROM users WHERE username=?`, uname);
    const ok = user ? await verifyPassword(user.password_hash, password) : (await verifyPassword(await getDummy(), password), false);
    if (!user || !ok) {
      await recordFailure(keys[0], MAX_FAILS_IP);
      await recordFailure(keys[1], MAX_FAILS_USER);
      return reply.code(401).send({ error: 'Incorrect username or password.', code: 'invalid' });
    }
    for (const k of keys) await clearFailures(k);
    if (req.auth) await revokeSession(req.auth.sessionHash); // rotate: prevents session fixation
    const { csrf, localKey } = await createSession(req, reply, user);
    return sessionPayload({ user, csrf, localKey });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) await revokeSession(req.auth.sessionHash);
    reply.clearCookie(SESSION_COOKIE, { path: config.basePath });
    return { ok: true };
  });

  app.post('/api/auth/change-password', {
    schema: { body: { type: 'object', required: ['current', 'next'], properties: { current: { type: 'string', maxLength: 256 }, next: { type: 'string', maxLength: 256 } } } },
  }, async (req, reply) => {
    const ctx = req.auth!;
    const { current, next } = req.body as { current: string; next: string };
    if (!(await verifyPassword(ctx.user.password_hash, current))) {
      await recordFailure(`user:${ctx.user.username}`, MAX_FAILS_USER);
      return reply.code(400).send({ error: 'Your current password is incorrect.', code: 'invalid_current' });
    }
    const problems = passwordProblems(next, ctx.user.username);
    if (current === next) problems.push('Choose a password different from the current one.');
    if (problems.length) return reply.code(400).send({ error: problems[0], problems, code: 'weak' });
    await q.run(`UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=?, security_stamp=? WHERE id=?`, await hashPassword(next), now(), uuid(), ctx.user.id);
    // Invalidate every session (including this one), then issue a fresh one.
    await q.run(`DELETE FROM sessions WHERE user_id=?`, ctx.user.id);
    const user = (await q.get<UserRow>(`SELECT * FROM users WHERE id=?`, ctx.user.id))!;
    const { csrf, localKey } = await createSession(req, reply, user);
    return sessionPayload({ user, csrf, localKey });
  });

  app.get('/api/auth/sessions', async (req) => {
    const rows = await q.all<{ id_hash: string; created_at: string; last_seen: string; ip: string }>(`SELECT id_hash, created_at, last_seen, ip FROM sessions WHERE user_id=? ORDER BY last_seen DESC`, req.auth!.user.id);
    return rows.map((r) => ({ id: r.id_hash.slice(0, 12), createdAt: r.created_at, lastSeen: r.last_seen, ip: r.ip, current: r.id_hash === req.auth!.sessionHash }));
  });

  app.post('/api/auth/sessions/revoke-others', async (req) => {
    const r = await q.run(`DELETE FROM sessions WHERE user_id=? AND id_hash<>?`, req.auth!.user.id, req.auth!.sessionHash);
    return { revoked: r.changes };
  });
}
