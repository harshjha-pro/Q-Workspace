import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Download, FileSpreadsheet, FileJson, FileText, ClipboardPaste, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Copy, ShieldCheck, Library, FolderKanban, RefreshCw, CloudOff, FileUp, ArrowRight } from 'lucide-react';
import { useStoreVersion, store } from '../lib/store';
import { api, apiUrl, downloadUrl, ApiError, uploadParts, getTransferChunk } from '../lib/api';
import { topProjects, projectLabel } from '../lib/data';
import { plural, useIsMobile, useOnline, cx } from '../lib/util';
import { Button, Card, CardHead, Field, Input, Select, Stepper, Segmented, Chip, Textarea, Badge, EmptyState } from '../components/ui';
import { toast } from '../components/overlay';
import { ProjectSelect } from '../components/domain';
import { AiTemplateHelper } from '../components/AiTemplateHelper';
import { usePageMeta } from '../layout/AppShell';

type Fmt = 'csv' | 'xlsx' | 'json';
interface Row { row: number; title: string; content: string; type: 'mandatory' | 'optional'; typeFromFile: boolean; description: string; tags: string[]; collection: string; sequence: number | null; variables: { name: string; required: boolean; declared?: boolean }[]; status: 'ok' | 'error' | 'duplicate'; errors: string[]; warnings: string[]; duplicateOf?: string }
interface Preview { previewId: string; filename: string; destination: string; projectId: string | null; defaultType: string; structureErrors: string[]; rows: Row[]; summary: { total: number; valid: number; duplicates: number; errors: number } }
interface Result { jobId: string; total: number; imported: number; skipped: number; failed: number; duplicates: number; collections: number }

const STEPS = ['Destination', 'Upload', 'Preview', 'Confirm', 'Done'];

export default function BulkImport() {
  useStoreVersion();
  usePageMeta('Bulk import prompts', true);
  const nav = useNavigate();
  const mobile = useIsMobile();
  const online = useOnline();
  const [params] = useSearchParams();
  const destParam = params.get('dest');
  const [step, setStep] = useState(destParam ? 1 : 0);
  const [dest, setDest] = useState<'library' | 'project'>(destParam === 'library' ? 'library' : 'project');
  const [projectId, setProjectId] = useState(destParam && destParam !== 'library' ? destParam : topProjects()[0]?.id ?? '');
  const [fmt, setFmt] = useState<Fmt>('csv');
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [defaultType, setDefaultType] = useState<'mandatory' | 'optional'>('optional');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<number, 'import' | 'skip' | 'rename'>>({});
  const [renames, setRenames] = useState<Record<number, string>>({});
  const [overrides, setOverrides] = useState<Record<number, 'mandatory' | 'optional'>>({});
  const [filter, setFilter] = useState<'all' | 'ok' | 'duplicate' | 'error'>('all');
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (destParam === 'library') setDest('library'); }, [destParam]);

  const destLabel = dest === 'library' ? 'Global Prompt Template Library' : projectLabel(projectId);
  const runPreview = async (overrideType?: 'mandatory' | 'optional') => {
    setBusy(true); setError(null);
    const t = overrideType ?? defaultType;
    try {
      let p: Preview;
      if (mode === 'file') {
        if (!file) throw new Error('Choose a file to upload.');
        if (getTransferChunk()) {
          const up = await uploadParts(file);
          p = await api<Preview>('/api/import/preview', { body: { destination: dest, project_id: projectId, default_type: t, filename: file.name, ...up } });
        } else {
          const form = new FormData();
          form.append('destination', dest); form.append('project_id', projectId); form.append('default_type', t); form.append('file', file);
          p = await api<Preview>('/api/import/preview', { body: form });
        }
      } else {
        if (!paste.trim()) throw new Error('Paste at least one prompt.');
        p = await api<Preview>('/api/import/preview', { body: { destination: dest, project_id: projectId, default_type: t, paste } });
      }
      setPreview(p); setDecisions({}); setRenames({}); setOverrides({});
      setFilter(p.summary.errors || p.summary.duplicates ? 'all' : 'all');
      setStep(2);
    } catch (e) { setError(e instanceof ApiError && e.status === 0 ? 'You are offline. Bulk import needs a connection.' : (e as Error).message); }
    finally { setBusy(false); }
  };
  const decision = (r: Row) => decisions[r.row] ?? (r.status === 'duplicate' ? 'skip' : 'import');
  const counts = useMemo(() => {
    if (!preview) return { imp: 0, skip: 0, err: 0, colls: 0 };
    const importing = preview.rows.filter((r) => r.status !== 'error' && decision(r) !== 'skip');
    return { imp: importing.length, skip: preview.rows.filter((r) => r.status !== 'error' && decision(r) === 'skip').length, err: preview.summary.errors, colls: dest === 'project' ? new Set(importing.map((r) => r.collection.toLowerCase()).filter(Boolean)).size : 0 };
  }, [preview, decisions]);
  const commit = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const r = await api<Result>('/api/import/commit', { body: { previewId: preview.previewId, decisions, renames, overrides: Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, { type: v }])) } });
      setResult(r); setStep(4);
      await store.sync();
      toast.success(`Imported ${plural(r.imported, 'prompt')}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const reset = () => { setStep(1); setFile(null); setPaste(''); setPreview(null); setResult(null); setError(null); };
  const rows = preview?.rows.filter((r) => filter === 'all' || r.status === filter) ?? [];

  return (
    <div className="col gap-16" style={{ maxWidth: 1100 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Bulk import prompts</h1><p className="sub">Download template → fill prompts → upload → preview → confirm.</p></div>
      </div>
      <Card pad><Stepper steps={STEPS} current={step} /></Card>
      {!online && step < 4 && <div className="alert warn"><CloudOff />You are offline. Bulk import validates on the server, so it needs a connection.</div>}
      {error && <div className="alert err" role="alert"><AlertCircle />{error}</div>}

      {step === 0 && (
        <Card>
          <CardHead title="Where should the prompts go?" />
          <div className="card-body col gap-16">
            <div className="radio-cards" style={{ gridTemplateColumns: mobile ? '1fr' : '1fr 1fr' }}>
              <label className="radio-card"><input type="radio" checked={dest === 'project'} onChange={() => setDest('project')} /><span><span className="strong row gap-4"><FolderKanban style={{ width: 16 }} />Project or subproject</span><span className="small muted">Prompts are added to the chosen workspace. Collections and sequences are created automatically.</span></span></label>
              <label className="radio-card"><input type="radio" checked={dest === 'library'} onChange={() => setDest('library')} /><span><span className="strong row gap-4"><Library style={{ width: 16 }} />Global Prompt Template Library</span><span className="small muted">Reusable templates for any project. Collection names become tags.</span></span></label>
            </div>
            {dest === 'project' && (topProjects(true).length ? <Field label="Project or subproject" htmlFor="dest"><ProjectSelect id="dest" value={projectId} onChange={setProjectId} /></Field> : <div className="alert info">Create a project first, or import into the template library.</div>)}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHead title="Upload your file" sub={<>Importing into <span className="strong">{destLabel}</span> · <button className="btn-link" style={{ border: 0, background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }} onClick={() => setStep(0)}>change</button></>} />
          <div className="card-body col gap-16">
            <Field label="1. Get a template (optional)">
              <div className="row row-wrap gap-8">
                <Segmented label="Format" value={fmt} onChange={setFmt} options={[{ value: 'csv', label: 'CSV', icon: <FileText style={{ width: 14 }} /> }, { value: 'xlsx', label: 'Excel', icon: <FileSpreadsheet style={{ width: 14 }} /> }, { value: 'json', label: 'JSON', icon: <FileJson style={{ width: 14 }} /> }]} />
                <Button size="sm" variant="soft" icon={<Download />} onClick={() => downloadUrl(`/api/import/template?kind=simple&format=${fmt}`)}>Simple template</Button>
                <Button size="sm" variant="ghost" icon={<Download />} onClick={() => downloadUrl(`/api/import/template?kind=advanced&format=${fmt}`)}>Advanced template</Button>
              </div>
              <span className="hint">Simple: Prompt Title, Prompt Content, Input 1 Title, Input 2 Title… Advanced adds Prompt Type, Description, Tags, Collection and Sequence.</span>
            </Field>
            <AiTemplateHelper forLibrary={dest === 'library'} onPasteAnswer={() => { setMode('paste'); setTimeout(() => document.getElementById('paste-box')?.focus(), 50); }} />
            <Field label="2. Add your prompts">
              <Segmented label="Input" value={mode} onChange={setMode} options={[{ value: 'file', label: 'Upload file', icon: <Upload style={{ width: 14 }} /> }, { value: 'paste', label: 'Paste multiple prompts', icon: <ClipboardPaste style={{ width: 14 }} /> }]} />
            </Field>
            {mode === 'file' ? (
              <div className={cx('dropzone', over && 'over')} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
                <span className="icon-tile lg"><FileUp /></span>
                {file ? <><div className="strong">{file.name}</div><div className="small muted">{(file.size / 1024).toFixed(1)} KB · tap to choose a different file</div></> : <><div className="strong">Drag & drop your file here</div><div className="small muted">or <span style={{ color: 'var(--primary)', fontWeight: 600 }}>choose file</span> · CSV, Excel (.xlsx) or JSON</div></>}
                <input ref={inputRef} type="file" accept=".csv,.tsv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </div>
            ) : (
              <Field hint={<>Paste the AI’s answer (CSV or JSON, with or without the ``` block), rows copied from a spreadsheet, or prompts separated by a line with <code>---</code> (first line of each block is its title).</>}>
                <Textarea id="paste-box" rows={mobile ? 10 : 12} className="code" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Prompt Title,Prompt Content,Input 1 Title,Input 2 Title\n"Market Research","Conduct detailed market research for {Company name}.","Company name","Industry"'} />
              </Field>
            )}
            <Field label="3. Default classification" hint="Applied to prompts that don’t specify a Prompt Type.">
              <Segmented label="Default classification" value={defaultType} onChange={setDefaultType} options={[{ value: 'mandatory', label: 'Mandatory' }, { value: 'optional', label: 'Optional' }]} />
            </Field>
            <div className="alert ok"><ShieldCheck />Existing prompts are never overwritten. Duplicates are shown for review before anything is imported.</div>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <Card>
          <CardHead title={`Preview · ${preview.filename}`} sub={`${plural(preview.summary.total, 'record')} detected`} actions={<Segmented label="Default classification" value={defaultType} onChange={(t) => { setDefaultType(t); void runPreview(t); }} options={[{ value: 'mandatory', label: 'Default: Mandatory' }, { value: 'optional', label: 'Default: Optional' }]} />} />
          {preview.structureErrors.length > 0 && <div className="card-body">{preview.structureErrors.map((e, i) => <div key={i} className="alert err mt-4"><AlertCircle />{e}</div>)}</div>}
          {preview.rows.length > 0 && (
            <>
              <div className="card-body chips" style={{ paddingBottom: 0 }}>
                <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All ({preview.summary.total})</Chip>
                <Chip active={filter === 'ok'} onClick={() => setFilter('ok')} icon={<CheckCircle2 />}>Valid ({preview.summary.valid})</Chip>
                <Chip active={filter === 'duplicate'} onClick={() => setFilter('duplicate')} icon={<Copy />}>Duplicates ({preview.summary.duplicates})</Chip>
                <Chip active={filter === 'error'} onClick={() => setFilter('error')} icon={<AlertCircle />}>Errors ({preview.summary.errors})</Chip>
              </div>
              <div className="card-body">
                {mobile ? (
                  <div className="col gap-8">
                    {rows.map((r) => (
                      <div key={r.row} className="card" style={{ padding: 12, borderColor: r.status === 'error' ? 'var(--danger)' : r.status === 'duplicate' ? 'var(--warning)' : undefined }}>
                        <div className="row between"><span className="tiny muted">Row {r.row}</span><RowStatus r={r} /></div>
                        <div className="strong mt-4">{r.title || <span className="danger-text">(no title)</span>}</div>
                        <div className="small muted clamp-2 pre">{r.content}</div>
                        <div className="row row-wrap gap-4 mt-8"><TypeCell r={r} value={overrides[r.row] ?? r.type} onChange={(t) => setOverrides({ ...overrides, [r.row]: t })} />{r.collection && <span className="tag">{r.collection}{r.sequence ? ` #${r.sequence}` : ''}</span>}{r.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
                        <RowMessages r={r} />
                        {r.status === 'duplicate' && <DupControl r={r} d={decision(r)} set={(d) => setDecisions({ ...decisions, [r.row]: d })} rename={renames[r.row] ?? `${r.title} (imported)`} setRename={(v) => setRenames({ ...renames, [r.row]: v })} />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="table-wrap" style={{ maxHeight: '60vh' }}>
                    <table className="table">
                      <thead><tr><th>Row</th><th>Status</th><th>Prompt title</th><th>Content</th><th>Type</th><th>Tags</th><th>Collection</th><th>Seq.</th><th>Inputs</th></tr></thead>
                      <tbody>{rows.map((r) => (
                        <tr key={r.row} className={r.status === 'error' ? 'row-error' : r.status === 'duplicate' ? 'row-dup' : ''}>
                          <td className="num muted">{r.row}</td>
                          <td style={{ minWidth: 190 }}><RowStatus r={r} /><RowMessages r={r} />{r.status === 'duplicate' && <DupControl r={r} d={decision(r)} set={(d) => setDecisions({ ...decisions, [r.row]: d })} rename={renames[r.row] ?? `${r.title} (imported)`} setRename={(v) => setRenames({ ...renames, [r.row]: v })} />}</td>
                          <td style={{ minWidth: 160 }} className="strong">{r.title || <span className="danger-text">—</span>}</td>
                          <td style={{ minWidth: 260, maxWidth: 380 }}><div className="pre small clamp-2" title={r.content}>{r.content || <span className="danger-text">—</span>}</div></td>
                          <td><TypeCell r={r} value={overrides[r.row] ?? r.type} onChange={(t) => setOverrides({ ...overrides, [r.row]: t })} /></td>
                          <td>{r.tags.join(', ')}</td><td>{r.collection}</td><td className="num">{r.sequence ?? ''}</td>
                          <td className="mono tiny">{r.variables.map((v) => v.name + (v.required ? '' : '?')).join(', ')}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {step === 3 && preview && (
        <Card>
          <CardHead title="Confirm import" sub={`Into ${destLabel}`} />
          <div className="card-body col gap-16">
            <div className="grid grid-stats">
              <SummaryStat label="Records detected" value={preview.summary.total} />
              <SummaryStat label="Will be imported" value={counts.imp} tone="success" />
              <SummaryStat label="Skipped duplicates" value={counts.skip} tone="warning" />
              <SummaryStat label="Rejected (errors)" value={counts.err} tone="danger" />
              {dest === 'project' && <SummaryStat label="Collections" value={counts.colls} />}
            </div>
            {counts.err > 0 && <div className="alert warn"><AlertCircle />{plural(counts.err, 'record')} with errors will not be imported. You can download an error report afterwards.</div>}
            <div className="alert ok"><ShieldCheck />No existing prompt will be changed or overwritten.</div>
          </div>
        </Card>
      )}

      {step === 4 && result && (
        <Card>
          <div className="card-body">
            <EmptyState icon={<CheckCircle2 />} title={`Imported ${plural(result.imported, 'prompt')}`}>{result.collections ? `${plural(result.collections, 'collection')} created or updated with sequences.` : 'Your prompts are ready to use.'}</EmptyState>
            <div className="grid grid-stats">
              <SummaryStat label="Total records" value={result.total} />
              <SummaryStat label="Imported" value={result.imported} tone="success" />
              <SummaryStat label="Skipped" value={result.skipped} tone="warning" />
              <SummaryStat label="Failed" value={result.failed} tone="danger" />
              <SummaryStat label="Duplicates found" value={result.duplicates} />
            </div>
            <div className="row row-wrap mt-16" style={{ justifyContent: 'center' }}>
              {(result.failed > 0 || result.skipped > 0) && <Button icon={<Download />} onClick={() => downloadUrl(`/api/import/${result.jobId}/error-report`)}>Download error report</Button>}
              <Button icon={<RefreshCw />} onClick={reset}>Import more</Button>
              <Button variant="primary" icon={<ArrowRight />} onClick={() => nav(dest === 'library' ? '/library' : `/p/${projectId}/prompts`)}>{dest === 'library' ? 'Open library' : 'View prompts'}</Button>
            </div>
          </div>
        </Card>
      )}

      {step < 4 && (
        <div className="sticky-actions">
          {step > 0 ? <Button icon={<ChevronLeft />} onClick={() => setStep(step - 1)}>Back</Button> : <Button onClick={() => nav(-1)}>Cancel</Button>}
          <div className="grow" />
          {step === 0 && <Button variant="primary" icon={<ChevronRight />} disabled={dest === 'project' && !projectId} onClick={() => setStep(1)}>Next</Button>}
          {step === 1 && <Button variant="primary" icon={<ChevronRight />} loading={busy} disabled={!online || (mode === 'file' ? !file : !paste.trim())} onClick={() => runPreview()}>Preview</Button>}
          {step === 2 && <Button variant="primary" icon={<ChevronRight />} disabled={!preview?.rows.some((r) => r.status !== 'error')} onClick={() => setStep(3)}>Review summary</Button>}
          {step === 3 && <Button variant="primary" icon={<CheckCircle2 />} loading={busy} disabled={!counts.imp || !online} onClick={commit}>Import {plural(counts.imp, 'prompt')}</Button>}
        </div>
      )}
    </div>
  );
}

function RowStatus({ r }: { r: Row }) {
  return r.status === 'ok' ? <Badge tone="success">Valid</Badge> : r.status === 'duplicate' ? <Badge tone="warning">Duplicate</Badge> : <Badge tone="danger">Error</Badge>;
}
function RowMessages({ r }: { r: Row }) {
  return <>{r.errors.map((e, i) => <div key={i} className="tiny danger-text mt-4">{e}</div>)}{r.duplicateOf && <div className="tiny warning-text mt-4">{r.duplicateOf}</div>}{r.warnings.map((w, i) => <div key={i} className="tiny muted mt-4">⚠ {w}</div>)}</>;
}
function TypeCell({ r, value, onChange }: { r: Row; value: 'mandatory' | 'optional'; onChange: (t: 'mandatory' | 'optional') => void }) {
  if (r.status === 'error') return <span className="tiny muted">—</span>;
  return <Select value={value} onChange={(e) => onChange(e.target.value as 'mandatory' | 'optional')} style={{ height: 30, width: 'auto', fontSize: 12.5, paddingRight: 28 }} aria-label={`Classification for row ${r.row}`}><option value="mandatory">Mandatory</option><option value="optional">Optional</option></Select>;
}
function DupControl({ r, d, set, rename, setRename }: { r: Row; d: string; set: (d: 'import' | 'skip' | 'rename') => void; rename: string; setRename: (v: string) => void }) {
  return (
    <div className="col gap-4 mt-8">
      <Select value={d} onChange={(e) => set(e.target.value as 'import' | 'skip' | 'rename')} style={{ height: 30, fontSize: 12.5 }} aria-label={`Duplicate handling for row ${r.row}`}><option value="skip">Skip</option><option value="import">Import anyway</option><option value="rename">Import with new title</option></Select>
      {d === 'rename' && <Input value={rename} onChange={(e) => setRename(e.target.value)} style={{ height: 30, fontSize: 12.5 }} aria-label="New title" />}
    </div>
  );
}
function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' | 'danger' }) {
  return <div className="card stat"><span className={cx('stat-value', tone && `${tone}-text`)}>{value.toLocaleString()}</span><span className="stat-label">{label}</span></div>;
}

export { apiUrl, Input };
