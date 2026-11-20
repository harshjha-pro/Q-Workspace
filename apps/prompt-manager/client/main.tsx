import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { boot } from './lib/session';
import { applyTheme } from './lib/prefs';
import { BASE } from './lib/api';
import { toast } from './components/overlay';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
void boot();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Service worker: offline app shell + background sync. Scoped to this app's base path only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
      const promptUpdate = (w: ServiceWorker) => toast.info('A new version is available.', { label: 'Reload', onClick: () => w.postMessage({ type: 'SKIP_WAITING' }) });
      // A newer version already downloaded when the app opens: switch to it straight away.
      if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      else void reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state !== 'installed' || !navigator.serviceWorker.controller) return;
          // Apply silently if the app was just opened or is in the background; otherwise ask (unsaved edits).
          if (performance.now() < 15_000 || document.visibilityState === 'hidden') w.postMessage({ type: 'SKIP_WAITING' });
          else promptUpdate(w);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
      setInterval(() => void reg.update().catch(() => {}), 30 * 60_000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => {}); });
    } catch { /* SW unsupported or blocked: app still works online */ }
  });
}
