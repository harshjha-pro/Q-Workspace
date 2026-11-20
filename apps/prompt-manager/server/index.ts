import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { q, getSettings, migrate } from './db';
import { authPlugin, purgeExpiredSessions, userCount } from './auth';
import { syncRoutes, purgeExpiredTrash } from './sync';
import { fileRoutes, resumeExtraction, purgeStaleParts } from './files';
import { importRoutes } from './import';
import { projectRoutes } from './projects';
import { backupRoutes, runScheduledBackup } from './backup';
import { searchRoutes, rebuildIndex, indexIsEmpty } from './search';
import { getMasterKey } from './storage';

const LOCAL_TRUSTED = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', ...(process.env.PPM_LOCAL_TRUSTED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean)]);

export async function buildApp(): Promise<FastifyInstance> {
  if (config.serverless) {
    // Never fall back to a temporary database or key on serverless hosting: data would be lost.
    if (!/^(mysql|mariadb):\/\//.test(config.databaseUrl)) throw new Error('PPM_DATABASE_URL is not set. Add your MySQL connection string in the hosting environment variables and redeploy.');
    getMasterKey();
  }
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    logger: { level: config.isProd ? 'info' : 'warn', redact: ['req.headers.cookie', 'req.headers["x-ppm-csrf"]'] },
    disableRequestLogging: !config.isProd,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure === 'false' ? false : { maxAge: 31536000, includeSubDomains: false },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await migrate();
  await app.register(cookie);
  // Raw bytes for chunked uploads.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  await app.register(multipart, { limits: { fieldNameSize: 100, parts: 30 } });

  // Local-only mode: refuse anything that isn't from this device.
  app.addHook('onRequest', async (req, reply) => {
    if (!config.serverless && (await getSettings()).storage_mode === 'local' && !LOCAL_TRUSTED.has(req.ip)) {
      return reply.code(403).send({ error: 'This workspace is in Local-only mode and only accepts connections from this device.' });
    }
    // Defence in depth on top of SameSite cookies + CSRF token: reject cross-origin writes.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        const host = req.headers['x-forwarded-host'] && config.trustProxy ? String(req.headers['x-forwarded-host']) : req.headers.host;
        let ok = false;
        try { ok = new URL(origin).host === host || config.allowedOrigins.includes(origin); } catch { ok = false; }
        if (!ok) return reply.code(403).send({ error: 'Cross-origin request blocked.' });
      }
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.includes('/api/')) reply.header('Cache-Control', reply.getHeader('Cache-Control') || 'no-store');
    return payload;
  });

  app.setErrorHandler((err: any, req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) { req.log.error(err); console.error(`[${req.method} ${req.url.split('?')[0]}]`, err?.code || '', err?.message || err); }
    const msg = status === 413 ? 'The upload is too large.' : status < 500 ? (err.validation ? 'Some of the information sent was invalid.' : err.message) : 'Something went wrong on the server. Please try again.';
    reply.code(status).send({ error: msg });
  });

  const prefix = config.basePath === '/' ? '' : config.basePath.replace(/\/$/, '');
  await app.register(async (api) => {
    await authPlugin(api);
    await syncRoutes(api);
    await fileRoutes(api);
    await importRoutes(api);
    await projectRoutes(api);
    await backupRoutes(api);
    await searchRoutes(api);
    // Periodic maintenance. Called by Vercel Cron (Authorization: Bearer CRON_SECRET) or the local timer.
    api.get('/api/cron', async (req, reply) => {
      const auth = String(req.headers.authorization || '');
      const expected = `Bearer ${config.cronSecret}`;
      if (!config.cronSecret || auth.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return reply.code(401).send({ error: 'Unauthorized' });
      return runMaintenance();
    });
  }, { prefix });

  // ---------- PWA static files (on Vercel the platform serves them) ----------
  if (!config.serverless && fs.existsSync(path.join(config.clientDir, 'index.html'))) {
    const indexHtml = fs.readFileSync(path.join(config.clientDir, 'index.html'));
    await app.register(fastifyStatic, {
      root: config.clientDir,
      prefix: config.basePath,
      index: false,
      wildcard: false,
      setHeaders(res: any, p: string) {
        if (/\/assets\//.test(p)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else res.header('Cache-Control', 'no-cache');
        if (p.endsWith('sw.js')) res.header('Service-Worker-Allowed', config.basePath);
      },
    });
    const sendIndex = (_req: unknown, reply: any) => reply.header('Cache-Control', 'no-cache').type('text/html').send(indexHtml);
    app.get(config.basePath, sendIndex);
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && req.url.startsWith(config.basePath) && !req.url.startsWith(config.basePath + 'api/') && !path.extname(req.url.split('?')[0])) return sendIndex(req, reply);
      reply.code(404).send({ error: 'Not found' });
    });
  } else if (!config.serverless) {
    app.log.warn(`Client build not found at ${config.clientDir}. Run "npm run build:client" (or use "npm run dev").`);
  }
  return app;
}

export async function runMaintenance() {
  const done: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => { try { await fn(); done.push(name); } catch (e) { done.push(`${name}: ${(e as Error).message}`); } };
  await step('sessions', purgeExpiredSessions);
  await step('uploads', purgeStaleParts);
  await step('trash', purgeExpiredTrash);
  await step('extraction', () => resumeExtraction(20));
  await step('backup', runScheduledBackup);
  return { ok: true, done };
}

async function main() {
  getMasterKey();
  await migrate();
  if (!(await userCount())) console.warn('\n  No account exists yet. Run "npm run setup" to create the owner account.\n');
  if (await indexIsEmpty()) await rebuildIndex();
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  console.log(`Prompt & Project Manager running at http://${config.host}:${config.port}${config.basePath} (storage mode: ${(await getSettings()).storage_mode}, database: ${config.databaseUrl ? 'MySQL' : 'SQLite'})`);
  const tick = async () => { try { await runMaintenance(); } catch (e) { app.log.error(e); } };
  setInterval(tick, 15 * 60_000).unref();
  setTimeout(tick, 10_000).unref();
  const shutdown = async () => { await app.close(); await q.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.env.PPM_NO_LISTEN !== '1' && !config.serverless) void main();
