import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let waitingWorker: ServiceWorker | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; listeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}

/** Registers /sw.js in production builds only (dev server has no generated sw.js). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) { waitingWorker = w; listeners.forEach((l) => l()); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; listeners.forEach((l) => l()); }
      reg.addEventListener('updatefound', () => track(reg.installing));
      setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    }).catch(() => undefined);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; window.location.reload(); } });
  });
}

export function usePWA() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return {
    canInstall: !!deferred,
    standalone,
    install: async () => { if (!deferred) return false; await deferred.prompt(); const r = await deferred.userChoice; deferred = null; listeners.forEach((l) => l()); return r.outcome === 'accepted'; },
    updateReady: !!waitingWorker,
    applyUpdate: () => waitingWorker?.postMessage('skip-waiting')
  };
}
