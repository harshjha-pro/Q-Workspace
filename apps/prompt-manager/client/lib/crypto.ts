// Local data encryption. A random data key (DEK) encrypts everything stored on the
// device. The DEK is only ever stored wrapped:
//   - by a key derived from the password (PBKDF2, for offline unlock), and
//   - by a per-session key held by the server (for seamless reloads while signed in).
// Locking or signing out drops the DEK from memory, leaving only ciphertext on disk.

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITER = 310_000;

export interface Wrapped { iv: Uint8Array; ct: ArrayBuffer; salt?: Uint8Array }

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function passwordKek(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function b64urlToBytes(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function sessionKek(localKey: string) {
  const raw = b64urlToBytes(localKey);
  const base = await crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('ppm-session-wrap'), info: enc.encode('dek') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function wrapWith(kek: CryptoKey, dek: CryptoKey, salt?: Uint8Array): Promise<Wrapped> {
  const raw = await crypto.subtle.exportKey('raw', dek);
  const iv = randomBytes(12);
  return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, kek, raw), salt };
}
async function unwrapWith(kek: CryptoKey, w: Wrapped): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: w.iv as BufferSource }, kek, w.ct);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function wrapWithPassword(dek: CryptoKey, password: string) { const salt = randomBytes(16); return wrapWith(await passwordKek(password, salt), dek, salt); }
export async function unwrapWithPassword(w: Wrapped, password: string) { return unwrapWith(await passwordKek(password, w.salt!), w); }
export async function wrapWithSession(dek: CryptoKey, localKey: string) { return wrapWith(await sessionKek(localKey), dek); }
export async function unwrapWithSession(w: Wrapped, localKey: string) { return unwrapWith(await sessionKek(localKey), w); }

export interface Sealed { iv: Uint8Array; ct: ArrayBuffer }
export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(JSON.stringify(value))) };
}
export async function open<T = unknown>(key: CryptoKey, s: Sealed): Promise<T> {
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv as BufferSource }, key, s.ct)));
}
export async function sealBytes(key: CryptoKey, data: ArrayBuffer): Promise<Sealed> {
  const iv = randomBytes(12);
  return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data) };
}
export async function openBytes(key: CryptoKey, s: Sealed): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv as BufferSource }, key, s.ct);
}
