import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Upload, Plus, LayoutGrid, LayoutList, X, CloudOff, AlertCircle, RefreshCw, Trash2, BookMarked, Paperclip, Bot, FileUp } from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { filesOf, promptsOf, type FileView } from '../../lib/data';
import { ACCEPT, queueUpload, validateLocalFile, retryUpload, cancelUpload } from '../../lib/files';
import { useServerSettings } from '../../lib/serverSettings';
import { formatBytes, timeAgo, matches, plural, useIsMobile, cx } from '../../lib/util';
import { Button, IconButton, Card, EmptyState, SearchBox, Segmented, Field, Input, Textarea, Badge, Tabs } from '../../components/ui';
import { Modal, toast } from '../../components/overlay';
import { FileGlyph, ExtBadge } from '../../components/domain';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import { CATEGORY_LABEL, FILE_CATEGORIES, type FileCategory } from '../../../shared/schema';

const DESC: Record<FileCategory, string> = {
  reference: 'Permanent reference material — background documents, research papers, guidelines, existing reports.',
  additional: 'Supporting attachments for specific tasks — extra instructions, new research, spreadsheets, images.',
  output: 'Documents generated with external AI tools. Every output keeps a complete version history.',
};
const ICON: Record<FileCategory, React.ReactNode> = { reference: <BookMarked />, additional: <Paperclip />, output: <Bot /> };

export function UploadModal({ projectId, category: initialCat, onClose }: { projectId: string; category: FileCategory; onClose: () => void }) {
  const settings = useServerSettings();
  const [files, setFiles] = useState<{ file: File; name: string; error: string | null }[]>([]);
  const [category, setCategory] = useState<FileCategory>(initialCat);
  const [description, setDescription] = useState('');
  const [promptIds, setPromptIds] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const prompts = promptsOf(projectId);
  const add = (list: FileList | File[]) => {
    const next = [...files];
    for (const f of Array.from(list)) next.push({ file: f, name: f.name, error: validateLocalFile(f, settings.upload_max_mb) });
    setFiles(next);
  };
  const valid = files.filter((f) => !f.error);
  const submit = async () => {
    for (const f of valid) await queueUpload({ file: f.file, name: f.name, project_id: projectId, category, description, prompt_ids: promptIds });
    toast.success(navigator.onLine ? `Uploading ${plural(valid.length, 'file')}…` : `${plural(valid.length, 'file')} saved on this device — will upload when you're back online`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Upload files" size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Upload />} disabled={!valid.length} onClick={submit}>Upload {valid.length || ''}</Button></>}>
      <div className={cx('dropzone', over && 'over')} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
        <span className="icon-tile lg"><FileUp /></span>
        <div className="strong">Drag & drop files here, or tap to choose</div>
        <div className="small muted">PDF, Word, Excel, PowerPoint, TXT, Markdown, CSV, JSON, JPG, PNG, WEBP · up to {settings.upload_max_mb} MB each</div>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <div className="card list">
          {files.map((f, i) => (
            <div key={i} className="list-row">
              <FileGlyph ext={f.file.name.split('.').pop()!.toLowerCase()} size={24} />
              <div className="grow">
                <Input value={f.name} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="File name" style={{ height: 34 }} />
                <div className={cx('tiny mt-4', f.error ? 'danger-text' : 'muted')}>{f.error ?? formatBytes(f.file.size)}</div>
              </div>
              <IconButton size="sm" label="Remove" icon={<X />} onClick={() => setFiles(files.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      )}
      <Field label="Category">
        <Segmented label="Category" value={category} onChange={setCategory} options={FILE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        <span className="hint">{DESC[category]}</span>
      </Field>
      <Field label="Description (applies to all files)"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this file for?" /></Field>
      {prompts.length > 0 && (
        <Field label="Associate with prompts (optional)">
          <div className="chips" style={{ flexWrap: 'wrap' }}>{prompts.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={promptIds.includes(p.id)} onClick={() => setPromptIds(promptIds.includes(p.id) ? promptIds.filter((x) => x !== p.id) : [...promptIds, p.id])}>{p.title}</button>)}</div>
        </Field>
      )}
      {!navigator.onLine && <div className="alert warn"><CloudOff />You are offline. Files are stored encrypted on this device and upload automatically when you reconnect.</div>}
    </Modal>
  );
}

export function FileCard({ f, base }: { f: FileView; base: string }) {
  const inner = (
    <>
      <div className="ficon"><FileGlyph ext={f.ext} size={36} /></div>
      <div className="col gap-4" style={{ minWidth: 0 }}>
        <div className="row gap-4" style={{ minWidth: 0 }}><ExtBadge ext={f.ext} /><span className="truncate small strong" style={{ fontWeight: 500 }}>{f.name}</span></div>
        <div className="tiny muted">{formatBytes(f.size)} · {timeAgo(f.updated_at)}</div>
        {f._pending ? (f._status === 'error' ? <span className="tiny danger-text">{f._error}</span> : <span className="tiny warning-text">{f._status === 'uploading' ? `Uploading ${Math.round((f._progress || 0) * 100)}%` : 'Waiting to upload'}</span>)
          : f.version_count > 1 || f.category === 'output' ? <span className="tiny"><Badge tone={f.category === 'output' ? 'primary' : undefined}>v{store.get('file_versions', f.latest_version_id)?.label ?? '1.0'} · {plural(f.version_count, 'version')}</Badge></span> : null}
      </div>
    </>
  );
  return f._pending ? <div className="file-card" aria-busy>{inner}</div> : <Link to={`${base}/file/${f.id}`} className="file-card">{inner}</Link>;
}

export default function FilesTab() {
  useStoreVersion();
  const { project, base } = useWs();
  const { category: catParam } = useParams();
  const category = (FILE_CATEGORIES.includes(catParam as FileCategory) ? catParam : 'reference') as FileCategory;
  const nav = useNavigate();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [uploading, setUploading] = useState(params.get('upload') === '1');
  usePageMeta(`${project.name} · ${CATEGORY_LABEL[category]}`, base);
  useEffect(() => { if (params.get('upload')) { params.delete('upload'); setParams(params, { replace: true }); } }, []);
  const files = filesOf(project.id, category).filter((f) => matches(q, f.name, f.description));
  const pending = [...store.pendingFiles.values()].filter((p) => p.project_id === project.id || (p.target_file_id && store.get('files', p.target_file_id)?.project_id === project.id));
  return (
    <>
      {mobile && <div style={{ marginBottom: 12 }}><Tabs value={category} onChange={(c) => nav(`${base}/files/${c}`)} tabs={FILE_CATEGORIES.map((c) => ({ value: c, label: c === 'output' ? 'AI Outputs' : c === 'reference' ? 'Reference' : 'Additional', count: filesOf(project.id, c).length }))} /></div>}
      <div className="row between row-wrap gap-12" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}><h2 className="row gap-8">{ICON[category]}{CATEGORY_LABEL[category]}</h2><p className="small muted">{DESC[category]}</p></div>
        {!mobile && <Button variant="primary" icon={<Upload />} onClick={() => setUploading(true)}>Upload {category === 'output' ? 'AI output' : 'files'}</Button>}
      </div>
      <div className="row gap-8" style={{ marginBottom: 16 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search by file name or description…" className="grow" />
        {!mobile && <Segmented label="View" value={view} onChange={setView} options={[{ value: 'grid', label: '', icon: <LayoutGrid style={{ width: 16 }} /> }, { value: 'list', label: '', icon: <LayoutList style={{ width: 16 }} /> }]} />}
      </div>
      {pending.filter((p) => p.status === 'error').map((p) => (
        <div key={p.versionId} className="alert err" style={{ marginBottom: 12 }}><AlertCircle /><span className="grow">{p.name}: {p.error}</span><Button size="sm" icon={<RefreshCw />} onClick={() => retryUpload(p.versionId)}>Retry</Button><IconButton size="sm" label="Discard" icon={<Trash2 />} onClick={() => cancelUpload(p.versionId)} /></div>
      ))}
      {!files.length ? (
        <Card><EmptyState icon={ICON[category]} title={q ? 'No matching files' : `No ${CATEGORY_LABEL[category].toLowerCase()} yet`} action={!q && <Button variant="primary" icon={<Upload />} onClick={() => setUploading(true)}>Upload</Button>}>{q ? 'Try a different search.' : category === 'output' ? 'Run a prompt in your AI tool, download the result, and upload it here. Add new versions as it evolves.' : DESC[category]}</EmptyState></Card>
      ) : view === 'grid' || mobile ? (
        mobile ? (
          <Card><div className="list">{files.map((f) => (
            <Link key={f.id} to={f._pending ? '#' : `${base}/file/${f.id}`} className="list-row" onClick={(e) => f._pending && e.preventDefault()}>
              <FileGlyph ext={f.ext} size={30} />
              <div className="grow"><div className="truncate strong" style={{ fontWeight: 500 }}>{f.name}</div><div className="meta">{formatBytes(f.size)} · {f._pending ? (f._status === 'uploading' ? `Uploading ${Math.round((f._progress || 0) * 100)}%` : f._status === 'error' ? 'Failed' : 'Waiting to upload') : `${timeAgo(f.updated_at)}${f.version_count > 1 ? ` · v${store.get('file_versions', f.latest_version_id)?.label}` : ''}`}</div></div>
            </Link>
          ))}</div></Card>
        ) : <div className="file-grid">{files.map((f) => <FileCard key={f.id} f={f} base={base} />)}</div>
      ) : (
        <Card>
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Versions</th><th>Updated</th><th>Description</th></tr></thead>
              <tbody>{files.map((f) => (
                <tr key={f.id} style={{ cursor: f._pending ? 'default' : 'pointer' }} onClick={() => !f._pending && nav(`${base}/file/${f.id}`)}>
                  <td><span className="row gap-8"><FileGlyph ext={f.ext} size={18} /><span className="truncate" style={{ maxWidth: 280 }}>{f.name}</span></span></td>
                  <td><ExtBadge ext={f.ext} /></td><td className="num">{formatBytes(f.size)}</td>
                  <td>{f._pending ? <span className="warning-text tiny">Pending upload</span> : `v${store.get('file_versions', f.latest_version_id)?.label ?? '—'} (${f.version_count})`}</td>
                  <td className="muted">{timeAgo(f.updated_at)}</td><td className="muted truncate" style={{ maxWidth: 260 }}>{f.description}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
      {mobile && <button className="fab" aria-label="Upload files" onClick={() => setUploading(true)}><Plus /></button>}
      {uploading && <UploadModal projectId={project.id} category={category} onClose={() => setUploading(false)} />}
    </>
  );
}

export { Input };
