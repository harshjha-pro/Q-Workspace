import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Download, RefreshCw, FileQuestion, ChevronLeft, ChevronRight, ScanText } from 'lucide-react';
import { getVersionBlob, getPreview } from '../lib/files';
import { api, downloadUrl } from '../lib/api';
import { renderMarkdown, sanitizeHtml, saveBlob, useIsMobile } from '../lib/util';
import { Button, IconButton, Spinner, EmptyState, Segmented } from './ui';
import { toast } from './overlay';
import { isImage } from './domain';
import type { FileVersion } from '../../shared/schema';

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null;
async function pdfjs() {
  pdfjsP ??= (async () => {
    const lib = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })();
  return pdfjsP;
}

function PdfView({ blob, name }: { blob: Blob; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [scale, setScale] = useState(0);
  const [pages, setPages] = useState(0);
  const [limit, setLimit] = useState(20);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false; let d: any;
    (async () => {
      try {
        const lib = await pdfjs();
        d = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false } as any).promise;
        if (!cancelled) { setDoc(d); setPages(d.numPages); }
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    })();
    return () => { cancelled = true; d?.destroy?.(); };
  }, [blob]);
  useEffect(() => {
    if (!doc || !host.current) return;
    let cancelled = false;
    const el = host.current;
    el.innerHTML = '';
    (async () => {
      const width = el.clientWidth - 32;
      for (let i = 1; i <= Math.min(pages, limit); i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const s = scale || Math.min(2, width / base.width);
        const vp = page.getViewport({ scale: s * (window.devicePixelRatio || 1) });
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page';
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`;
        canvas.setAttribute('aria-label', `Page ${i}`);
        el.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas } as any).promise;
      }
    })();
    return () => { cancelled = true; };
  }, [doc, scale, limit, pages]);
  if (err) return <EmptyState icon={<FileQuestion />} title="Could not display this PDF">{err}</EmptyState>;
  return (
    <>
      <div className="preview-toolbar">
        <span className="small muted">{pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'Loading…'}</span>
        <div className="grow" />
        <IconButton size="sm" label="Zoom out" icon={<ZoomOut />} onClick={() => setScale((s) => Math.max(0.4, (s || 1) - 0.2))} />
        <Button size="sm" variant="ghost" onClick={() => setScale(0)}>Fit</Button>
        <IconButton size="sm" label="Zoom in" icon={<ZoomIn />} onClick={() => setScale((s) => Math.min(4, (s || 1) + 0.2))} />
        <IconButton size="sm" label="Download" icon={<Download />} onClick={() => saveBlob(blob, name)} />
      </div>
      <div ref={host} />
      {pages > limit && <div className="center" style={{ padding: 16 }}><Button onClick={() => setLimit(limit + 20)}>Show more pages ({pages - limit} left)</Button></div>}
    </>
  );
}

function SheetView({ sheets }: { sheets: { name: string; rows: string[][]; truncated: boolean }[] }) {
  const [i, setI] = useState(0);
  const s = sheets[i];
  if (!s) return <EmptyState icon={<FileQuestion />} title="Empty spreadsheet" />;
  return (
    <>
      {sheets.length > 1 && <div className="preview-toolbar"><Segmented label="Sheet" value={String(i)} onChange={(v) => setI(Number(v))} options={sheets.map((x, k) => ({ value: String(k), label: x.name }))} /></div>}
      <div className="table-wrap" style={{ margin: 12, background: 'var(--surface)' }}>
        <table className="table sheet-table">
          <tbody>{s.rows.map((r, ri) => <tr key={ri}><th style={{ position: 'static', width: 40 }} className="tiny faint">{ri + 1}</th>{r.map((c, ci) => ri === 0 ? <th key={ci} style={{ position: 'static' }}>{c}</th> : <td key={ci}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {s.truncated && <p className="small muted center" style={{ padding: 12 }}>Only the first rows are shown. Download the file to see everything.</p>}
    </>
  );
}

function SlidesView({ slides }: { slides: { n: number; texts: string[] }[] }) {
  const mobile = useIsMobile();
  const [i, setI] = useState(0);
  if (!slides.length) return <EmptyState icon={<FileQuestion />} title="No slide text found" />;
  const show = mobile ? slides : slides;
  return (
    <>
      <div className="preview-toolbar"><span className="small muted">{slides.length} slides · text preview</span><div className="grow" />{!mobile && <><IconButton size="sm" label="Previous slide" icon={<ChevronLeft />} disabled={i === 0} onClick={() => setI(i - 1)} /><span className="small num">{i + 1}/{slides.length}</span><IconButton size="sm" label="Next slide" icon={<ChevronRight />} disabled={i === slides.length - 1} onClick={() => setI(i + 1)} /></>}</div>
      {(mobile ? show : [slides[i]]).map((s) => (
        <div key={s.n} className="slide"><h4>Slide {s.n}</h4>{s.texts.length ? <><div className="slide-title">{s.texts[0]}</div>{s.texts.slice(1).map((t, k) => <p key={k} className="small" style={{ marginBottom: 6 }}>{t}</p>)}</> : <p className="faint small">No text on this slide</p>}</div>
      ))}
    </>
  );
}

export function FilePreview({ version, name }: { version: FileVersion; name: string }) {
  const [state, setState] = useState<{ loading: boolean; error?: string; blob?: Blob; url?: string; preview?: any; status?: string }>({ loading: true });
  const [tick, setTick] = useState(0);
  const ext = version.ext;
  useEffect(() => {
    let url: string | undefined; let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    setState({ loading: true });
    (async () => {
      try {
        if (ext === 'pdf' || isImage(ext)) {
          const blob = await getVersionBlob(version.id, version.mime);
          if (isImage(ext)) url = URL.createObjectURL(blob);
          if (!cancelled) setState({ loading: false, blob, url });
          return;
        }
        const p = await getPreview(version.id);
        if (cancelled) return;
        setState({ loading: false, preview: p.preview, status: p.status });
        if (p.status === 'pending') timer = setTimeout(() => setTick((t) => t + 1), 2500);
      } catch (e) { if (!cancelled) setState({ loading: false, error: (e as Error).message }); }
    })();
    return () => { cancelled = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [version.id, tick]);

  const download = async () => { try { saveBlob(await getVersionBlob(version.id, version.mime), `${name.replace(/\.[^.]+$/, '')} v${version.label}.${ext}`); } catch (e) { toast.error((e as Error).message); } };
  let body: React.ReactNode;
  if (state.loading) body = <div style={{ padding: 40 }}><Spinner label="Loading preview…" /></div>;
  else if (state.error) body = <EmptyState icon={<FileQuestion />} title="Preview unavailable" action={<><Button icon={<RefreshCw />} onClick={() => setTick(tick + 1)}>Retry</Button><Button icon={<Download />} onClick={download}>Download</Button></>}>{state.error}</EmptyState>;
  else if (ext === 'pdf' && state.blob) body = <PdfView blob={state.blob} name={name} />;
  else if (state.url) body = <div style={{ padding: 16 }}><img className="preview-img" src={state.url} alt={name} /></div>;
  else if (state.status === 'pending') body = <div style={{ padding: 40 }}><Spinner label="Preparing preview (extracting document text)…" /></div>;
  else {
    const p = state.preview;
    if (p?.kind === 'html') body = <div className="doc-html markdown" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.html) }} />;
    else if (p?.kind === 'markdown') body = <div className="doc-html markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.text) }} />;
    else if (p?.kind === 'text') body = <pre className="doc-html pre mono" style={{ fontSize: 13 }}>{p.text}{p.truncated ? '\n\n… (truncated — download for the full file)' : ''}</pre>;
    else if (p?.kind === 'sheet') body = <SheetView sheets={p.sheets} />;
    else if (p?.kind === 'slides') body = <SlidesView slides={p.slides} />;
    else body = <EmptyState icon={<FileQuestion />} title="No preview for this format" action={<Button variant="primary" icon={<Download />} onClick={download}>Download v{version.label}</Button>}>{['xls', 'ppt'].includes(ext) ? `Legacy .${ext} files can be stored and downloaded but not previewed. Save as .${ext}x for previews.` : 'Download the file to open it in its app.'}</EmptyState>;
  }
  return <div className="preview-stage">{body}</div>;
}

/** Client-side OCR for scanned PDFs/images isn't bundled; text extraction runs on the server. */
export async function reextract(versionId: string) {
  try { await api(`/api/files/versions/${versionId}/reextract`, { method: 'POST' }); toast.success('Re-processing started'); } catch (e) { toast.error((e as Error).message); }
}
export { downloadUrl, ScanText };
