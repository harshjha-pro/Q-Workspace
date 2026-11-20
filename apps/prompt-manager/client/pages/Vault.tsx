import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Download, ExternalLink, ChevronRight } from 'lucide-react';
import { store, useStoreVersion } from '../lib/store';
import { getProject, parentOf, topProjects } from '../lib/data';
import { getVersionBlob } from '../lib/files';
import { formatBytes, formatDateTime, plural, saveBlob, useIsMobile, useDebounced } from '../lib/util';
import { Card, EmptyState, PageHead, SearchBox, Chip, Select, Switch, Button, IconButton } from '../components/ui';
import { toast } from '../components/overlay';
import { FileGlyph, ProjectIcon } from '../components/domain';
import { usePageMeta } from '../layout/AppShell';
import { CATEGORY_LABEL, FILE_CATEGORIES, type FileCategory, type FileRec, type FileVersion, type Project } from '../../shared/schema';

const TYPE_GROUPS: Record<string, { label: string; exts: string[] }> = {
  pdf: { label: 'PDF', exts: ['pdf'] },
  doc: { label: 'Word', exts: ['doc', 'docx', 'rtf', 'odt'] },
  sheet: { label: 'Spreadsheets', exts: ['xls', 'xlsx', 'csv', 'ods'] },
  slides: { label: 'Presentations', exts: ['ppt', 'pptx', 'odp'] },
  image: { label: 'Images', exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'] },
  text: { label: 'Text & code', exts: ['txt', 'md', 'markdown', 'json', 'html', 'xml'] },
};
type Sort = 'new' | 'old' | 'name' | 'size';
interface Entry { file: FileRec; version: FileVersion; latest: boolean; project: Project | undefined; parent: Project | undefined }

async function download(e: Entry) {
  try { saveBlob(await getVersionBlob(e.version.id, e.version.mime), `${e.file.name.replace(/\.[^.]+$/, '')} v${e.version.label}.${e.version.ext}`); }
  catch (err) { toast.error((err as Error).message); }
}

/** Where an attachment lives: Project › Subproject › Category › File, each a link. */
function Location({ e }: { e: Entry }) {
  const top = e.parent ?? e.project;
  const sub = e.parent ? e.project : undefined;
  if (!e.project) return <span className="tiny faint">Project deleted</span>;
  return (
    <nav className="vault-loc" aria-label="Location">
      <Link to={`/p/${top!.id}`}>{top!.name}</Link>
      {sub && <><ChevronRight aria-hidden /><Link to={`/p/${sub.id}`}>{sub.name}</Link></>}
      <ChevronRight aria-hidden /><Link to={`/p/${e.project.id}/files/${e.file.category}`}>{CATEGORY_LABEL[e.file.category]}</Link>
    </nav>
  );
}

export default function VaultPage() {
  useStoreVersion();
  usePageMeta('Attachment Vault');
  const nav = useNavigate();
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 150).trim().toLowerCase();
  const [project, setProject] = useState('');
  const [cat, setCat] = useState<FileCategory | ''>('');
  const [type, setType] = useState('');
  const [latestOnly, setLatestOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('new');
  const [limit, setLimit] = useState(100);

  const all = useMemo<Entry[]>(() => {
    const files = new Map(store.all('files').map((f) => [f.id, f]));
    const out: Entry[] = [];
    for (const v of store.all('file_versions')) {
      const file = files.get(v.file_id);
      if (!file) continue;
      const p = getProject(file.project_id);
      out.push({ file, version: v, latest: file.latest_version_id ? file.latest_version_id === v.id : false, project: p, parent: parentOf(p) });
    }
    // Fallback when latest_version_id is missing: highest version number per file.
    const best = new Map<string, Entry>();
    for (const e of out) { const b = best.get(e.file.id); if (!b || e.version.major * 1e4 + e.version.minor > b.version.major * 1e4 + b.version.minor) best.set(e.file.id, e); }
    for (const e of out) if (!e.file.latest_version_id) e.latest = best.get(e.file.id) === e;
    return out;
  }, [store.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const exts = type ? new Set(TYPE_GROUPS[type].exts) : null;
    const r = all.filter((e) => {
      if (latestOnly && !e.latest) return false;
      if (cat && e.file.category !== cat) return false;
      if (exts && !exts.has((e.version.ext || e.file.ext).toLowerCase())) return false;
      if (project && e.project?.id !== project && e.parent?.id !== project) return false;
      if (q) {
        const hay = `${e.file.name} ${e.version.original_name} ${e.version.note} ${e.file.description} ${e.file.tags.join(' ')} ${e.project?.name ?? ''} ${e.parent?.name ?? ''}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const cmp: Record<Sort, (a: Entry, b: Entry) => number> = {
      new: (a, b) => b.version.created_at.localeCompare(a.version.created_at),
      old: (a, b) => a.version.created_at.localeCompare(b.version.created_at),
      name: (a, b) => a.file.name.localeCompare(b.file.name) || b.version.major - a.version.major || b.version.minor - a.version.minor,
      size: (a, b) => b.version.size - a.version.size,
    };
    return r.sort(cmp[sort]);
  }, [all, q, project, cat, type, latestOnly, sort]);

  const totalSize = list.reduce((n, e) => n + (e.version.size || 0), 0);
  const fileCount = new Set(list.map((e) => e.file.id)).size;
  const open = (e: Entry) => nav(`/p/${e.file.project_id}/file/${e.file.id}?v=${e.version.id}`);
  const shown = list.slice(0, limit);

  return (
    <>
      <PageHead title="Attachment Vault" sub="Every file and version across all projects, with where it belongs." />
      <Card pad className="col gap-12">
        <div className="row row-wrap gap-8">
          <SearchBox className="grow" value={query} onChange={setQuery} placeholder="Search file name, note, tag or project…" />
          <Select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} style={{ maxWidth: mobile ? undefined : 220, flex: mobile ? '1 1 100%' : undefined }}>
            <option value="">All projects</option>
            {topProjects(true).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select aria-label="File type" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: mobile ? undefined : 170, flex: mobile ? '1 1 45%' : undefined }}>
            <option value="">All types</option>
            {Object.entries(TYPE_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ maxWidth: mobile ? undefined : 150, flex: mobile ? '1 1 45%' : undefined }}>
            <option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name</option><option value="size">Largest</option>
          </Select>
        </div>
        <div className="row row-wrap between gap-8">
          <div className="row row-wrap gap-4">
            <Chip active={!cat} onClick={() => setCat('')}>All categories</Chip>
            {FILE_CATEGORIES.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{CATEGORY_LABEL[c]}</Chip>)}
          </div>
          <Switch label="Latest versions only" checked={latestOnly} onChange={setLatestOnly} />
        </div>
        <div className="tiny muted">{plural(list.length, latestOnly ? 'file' : 'version')}{!latestOnly && ` of ${plural(fileCount, 'file')}`} · {formatBytes(totalSize)}</div>
      </Card>

      <Card className="mt-16">
        {!all.length ? (
          <EmptyState icon={<Archive />} title="No attachments yet">Files you upload to any project’s Reference Files, Additional Files or AI Outputs appear here.</EmptyState>
        ) : !list.length ? (
          <EmptyState icon={<Archive />} title="Nothing matches">Try a different search or clear the filters.</EmptyState>
        ) : mobile ? (
          <div className="list">
            {shown.map((e) => (
              <div key={e.version.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <FileGlyph ext={e.version.ext || e.file.ext} />
                <div className="grow" style={{ cursor: 'pointer' }} onClick={() => open(e)}>
                  <div className="row gap-4"><span className="strong truncate">{e.file.name}</span><VersionBadge e={e} /></div>
                  <Location e={e} />
                  <div className="tiny muted">{formatDateTime(e.version.created_at)} · {formatBytes(e.version.size)}{e.version.note ? ` · ${e.version.note}` : ''}</div>
                </div>
                <IconButton size="sm" label="Download" icon={<Download />} onClick={() => download(e)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead><tr><th>File</th><th>Version</th><th>Belongs to</th><th>Uploaded</th><th>Size</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.version.id}>
                    <td style={{ minWidth: 220 }}>
                      <div className="row gap-8">
                        {e.project && <ProjectIcon project={e.parent ?? e.project} size="sm" />}
                        <FileGlyph ext={e.version.ext || e.file.ext} size={22} />
                        <div style={{ minWidth: 0 }}>
                          <Link className="strong truncate" style={{ color: 'var(--text)', display: 'block' }} to={`/p/${e.file.project_id}/file/${e.file.id}?v=${e.version.id}`}>{e.file.name}</Link>
                          {e.version.note && <div className="tiny muted truncate" style={{ maxWidth: 320 }}>{e.version.note}</div>}
                        </div>
                      </div>
                    </td>
                    <td><VersionBadge e={e} /></td>
                    <td style={{ minWidth: 220 }}><Location e={e} /></td>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.version.created_at)}</td>
                    <td className="small muted num" style={{ whiteSpace: 'nowrap' }}>{formatBytes(e.version.size)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="sm" label="Open" icon={<ExternalLink />} onClick={() => open(e)} />
                      <IconButton size="sm" label="Download" icon={<Download />} onClick={() => download(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length > limit && <div className="card-body row end"><Button onClick={() => setLimit(limit + 100)}>Show more ({list.length - limit} left)</Button></div>}
      </Card>
    </>
  );
}

function VersionBadge({ e }: { e: Entry }) {
  return <span className={e.latest ? 'badge badge-success' : 'badge'}>v{e.version.label}{e.latest ? ' · Latest' : ''}</span>;
}
