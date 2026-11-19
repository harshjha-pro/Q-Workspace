import { useSyncExternalStore } from 'react';

// Per-device, non-sensitive preferences. Wrapped in try/catch: storage can be unavailable.
export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  offlineCacheMb: number;
  cacheViewedFiles: boolean;
  projectView: 'list' | 'grid';
  density: 'comfortable' | 'compact';
  sidebarCollapsed: boolean;
  displayName: string;
}
const KEY = 'ppm.prefs.v1';
const DEFAULTS: Prefs = { theme: 'system', offlineCacheMb: 250, cacheViewedFiles: true, projectView: 'list', density: 'comfortable', sidebarCollapsed: false, displayName: '' };

function read(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}
let prefs = read();
const subs = new Set<() => void>();
export const getPrefs = () => prefs;
export function setPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  applyTheme();
  subs.forEach((s) => s());
}
export const usePrefs = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => prefs);

export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prefs.theme);
  root.dataset.density = prefs.density;
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0F1C' : '#1B2440');
}
