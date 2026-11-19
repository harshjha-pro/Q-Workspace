import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useParams, useOutletContext, useLocation, Link, Navigate } from 'react-router-dom';
import { LayoutDashboard, Layers, FileText, ListOrdered, BookMarked, Paperclip, Bot, CheckSquare, StickyNote, History, Upload, Pin, FolderX, PackageOpen, Plus } from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { getProject, parentOf, projectCounts, subprojectsOf, promptsOf, collectionsOf, filesOf, tasksOf, notesOf, touchProject } from '../../lib/data';
import { useIsMobile } from '../../lib/util';
import { Card, EmptyState, ButtonLink, StatusBadge, Tags, FavStar, IconButton, Button } from '../../components/ui';
import { ActionMenu } from '../../components/overlay';
import { ProjectIcon } from '../../components/domain';
import { ProjectMenu } from '../../components/projectActions';
import { usePageMeta } from '../../layout/AppShell';
import { STATUS_LABEL, type Project, type Status } from '../../../shared/schema';

export interface WsCtx { project: Project; parent?: Project; base: string }
export const useWs = () => useOutletContext<WsCtx>();

export default function Workspace() {
  useStoreVersion();
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const mobile = useIsMobile();
  const project = getProject(id);
  const parent = parentOf(project);
  useEffect(() => { if (id && project) touchProject(id); }, [id, !!project]);
  usePageMeta(project?.name ?? 'Project', parent ? `/p/${parent.id}` : '/projects');

  if (!project) {
    return <Card><EmptyState icon={<FolderX />} title={store.status.loaded ? 'Project not found' : 'Loading…'} action={<ButtonLink to="/projects" variant="primary">Back to projects</ButtonLink>}>It may have been deleted or moved to the trash.</EmptyState></Card>;
  }
  const base = `/p/${project.id}`;
  const c = projectCounts(project.id);
  const own = { prompts: promptsOf(project.id).length, collections: collectionsOf(project.id).length, ref: filesOf(project.id, 'reference').length, add: filesOf(project.id, 'additional').length, out: filesOf(project.id, 'output').length, tasks: tasksOf(project.id).filter((t) => !t.done).length, notes: notesOf(project.id).length };
  const tabs = [
    { to: base, label: 'Overview', icon: <LayoutDashboard />, end: true },
    ...(!project.parent_id ? [{ to: `${base}/subprojects`, label: 'Subprojects', icon: <Layers />, count: c.subprojects }] : []),
    { to: `${base}/prompts`, label: 'Prompts', icon: <FileText />, count: own.prompts },
    { to: `/import?dest=${project.id}`, label: 'Bulk Import', icon: <Upload />, external: true },
    { to: `${base}/collections`, label: 'Collections', icon: <ListOrdered />, count: own.collections },
    { to: `${base}/files/reference`, label: 'Reference Files', icon: <BookMarked />, count: own.ref },
    { to: `${base}/files/additional`, label: 'Additional Files', icon: <Paperclip />, count: own.add },
    { to: `${base}/files/output`, label: 'AI Outputs', icon: <Bot />, count: own.out },
    { to: `${base}/tasks`, label: 'Tasks', icon: <CheckSquare />, count: own.tasks },
    { to: `${base}/notes`, label: 'Notes', icon: <StickyNote />, count: own.notes },
    { to: `${base}/activity`, label: 'Activity', icon: <History /> },
  ];
  // Detail screens (editor, file viewer, pack) get the full width without the header on mobile.
  const detail = /\/(prompts\/[^/]+|file\/|pack|collections\/[^/]+)/.test(loc.pathname.slice(base.length));

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Dashboard</Link><span>›</span><Link to="/projects">Projects</Link>
        {parent && <><span>›</span><Link to={`/p/${parent.id}`}>{parent.name}</Link></>}
        <span>›</span><Link to={base} className={detail ? '' : 'current'}>{project.name}</Link>
        {tabs.filter((t) => !t.end && !t.external && loc.pathname.startsWith(t.to)).slice(0, 1).map((t) => <span key={t.to} className="row gap-4"><span>›</span><span className="current">{t.label}</span></span>)}
      </nav>
      {!(mobile && detail) && (
        <div className="ws-header">
          <ProjectIcon project={project} size="lg" />
          <div className="grow">
            {parent && <Link to={`/p/${parent.id}`} className="small muted">{parent.name} ›</Link>}
            <div className="row gap-4 row-wrap"><h1 className="truncate" style={{ fontSize: mobile ? 21 : 26 }}>{project.name}</h1>{project.archived && <span className="badge">Archived</span>}</div>
            <div className="row row-wrap mt-8">
              <ActionMenu title="Status" items={(['not_started', 'in_progress', 'completed'] as Status[]).map((s) => ({ label: STATUS_LABEL[s], onClick: () => store.update('projects', project.id, { status: s }) }))}
                trigger={(t) => <button {...t} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }} aria-label="Change status"><StatusBadge status={project.status} /></button>} />
              <Tags tags={project.tags} max={4} />
            </div>
            {project.description && <p className="muted mt-8" style={{ maxWidth: 760 }}>{project.description}</p>}
          </div>
          <div className="row">
            <FavStar on={project.favourite} onToggle={() => store.update('projects', project.id, { favourite: !project.favourite })} />
            <IconButton size="sm" label={project.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'} icon={<Pin className={project.pinned ? 'star' : ''} fill={project.pinned ? 'currentColor' : 'none'} />} onClick={() => store.update('projects', project.id, { pinned: !project.pinned })} />
            {!mobile && <Button size="sm" variant="soft" icon={<PackageOpen />} onClick={() => nav(`${base}/pack`)}>Generate Prompt Pack</Button>}
            <ProjectMenu project={project} onDeleted={() => nav(parent ? `/p/${parent.id}` : '/projects')} />
          </div>
        </div>
      )}
      {!(mobile && detail) && (
        <div className="ws-tabs">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive && !t.external ? ' active' : ''}`}>
                {t.icon}{t.label}{t.count !== undefined && t.count > 0 && <span className="count">{t.count}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <Outlet context={{ project, parent, base } satisfies WsCtx} />
    </>
  );
}

export function SubprojectsTab() {
  useStoreVersion();
  const { project, base } = useWs();
  const nav = useNavigate();
  const subs = subprojectsOf(project.id);
  usePageMeta(project.name, '/projects');
  if (project.parent_id) return <Navigate to={base} replace />;
  return <SubprojectList project={project} subs={subs} />;
}

import { useState } from 'react';
import { ProjectFormModal } from '../../components/domain';
import { ProgressBar } from '../../components/ui';
import { taskProgress } from '../../lib/data';
import { plural, timeAgo } from '../../lib/util';

function SubprojectList({ project, subs }: { project: Project; subs: Project[] }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const mobile = useIsMobile();
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2>Subprojects</h2>
        {!mobile && <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Add subproject</Button>}
      </div>
      {subs.length === 0 ? (
        <Card><EmptyState icon={<Layers />} title="No subprojects yet" action={<Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>Add subproject</Button>}>Split {project.name} into focused streams — each subproject has its own prompts, collections, files, outputs, tasks and notes.</EmptyState></Card>
      ) : (
        <div className="grid grid-cards">
          {subs.map((s) => {
            const c = projectCounts(s.id); const t = taskProgress(s.id);
            return (
              <Link key={s.id} to={`/p/${s.id}`} className="card card-pad col gap-12" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="row between"><ProjectIcon project={s} /><span onClick={(e) => e.preventDefault()} className="row"><FavStar on={s.favourite} onToggle={() => store.update('projects', s.id, { favourite: !s.favourite })} /><ProjectMenu project={s} /></span></div>
                <div><div className="row gap-4"><span className="strong truncate">{s.name}</span>{s.archived && <span className="badge">Archived</span>}</div><div className="small muted clamp-2">{s.description || '—'}</div></div>
                <div className="row between"><StatusBadge status={s.status} /><span className="tiny muted">{plural(c.prompts, 'prompt')} · {plural(c.files, 'file')}</span></div>
                {t.total > 0 && <div><ProgressBar value={t.pct} size="sm" /><div className="tiny muted mt-4">{t.done}/{t.total} tasks · updated {timeAgo(s.updated_at)}</div></div>}
              </Link>
            );
          })}
        </div>
      )}
      {mobile && <button className="fab" aria-label="Add subproject" onClick={() => setOpen(true)}><Plus /></button>}
      <ProjectFormModal open={open} onClose={() => setOpen(false)} parentId={project.id} onSaved={(s) => nav(`/p/${s.id}`)} />
    </>
  );
}
