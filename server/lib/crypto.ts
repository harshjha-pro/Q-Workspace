import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM with versioned ciphertext "v1:<iv>:<tag>:<data>" (base64url parts).
 * Two keys so a vault leak does not expose salaries and vice versa (spec 14.4, decisions D-10).
 */
export type KeyName = "VAULT" | "PII";

function keyFor(name: KeyName): Buffer {
  const raw = name === "VAULT" ? process.env.VAULT_KEY : process.env.PII_KEY;
  if (!raw) throw new Error(`${name}_KEY is not set — run npm run setup`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name}_KEY must be 32 bytes (base64)`);
  return key;
}

export function encrypt(plain: string, keyName: KeyName): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(keyName), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function decrypt(token: string, keyName: KeyName): string {
  const [ver, iv, tag, data] = token.split(":");
  if (ver !== "v1" || !iv || !tag || data === undefined) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(keyName), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const encryptOpt = (v: string | null | undefined, k: KeyName) => (v ? encrypt(v, k) : null);
export const decryptOpt = (v: string | null | undefined, k: KeyName) => (v ? decrypt(v, k) : null);

export const encryptJson = (v: unknown, k: KeyName) => encrypt(JSON.stringify(v), k);
export const decryptJson = <T>(v: string, k: KeyName): T => JSON.parse(decrypt(v, k)) as T;

export const sha256 = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const generateKey = () => randomBytes(32).toString("base64");
