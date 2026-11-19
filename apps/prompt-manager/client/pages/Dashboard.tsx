import { Link, useNavigate } from 'react-router-dom';
import { FolderKanban, Layers, FileText, Library, ListOrdered, Files, Bot, Activity as ActivityIcon, CheckCircle2, FolderPlus, FilePlus2, Upload, FileUp, PackageOpen, Search, Star, Pin, ArrowRight, Clock, StickyNote, Download } from 'lucide-react';
import { store, useStoreVersion } from '../lib/store';
import { useSession } from '../lib/session';
import { usePrefs } from '../lib/prefs';
import { topProjects, projectCounts, taskProgress, byUpdated, projectLabel } from '../lib/data';
import { timeAgo, plural } from '../lib/util';
import { Card, CardHead, StatusBadge, ProgressBar, EmptyState, Button, TypeBadge } from '../components/ui';
import { ProjectIcon, FileGlyph } from '../components/domain';
import { openQuick, usePageMeta } from '../layout/AppShell';
import type { Project } from '../../shared/schema';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

function ProjectRow({ p }: { p: Project }) {
  const c = projectCounts(p.id);
  const t = taskProgress(p.id, true);
  return (
    <Link to={`/p/${p.id}`} className="list-row">
      <ProjectIcon project={p} size="sm" />
      <div className="grow">
        <div className="strong truncate">{p.parent_id ? projectLabel(p.id) : p.name}</div>
        <div className="meta truncate">{p.parent_id ? 'Subproject' : plural(c.subprojects, 'subproject')} · {plural(c.prompts, 'prompt')} · Updated {timeAgo(p.updated_at)}</div>
      </div>
      {t.total > 0 && <div className="hide-mobile" style={{ width: 90 }}><ProgressBar value={t.pct} size="sm" /><div className="tiny muted mt-4 num">{t.pct}%</div></div>}
      <span className="hide-mobile"><StatusBadge status={p.status} /></span>
    </Link>
  );
}

export default function Dashboard() {
  useStoreVersion();
  usePageMeta('Dashboard');
  const sess = useSession();
  const prefs = usePrefs();
  const name = prefs.displayName || (sess.username ? sess.username.charAt(0).toUpperCase() + sess.username.slice(1) : '');
  const nav = useNavigate();
  const allProjects = store.all('projects');
  const tops = allProjects.filter((p) => !p.parent_id);
  const subs = allProjects.filter((p) => p.parent_id);
  const prompts = store.all('prompts');
  const files = store.all('files');
  const stats = [
    { label: 'Projects', value: tops.length, icon: <FolderKanban />, to: '/projects', tone: 'indigo' },
    { label: 'Subprojects', value: subs.length, icon: <Layers />, to: '/projects', tone: 'violet' },
    { label: 'Prompts', value: prompts.length, icon: <FileText />, to: '/search?kinds=prompt', tone: 'blue' },
    { label: 'Templates', value: store.all('templates').length, icon: <Library />, to: '/library', tone: 'teal' },
    { label: 'Collections', value: store.all('collections').length, icon: <ListOrdered />, to: '/collections', tone: 'amber' },
    { label: 'Files', value: files.length, icon: <Files />, to: '/search?kinds=file', tone: 'slate' },
    { label: 'AI outputs', value: files.filter((f) => f.category === 'output').length, icon: <Bot />, to: '/search?kinds=file&category=output', tone: 'pink' },
    { label: 'Active projects', value: allProjects.filter((p) => p.status === 'in_progress' && !p.archived).length, icon: <ActivityIcon />, to: '/projects?status=in_progress', tone: 'blue' },
    { label: 'Completed', value: allProjects.filter((p) => p.status === 'completed').length, icon: <CheckCircle2 />, to: '/projects?status=completed', tone: 'green' },
  ];
  const visible = allProjects.filter((p) => !p.archived);
  const recentProjects = [...visible].filter((p) => p.last_accessed_at).sort((a, b) => (b.last_accessed_at! > a.last_accessed_at! ? 1 : -1)).slice(0, 5);
  const recent = recentProjects.length ? recentProjects : [...tops].filter((p) => !p.archived).sort(byUpdated).slice(0, 5);
  const pinned = visible.filter((p) => p.pinned);
  const favourites = visible.filter((p) => p.favourite);
  const active = visible.filter((p) => p.status === 'in_progress').sort(byUpdated).slice(0, 6);
  const recentPrompts = [...prompts].sort(byUpdated).slice(0, 5);
  const importedPrompts = prompts.filter((p) => p.import_job_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const recentFiles = [...files].filter((f) => f.category !== 'output').sort(byUpdated).slice(0, 5);
  const recentOutputs = [...files].filter((f) => f.category === 'output').sort(byUpdated).slice(0, 5);
  const recentNotes = store.all('notes').sort(byUpdated).slice(0, 5);
  const activity = store.all('activity').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);

  const quick = [
    { label: 'Create Project', icon: <FolderPlus />, onClick: () => openQuick('project'), tone: 'indigo' },
    { label: 'Create Subproject', icon: <Layers />, onClick: () => openQuick('subproject'), tone: 'violet' },
    { label: 'Add Prompt', icon: <FilePlus2 />, onClick: () => openQuick('prompt'), tone: 'blue' },
    { label: 'Bulk Import', icon: <Upload />, onClick: () => nav('/import'), tone: 'teal' },
    { label: 'Add Collection', icon: <ListOrdered />, onClick: () => openQuick('collection'), tone: 'amber' },
    { label: 'Upload File', icon: <FileUp />, onClick: () => openQuick('upload'), tone: 'slate' },
    { label: 'Prompt Pack', icon: <PackageOpen />, onClick: () => openQuick('pack'), tone: 'pink' },
    { label: 'Search', icon: <Search />, onClick: () => nav('/search'), tone: 'green' },
  ];

  if (!store.status.loaded) return null;
  return (
    <>
      <div className="page-head">
        <div><h1>{greeting()}{name ? `, ${name}` : ''}!</h1><p className="sub">Your private AI productivity workspace.</p></div>
      </div>

      <div className="quick-actions" aria-label="Quick actions">
        {quick.map((q) => <button key={q.label} className="quick-action" onClick={q.onClick}><span className={`icon-tile tone-${q.tone}`}>{q.icon}</span>{q.label}</button>)}
      </div>

      <div className="grid grid-stats dense mt-24">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card stat">
            <span className={`stat-icon tone-${s.tone}`}>{s.icon}</span>
            <span className="stat-value">{s.value.toLocaleString()}</span>
            <span className="stat-label">{s.label}</span>
          </Link>
        ))}
      </div>

      {tops.length === 0 ? (
        <Card className="mt-24"><EmptyState icon={<FolderKanban />} title="Create your first project" action={<><Button variant="primary" icon={<FolderPlus />} onClick={() => openQuick('project')}>Create project</Button><Button icon={<Upload />} onClick={() => nav('/import')}>Import prompts</Button></>}>Projects hold your prompts, collections, reference files, AI outputs, tasks and notes. Add subprojects for each stream of work.</EmptyState></Card>
      ) : (
        <div className="grid grid-2 mt-24">
          <Card>
            <CardHead title="Recent projects" actions={<Link to="/projects" className="small row gap-4">View all <ArrowRight style={{ width: 14, height: 14 }} /></Link>} />
            <div className="list">{recent.map((p) => <ProjectRow key={p.id} p={p} />)}</div>
          </Card>
          <Card>
            <CardHead title={<span className="row gap-4"><Pin style={{ width: 16, height: 16 }} />Pinned</span>} actions={<Link to="/favourites" className="small row gap-4">View all <ArrowRight style={{ width: 14, height: 14 }} /></Link>} />
            {pinned.length ? <div className="list">{pinned.slice(0, 6).map((p) => <ProjectRow key={p.id} p={p} />)}</div> : <p className="card-body muted small">Pin important projects or subprojects for one-tap access. Use the pin option in any project.</p>}
          </Card>
          <Card>
            <CardHead title={<span className="row gap-4"><Star style={{ width: 16, height: 16 }} />Favourites</span>} actions={<Link to="/favourites" className="small">View all</Link>} />
            {favourites.length ? <div className="list">{favourites.slice(0, 6).map((p) => <ProjectRow key={p.id} p={p} />)}</div> : <p className="card-body muted small">Star projects to keep them here.</p>}
          </Card>
          <Card>
            <CardHead title="Active projects" sub="Status: In Progress" />
            {active.length ? <div className="list">{active.map((p) => <ProjectRow key={p.id} p={p} />)}</div> : <p className="card-body muted small">No projects are in progress.</p>}
          </Card>
        </div>
      )}

      {tops.length > 0 && (
        <>
          <div className="section-title"><h2>Recent activity</h2></div>
          <div className="grid grid-3">
            <RecentList title="Recently modified prompts" icon={<FileText />} items={recentPrompts.map((p) => ({ id: p.id, to: `/p/${p.project_id}/prompts/${p.id}`, title: p.title, meta: `${projectLabel(p.project_id)} · ${timeAgo(p.updated_at)}`, badge: <TypeBadge type={p.type} /> }))} />
            <RecentList title="Recently imported prompts" icon={<Download />} items={importedPrompts.map((p) => ({ id: p.id, to: `/p/${p.project_id}/prompts/${p.id}`, title: p.title, meta: `${projectLabel(p.project_id)} · ${timeAgo(p.created_at)}` }))} empty="Bulk-imported prompts appear here." />
            <RecentList title="Recently uploaded files" icon={<Files />} items={recentFiles.map((f) => ({ id: f.id, to: `/p/${f.project_id}/file/${f.id}`, title: f.name, meta: `${projectLabel(f.project_id)} · ${timeAgo(f.updated_at)}`, glyph: f.ext }))} />
            <RecentList title="Recently updated AI outputs" icon={<Bot />} items={recentOutputs.map((f) => ({ id: f.id, to: `/p/${f.project_id}/file/${f.id}`, title: f.name, meta: `${f.version_count} version${f.version_count === 1 ? '' : 's'} · ${timeAgo(f.updated_at)}`, glyph: f.ext }))} />
            <RecentList title="Recently modified notes" icon={<StickyNote />} items={recentNotes.map((n) => ({ id: n.id, to: `/p/${n.project_id}/notes?note=${n.id}`, title: n.title, meta: `${projectLabel(n.project_id)} · ${timeAgo(n.updated_at)}` }))} />
            <Card>
              <CardHead title="Activity" />
              {activity.length ? (
                <div className="card-body timeline">
                  {activity.map((a) => (
                    <div key={a.id} className="timeline-item"><span className="t-icon"><Clock /></span><div className="col gap-4" style={{ minWidth: 0 }}><span className="small">{a.summary}</span><span className="tiny faint">{a.project_id ? `${projectLabel(a.project_id)} · ` : ''}{timeAgo(a.created_at)}</span></div></div>
                  ))}
                </div>
              ) : <p className="card-body muted small">Nothing yet.</p>}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function RecentList({ title, icon, items, empty = 'Nothing yet.' }: { title: string; icon: React.ReactNode; items: { id: string; to: string; title: string; meta: string; badge?: React.ReactNode; glyph?: string }[]; empty?: string }) {
  return (
    <Card>
      <CardHead title={<span className="row gap-4">{icon}{title}</span>} />
      {items.length ? (
        <div className="list">
          {items.map((i) => (
            <Link key={i.id} to={i.to} className="list-row">
              {i.glyph && <FileGlyph ext={i.glyph} size={22} />}
              <div className="grow"><div className="truncate strong" style={{ fontWeight: 500 }}>{i.title}</div><div className="meta truncate">{i.meta}</div></div>
              {i.badge}
            </Link>
          ))}
        </div>
      ) : <p className="card-body muted small">{empty}</p>}
    </Card>
  );
}
