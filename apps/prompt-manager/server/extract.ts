import net from 'node:net';
import fs from 'node:fs';
import { fileTypeFromFile } from 'file-type';
import { config } from './config';

export type Preview =
  | { kind: 'html'; html: string }
  | { kind: 'sheet'; sheets: { name: string; rows: string[][]; truncated: boolean }[] }
  | { kind: 'slides'; slides: { n: number; texts: string[] }[] }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'markdown'; text: string; truncated: boolean }
  | { kind: 'none' };

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'json']);
const MAX_PREVIEW_TEXT = 400_000;
const MAX_INDEX_TEXT = 2_000_000;

// ---------- Content validation (magic bytes) ----------
const EXPECT: Record<string, string[]> = {
  pdf: ['pdf'], docx: ['docx', 'zip'], xlsx: ['xlsx', 'zip'], pptx: ['pptx', 'zip'],
  doc: ['cfb'], xls: ['cfb'], ppt: ['cfb'], jpg: ['jpg'], jpeg: ['jpg'], png: ['png'], webp: ['webp'], gif: ['gif'],
};

export async function validateContent(file: string, ext: string): Promise<{ ok: boolean; reason?: string; mime?: string }> {
  if (TEXT_EXT.has(ext)) {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const sample = buf.subarray(0, n);
    if (sample.includes(0)) return { ok: false, reason: 'This file is not a text file.' };
    try { new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, Math.max(0, n - 4))); } catch { return { ok: false, reason: 'Text files must be UTF-8 encoded.' }; }
    return { ok: true };
  }
  const ft = await fileTypeFromFile(file);
  const allowed = EXPECT[ext];
  if (!allowed) return { ok: false, reason: 'This file type is not supported.' };
  if (!ft || !allowed.includes(ft.ext)) return { ok: false, reason: `The file content does not match the .${ext} extension.` };
  return { ok: true, mime: ft.mime };
}

// ---------- Malware scan via clamd (optional) ----------
export async function scanFile(file: string): Promise<'clean' | 'infected' | 'skipped' | 'error'> {
  if (!config.clamd.host) return 'skipped';
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: config.clamd.host, port: config.clamd.port });
    let reply = '';
    sock.setTimeout(60_000, () => { sock.destroy(); resolve('error'); });
    sock.on('error', () => resolve('error'));
    sock.on('data', (d) => (reply += d.toString()));
    sock.on('end', () => resolve(/FOUND/.test(reply) ? 'infected' : /OK/.test(reply) ? 'clean' : 'error'));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      const rs = fs.createReadStream(file, { highWaterMark: 64 * 1024 });
      rs.on('data', (chunk) => { const len = Buffer.alloc(4); len.writeUInt32BE((chunk as Buffer).length); sock.write(len); sock.write(chunk); });
      rs.on('end', () => sock.write(Buffer.alloc(4)));
      rs.on('error', () => { sock.destroy(); resolve('error'); });
    });
  });
}

// ---------- Extraction ----------
const xmlText = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 } as any);
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 500); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const it of tc.items as any[]) {
      line += it.str;
      if (it.hasEOL) { lines.push(line); line = ''; } else if (it.str && !it.str.endsWith(' ')) line += '';
    }
    if (line) lines.push(line);
    out.push(lines.join('\n'));
    if (out.join('\n').length > MAX_INDEX_TEXT) break;
  }
  await task.destroy();
  return out.join('\n\n');
}

async function sheetData(buf: Buffer) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const sheets: { name: string; rows: string[][]; truncated: boolean }[] = [];
  const text: string[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    let truncated = false;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => cellText(v));
      text.push(vals.filter(Boolean).join(' '));
      if (rows.length < 500) rows.push(vals.slice(0, 50)); else truncated = true;
      void n;
    });
    sheets.push({ name: ws.name, rows, truncated });
  });
  return { sheets, text: text.join('\n') };
}

function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as any;
    if (o.richText) return o.richText.map((r: any) => r.text).join('');
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
    if (o.formula) return `=${o.formula}`;
    if (o.error) return String(o.error);
    return '';
  }
  return String(v);
}

async function pptxSlides(buf: Buffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const slides: { n: number; texts: string[] }[] = [];
  for (const n of names.slice(0, 300)) {
    const xml = await zip.file(n)!.async('string');
    const paras = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => xmlText(m[1])).join('')).filter((t) => t.trim());
    slides.push({ n: slides.length + 1, texts: paras });
  }
  return slides;
}

export async function extract(buf: Buffer, ext: string, ocr: boolean): Promise<{ text: string; preview: Preview }> {
  try {
    switch (ext) {
      case 'pdf': return { text: (await pdfText(buf)).slice(0, MAX_INDEX_TEXT), preview: { kind: 'none' } };
      case 'docx': {
        const mammoth = (await import('mammoth')).default;
        const [raw, html] = await Promise.all([mammoth.extractRawText({ buffer: buf }), mammoth.convertToHtml({ buffer: buf })]);
        return { text: raw.value.slice(0, MAX_INDEX_TEXT), preview: { kind: 'html', html: html.value.slice(0, 3_000_000) } };
      }
      case 'doc': {
        const WordExtractor = (await import('word-extractor')).default;
        const d = await new WordExtractor().extract(buf);
        const t = d.getBody();
        return { text: t.slice(0, MAX_INDEX_TEXT), preview: { kind: 'text', text: t.slice(0, MAX_PREVIEW_TEXT), truncated: t.length > MAX_PREVIEW_TEXT } };
      }
      case 'xlsx': {
        const { sheets, text } = await sheetData(buf);
        return { text: text.slice(0, MAX_INDEX_TEXT), preview: { kind: 'sheet', sheets } };
      }
      case 'csv': {
        const Papa = (await import('papaparse')).default;
        const s = buf.toString('utf8').replace(/^﻿/, '');
        const parsed = Papa.parse<string[]>(s, { skipEmptyLines: true });
        const rows = parsed.data.slice(0, 1000).map((r) => r.slice(0, 50));
        return { text: s.slice(0, MAX_INDEX_TEXT), preview: { kind: 'sheet', sheets: [{ name: 'CSV', rows, truncated: parsed.data.length > 1000 }] } };
      }
      case 'pptx': {
        const slides = await pptxSlides(buf);
        return { text: slides.map((s) => s.texts.join('\n')).join('\n\n').slice(0, MAX_INDEX_TEXT), preview: { kind: 'slides', slides } };
      }
      case 'md': case 'markdown': {
        const t = buf.toString('utf8');
        return { text: t.slice(0, MAX_INDEX_TEXT), preview: { kind: 'markdown', text: t.slice(0, MAX_PREVIEW_TEXT), truncated: t.length > MAX_PREVIEW_TEXT } };
      }
      case 'txt': case 'json': {
        const t = buf.toString('utf8');
        return { text: t.slice(0, MAX_INDEX_TEXT), preview: { kind: 'text', text: t.slice(0, MAX_PREVIEW_TEXT), truncated: t.length > MAX_PREVIEW_TEXT } };
      }
      case 'jpg': case 'jpeg': case 'png': case 'webp': case 'gif': {
        if (!ocr) return { text: '', preview: { kind: 'none' } };
        return { text: await ocrImage(buf), preview: { kind: 'none' } };
      }
      default: return { text: '', preview: { kind: 'none' } };
    }
  } catch (e) {
    return { text: '', preview: { kind: 'none' } };
  }
}

/** Optional OCR for images (scanned documents). Requires the optional `tesseract.js` package. */
async function ocrImage(buf: Buffer): Promise<string> {
  try {
    const mod = 'tesseract.js';
    const T: any = await import(/* @vite-ignore */ mod);
    const worker = await T.createWorker('eng');
    const { data } = await worker.recognize(buf);
    await worker.terminate();
    return String(data.text || '').slice(0, MAX_INDEX_TEXT);
  } catch {
    return '';
  }
}
