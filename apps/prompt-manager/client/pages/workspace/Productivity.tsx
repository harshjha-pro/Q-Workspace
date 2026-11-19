import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, CheckSquare, StickyNote, Pin, Bold, Italic, Heading2, List, ListOrdered, Link2, Code, Eye, Edit3, History, FileText, Files, FolderKanban, CheckCircle2, ListChecks, Upload, ArrowLeft, Calendar, Flag } from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { tasksOf, notesOf, activityOf, taskProgress, subprojectsOf } from '../../lib/data';
import { formatDate, formatDateTime, timeAgo, matches, renderMarkdown, useIsMobile, plural, cx } from '../../lib/util';
import { Button, IconButton, Card, CardHead, EmptyState, Field, Input, Textarea, Select, ProgressBar, SearchBox, Segmented, Chip } from '../../components/ui';
import { Modal, confirmDialog, toast } from '../../components/overlay';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import type { Task, Note } from '../../../shared/schema';

// ================= Tasks =================
function TaskModal({ task, projectId, onClose }: { task?: Task; projectId: string; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [due, setDue] = useState(task?.due_date ?? '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? '');
  const save = () => {
    if (!title.trim()) return;
    const data = { title: title.trim(), description, due_date: due || null, priority };
    if (task) store.update('tasks', task.id, data); else store.create('tasks', { ...data, project_id: projectId, sort: Date.now() });
    toast.success(task ? 'Task updated' : 'Task added');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={task ? 'Edit task' : 'New task'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!title.trim()} onClick={save}>Save</Button></>}>
      <Field label="Title" required><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} /></Field>
      <Field label="Description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Due date (optional)"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Priority (optional)"><Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}><option value="">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
      </div>
      {task && <p className="tiny muted">Created {formatDateTime(task.created_at)}{task.completed_at ? ` · completed ${formatDateTime(task.completed_at)}` : ''}</p>}
    </Modal>
  );
}

export function TasksTab() {
  useStoreVersion();
  const { project, base } = useWs();
  usePageMeta(`${project.name} · Tasks`, base);
  const mobile = useIsMobile();
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [editing, setEditing] = useState<Task | null | 'new'>(null);
  const tasks = tasksOf(project.id);
  const prog = taskProgress(project.id);
  const subs = !project.parent_id ? subprojectsOf(project.id, false) : [];
  const list = tasks.filter((t) => (filter === 'open' ? !t.done : filter === 'done' ? t.done : true));
  const today = new Date().toISOString().slice(0, 10);
  const add = () => { if (!title.trim()) return; store.create('tasks', { project_id: project.id, title: title.trim(), sort: Date.now() }); setTitle(''); };
  return (
    <div className="col gap-16" style={{ maxWidth: 900 }}>
      <Card>
        <CardHead title="Task checklist" sub={`${prog.done} of ${prog.total} completed`} actions={<span className="strong num">{prog.pct}%</span>} />
        <div className="card-body col gap-12">
          <ProgressBar value={prog.pct} />
          <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task and press Enter…" aria-label="New task" />
            <Button type="submit" variant="primary" icon={<Plus />} disabled={!title.trim()}>{mobile ? '' : 'Add'}</Button>
            <IconButton label="Add task with details" icon={<Pencil />} onClick={() => setEditing('new')} />
          </form>
          <Segmented label="Filter tasks" value={filter} onChange={setFilter} options={[{ value: 'all', label: `All (${tasks.length})` }, { value: 'open', label: `Open (${tasks.length - prog.done})` }, { value: 'done', label: `Done (${prog.done})` }]} />
        </div>
        {list.length === 0 ? <EmptyState icon={<CheckSquare />} title={tasks.length ? 'Nothing here' : 'No tasks yet'}>{tasks.length ? 'Try another filter.' : 'Break the work into steps and tick them off. Progress shows on the dashboard.'}</EmptyState> : (
          <div>
            {list.map((t) => (
              <div key={t.id} className={cx('task-row', t.done && 'done')}>
                <input type="checkbox" checked={t.done} aria-label={`Mark “${t.title}” ${t.done ? 'not done' : 'done'}`} onChange={(e) => store.update('tasks', t.id, { done: e.target.checked })} />
                <div className="grow" style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => setEditing(t)}>
                  <div className="task-title" style={{ wordBreak: 'break-word' }}>{t.title}</div>
                  {t.description && <div className="small muted clamp-2">{t.description}</div>}
                  <div className="row gap-12 tiny mt-4 row-wrap">
                    {t.due_date && <span className={cx('row gap-4', !t.done && t.due_date < today ? 'overdue' : 'muted')}><Calendar style={{ width: 12 }} />{t.due_date < today && !t.done ? 'Overdue · ' : ''}{formatDate(t.due_date)}</span>}
                    {t.priority && <span className={cx('row gap-4', `prio-${t.priority}`)}><Flag style={{ width: 12 }} />{t.priority[0].toUpperCase() + t.priority.slice(1)}</span>}
                    <span className="faint">Created {formatDate(t.created_at)}</span>
                  </div>
                </div>
                <IconButton size="sm" label="Delete task" icon={<Trash2 />} onClick={async () => { if (await confirmDialog({ title: 'Delete task?', message: t.title, danger: true, confirmLabel: 'Delete' })) store.remove('tasks', t.id); }} />
              </div>
            ))}
          </div>
        )}
      </Card>
      {subs.length > 0 && (
        <Card>
          <CardHead title="Subproject progress" />
          <div className="list">{subs.map((s) => { const p = taskProgress(s.id); return <Link key={s.id} to={`/p/${s.id}/tasks`} className="list-row"><span className="grow truncate">{s.name}</span><span style={{ width: 120 }}><ProgressBar value={p.pct} size="sm" /></span><span className="tiny muted num" style={{ width: 60, textAlign: 'right' }}>{p.done}/{p.total}</span></Link>; })}</div>
        </Card>
      )}
      {editing && <TaskModal task={editing === 'new' ? undefined : editing} projectId={project.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ================= Notes =================
function insertAround(el: HTMLTextAreaElement, before: string, after = before, placeholder = 'text') {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + sel + after + value.slice(e);
  return { next, cursor: [s + before.length, s + before.length + sel.length] as [number, number] };
}
function insertLinePrefix(el: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: s, value } = el;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  return { next: value.slice(0, lineStart) + prefix + value.slice(lineStart), cursor: [s + prefix.length, s + prefix.length] as [number, number] };
}

function NoteEditor({ note, onBack }: { note: Note; onBack?: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [mode, setMode] = useState<'edit' | 'preview'>(note.body ? 'preview' : 'edit');
  const [saved, setSaved] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ title, body });
  latest.current = { title, body };
  // Reset when switching notes; pick up remote changes only if there are no local edits.
  useEffect(() => { setTitle(note.title); setBody(note.body); setSaved(true); }, [note.id]);
  useEffect(() => { if (saved) { setTitle(note.title); setBody(note.body); } }, [note.rev]);
  const flush = () => {
    clearTimeout(timer.current);
    const { title: t, body: b } = latest.current;
    if (t !== note.title || b !== note.body) store.update('notes', note.id, { title: t.trim() || 'Untitled note', body: b });
    setSaved(true);
  };
  const schedule = () => { setSaved(false); clearTimeout(timer.current); timer.current = setTimeout(flush, 800); };
  useEffect(() => () => flush(), [note.id]);
  const apply = (fn: (el: HTMLTextAreaElement) => { next: string; cursor: [number, number] }) => {
    const el = ta.current; if (!el) return;
    const r = fn(el); setBody(r.next); schedule();
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(...r.cursor); });
  };
  return (
    <Card className="col" style={{ gap: 0 }}>
      <div className="card-head" style={{ gap: 8 }}>
        {onBack && <IconButton label="Back to notes" icon={<ArrowLeft />} onClick={() => { flush(); onBack(); }} />}
        <input className="inline-edit strong" style={{ fontSize: 17 }} value={title} onChange={(e) => { setTitle(e.target.value); schedule(); }} onBlur={flush} aria-label="Note title" maxLength={300} />
        <Segmented label="Mode" value={mode} onChange={(m) => { flush(); setMode(m); }} options={[{ value: 'edit', label: '', icon: <Edit3 style={{ width: 15 }} /> }, { value: 'preview', label: '', icon: <Eye style={{ width: 15 }} /> }]} />
      </div>
      <div className="card-body col gap-8">
        {mode === 'edit' ? (
          <div>
            <div className="md-toolbar" role="toolbar" aria-label="Formatting">
              <IconButton size="sm" label="Bold" icon={<Bold />} onClick={() => apply((el) => insertAround(el, '**'))} />
              <IconButton size="sm" label="Italic" icon={<Italic />} onClick={() => apply((el) => insertAround(el, '_'))} />
              <IconButton size="sm" label="Heading" icon={<Heading2 />} onClick={() => apply((el) => insertLinePrefix(el, '## '))} />
              <IconButton size="sm" label="Bullet list" icon={<List />} onClick={() => apply((el) => insertLinePrefix(el, '- '))} />
              <IconButton size="sm" label="Numbered list" icon={<ListOrdered />} onClick={() => apply((el) => insertLinePrefix(el, '1. '))} />
              <IconButton size="sm" label="Checklist item" icon={<ListChecks />} onClick={() => apply((el) => insertLinePrefix(el, '- [ ] '))} />
              <IconButton size="sm" label="Link" icon={<Link2 />} onClick={() => apply((el) => insertAround(el, '[', '](https://)', 'link text'))} />
              <IconButton size="sm" label="Code" icon={<Code />} onClick={() => apply((el) => insertAround(el, '`'))} />
            </div>
            <Textarea ref={ta} className="editor-area" value={body} onChange={(e) => { setBody(e.target.value); schedule(); }} onBlur={flush} placeholder="Write in Markdown… (# heading, **bold**, - list)" aria-label="Note content" />
          </div>
        ) : body.trim() ? <div className="markdown" style={{ minHeight: 200, cursor: 'text' }} onDoubleClick={() => setMode('edit')} dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} /> : <p className="muted" style={{ minHeight: 120 }}>Empty note. <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>Start writing</Button></p>}
        <div className="row between tiny faint"><span>Created {formatDateTime(note.created_at)} · modified {timeAgo(note.updated_at)}</span><span>{saved ? 'Saved' : 'Saving…'}</span></div>
      </div>
    </Card>
  );
}

export function NotesTab() {
  useStoreVersion();
  const { project, base } = useWs();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const notes = notesOf(project.id);
  const sel = params.get('note');
  const current = notes.find((n) => n.id === sel) ?? (mobile ? undefined : notes[0]);
  usePageMeta(mobile && current ? current.title : `${project.name} · Notes`, mobile && current ? `${base}/notes` : base);
  const list = notes.filter((n) => matches(q, n.title, n.body));
  const create = () => { const n = store.create('notes', { project_id: project.id, title: 'Untitled note', body: '' }); setParams({ note: n.id }); };
  const del = async (n: Note) => { if (await confirmDialog({ title: `Delete “${n.title}”?`, message: 'The note moves to the trash.', danger: true, confirmLabel: 'Delete' })) { store.remove('notes', n.id); setParams({}); toast.success('Note deleted'); } };
  const sidebar = (
    <Card className="col" style={{ gap: 0 }}>
      <div className="card-head" style={{ padding: 12 }}><SearchBox value={q} onChange={setQ} placeholder="Search notes…" />{!mobile && <IconButton label="New note" icon={<Plus />} variant="primary" onClick={create} />}</div>
      {list.length ? <div className="list">{list.map((n) => (
        <div key={n.id} className={cx('list-row clickable', current?.id === n.id && !mobile && 'active')} style={{ cursor: 'pointer' }} onClick={() => setParams({ note: n.id })}>
          <div className="grow"><div className="row gap-4">{n.pinned && <Pin style={{ width: 13 }} className="star" />}<span className="strong truncate" style={{ fontWeight: 500 }}>{n.title}</span></div><div className="meta truncate">{n.body.replace(/[#*_>`-]/g, '').slice(0, 80) || 'Empty'}</div><div className="tiny faint">{timeAgo(n.updated_at)}</div></div>
          <span className="row gap-4" onClick={(e) => e.stopPropagation()}>
            <IconButton size="sm" label={n.pinned ? 'Unpin note' : 'Pin note'} icon={<Pin className={n.pinned ? 'star' : ''} />} onClick={() => store.update('notes', n.id, { pinned: !n.pinned })} />
            <IconButton size="sm" label="Delete note" icon={<Trash2 />} onClick={() => del(n)} />
          </span>
        </div>
      ))}</div> : <EmptyState icon={<StickyNote />} title={notes.length ? 'No matches' : 'No notes yet'} action={!notes.length && <Button variant="primary" icon={<Plus />} onClick={create}>New note</Button>}>{notes.length ? '' : 'Capture insights, decisions and context for this work.'}</EmptyState>}
    </Card>
  );
  if (mobile) return (
    <>
      {current ? <NoteEditor key={current.id} note={current} onBack={() => setParams({})} /> : sidebar}
      {!current && <button className="fab" aria-label="New note" onClick={create}><Plus /></button>}
    </>
  );
  return (
    <div className="notes-layout">
      <div className="sticky-panel">{sidebar}</div>
      {current ? <NoteEditor key={current.id} note={current} /> : <Card><EmptyState icon={<StickyNote />} title="No note selected" action={<Button variant="primary" icon={<Plus />} onClick={create}>New note</Button>} /></Card>}
    </div>
  );
}

// ================= Activity =================
const ACT_ICON: Record<string, React.ReactNode> = { prompts: <FileText />, files: <Files />, projects: <FolderKanban />, tasks: <CheckCircle2 />, notes: <StickyNote />, collections: <ListOrdered />, collection_steps: <ListChecks />, templates: <FileText /> };

export function ActivityTab() {
  useStoreVersion();
  const { project, base } = useWs();
  usePageMeta(`${project.name} · Activity`, base);
  const [kind, setKind] = useState('');
  const all = activityOf(project.id, !project.parent_id);
  const list = all.filter((a) => !kind || a.entity === kind || (kind === 'collections' && a.entity === 'collection_steps'));
  const [limit, setLimit] = useState(100);
  const grouped = useMemo(() => {
    const g = new Map<string, typeof list>();
    for (const a of list.slice(0, limit)) { const d = formatDate(a.created_at); g.set(d, [...(g.get(d) ?? []), a]); }
    return [...g.entries()];
  }, [list, limit]);
  const kinds = [['', 'All'], ['prompts', 'Prompts'], ['files', 'Files'], ['tasks', 'Tasks'], ['notes', 'Notes'], ['collections', 'Collections'], ['projects', 'Project']];
  return (
    <div className="col gap-16" style={{ maxWidth: 820 }}>
      <div className="chips">{kinds.map(([k, l]) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{l}</Chip>)}</div>
      {grouped.length === 0 ? <Card><EmptyState icon={<History />} title="No activity yet">Changes to prompts, files, tasks, notes and collections are recorded here.</EmptyState></Card> : grouped.map(([day, items]) => (
        <Card key={day}>
          <CardHead title={day} sub={plural(items.length, 'event')} />
          <div className="card-body timeline">
            {items.map((a) => <div key={a.id} className="timeline-item"><span className="t-icon">{ACT_ICON[a.entity] ?? <Upload />}</span><div className="col gap-4" style={{ minWidth: 0 }}><span className="small" style={{ wordBreak: 'break-word' }}>{a.summary}</span><span className="tiny faint">{new Date(a.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}{a.project_id !== project.id ? ` · ${store.get('projects', a.project_id)?.name ?? ''}` : ''}</span></div></div>)}
          </div>
        </Card>
      ))}
      {list.length > limit && <Button onClick={() => setLimit(limit + 100)}>Show older activity</Button>}
    </div>
  );
}
