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
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w); });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
      setInterval(() => void reg.update().catch(() => {}), 60 * 60_000);
    } catch { /* SW unsupported or blocked: app still works online */ }
  });
}
