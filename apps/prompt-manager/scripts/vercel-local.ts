/**
 * Local stand-in for Vercel: serves the built PWA (dist/client) like Vercel's CDN and routes
 * /api/* to the same function handler (api/index.ts). Used to test the serverless build locally.
 *   PPM_SERVERLESS=1 PPM_DATABASE_URL=mysql://... PPM_MASTER_KEY=... npx tsx scripts/vercel-local.ts
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import handler from '../api/index';

const root = path.resolve('dist/client');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' };
const port = Number(process.env.PORT || 8787);
http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname.startsWith('/api/')) return void handler(req, res);
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`vercel-local on http://127.0.0.1:${port}`));
