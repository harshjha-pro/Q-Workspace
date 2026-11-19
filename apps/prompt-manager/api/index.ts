// Vercel Function: every /api/* request is routed here (see vercel.json) and handed to Fastify.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../server/index';

type App = Awaited<ReturnType<typeof buildApp>>;
let appPromise: Promise<App> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    appPromise ??= buildApp().then(async (a) => { await a.ready(); return a; });
    const app = await appPromise;
    app.server.emit('request', req, res);
  } catch (e) {
    appPromise = null;
    console.error('Startup failed:', (e as Error).message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    const msg = (e as Error).message || '';
    const safe = /PPM_DATABASE_URL|PPM_MASTER_KEY/.test(msg) ? msg : 'The server could not connect to its database. Check PPM_DATABASE_URL in Vercel and that Remote MySQL allows connections.';
    res.end(JSON.stringify({ error: safe, code: 'not_configured' }));
  }
}

