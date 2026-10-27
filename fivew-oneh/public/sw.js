/* CareLens (fivew-oneh) service worker.
 * - Own cache namespace: "fivew-oneh-v1". Only caches whose name starts with
 *   "fivew-oneh-" are ever touched, so other apps on the origin are unaffected.
 * - Only handles GET requests inside this worker's scope; cross-origin requests
 *   (e.g. the optional weather API) and other paths pass straight through.
 * BUILD: __BUILD_ID__
 */
const CACHE = 'fivew-oneh-v1';
const SCOPE = self.registration.scope; // ends with "/"
const SHELL = ['', 'index.html', 'offline.html', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

const inScope = (url) => url.startsWith(SCOPE);

async function precacheList() {
  try {
    const res = await fetch(new URL('precache-manifest.json', SCOPE), { cache: 'no-store' });
    if (res.ok) return (await res.json()).files || [];
  } catch (_) {
    /* manifest missing (e.g. dev) — fall back to the shell only */
  }
  return [];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const files = [...new Set([...SHELL, ...(await precacheList())])];
      const urls = files.map((f) => new URL(f, SCOPE).toString());
      // Fetch fresh copies so an update never re-caches stale files.
      await Promise.all(
        urls.map(async (u) => {
          try {
            const res = await fetch(u, { cache: 'reload' });
            if (res.ok) await cache.put(u, res);
          } catch (_) {
            /* tolerate individual failures; the app shell still installs */
          }
        }),
      );
      await cache.put(new URL('__precache__', SCOPE).toString(), new Response(JSON.stringify(urls)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('fivew-oneh-') && n !== CACHE).map((n) => caches.delete(n)));
      // Drop hashed assets from previous builds that are no longer referenced.
      const cache = await caches.open(CACHE);
      const listRes = await cache.match(new URL('__precache__', SCOPE).toString());
      if (listRes) {
        const keep = new Set(await listRes.json());
        for (const req of await cache.keys()) {
          if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !inScope(request.url)) return;
  const url = new URL(request.url);
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/precache-manifest.json')) return;

  // Navigations: network first, fall back to the cached app shell, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(new URL('index.html', SCOPE).toString(), res.clone());
          return res;
        } catch (_) {
          return (
            (await cache.match(new URL('index.html', SCOPE).toString())) ||
            (await cache.match(new URL('offline.html', SCOPE).toString())) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })(),
    );
    return;
  }

  // Static assets: cache first, then network (and cache the result).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok && res.type === 'basic') cache.put(request, res.clone());
        return res;
      } catch (_) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })(),
  );
});
