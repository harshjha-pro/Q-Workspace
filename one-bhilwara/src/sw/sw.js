/* One Bhilwara service worker. Standalone: it only touches caches named "one-bhilwara-*".
   Built into dist/sw.js by the Vite plugin in vite.config.ts, which stamps BUILD_ID. */
const CACHE = 'one-bhilwara-v1';
const BUILD_ID = '__BUILD_ID__';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/favicon-48.png'];

// Static hosts may send `Vary: Origin`; module-script requests carry Origin while precached
// requests don't, so ignore Vary when matching our own static files.
const MATCH = { ignoreVary: true };

// Never cache these: API calls, auth callbacks, admin data, anything private.
const NEVER_CACHE = [/^\/api\//, /^\/auth\//];

async function buildFileList() {
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const { files } = await res.json();
    // Precache the app code and styles; media is cached on first use.
    return files.filter((f) => /\.(js|css|svg|woff2?)$/.test(f)).map((f) => '/' + f);
  } catch (_) {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const files = await buildFileList();
    // Cache individually so one missing file can't fail the whole install.
    await Promise.all(files.map((f) => cache.add(f).catch(() => undefined)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('one-bhilwara-') && k !== CACHE).map((k) => caches.delete(k)));
    // Drop hashed assets from previous builds.
    const current = new Set(await buildFileList());
    if (current.size) {
      const cache = await caches.open(CACHE);
      for (const req of await cache.keys()) {
        const p = new URL(req.url).pathname;
        if (p.startsWith('/assets/') && !current.has(p)) await cache.delete(req);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'build-id' && event.source) event.source.postMessage({ type: 'build-id', buildId: BUILD_ID });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party APIs: network only
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  // Navigations: network first, then cached app shell, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put('/index.html', res.clone());
        }
        return res;
      } catch (_) {
        return (await caches.match('/index.html', MATCH)) || (await caches.match('/offline.html', MATCH)) || Response.error();
      }
    })());
    return;
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req, MATCH).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // Other public static files (icons, audio, manifest): stale-while-revalidate.
  event.respondWith(caches.match(req, MATCH).then((hit) => {
    const network = fetch(req).then((res) => {
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit || Response.error());
    return hit || network;
  }));
});

/* Web push: structure only. Requires a push server with VAPID keys (see README). */
self.addEventListener('push', (event) => {
  let data = { title: 'One Bhilwara', body: 'You have a new update.', url: '/notifications' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) { /* plain text */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icons/icon-192.png', badge: '/icons/favicon-48.png', data: { url: data.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((wins) => {
    const w = wins.find((c) => 'focus' in c);
    if (w) { w.navigate(target); return w.focus(); }
    return self.clients.openWindow(target);
  }));
});
