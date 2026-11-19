import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Download, Upload, GitCompare, MoreVertical, Pencil, Trash2, Link2, FolderInput, WifiOff, Wifi, Info, Eye, RefreshCw, FileUp, X, ArrowLeftRight, FileQuestion } from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { versionsOfFile, promptsOf, projectLabel, getProject, parentOf } from '../../lib/data';
import { ACCEPT, queueUpload, validateLocalFile, getVersionBlob, setAvailableOffline, offlineFileIds, getText } from '../../lib/files';
import { useServerSettings } from '../../lib/serverSettings';
import { formatBytes, formatDateTime, timeAgo, saveBlob, useIsMobile, plural, cx } from '../../lib/util';
import { Button, IconButton, Card, CardHead, Field, Input, Textarea, Segmented, Select, Badge, Switch, Spinner, EmptyState, Tabs } from '../../components/ui';
import { ActionMenu, Modal, confirmDialog, promptDialog, toast } from '../../components/overlay';
import { FilePreview, reextract } from '../../components/FilePreview';
import { DiffView, FileGlyph, ExtBadge, isImage } from '../../components/domain';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import { CATEGORY_LABEL, FILE_CATEGORIES, type FileRec, type FileVersion, type FileCategory } from '../../../shared/schema';

const TEXT_DIFFABLE = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'docx', 'doc', 'pdf', 'xlsx', 'pptx']);

async function downloadVersion(f: FileRec, v: FileVersion) {
  try { saveBlob(await getVersionBlob(v.id, v.mime), `${f.name.replace(/\.[^.]+$/, '')} v${v.label}.${v.ext}`); }
  catch (e) { toast.error((e as Error).message); }
}

function AddVersionModal({ file, onClose }: { file: FileRec; onClose: () => void }) {
  const settings = useServerSettings();
  const versions = versionsOfFile(file.id);
  const latest = versions[0];
  const [f, setF] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [bump, setBump] = useState<'minor' | 'major'>('minor');
  const input = useRef<HTMLInputElement>(null);
  const err = f ? validateLocalFile(f, settings.upload_max_mb) : null;
  const nextLabel = latest ? (bump === 'major' ? `${latest.major + 1}.0` : `${latest.major}.${latest.minor + 1}`) : '1.0';
  const submit = async () => {
    if (!f || err) return;
    await queueUpload({ file: f, target_file_id: file.id, note, bump });
    toast.success(navigator.onLine ? `Uploading version ${nextLabel}…` : `Version ${nextLabel} saved on this device — it will upload when you're online`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Add new version of “${file.name}”`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Upload />} disabled={!f || !!err} onClick={submit}>Save as v{nextLabel}</Button></>}>
      <div className="dropzone" onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') input.current?.click(); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setF(e.dataTransfer.files[0]); }}>
        <span className="icon-tile lg"><FileUp /></span>
        {f ? <><div className="strong">{f.name}</div><div className={cx('small', err ? 'danger-text' : 'muted')}>{err ?? formatBytes(f.size)}</div></> : <><div className="strong">Choose the updated file</div><div className="small muted">Previous versions are never overwritten.</div></>}
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => setF(e.target.files?.[0] ?? null)} />
      </div>
      <Field label="Version number">
        <Segmented label="Version bump" value={bump} onChange={setBump} options={[{ value: 'minor', label: `Minor → ${latest ? `${latest.major}.${latest.minor + 1}` : '1.1'}` }, { value: 'major', label: `Major → ${latest ? latest.major + 1 : 2}.0` }]} />
        <span className="hint">Current latest: v{latest?.label ?? '—'}. Use “Major” for a final or substantially rewritten document.</span>
      </Field>
      <Field label="Change description (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated financial section" /></Field>
    </Modal>
  );
}

function EditFileModal({ file, onClose }: { file: FileRec; onClose: () => void }) {
  const [name, setName] = useState(file.name);
  const [description, setDescription] = useState(file.description);
  const [category, setCategory] = useState<FileCategory>(file.category);
  const [promptIds, setPromptIds] = useState<string[]>(file.prompt_ids);
  const prompts = promptsOf(file.project_id);
  return (
    <Modal open onClose={onClose} title="Edit file details" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { store.update('files', file.id, { name: name.trim(), description, category, prompt_ids: promptIds }); toast.success('File details saved'); onClose(); }}>Save</Button></>}>
      <Field label="File name" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
      <Field label="Description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Category"><Segmented label="Category" value={category} onChange={setCategory} options={FILE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} /></Field>
      <Field label="Associated prompts">
        {prompts.length ? <div className="chips" style={{ flexWrap: 'wrap' }}>{prompts.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={promptIds.includes(p.id)} onClick={() => setPromptIds(promptIds.includes(p.id) ? promptIds.filter((x) => x !== p.id) : [...promptIds, p.id])}>{p.title}</button>)}</div> : <span className="small muted">No prompts in this project.</span>}
      </Field>
    </Modal>
  );
}

function MoveFileModal({ file, onClose }: { file: FileRec; onClose: () => void }) {
  const nav = useNavigate();
  const [target, setTarget] = useState(file.project_id);
  const tops = store.all('projects');
  return (
    <Modal open onClose={onClose} title="Move file" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={target === file.project_id} onClick={() => { store.update('files', file.id, { project_id: target, prompt_ids: [] }); toast.success(`Moved to ${projectLabel(target)}`); onClose(); nav(`/p/${target}/file/${file.id}`); }}>Move</Button></>}>
      <Field label="Project or subproject"><Select value={target} onChange={(e) => setTarget(e.target.value)}>{tops.sort((a, b) => projectLabel(a.id).localeCompare(projectLabel(b.id))).map((p) => <option key={p.id} value={p.id}>{projectLabel(p.id)}</option>)}</Select></Field>
    </Modal>
  );
}

export default function FileDetail() {
  useStoreVersion();
  const { base, project } = useWs();
  const { fid } = useParams();
  const nav = useNavigate();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [addVersion, setAddVersion] = useState(false);
  const [edit, setEdit] = useState(false);
  const [move, setMove] = useState(false);
  const [offline, setOffline] = useState(false);
  const [mobileTab, setMobileTab] = useState<'preview' | 'versions' | 'info'>('preview');
  const file = fid ? store.get('files', fid) : undefined;
  const versions = file ? versionsOfFile(file.id) : [];
  const vParam = params.get('v');
  const current = versions.find((v) => v.id === vParam) ?? versions[0];
  usePageMeta(file?.name ?? 'File', `${base}/files/${file?.category ?? 'reference'}`);
  useEffect(() => { if (current) void offlineFileIds().then((s) => setOffline(s.has(current.id))); }, [current?.id]);
  const pendingVersions = [...store.pendingFiles.values()].filter((p) => p.target_file_id === fid);

  if (!file) return <Card><EmptyState icon={<FileQuestion />} title="File not found" action={<Button onClick={() => nav(`${base}/files/reference`)}>Back to files</Button>}>It may have been deleted.</EmptyState></Card>;
  const del = async () => {
    if (!(await confirmDialog({ title: `Delete “${file.name}”?`, message: `The file and all ${plural(file.version_count, 'version')} move to the trash. You can restore them from Settings → Trash.`, danger: true, confirmLabel: 'Move to trash' }))) return;
    store.remove('files', file.id);
    toast.success('Moved to trash');
    nav(`${base}/files/${file.category}`);
  };
  const toggleOffline = async (on: boolean) => {
    try { await setAvailableOffline(versions.map((v) => v.id), on, Object.fromEntries(versions.map((v) => [v.id, v.mime]))); setOffline(on); toast.success(on ? 'All versions saved for offline use (encrypted)' : 'Removed from offline storage'); }
    catch (e) { toast.error((e as Error).message); }
  };
  const proj = getProject(file.project_id); const parent = parentOf(proj);

  const versionList = (
    <Card>
      <CardHead title="Version history" sub={plural(versions.length, 'version')} actions={versions.length > 1 && <Button size="sm" icon={<GitCompare />} onClick={() => nav(`${base}/file/${file.id}/compare`)}>Compare</Button>} />
      <div className="list">
        {pendingVersions.map((p) => <div key={p.versionId} className="list-row"><span className="badge badge-warning">Pending</span><div className="grow"><div className="small">{p.note || 'New version'}</div><div className="tiny muted">{p.status === 'uploading' ? `Uploading ${Math.round(p.progress * 100)}%` : p.status === 'error' ? p.error : 'Waiting for connection'}</div></div></div>)}
        {versions.map((v, i) => (
          <div key={v.id} className={cx('list-row', current?.id === v.id && 'active')}>
            <button className="badge" style={{ border: 0, cursor: 'pointer', background: i === 0 ? 'var(--success-soft)' : undefined, color: i === 0 ? 'var(--success-text)' : undefined }} onClick={() => setParams({ v: v.id })}>v{v.label}</button>
            <div className="grow" style={{ cursor: 'pointer' }} onClick={() => { setParams({ v: v.id }); if (mobile) setMobileTab('preview'); }}>
              <div className="small truncate">{v.note || (i === versions.length - 1 ? 'Initial upload' : 'Updated')}{i === 0 && <span className="tiny success-text"> · Latest</span>}</div>
              <div className="tiny muted">{formatDateTime(v.created_at)} · {formatBytes(v.size)}</div>
            </div>
            <IconButton size="sm" label={`Preview v${v.label}`} icon={<Eye />} onClick={() => { setParams({ v: v.id }); if (mobile) setMobileTab('preview'); }} />
            <IconButton size="sm" label={`Download v${v.label}`} icon={<Download />} onClick={() => downloadVersion(file, v)} />
          </div>
        ))}
      </div>
    </Card>
  );
  const info = (
    <Card>
      <CardHead title="File information" />
      <dl className="card-body col gap-8 small" style={{ margin: 0 }}>
        {[
          ['File name', file.name], ['Original name', current?.original_name], ['Type', <span className="row gap-4"><ExtBadge ext={file.ext} />{file.mime}</span>], ['Size', formatBytes(current?.size ?? file.size)],
          ['Uploaded', formatDateTime(current?.created_at)], ['Category', CATEGORY_LABEL[file.category]],
          ['Project', parent ? <Link to={`/p/${parent.id}`}>{parent.name}</Link> : <Link to={`/p/${proj?.id}`}>{proj?.name}</Link>], ['Subproject', parent ? <Link to={`/p/${proj?.id}`}>{proj?.name}</Link> : '—'],
          ['Description', file.description || '—'], ['Linked prompts', file.prompt_ids.length ? <span className="row row-wrap gap-4">{file.prompt_ids.map((id) => store.get('prompts', id)).filter(Boolean).map((p) => <Link key={p!.id} to={`/p/${p!.project_id}/prompts/${p!.id}`} className="tag">{p!.title}</Link>)}</span> : '—'],
          ['Checksum', <span className="mono tiny" style={{ wordBreak: 'break-all' }}>{current?.sha256?.slice(0, 16)}…</span>],
          ['Text extraction', current?.extract_status === 'done' ? 'Searchable' : current?.extract_status === 'pending' ? 'Processing…' : current?.extract_status === 'error' ? 'Failed' : 'No text found'],
          ['Malware scan', current?.scan_status === 'clean' ? 'Clean' : current?.scan_status === 'skipped' ? 'Not configured' : current?.scan_status || '—'],
        ].map(([k, v], i) => <div key={i} className="row between gap-12" style={{ alignItems: 'flex-start' }}><dt className="muted" style={{ flex: 'none' }}>{k}</dt><dd style={{ margin: 0, textAlign: 'right', minWidth: 0, wordBreak: 'break-word' }}>{v}</dd></div>)}
      </dl>
      <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}><Switch label={offline ? <span className="row gap-4"><WifiOff style={{ width: 15 }} />Available offline</span> : <span className="row gap-4"><Wifi style={{ width: 15 }} />Available offline</span>} hint="Keep an encrypted copy of every version on this device" checked={offline} onChange={toggleOffline} /></div>
    </Card>
  );

  return (
    <div className="col gap-16">
      <div className="row between row-wrap gap-12">
        <div className="row gap-12" style={{ minWidth: 0 }}>
          <FileGlyph ext={file.ext} size={36} />
          <div style={{ minWidth: 0 }}>
            <h2 className="truncate" style={{ fontSize: 19 }}>{file.name}</h2>
            <div className="row gap-4 row-wrap"><Badge tone={file.category === 'output' ? 'primary' : undefined}>{CATEGORY_LABEL[file.category]}</Badge>{current && <Badge tone="success">v{current.label}{current.id === versions[0]?.id ? ' · Latest' : ''}</Badge>}<span className="tiny muted">{timeAgo(file.updated_at)}</span></div>
          </div>
        </div>
        <div className="row row-wrap">
          <Button variant="primary" icon={<Upload />} onClick={() => setAddVersion(true)}>Add New Version</Button>
          {current && <Button icon={<Download />} onClick={() => downloadVersion(file, current)}>{mobile ? '' : 'Download'}</Button>}
          {versions.length > 1 && !mobile && <Button icon={<GitCompare />} onClick={() => nav(`${base}/file/${file.id}/compare`)}>Compare versions</Button>}
          <ActionMenu title={file.name} items={[
            { label: 'Rename', icon: <Pencil />, onClick: async () => { const n = await promptDialog({ title: 'Rename file', label: 'Name', defaultValue: file.name, confirmLabel: 'Rename' }); if (n) store.update('files', file.id, { name: n }); } },
            { label: 'Edit details & linked prompts', icon: <Link2 />, onClick: () => setEdit(true) },
            { label: 'Compare versions', icon: <GitCompare />, onClick: () => nav(`${base}/file/${file.id}/compare`), hidden: versions.length < 2 },
            { label: 'Move to another project', icon: <FolderInput />, onClick: () => setMove(true) },
            { label: 'Re-run text extraction', icon: <RefreshCw />, onClick: () => current && reextract(current.id), hidden: !current },
            { divider: true, label: '' },
            { label: 'Delete file', icon: <Trash2 />, danger: true, onClick: del },
          ]} trigger={(t) => <IconButton label="File actions" icon={<MoreVertical />} {...t} />} />
        </div>
      </div>
      {mobile && <Tabs value={mobileTab} onChange={setMobileTab} tabs={[{ value: 'preview', label: 'Preview' }, { value: 'versions', label: 'Versions', count: versions.length }, { value: 'info', label: 'Info' }]} />}
      {mobile ? (
        <>
          {mobileTab === 'preview' && (current ? <FilePreview key={current.id} version={current} name={file.name} /> : <Spinner label="Waiting for upload…" />)}
          {mobileTab === 'versions' && versionList}
          {mobileTab === 'info' && info}
        </>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }}>
          <div>{current ? <FilePreview key={current.id} version={current} name={file.name} /> : <Card pad><Spinner label="Waiting for upload…" /></Card>}</div>
          <div className="col gap-16">{versionList}{info}</div>
        </div>
      )}
      {addVersion && <AddVersionModal file={file} onClose={() => setAddVersion(false)} />}
      {edit && <EditFileModal file={file} onClose={() => setEdit(false)} />}
      {move && <MoveFileModal file={file} onClose={() => setMove(false)} />}
      <span hidden>{project.id}</span>
    </div>
  );
}

// ---------- Side-by-side comparison ----------
export function FileCompare() {
  useStoreVersion();
  const { base } = useWs();
  const { fid } = useParams();
  const [params, setParams] = useSearchParams();
  const file = fid ? store.get('files', fid) : undefined;
  const versions = file ? versionsOfFile(file.id) : [];
  const a = versions.find((v) => v.id === params.get('a')) ?? versions[1] ?? versions[0];
  const b = versions.find((v) => v.id === params.get('b')) ?? versions[0];
  usePageMeta('Compare versions', `${base}/file/${fid}`);
  const [texts, setTexts] = useState<{ a?: string; b?: string; loading: boolean; error?: string }>({ loading: false });
  const [urls, setUrls] = useState<{ a?: string; b?: string }>({});
  const textual = file && TEXT_DIFFABLE.has(file.ext) && a && b && TEXT_DIFFABLE.has(a.ext) && TEXT_DIFFABLE.has(b.ext);
  const images = a && b && isImage(a.ext) && isImage(b.ext);
  useEffect(() => {
    if (!a || !b || a.id === b.id) return;
    let cancelled = false; const made: string[] = [];
    if (textual) {
      setTexts({ loading: true });
      Promise.all([getText(a.id), getText(b.id)]).then(([ta, tb]) => { if (!cancelled) setTexts({ a: ta.text, b: tb.text, loading: false, error: ta.status === 'pending' || tb.status === 'pending' ? 'Text is still being extracted. Try again in a moment.' : undefined }); })
        .catch((e) => !cancelled && setTexts({ loading: false, error: e.message }));
    } else if (images) {
      Promise.all([getVersionBlob(a.id, a.mime), getVersionBlob(b.id, b.mime)]).then(([ba, bb]) => { if (cancelled) return; const ua = URL.createObjectURL(ba); const ub = URL.createObjectURL(bb); made.push(ua, ub); setUrls({ a: ua, b: ub }); }).catch(() => {});
    }
    return () => { cancelled = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [a?.id, b?.id]);
  const meta = useMemo(() => (v: FileVersion) => <span className="row gap-8 row-wrap"><span className="strong">v{v.label}</span><span className="tiny muted">{formatDateTime(v.created_at)} · {formatBytes(v.size)}</span></span>, []);
  if (!file) return <Card pad>File not found.</Card>;
  if (versions.length < 2) return <Card><EmptyState icon={<GitCompare />} title="Only one version" action={<Link to={`${base}/file/${file.id}`} className="btn btn-primary">Back to file</Link>}>Add a new version to compare.</EmptyState></Card>;
  return (
    <div className="col gap-16">
      <div className="row between row-wrap gap-12">
        <div><Link to={`${base}/file/${file.id}`} className="small muted">← {file.name}</Link><h2>Compare versions</h2></div>
        <div className="row row-wrap gap-8">
          <Select value={a.id} onChange={(e) => setParams({ a: e.target.value, b: b.id })} style={{ width: 'auto' }} aria-label="First version">{versions.map((v) => <option key={v.id} value={v.id}>v{v.label} — {v.note || formatDateTime(v.created_at)}</option>)}</Select>
          <IconButton label="Swap versions" icon={<ArrowLeftRight />} onClick={() => setParams({ a: b.id, b: a.id })} />
          <Select value={b.id} onChange={(e) => setParams({ a: a.id, b: e.target.value })} style={{ width: 'auto' }} aria-label="Second version">{versions.map((v) => <option key={v.id} value={v.id}>v{v.label} — {v.note || formatDateTime(v.created_at)}</option>)}</Select>
        </div>
      </div>
      <div className="alert info"><Info />Comparing never changes either version.</div>
      {a.id === b.id ? <div className="alert warn">Choose two different versions.</div> : textual ? (
        texts.loading ? <Spinner label="Extracting text from both versions…" /> : texts.error ? <div className="alert warn">{texts.error}</div> :
          <Card pad><DiffView before={texts.a ?? ''} after={texts.b ?? ''} beforeLabel={meta(a)} afterLabel={meta(b)} granularity={(texts.a?.length ?? 0) + (texts.b?.length ?? 0) > 60000 ? 'lines' : 'words'} /></Card>
      ) : (
        <div className="diff-cols">
          {[a, b].map((v, i) => (
            <div key={v.id} className="diff-col">
              <div className="diff-col-head">{meta(v)}<Button size="sm" icon={<Download />} onClick={() => downloadVersion(file, v)}>Download</Button></div>
              <div className="diff-col-body col gap-8">
                {images && (i === 0 ? urls.a : urls.b) ? <img className="preview-img" src={i === 0 ? urls.a : urls.b} alt={`Version ${v.label}`} /> : null}
                <div className="small"><span className="muted">Note: </span>{v.note || '—'}</div>
                <div className="small"><span className="muted">File: </span>{v.original_name}</div>
                <div className="small"><span className="muted">Checksum: </span><span className="mono tiny">{v.sha256.slice(0, 20)}…</span></div>
                {!images && <div className="tiny muted">Text comparison is not available for .{v.ext} files.</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { X };
