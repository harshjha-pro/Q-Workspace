import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, Upload, FileUp, PlayCircle, PackageOpen, FolderPlus, Layers, FileText, Files, ListOrdered, CheckSquare, StickyNote, Clock, Variable, Plus } from 'lucide-react';
import { useState } from 'react';
import { store, useStoreVersion } from '../../lib/store';
import { projectCounts, taskProgress, tasksOf, subprojectsOf, collectionsOf, promptsOf, activityOf, notesOf, filesOf, byUpdated } from '../../lib/data';
import { timeAgo, formatDate } from '../../lib/util';
import { Card, CardHead, ProgressBar, Checkbox, Button, StatusBadge, TypeBadge, Field, Input } from '../../components/ui';
import { ProjectIcon, ProjectFormModal, FileGlyph } from '../../components/domain';
import { Modal, toast } from '../../components/overlay';
import { humanizeVariable } from '../../../shared/variables';
import { useWs } from './Workspace';
import { openQuick } from '../../layout/AppShell';

export default function Overview() {
  useStoreVersion();
  const { project, base } = useWs();
  const nav = useNavigate();
  const [newSub, setNewSub] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const isTop = !project.parent_id;
  const c = projectCounts(project.id);
  const progress = taskProgress(project.id, isTop);
  const tasks = tasksOf(project.id).slice(0, 6);
  const prompts = promptsOf(project.id);
  const subs = isTop ? subprojectsOf(project.id, false) : [];
  const collections = collectionsOf(project.id);
  const notes = notesOf(project.id).slice(0, 3);
  const outputs = filesOf(project.id, 'output').slice(0, 4);
  const activity = activityOf(project.id).slice(0, 6);
  const varCount = Object.values(project.variable_values || {}).filter(Boolean).length;
  const stats = [
    ...(isTop ? [{ label: 'Subprojects', value: c.subprojects, icon: <Layers />, to: `${base}/subprojects` }] : []),
    { label: 'Prompts', value: isTop ? c.prompts : prompts.length, icon: <FileText />, to: `${base}/prompts` },
    { label: 'Files', value: c.files, icon: <Files />, to: `${base}/files/reference` },
    { label: 'Collections', value: c.collections, icon: <ListOrdered />, to: `${base}/collections` },
    { label: 'Tasks done', value: `${progress.done}/${progress.total}`, icon: <CheckSquare />, to: `${base}/tasks` },
  ];
  const actions = [
    { label: 'Add prompt', icon: <FilePlus2 />, onClick: () => nav(`${base}/prompts/new`) },
    { label: 'Bulk import prompts', icon: <Upload />, onClick: () => nav(`/import?dest=${project.id}`) },
    { label: 'Upload file', icon: <FileUp />, onClick: () => openQuick('upload', project.id) },
    ...(isTop ? [{ label: 'Add subproject', icon: <FolderPlus />, onClick: () => setNewSub(true) }] : []),
    { label: 'Start workflow', icon: <PlayCircle />, onClick: () => nav(collections[0] ? `${base}/collections/${collections[0].id}` : `${base}/collections?new=1`) },
    { label: 'Generate prompt pack', icon: <PackageOpen />, onClick: () => nav(`${base}/pack`) },
  ];
  return (
    <>
      <div className="grid grid-stats">
        {stats.map((s) => <Link key={s.label} to={s.to} className="card stat"><span className="stat-icon">{s.icon}</span><span className="stat-value">{s.value}</span><span className="stat-label">{s.label}</span></Link>)}
      </div>
      <div className="grid mt-16" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }} data-overview-grid>
        <div className="col gap-16">
          <Card>
            <CardHead title={`${isTop ? 'Project' : 'Subproject'} progress`} sub={progress.total ? `${progress.done} of ${progress.total} tasks completed${isTop && c.subprojects ? ' (including subprojects)' : ''}` : 'Add tasks to track progress'} actions={<Link to={`${base}/tasks`} className="small">All tasks</Link>} />
            <div className="card-body col gap-12">
              <div className="row gap-12"><div className="grow"><ProgressBar value={progress.pct} /></div><span className="strong num">{progress.pct}%</span></div>
              {tasks.map((t) => <Checkbox key={t.id} checked={t.done} onChange={(v) => store.update('tasks', t.id, { done: v })} label={<span className={t.done ? 'faint' : ''} style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.title}</span>} />)}
              <QuickTask projectId={project.id} />
            </div>
          </Card>
          {isTop && subs.length > 0 && (
            <Card>
              <CardHead title="Subprojects" actions={<Link to={`${base}/subprojects`} className="small">View all</Link>} />
              <div className="list">
                {subs.slice(0, 6).map((s) => { const t = taskProgress(s.id); return (
                  <Link key={s.id} to={`/p/${s.id}`} className="list-row"><ProjectIcon project={s} size="sm" /><div className="grow"><div className="strong truncate">{s.name}</div><div className="meta">{promptsOf(s.id).length} prompts · {t.pct}% tasks</div></div><StatusBadge status={s.status} /></Link>
                ); })}
              </div>
            </Card>
          )}
          <Card>
            <CardHead title="Prompts" sub={`${prompts.filter((p) => p.type === 'mandatory').length} mandatory · ${prompts.filter((p) => p.type === 'optional').length} optional`} actions={<Link to={`${base}/prompts`} className="small">Manage</Link>} />
            {prompts.length ? <div className="list">{prompts.slice(0, 5).map((p) => <Link key={p.id} to={`${base}/prompts/${p.id}`} className={`list-row${p.type === 'mandatory' ? ' mandatory' : ''}`}><div className="grow"><div className="strong truncate">{p.title}</div><div className="meta truncate">{p.description || p.content.slice(0, 120)}</div></div><TypeBadge type={p.type} /></Link>)}</div>
              : <div className="card-body row row-wrap"><Button variant="primary" icon={<Plus />} onClick={() => nav(`${base}/prompts/new`)}>Add prompt</Button><Button icon={<Upload />} onClick={() => nav(`/import?dest=${project.id}`)}>Bulk import</Button></div>}
          </Card>
        </div>
        <div className="col gap-16">
          <Card>
            <CardHead title="Quick actions" />
            <div className="card-body col gap-8">{actions.map((a) => <Button key={a.label} icon={a.icon} onClick={a.onClick} block style={{ justifyContent: 'flex-start' }}>{a.label}</Button>)}</div>
          </Card>
          <Card>
            <CardHead title={<span className="row gap-4"><Variable style={{ width: 16, height: 16 }} />Saved input values</span>} actions={<Button size="sm" variant="ghost" onClick={() => setVarsOpen(true)}>Edit</Button>} />
            <div className="card-body small muted">{varCount ? Object.entries(project.variable_values).filter(([, v]) => v).slice(0, 6).map(([k, v]) => <div key={k} className="row between gap-12"><span className="var-chip">{k}</span><span className="truncate" style={{ maxWidth: '60%' }}>{v}</span></div>) : 'Values you fill in prompts and packs are remembered here for this project.'}</div>
          </Card>
          {outputs.length > 0 && (
            <Card>
              <CardHead title="Latest AI outputs" actions={<Link to={`${base}/files/output`} className="small">All</Link>} />
              <div className="list">{outputs.map((f) => <Link key={f.id} to={`${base}/file/${f.id}`} className="list-row"><FileGlyph ext={f.ext} size={22} /><div className="grow"><div className="truncate">{f.name}</div><div className="meta">{f.version_count} versions · {timeAgo(f.updated_at)}</div></div></Link>)}</div>
            </Card>
          )}
          {notes.length > 0 && (
            <Card>
              <CardHead title="Notes" actions={<Link to={`${base}/notes`} className="small">All</Link>} />
              <div className="list">{notes.map((n) => <Link key={n.id} to={`${base}/notes?note=${n.id}`} className="list-row"><StickyNote style={{ width: 18, height: 18, color: 'var(--text-3)' }} /><div className="grow"><div className="truncate">{n.title}</div><div className="meta">{timeAgo(n.updated_at)}</div></div></Link>)}</div>
            </Card>
          )}
          <Card>
            <CardHead title="Recent activity" actions={<Link to={`${base}/activity`} className="small">History</Link>} />
            <div className="card-body timeline">
              {activity.length ? activity.map((a) => <div key={a.id} className="timeline-item"><span className="t-icon"><Clock /></span><div className="col gap-4" style={{ minWidth: 0 }}><span className="small">{a.summary}</span><span className="tiny faint">{timeAgo(a.created_at)}</span></div></div>) : <span className="small muted">Created {formatDate(project.created_at)}</span>}
            </div>
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 960px) { [data-overview-grid] { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
      <ProjectFormModal open={newSub} onClose={() => setNewSub(false)} parentId={project.id} onSaved={(s) => nav(`/p/${s.id}`)} />
      <VariablesModal open={varsOpen} onClose={() => setVarsOpen(false)} />
    </>
  );
}

function QuickTask({ projectId }: { projectId: string }) {
  const [t, setT] = useState('');
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (!t.trim()) return; store.create('tasks', { project_id: projectId, title: t.trim(), sort: Date.now() }); setT(''); }}>
      <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a task…" aria-label="New task" />
      <Button type="submit" icon={<Plus />} disabled={!t.trim()}>Add</Button>
    </form>
  );
}

function VariablesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project } = useWs();
  const names = new Set<string>(Object.keys(project.variable_values || {}));
  for (const p of promptsOf(project.id)) for (const v of p.variables) names.add(v.name);
  const [vals, setVals] = useState<Record<string, string>>(project.variable_values || {});
  if (!open) return null;
  const list = [...names].sort();
  return (
    <Modal open onClose={onClose} title="Saved input values" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { store.update('projects', project.id, { variable_values: vals }); toast.success('Saved'); onClose(); }}>Save</Button></>}>
      <p className="small muted">These values pre-fill prompts and prompt packs in this {project.parent_id ? 'subproject' : 'project'}. The prompts themselves are never changed.</p>
      {list.length ? list.map((n) => <Field key={n} label={humanizeVariable(n)} hint={`{${n}}`}><Input value={vals[n] ?? ''} onChange={(e) => setVals({ ...vals, [n]: e.target.value })} /></Field>) : <p className="muted">No variables in this project's prompts yet.</p>}
    </Modal>
  );
}

export { byUpdated };
