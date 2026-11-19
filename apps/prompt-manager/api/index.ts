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
    res.end(JSON.stringify({ error: 'The server could not start. Check the database settings (PPM_DATABASE_URL) and PPM_MASTER_KEY in Vercel.' }));
  }
}

