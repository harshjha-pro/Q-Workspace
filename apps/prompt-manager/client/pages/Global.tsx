import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, FolderKanban, FileText, Library, ListOrdered, Files, StickyNote, CheckSquare, Star, Pin, CloudOff, SlidersHorizontal, PlayCircle } from 'lucide-react';
import { store, useStoreVersion } from '../lib/store';
import { api } from '../lib/api';
import { projectLabel, getProject, parentOf, projectCounts, taskProgress, collectionsOf, topProjects } from '../lib/data';
import { useDebounced, useOnline, timeAgo, plural, useIsMobile, formatDate } from '../lib/util';
import { Card, CardHead, EmptyState, PageHead, SearchBox, Chip, Field, Input, Select, Button, StatusBadge, ProgressBar, FavStar, Spinner } from '../components/ui';
import { Modal } from '../components/overlay';
import { ProjectIcon, ProjectSelect, FileGlyph } from '../components/domain';
import { collectionState } from './workspace/Collections';
import { usePageMeta } from '../layout/AppShell';
import { CATEGORY_LABEL, type FileCategory } from '../../shared/schema';

type Kind = 'project' | 'prompt' | 'template' | 'collection' | 'file' | 'note' | 'task';
interface Hit { kind: Kind; ref_id: string; project_id: string | null; updated_at: string; title: string; title_snip?: string; snip?: string }
const KINDS: { value: Kind; label: string; icon: ReactNode }[] = [
  { value: 'project', label: 'Projects', icon: <FolderKanban /> }, { value: 'prompt', label: 'Prompts', icon: <FileText /> }, { value: 'template', label: 'Templates', icon: <Library /> },
  { value: 'collection', label: 'Collections', icon: <ListOrdered /> }, { value: 'file', label: 'Files & AI outputs', icon: <Files /> }, { value: 'note', label: 'Notes', icon: <StickyNote /> }, { value: 'task', label: 'Tasks', icon: <CheckSquare /> },
];
const ICON = Object.fromEntries(KINDS.map((k) => [k.value, k.icon])) as Record<Kind, ReactNode>;

function linkFor(h: Hit) {
  switch (h.kind) {
    case 'project': return `/p/${h.ref_id}`;
    case 'prompt': return `/p/${h.project_id}/prompts/${h.ref_id}`;
    case 'template': return `/library/${h.ref_id}`;
    case 'collection': return `/p/${h.project_id}/collections/${h.ref_id}`;
    case 'file': return `/p/${h.project_id}/file/${h.ref_id}`;
    case 'note': return `/p/${h.project_id}/notes?note=${h.ref_id}`;
    case 'task': return `/p/${h.project_id}/tasks`;
  }
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return <>{parts.map((p, i) => (p.startsWith('[[') ? <mark key={i} className="hl">{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>))}</>;
}

/** Offline fallback: search the local replica (metadata, prompts, notes — not document contents). */
function localSearch(q: string, kinds: Kind[], projectId: string, category: string, from: string, to: string): Hit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const projectIds = projectId ? new Set([projectId, ...store.all('projects').filter((p) => p.parent_id === projectId).map((p) => p.id)]) : null;
  const out: Hit[] = [];
  const snip = (body: string) => {
    const lower = body.toLowerCase(); const i = lower.indexOf(terms[0]);
    if (i < 0) return body.slice(0, 160);
    const s = Math.max(0, i - 60); const seg = body.slice(s, i + 100);
    return (s ? '…' : '') + terms.reduce((acc, t) => acc.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), (m) => `[[${m}]]`), seg) + '…';
  };
  const test = (kind: Kind, id: string, pid: string | null, title: string, body: string, updated: string) => {
    if (kinds.length && !kinds.includes(kind)) return;
    if (projectIds && (!pid || !projectIds.has(pid))) return;
    if (from && updated < from) return;
    if (to && updated > to + 'T23:59:59') return;
    const hay = (title + ' ' + body).toLowerCase();
    if (terms.every((t) => hay.includes(t))) out.push({ kind, ref_id: id, project_id: pid, updated_at: updated, title, snip: snip(body || title) });
  };
  for (const p of store.all('projects')) test('project', p.id, p.id, p.name, `${p.description} ${p.tags.join(' ')}`, p.updated_at);
  for (const p of store.all('prompts')) test('prompt', p.id, p.project_id, p.title, `${p.content} ${p.description} ${p.tags.join(' ')}`, p.updated_at);
  for (const t of store.all('templates')) test('template', t.id, null, t.title, `${t.content} ${t.description} ${t.tags.join(' ')}`, t.updated_at);
  for (const c of store.all('collections')) test('collection', c.id, c.project_id, c.name, c.description, c.updated_at);
  for (const f of store.all('files')) if (!category || f.category === category) test('file', f.id, f.project_id, f.name, f.description, f.updated_at);
  for (const n of store.all('notes')) test('note', n.id, n.project_id, n.title, n.body, n.updated_at);
  for (const t of store.all('tasks')) test('task', t.id, t.project_id, t.title, t.description, t.updated_at);
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 200);
}

export function SearchPage() {
  useStoreVersion();
  usePageMeta('Search');
  const online = useOnline();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const kinds = (params.get('kinds') || '').split(',').filter(Boolean) as Kind[];
  const projectId = params.get('project') || '';
  const category = params.get('category') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const dq = useDebounced(q, 250);
  const [res, setRes] = useState<{ hits: Hit[]; total: number; mode: 'server' | 'local'; loading: boolean; error?: string }>({ hits: [], total: 0, mode: 'server', loading: false });
  const [limit, setLimit] = useState(30);
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  useEffect(() => { setParam('q', dq); }, [dq]);
  useEffect(() => {
    if (!dq.trim()) { setRes({ hits: [], total: 0, mode: 'server', loading: false }); return; }
    let cancelled = false;
    const local = () => { const hits = localSearch(dq, kinds, projectId, category, from, to); setRes({ hits, total: hits.length, mode: 'local', loading: false }); };
    if (!online) { local(); return; }
    setRes((r) => ({ ...r, loading: true }));
    const qs = new URLSearchParams({ q: dq, limit: String(limit) });
    if (kinds.length) qs.set('kinds', kinds.join(','));
    if (projectId) qs.set('project', projectId);
    if (category) { qs.set('category', category); }
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api<{ total: number; results: Hit[] }>(`/api/search?${qs}`).then((r) => { if (!cancelled) setRes({ hits: r.results, total: r.total, mode: 'server', loading: false }); }).catch(() => { if (!cancelled) local(); });
    return () => { cancelled = true; };
  }, [dq, params.toString(), online, limit, store.version]);
  const toggleKind = (k: Kind) => setParam('kinds', (kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]).join(','));
  const nFilters = [projectId, category, from, to].filter(Boolean).length;
  const filters = (
    <div className="col gap-12">
      <Field label="Project / subproject"><ProjectSelect value={projectId} onChange={(v) => setParam('project', v)} includeEmpty="All projects" /></Field>
      <Field label="File category"><Select value={category} onChange={(e) => { setParam('category', e.target.value); if (e.target.value && !kinds.includes('file')) setParam('kinds', 'file'); }}><option value="">Any</option>{(['reference', 'additional', 'output'] as FileCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</Select></Field>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Modified from"><Input type="date" value={from} onChange={(e) => setParam('from', e.target.value)} /></Field>
        <Field label="to"><Input type="date" value={to} onChange={(e) => setParam('to', e.target.value)} /></Field>
      </div>
    </div>
  );
  return (
    <>
      <PageHead title="Search everything" sub="Projects, prompts, templates, collections, notes, tasks — and the text inside your documents and AI outputs." />
      <div className="row gap-8">
        <SearchBox value={q} onChange={setQ} placeholder="Search…" autoFocus className="grow" />
        {mobile && <Button icon={<SlidersHorizontal />} onClick={() => setFiltersOpen(true)}>{nFilters ? `(${nFilters})` : ''}</Button>}
      </div>
      <div className="chips mt-12">{KINDS.map((k) => <Chip key={k.value} active={kinds.includes(k.value)} onClick={() => toggleKind(k.value)} icon={k.icon}>{k.label}</Chip>)}</div>
      <div className={mobile ? 'mt-16' : 'split mt-16'} style={mobile ? undefined : { gridTemplateColumns: 'minmax(0, 1fr) 260px' }}>
        <div className="col gap-12">
          {res.mode === 'local' && dq && <div className="alert warn"><CloudOff />Offline search: names, prompts, notes and descriptions on this device. Document contents are searched when you’re online.</div>}
          {!dq ? <Card><EmptyState icon={<SearchIcon />} title="What are you looking for?">Search across all projects, including text inside PDFs, Word documents, spreadsheets and AI outputs.</EmptyState></Card>
            : res.loading && !res.hits.length ? <Card pad><Spinner label="Searching…" /></Card>
            : !res.hits.length ? <Card><EmptyState icon={<SearchIcon />} title={`No results for “${dq}”`}>Try fewer words or remove filters.</EmptyState></Card>
            : (
              <Card>
                <CardHead title={`${plural(res.total, 'result')}`} sub={res.mode === 'server' ? 'Full-text search' : 'Searched on this device'} />
                <div className="list">
                  {res.hits.map((h) => {
                    const p = h.project_id ? getProject(h.project_id) : undefined; const parent = parentOf(p);
                    const file = h.kind === 'file' ? store.get('files', h.ref_id) : undefined;
                    return (
                      <Link key={h.kind + h.ref_id} to={linkFor(h)} className="list-row" style={{ alignItems: 'flex-start' }}>
                        <span className="icon-tile sm tone-slate">{file ? <FileGlyph ext={file.ext} size={16} /> : ICON[h.kind]}</span>
                        <div className="grow col gap-4">
                          <div className="strong truncate"><Highlight text={h.title_snip || h.title} /></div>
                          {h.snip && <div className="small muted clamp-2"><Highlight text={h.snip} /></div>}
                          <div className="row gap-8 tiny faint row-wrap"><span className="badge">{h.kind === 'file' && file ? CATEGORY_LABEL[file.category] : KINDS.find((k) => k.value === h.kind)?.label.replace(/s$/, '')}</span>{p && <span>{parent ? `${parent.name} › ${p.name}` : p.name}</span>}<span>{timeAgo(h.updated_at)}</span></div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {res.total > res.hits.length && res.mode === 'server' && <div className="card-body"><Button block onClick={() => setLimit(limit + 30)}>Load more</Button></div>}
              </Card>
            )}
        </div>
        {!mobile && <Card pad className="col gap-12" style={{ alignSelf: 'start' }}><h3>Filters</h3>{filters}{nFilters > 0 && <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams({ q }), { replace: true })}>Clear filters</Button>}</Card>}
      </div>
      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Search filters" footer={<><Button onClick={() => { setParams(new URLSearchParams({ q }), { replace: true }); setFiltersOpen(false); }}>Clear</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>Show results</Button></>}>{filters}</Modal>
    </>
  );
}

export function FavouritesPage() {
  useStoreVersion();
  usePageMeta('Favourites & pinned');
  const all = store.all('projects').filter((p) => !p.archived);
  const fav = all.filter((p) => p.favourite);
  const pinned = all.filter((p) => p.pinned);
  const tpl = store.all('templates').filter((t) => t.favourite);
  const row = (p: typeof all[number]) => {
    const t = taskProgress(p.id, !p.parent_id); const c = projectCounts(p.id);
    return (
      <Link key={p.id} to={`/p/${p.id}`} className="list-row">
        <ProjectIcon project={p} size="sm" />
        <div className="grow"><div className="strong truncate">{p.name}</div><div className="meta truncate">{p.parent_id ? `Subproject of ${parentOf(p)?.name}` : plural(c.subprojects, 'subproject')} · {plural(c.prompts, 'prompt')}{t.total ? ` · ${t.pct}% tasks` : ''}</div></div>
        <StatusBadge status={p.status} />
        <span onClick={(e) => e.preventDefault()}><FavStar on={p.favourite} onToggle={() => store.update('projects', p.id, { favourite: !p.favourite })} /></span>
      </Link>
    );
  };
  return (
    <>
      <PageHead title="Favourites & pinned" sub="Quick access to the work you use most." />
      <div className="grid grid-2">
        <Card><CardHead title={<span className="row gap-4"><Star style={{ width: 16 }} className="star" />Favourite projects & subprojects</span>} />{fav.length ? <div className="list">{fav.map(row)}</div> : <p className="card-body small muted">Tap the star on any project or subproject.</p>}</Card>
        <Card><CardHead title={<span className="row gap-4"><Pin style={{ width: 16 }} />Pinned to dashboard</span>} />{pinned.length ? <div className="list">{pinned.map(row)}</div> : <p className="card-body small muted">Use “Pin to dashboard” in a project’s menu.</p>}</Card>
        <Card><CardHead title={<span className="row gap-4"><Library style={{ width: 16 }} />Favourite templates</span>} />{tpl.length ? <div className="list">{tpl.map((t) => <Link key={t.id} to={`/library/${t.id}`} className="list-row"><span className="grow truncate">{t.title}</span><span className="tiny muted">{timeAgo(t.updated_at)}</span></Link>)}</div> : <p className="card-body small muted">Star templates in the library.</p>}</Card>
      </div>
    </>
  );
}

export function AllCollectionsPage() {
  useStoreVersion();
  usePageMeta('Collections');
  const [q, setQ] = useState('');
  const groups = useMemo(() => store.all('projects').filter((p) => !p.archived).sort((a, b) => projectLabel(a.id).localeCompare(projectLabel(b.id)))
    .map((p) => ({ p, cols: collectionsOf(p.id).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.cols.length), [store.version, q]);
  const total = store.all('collections').length;
  return (
    <>
      <PageHead title="Prompt collections" sub={`${plural(total, 'collection')} across your projects`} />
      <SearchBox value={q} onChange={setQ} placeholder="Search collections…" />
      <div className="col gap-16 mt-16">
        {!groups.length ? <Card><EmptyState icon={<ListOrdered />} title={total ? 'No matches' : 'No collections yet'} action={!total && topProjects()[0] && <Link to={`/p/${topProjects()[0].id}/collections?new=1`} className="btn btn-primary">Create a collection</Link>}>Collections live inside projects and subprojects. Group prompts into a sequence and run them as a workflow.</EmptyState></Card>
          : groups.map(({ p, cols }) => (
            <Card key={p.id}>
              <CardHead title={<Link to={`/p/${p.id}/collections`} style={{ color: 'inherit' }}>{projectLabel(p.id)}</Link>} />
              <div className="list">
                {cols.map((c) => { const s = collectionState(c); return (
                  <Link key={c.id} to={`/p/${p.id}/collections/${c.id}`} className="list-row">
                    <span className="icon-tile sm tone-amber"><ListOrdered /></span>
                    <div className="grow"><div className="strong truncate">{c.name}</div><div className="meta">{s.done} of {s.total} completed · {s.label}</div></div>
                    <div style={{ width: 100 }} className="hide-mobile"><ProgressBar value={s.pct} size="sm" /></div>
                    <PlayCircle style={{ width: 18, color: 'var(--primary)' }} />
                  </Link>
                ); })}
              </div>
            </Card>
          ))}
      </div>
    </>
  );
}

export { formatDate };
