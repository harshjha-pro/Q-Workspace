const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

/** ₹1,23,456 (Indian digit grouping). */
export const formatINR = (n: number) => inr.format(n);
export const formatNum = (n: number) => num.format(n);

/** Compact Indian units: ₹62 L, ₹1.2 Cr. */
export function formatINRShort(n: number) {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
  return formatINR(n);
}

/** 24 Oct 2026 */
export const formatDate = (iso: string | number | Date) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** 24 Oct 2026, 5:30 pm */
export const formatDateTime = (iso: string | number | Date) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatTime = (iso: string | number | Date) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function timeAgo(iso: string, now = Date.now()) {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 0) return `in ${humanDuration(-diff)}`;
  if (diff < 60) return 'just now';
  return `${humanDuration(diff)} ago`;
}

export function humanDuration(sec: number) {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h`;
  const d = Math.round(sec / 86400);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/** Countdown "2d 4h 10m" */
export function countdown(toIso: string, now = Date.now()) {
  let s = Math.max(0, Math.floor((new Date(toIso).getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return [d ? `${d}d` : '', h || d ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

/** Indian mobile: +91 98765 43210 */
export function formatMobile(m?: string) {
  if (!m) return '';
  const d = m.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : m;
}

export const isValidMobile = (m: string) => /^[6-9]\d{9}$/.test(m.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''));

export const durationMMSS = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const plural = (n: number, one: string, many = one + 's') => `${formatNum(n)} ${n === 1 ? one : many}`;

export const salaryLabel = (min: number, max: number, period: 'month' | 'day' | 'hour') =>
  `${formatINR(min)}–${formatINR(max)}/${period === 'month' ? 'mo' : period === 'day' ? 'day' : 'hr'}`;
