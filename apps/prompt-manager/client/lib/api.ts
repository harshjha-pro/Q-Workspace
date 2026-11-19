// Thin fetch wrapper. All requests are same-origin and carry the CSRF token.
export const BASE = import.meta.env.BASE_URL; // e.g. "/" or "/prompt-manager/"
export const apiUrl = (p: string) => BASE + p.replace(/^\//, '');

let csrf = '';
export const setCsrf = (t: string) => { csrf = t; };
export const hasCsrf = () => !!csrf;

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: any) { super(message); }
}
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof ApiError && e.status === 0);

type Listener = (e: { type: 'unauthenticated' | 'must_change_password' | 'csrf' }) => void;
const listeners = new Set<Listener>();
export const onAuthEvent = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };

async function handle(res: Response) {
  if (res.ok) {
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res;
  }
  let body: any = {};
  try { body = await res.json(); } catch { /* not json */ }
  if (res.status === 401 && body.code === 'unauthenticated') listeners.forEach((l) => l({ type: 'unauthenticated' }));
  if (res.status === 403 && body.code === 'must_change_password') listeners.forEach((l) => l({ type: 'must_change_password' }));
  if (res.status === 403 && body.code === 'csrf') listeners.forEach((l) => l({ type: 'csrf' }));
  throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.code, body);
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method || (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  if (method !== 'GET') headers['X-PPM-CSRF'] = csrf;
  const res = await fetch(apiUrl(path), { method, headers, body, credentials: 'same-origin', signal: opts.signal, cache: 'no-store' });
  return handle(res);
}

/** Download a binary response as a Blob (for previews / cached files). */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(apiUrl(path), { credentials: 'same-origin', signal, cache: 'no-store' });
  if (!res.ok) await handle(res);
  return res.blob();
}

/** Multipart upload with progress (XHR gives upload progress events; fetch does not). */
export function uploadForm<T = any>(path: string, form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.setRequestHeader('X-PPM-CSRF', csrf);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        if (xhr.status === 401) listeners.forEach((l) => l({ type: 'unauthenticated' }));
        reject(new ApiError(data.error || `Upload failed (${xhr.status})`, xhr.status, data.code, data));
      }
    };
    xhr.onerror = () => reject(new ApiError('Network error — you appear to be offline.', 0));
    signal?.addEventListener('abort', () => { xhr.abort(); reject(new ApiError('Upload cancelled', 0, 'aborted')); });
    xhr.send(form);
  });
}

/** Trigger a browser download for an authenticated GET endpoint. */
export function downloadUrl(path: string) {
  const a = document.createElement('a');
  a.href = apiUrl(path);
  a.rel = 'noopener';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
