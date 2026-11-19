/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { setCacheNameDetails } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

// Cache names are namespaced so they never collide with other apps on the same origin.
setCacheNameDetails({ prefix: 'ppm', suffix: 'v1' });
cleanupOutdatedCaches();

// Only the static app shell is cached. API responses and private files are never
// stored in the Cache API (they live encrypted in IndexedDB instead).
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/api\//] }));

self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting(); });

// Background Sync: wake open windows so they flush their encrypted outbox.
self.addEventListener('sync', (e: Event) => {
  const ev = e as Event & { tag: string; waitUntil: (p: Promise<unknown>) => void };
  if (ev.tag === 'ppm-sync') ev.waitUntil(self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'ppm-sync' }))));
});
