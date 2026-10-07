import { inflateSync } from "node:zlib";
import AdmZip from "adm-zip";

/**
 * Text extraction and tokenising for the portable search index (decisions D-11). No new
 * dependencies: plain-text formats are read directly, Office files are zips (adm-zip), and PDFs get a
 * best-effort pass over their content streams (zlib) that works for simple-font PDFs such as the ones
 * this app generates. Scanned or CID-font PDFs yield little text; they stay findable by name and tags.
 */
const MAX_TEXT_CHARS = 400_000;
const MAX_TOKENS = 5_000;
const STOP = new Set(["the", "and", "for", "of", "to", "in", "on", "at", "by", "an", "is", "be", "or", "as", "it", "we", "this", "that", "with", "from", "are", "was", "has", "have"]);

/** Lower-case words and numbers of 2–40 characters, de-duplicated, stop words dropped. */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  const norm = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const m of norm.matchAll(/[a-z0-9]+/g)) {
    const t = m[0];
    if (t.length < 2 || t.length > 40 || STOP.has(t)) continue;
    out.add(t);
    if (out.size >= MAX_TOKENS) break;
  }
  return [...out];
}

const stripXml = (xml: string) =>
  xml
    .replace(/<\/w:p>|<\/a:p>|<\/si>|<\/c>|<\/row>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function zipText(data: Buffer, pick: (name: string) => boolean): string {
  const zip = new AdmZip(data);
  let text = "";
  for (const e of zip.getEntries()) {
    if (e.isDirectory || !pick(e.entryName)) continue;
    // Guard against zip bombs: skip entries that claim to be huge once inflated.
    if (e.header.size > 20 * 1024 * 1024) continue;
    text += `${stripXml(e.getData().toString("utf8"))}\n`;
    if (text.length > MAX_TEXT_CHARS) break;
  }
  return text;
}

function decodePdfLiteral(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return ({ n: "\n", r: "\r", t: "\t", b: "", f: "" } as Record<string, string>)[c] ?? c;
  });
}

function decodePdfHex(h: string): string {
  const clean = h.replace(/\s+/g, "");
  const buf = Buffer.from(clean.length % 2 ? `${clean}0` : clean, "hex");
  // Two-byte (UTF-16BE) strings start with a BOM; everything else is treated as a single-byte encoding.
  if (buf[0] === 0xfe && buf[1] === 0xff) return buf.subarray(2).swap16().toString("utf16le");
  return buf.toString("latin1");
}

/** Text shown by Tj / TJ / ' / " operators in one content stream. */
function textOps(content: string): string {
  const parts: string[] = [];
  for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = block[1]!;
    for (const m of body.matchAll(/\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      if (m[1] !== undefined) {
        let line = "";
        for (const s of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g)) {
          if (s[1] !== undefined) line += decodePdfLiteral(s[1]);
          else if (s[2] !== undefined) line += decodePdfHex(s[2]);
          else if (s[3] !== undefined && Number(s[3]) < -200) line += " "; // a big kern is a word gap
        }
        parts.push(line);
      } else if (m[2] !== undefined) parts.push(decodePdfLiteral(m[2]));
      else if (m[3] !== undefined) parts.push(decodePdfHex(m[3]));
    }
    parts.push("\n");
  }
  return parts.join(" ");
}

export function pdfText(data: Buffer): string {
  const raw = data.toString("latin1");
  let text = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) && text.length < MAX_TEXT_CHARS) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const dict = raw.slice(Math.max(0, m.index - 300), m.index);
    const bytes = data.subarray(start, end);
    re.lastIndex = end;
    if (/\/Subtype\s*\/Image|\/Length1|\/FontFile/.test(dict)) continue;
    let content: string;
    try {
      content = /FlateDecode/.test(dict) ? inflateSync(bytes).toString("latin1") : bytes.toString("latin1");
    } catch {
      continue;
    }
    if (content.includes("BT")) text += textOps(content);
  }
  return text;
}

/** Searchable text inside a stored file, by extension. Never throws: a bad file just indexes nothing. */
export function extractText(fileName: string, data: Buffer): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  try {
    switch (ext) {
      case "txt":
      case "csv":
      case "json":
        return data.subarray(0, MAX_TEXT_CHARS).toString("utf8");
      case "xml":
        return stripXml(data.subarray(0, MAX_TEXT_CHARS).toString("utf8"));
      case "docx":
        return zipText(data, (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
      case "xlsx":
        return zipText(data, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
      case "pdf":
        return pdfText(data);
      default:
        return "";
    }
  } catch {
    return "";
  }
}

/** Tokens for a document: its name, tags and (for supported types) the text inside the current version. */
export function documentTokens(doc: { name: string; tagsCsv: string; kind?: string }, file?: { name: string; data: Buffer }): string[] {
  const head = `${doc.name} ${doc.tagsCsv.replace(/,/g, " ")} ${doc.kind ?? ""}`;
  const body = file ? extractText(file.name, file.data) : "";
  return tokenize(`${head}\n${body}`);
}
