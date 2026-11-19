import { useEffect, useState, useSyncExternalStore } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function formatBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : n / 1024 ** i >= 100 ? 0 : 1)} ${u[i]}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = (new Date(iso).getTime() - Date.now()) / 1000;
  const a = Math.abs(d);
  if (a < 45) return 'just now';
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(d / 86400), 'day');
  return formatDate(iso);
}
export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const saveText = (text: string, name: string, type = 'text/plain') => saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), name);

export function safeFileName(s: string) { return s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'export'; }

marked.setOptions({ gfm: true, breaks: true });
export function renderMarkdown(md: string) {
  return DOMPurify.sanitize(marked.parse(md || '', { async: false }) as string, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] });
}
export const sanitizeHtml = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'iframe'], FORBID_ATTR: ['style'] });

// ---------- Hooks ----------
const mq = (q: string) => (typeof window === 'undefined' ? null : window.matchMedia(q));
export function useMedia(q: string) {
  return useSyncExternalStore(
    (l) => { const m = mq(q); m?.addEventListener('change', l); return () => m?.removeEventListener('change', l); },
    () => !!mq(q)?.matches,
  );
}
export const useIsMobile = () => useMedia('(max-width: 720px)');
export const useIsDesktop = () => useMedia('(min-width: 1024px)');

export function useDebounced<T>(v: T, ms = 200) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function useOnline() {
  return useSyncExternalStore(
    (l) => { window.addEventListener('online', l); window.addEventListener('offline', l); return () => { window.removeEventListener('online', l); window.removeEventListener('offline', l); }; },
    () => navigator.onLine,
  );
}

export function plural(n: number, one: string, many = one + 's') { return `${n.toLocaleString()} ${n === 1 ? one : many}`; }

export function matches(q: string, ...fields: (string | undefined | null | string[])[]) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => (Array.isArray(f) ? f.join(' ') : f || '').toLowerCase().includes(needle));
}
