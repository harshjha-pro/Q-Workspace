import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FolderKanban, Plus, LayoutList, LayoutGrid, SlidersHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import { store, useStoreVersion } from '../lib/store';
import { subprojectsOf, projectCounts, taskProgress, allTags, byUpdated } from '../lib/data';
import { matches, timeAgo, plural, useIsMobile } from '../lib/util';
import { usePrefs, setPrefs } from '../lib/prefs';
import { Button, Card, EmptyState, PageHead, SearchBox, Segmented, Select, StatusBadge, ProgressBar, Tags, FavStar, Field, Chip, IconButton } from '../components/ui';
import { Modal } from '../components/overlay';
import { ProjectIcon } from '../components/domain';
import { ProjectMenu } from '../components/projectActions';
import { openQuick, usePageMeta } from '../layout/AppShell';
import type { Project, Status } from '../../shared/schema';

type Sort = 'updated' | 'name' | 'created' | 'accessed';

export default function Projects() {
  useStoreVersion();
  usePageMeta('Projects');
  const prefs = usePrefs();
  const mobile = useIsMobile();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const status = (params.get('status') || '') as Status | '';
  const tag = params.get('tag') || '';
  const scope = params.get('scope') || 'active';
  const sort = (params.get('sort') || 'updated') as Sort;
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const all = store.all('projects');
  const tags = allTags();
  const filterFn = (p: Project) =>
    (scope === 'archived' ? p.archived : scope === 'favourites' ? p.favourite && !p.archived : scope === 'all' ? true : !p.archived) &&
    (!status || p.status === status) && (!tag || p.tags.includes(tag)) && matches(q, p.name, p.description, p.tags);
  const sorter = (a: Project, b: Project) =>
    sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.created_at.localeCompare(a.created_at) :
    sort === 'accessed' ? (b.last_accessed_at || '').localeCompare(a.last_accessed_at || '') : byUpdated(a, b);

  const { tops, subMatches } = useMemo(() => {
    const tops = all.filter((p) => !p.parent_id && filterFn(p)).sort(sorter);
    // Subprojects matching filters whose parent doesn't (so search finds them).
    const topIds = new Set(tops.map((t) => t.id));
    const subMatches = (q || status || tag) ? all.filter((p) => p.parent_id && filterFn(p) && !topIds.has(p.parent_id!)).sort(sorter) : [];
    return { tops, subMatches };
  }, [store.version, q, status, tag, scope, sort]);

  const counts = { active: all.filter((p) => !p.parent_id && !p.archived).length, archived: all.filter((p) => !p.parent_id && p.archived).length, favourites: all.filter((p) => p.favourite && !p.archived).length };
  const activeFilters = [status, tag].filter(Boolean).length;
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const filters = (
    <div className="col gap-12">
      <Field label="Status"><Select value={status} onChange={(e) => setParam('status', e.target.value)}><option value="">Any status</option><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></Select></Field>
      <Field label="Tag"><Select value={tag} onChange={(e) => setParam('tag', e.target.value)}><option value="">Any tag</option>{tags.map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="Sort by"><Select value={sort} onChange={(e) => setParam('sort', e.target.value)}><option value="updated">Last modified</option><option value="accessed">Recently opened</option><option value="created">Newest</option><option value="name">Name</option></Select></Field>
    </div>
  );

  return (
    <>
      <PageHead title="Projects" sub={`${plural(counts.active, 'active project')} · ${plural(all.filter((p) => p.parent_id).length, 'subproject')}`}
        actions={!mobile && <Button variant="primary" icon={<Plus />} onClick={() => openQuick('project')}>Create project</Button>} />
      <div className="row row-wrap gap-12" style={{ marginBottom: 16 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search projects and subprojects…" className="grow" />
        {mobile ? (
          <Button icon={<SlidersHorizontal />} onClick={() => setFiltersOpen(true)}>Filters{activeFilters ? ` (${activeFilters})` : ''}</Button>
        ) : (
          <>
            <Select style={{ width: 150 }} value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status filter"><option value="">Any status</option><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></Select>
            <Select style={{ width: 140 }} value={tag} onChange={(e) => setParam('tag', e.target.value)} aria-label="Tag filter"><option value="">Any tag</option>{tags.map((t) => <option key={t}>{t}</option>)}</Select>
            <Select style={{ width: 160 }} value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="Sort"><option value="updated">Last modified</option><option value="accessed">Recently opened</option><option value="created">Newest</option><option value="name">Name</option></Select>
            <Segmented label="View" value={prefs.projectView} onChange={(v) => setPrefs({ projectView: v })} options={[{ value: 'list', label: '', icon: <LayoutList style={{ width: 16, height: 16 }} /> }, { value: 'grid', label: '', icon: <LayoutGrid style={{ width: 16, height: 16 }} /> }]} />
          </>
        )}
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        <Chip active={scope === 'active'} onClick={() => setParam('scope', '')}>Active ({counts.active})</Chip>
        <Chip active={scope === 'favourites'} onClick={() => setParam('scope', 'favourites')}>Favourites ({counts.favourites})</Chip>
        <Chip active={scope === 'archived'} onClick={() => setParam('scope', 'archived')}>Archived ({counts.archived})</Chip>
        <Chip active={scope === 'all'} onClick={() => setParam('scope', 'all')}>All</Chip>
      </div>

      {tops.length === 0 && subMatches.length === 0 ? (
        <Card><EmptyState icon={<FolderKanban />} title={all.length ? 'No matching projects' : 'No projects yet'} action={!all.length && <Button variant="primary" icon={<Plus />} onClick={() => openQuick('project')}>Create project</Button>}>{all.length ? 'Try a different search or filter.' : 'Create a project to organise prompts, files and outputs.'}</EmptyState></Card>
      ) : prefs.projectView === 'grid' && !mobile ? (
        <div className="grid grid-cards">
          {tops.map((p) => <ProjectCard key={p.id} p={p} />)}
          {subMatches.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      ) : (
        <Card>
          <div className="list">
            {tops.map((p) => {
              const subs = subprojectsOf(p.id, scope !== 'active');
              const open = expanded.has(p.id) || !!q;
              return (
                <div key={p.id}>
                  <ProjectListRow p={p} onToggle={subs.length ? () => toggle(p.id) : undefined} open={open} />
                  {open && subs.filter((s) => !q || matches(q, s.name, s.description, s.tags) || matches(q, p.name)).map((s) => <ProjectListRow key={s.id} p={s} indent />)}
                </div>
              );
            })}
            {subMatches.map((p) => <ProjectListRow key={p.id} p={p} showParent />)}
          </div>
        </Card>
      )}

      {mobile && <button className="fab" aria-label="Create project" onClick={() => openQuick('project')}><Plus /></button>}
      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter & sort" footer={<><Button onClick={() => { setParams(new URLSearchParams(), { replace: true }); setFiltersOpen(false); }}>Reset</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>Show results</Button></>}>{filters}</Modal>
    </>
  );

  function ProjectListRow({ p, indent, onToggle, open, showParent }: { p: Project; indent?: boolean; onToggle?: () => void; open?: boolean; showParent?: boolean }) {
    const c = projectCounts(p.id);
    const t = taskProgress(p.id, !p.parent_id);
    const parent = p.parent_id ? store.get('projects', p.parent_id) : undefined;
    return (
      <div className="list-row clickable" style={{ paddingLeft: indent ? (mobile ? 28 : 56) : undefined, cursor: 'pointer' }} onClick={() => nav(`/p/${p.id}`)} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/p/${p.id}`); }}>
        {!indent && (onToggle ? <IconButton size="sm" label={open ? 'Collapse subprojects' : 'Expand subprojects'} icon={open ? <ChevronDown /> : <ChevronRight />} onClick={(e) => { e.stopPropagation(); onToggle(); }} /> : <span style={{ width: mobile ? 0 : 32 }} />)}
        <ProjectIcon project={p} size={indent ? 'sm' : undefined} />
        <div className="grow">
          <div className="row gap-4"><span className="strong truncate">{p.name}</span>{p.archived && <span className="badge">Archived</span>}</div>
          <div className="meta truncate">{showParent && parent ? `${parent.name} › ` : ''}{p.parent_id ? 'Subproject' : plural(c.subprojects, 'subproject')} · {plural(c.prompts, 'prompt')} · {plural(c.files, 'file')} · {timeAgo(p.updated_at)}</div>
          {mobile && <div className="row mt-4 gap-4"><StatusBadge status={p.status} />{t.total > 0 && <span className="tiny muted">{t.pct}% tasks</span>}</div>}
        </div>
        {!mobile && <Tags tags={p.tags} max={2} />}
        {!mobile && t.total > 0 && <div style={{ width: 100 }}><ProgressBar value={t.pct} size="sm" /><div className="tiny muted mt-4 num">{t.done}/{t.total} tasks</div></div>}
        {!mobile && <StatusBadge status={p.status} />}
        <FavStar on={p.favourite} onToggle={() => store.update('projects', p.id, { favourite: !p.favourite })} />
        <span onClick={(e) => e.stopPropagation()}><ProjectMenu project={p} /></span>
      </div>
    );
  }

  function ProjectCard({ p }: { p: Project }) {
    const c = projectCounts(p.id);
    const t = taskProgress(p.id, true);
    return (
      <Link to={`/p/${p.id}`} className="card card-pad col gap-12" style={{ color: 'inherit', textDecoration: 'none' }}>
        <div className="row between"><ProjectIcon project={p} /><span className="row gap-4" onClick={(e) => e.preventDefault()}><FavStar on={p.favourite} onToggle={() => store.update('projects', p.id, { favourite: !p.favourite })} /><ProjectMenu project={p} /></span></div>
        <div><div className="strong truncate">{p.name}</div><div className="small muted clamp-2" style={{ minHeight: 38 }}>{p.description || 'No description'}</div></div>
        <div className="row between"><StatusBadge status={p.status} /><span className="tiny muted">{plural(c.subprojects, 'sub')} · {plural(c.prompts, 'prompt')}</span></div>
        {t.total > 0 && <ProgressBar value={t.pct} size="sm" />}
      </Link>
    );
  }
}
