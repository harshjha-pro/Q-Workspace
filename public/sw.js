/*
 * QEPEX Work Tracker service worker (P2-38). Keeps the Add Work shell available offline.
 * - Navigations: network first; successful /work pages are cached; offline falls back to the cache.
 * - Built assets (/_next/static/, immutable): cache first.
 * - /api/, server actions (POST) and RSC fetches are never cached.
 */
const CACHE = "qepex-shell-v1";
const SHELL = ["/work", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { credentials: "same-origin" })).catch(() => undefined)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function cacheable(res) {
  return res && res.ok && !res.redirected && res.type === "basic";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate") {
    const isWork = url.pathname === "/work" || url.pathname.startsWith("/work/");
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isWork && cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname === "/work" ? "/work" : req, copy));
          }
          return res;
        })
        .catch(async () => {
          const c = await caches.open(CACHE);
          return (await c.match(req, { ignoreSearch: false })) || (await c.match(url.pathname)) || (await c.match("/work")) || new Response("You are offline.", { status: 503, headers: { "content-type": "text/plain" } });
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (cacheable(res)) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
