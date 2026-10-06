import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { DomainError } from "./errors";

/**
 * Local-disk file storage under STORAGE_DIR (replaces object storage + virus scan, brief §4).
 * Layout: <client code or area>/<engagement code or sub-area>/<random>.<ext>
 * Files are never served from /public; downloads go through an authorised route handler.
 */
export const ALLOWED_TYPES: Record<string, { mime: string; magic?: (b: Buffer) => boolean }> = {
  pdf: { mime: "application/pdf", magic: (b) => b.subarray(0, 5).toString() === "%PDF-" },
  jpg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  jpeg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  png: { mime: "image/png", magic: (b) => b.subarray(1, 4).toString() === "PNG" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: isZip },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: isZip },
  zip: { mime: "application/zip", magic: isZip },
  xls: { mime: "application/vnd.ms-excel", magic: isOle },
  doc: { mime: "application/msword", magic: isOle },
  csv: { mime: "text/csv", magic: isText },
  txt: { mime: "text/plain", magic: isText },
  json: { mime: "application/json", magic: isText },
  xml: { mime: "application/xml", magic: isText },
};

function isZip(b: Buffer) {
  return b[0] === 0x50 && b[1] === 0x4b;
}
function isOle(b: Buffer) {
  return b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
}
function isText(b: Buffer) {
  // Reject binary content (NUL bytes) in the first 4 KB.
  return !b.subarray(0, 4096).includes(0);
}

export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export function storageRoot() {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

const SAFE_SEGMENT = /[^A-Za-z0-9._-]/g;
const safe = (s: string) => s.replace(SAFE_SEGMENT, "_").slice(0, 80) || "_";

export type StoredFile = { storagePath: string; sizeBytes: number; sha256: string; mimeType: string; ext: string };

/** Validate type/size/magic bytes and write the file. Throws VALIDATION on a rejected file. */
export async function storeFile(
  segments: string[],
  originalName: string,
  data: Buffer,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<StoredFile> {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  const type = ALLOWED_TYPES[ext];
  if (!type) throw new DomainError("VALIDATION", `File type .${ext || "?"} is not allowed.`);
  if (data.length === 0) throw new DomainError("VALIDATION", "The file is empty.");
  if (data.length > maxBytes) throw new DomainError("VALIDATION", `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  if (type.magic && !type.magic(data)) throw new DomainError("VALIDATION", `The file content does not look like a .${ext} file.`);

  const rel = path.join(...segments.map(safe), `${randomBytes(12).toString("hex")}.${ext}`);
  const abs = resolveInside(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data, { flag: "wx" });
  return { storagePath: rel, sizeBytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), mimeType: type.mime, ext };
}

/** Resolve a stored relative path, refusing anything that escapes STORAGE_DIR. */
export function resolveInside(rel: string): string {
  const root = storageRoot();
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new DomainError("FORBIDDEN", "Invalid file path.");
  return abs;
}

export async function readStoredFile(rel: string): Promise<Buffer> {
  return fs.readFile(resolveInside(rel));
}

export async function deleteStoredFile(rel: string): Promise<void> {
  await fs.rm(resolveInside(rel), { force: true });
}
