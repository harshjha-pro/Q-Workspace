// Registers this app's own service worker, scoped to the app's base path so it
// never controls other applications on the same origin.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
      const announce = (sw: ServiceWorker | null) => {
        if (sw && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('fivew-oneh:sw-update', { detail: sw }));
      };
      announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => sw.state === 'installed' && announce(sw));
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn('[fivew-oneh] service worker registration failed', err);
    }
  });
}
