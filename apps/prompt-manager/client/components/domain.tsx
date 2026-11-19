import { useId, useMemo, useState, type ReactNode } from 'react';
import { diffWords, diffLines } from 'diff';
import {
  Folder, Briefcase, BarChart3, Rocket, Lightbulb, Target, BookOpen, Megaphone, DollarSign, Users, FlaskConical, Globe, Layers, Sparkles,
  FileText, FileSpreadsheet, Presentation, Image as ImageIcon, FileType2, FileCode2, X, Plus, Check,
} from 'lucide-react';
import { Button, Field, Input, Textarea, Select, Segmented, Switch, Chip } from './ui';
import { Modal, toast } from './overlay';
import { cx } from '../lib/util';
import { allTags, registerTags, topProjects, subprojectsOf } from '../lib/data';
import { store } from '../lib/store';
import { humanizeVariable } from '../../shared/variables';
import type { Project, Status, VariableMeta } from '../../shared/schema';

export const PROJECT_ICONS: Record<string, (p: { className?: string }) => ReactNode> = {
  folder: (p) => <Folder {...p} />, briefcase: (p) => <Briefcase {...p} />, chart: (p) => <BarChart3 {...p} />, rocket: (p) => <Rocket {...p} />,
  lightbulb: (p) => <Lightbulb {...p} />, target: (p) => <Target {...p} />, book: (p) => <BookOpen {...p} />, megaphone: (p) => <Megaphone {...p} />,
  dollar: (p) => <DollarSign {...p} />, users: (p) => <Users {...p} />, flask: (p) => <FlaskConical {...p} />, globe: (p) => <Globe {...p} />,
  layers: (p) => <Layers {...p} />, sparkles: (p) => <Sparkles {...p} />,
};
export const TONES = ['indigo', 'blue', 'green', 'amber', 'red', 'violet', 'teal', 'pink', 'slate'];

export function ProjectIcon({ project, size }: { project?: Pick<Project, 'icon' | 'color'>; size?: 'sm' | 'lg' }) {
  const I = PROJECT_ICONS[project?.icon || 'folder'] ?? PROJECT_ICONS.folder;
  return <span className={cx('icon-tile', size, `tone-${project?.color || 'indigo'}`)} aria-hidden><I /></span>;
}

const IMG = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
export function FileGlyph({ ext, size = 28 }: { ext: string; size?: number }) {
  const s = { width: size, height: size };
  if (ext === 'pdf') return <FileText style={{ ...s, color: '#D64545' }} />;
  if (['doc', 'docx'].includes(ext)) return <FileType2 style={{ ...s, color: '#2F6BD8' }} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet style={{ ...s, color: '#1F8A4C' }} />;
  if (['ppt', 'pptx'].includes(ext)) return <Presentation style={{ ...s, color: '#D9701E' }} />;
  if (IMG.has(ext)) return <ImageIcon style={{ ...s, color: '#7646C8' }} />;
  if (['json', 'md', 'markdown'].includes(ext)) return <FileCode2 style={{ ...s, color: '#4A5470' }} />;
  return <FileText style={{ ...s, color: '#4A5470' }} />;
}
export const ExtBadge = ({ ext }: { ext: string }) => <span className={cx('ext-badge', IMG.has(ext) ? 'ext-img' : `ext-${ext}`)}>{ext}</span>;
export const isImage = (ext: string) => IMG.has(ext);

export function TagInput({ value, onChange, placeholder = 'Add tag…' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const suggestions = useMemo(() => allTags().filter((t) => !value.includes(t)), [value]);
  const add = (raw: string) => {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...value, ...parts])].slice(0, 50));
    setText('');
  };
  const listId = useMemo(() => 'tags-' + Math.random().toString(36).slice(2), []);
  return (
    <div className="tag-input" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {value.map((t) => <span key={t} className="tag">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X /></button></span>)}
      <input value={text} list={listId} placeholder={value.length ? '' : placeholder} aria-label="Add tag" maxLength={50}
        onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) add(v); else setText(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(text); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => add(text)} />
      <datalist id={listId}>{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}

/** Render prompt text with {variables} highlighted (filled ones shown with their values). */
export function PromptText({ content, values, className }: { content: string; values?: Record<string, string>; className?: string }) {
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    const re = /(?<!\{)\{([A-Za-z_][A-Za-z0-9_.-]{0,63})\}(?!\})/g;
    let last = 0; let m: RegExpExecArray | null; let i = 0;
    while ((m = re.exec(content))) {
      out.push(content.slice(last, m.index));
      const v = values?.[m[1]];
      out.push(v ? <span key={i++} className="var filled" title={`{${m[1]}}`}>{v}</span> : <span key={i++} className="var">{m[0]}</span>);
      last = m.index + m[0].length;
    }
    out.push(content.slice(last));
    return out;
  }, [content, values]);
  return <div className={cx('prompt-text', className)}>{parts}</div>;
}

export function VariableForm({ meta, values, onChange, compact }: { meta: VariableMeta[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; compact?: boolean }) {
  const uid = useId();
  if (!meta.length) return <p className="small muted">This prompt has no variables. Add <span className="var-chip">{'{like_this}'}</span> to the content to create fillable fields.</p>;
  return (
    <div className={cx('grid', !compact && 'grid-2')} style={{ gap: 12 }}>
      {meta.map((m) => {
        const long = (values[m.name] || '').length > 60;
        return (
          <Field key={m.name} label={humanizeVariable(m.name)} required={m.required} hint={m.description || `{${m.name}}`} htmlFor={`${uid}-${m.name}`}>
            {long ? <Textarea id={`${uid}-${m.name}`} rows={3} value={values[m.name] ?? ''} onChange={(e) => onChange({ ...values, [m.name]: e.target.value })} />
              : <Input id={`${uid}-${m.name}`} value={values[m.name] ?? ''} placeholder={m.required ? 'Required' : 'Optional'} onChange={(e) => onChange({ ...values, [m.name]: e.target.value })} />}
          </Field>
        );
      })}
    </div>
  );
}

/** Editor for variable metadata (required flag + description). */
export function VariableMetaEditor({ meta, onChange }: { meta: VariableMeta[]; onChange: (m: VariableMeta[]) => void }) {
  if (!meta.length) return <p className="small muted">No variables detected. Type <span className="var-chip">{'{company_name}'}</span> in the content to add one.</p>;
  return (
    <div className="col gap-12">
      {meta.map((m, i) => (
        <div key={m.name} className="row gap-12 row-wrap" style={{ alignItems: 'flex-start' }}>
          <span className="var-chip" style={{ marginTop: 10 }}>{`{${m.name}}`}</span>
          <Input className="grow" style={{ flex: '1 1 180px' }} placeholder="Description (optional)" value={m.description || ''} onChange={(e) => onChange(meta.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          <Segmented label="Required" value={m.required ? 'req' : 'opt'} onChange={(v) => onChange(meta.map((x, j) => (j === i ? { ...x, required: v === 'req' } : x)))} options={[{ value: 'req', label: 'Required' }, { value: 'opt', label: 'Optional' }]} />
        </div>
      ))}
    </div>
  );
}

export function DiffView({ before, after, beforeLabel, afterLabel, granularity = 'words' }: { before: string; after: string; beforeLabel: ReactNode; afterLabel: ReactNode; granularity?: 'words' | 'lines' }) {
  const [mode, setMode] = useState<'side' | 'unified' | 'before' | 'after'>(window.matchMedia('(max-width: 860px)').matches ? 'unified' : 'side');
  const parts = useMemo(() => {
    if (before.length + after.length > 400_000) return diffLines(before, after);
    return granularity === 'lines' ? diffLines(before, after) : diffWords(before, after);
  }, [before, after, granularity]);
  const stats = useMemo(() => ({ add: parts.filter((p) => p.added).reduce((s, p) => s + p.value.length, 0), del: parts.filter((p) => p.removed).reduce((s, p) => s + p.value.length, 0) }), [parts]);
  const left = parts.map((p, i) => (p.added ? null : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>));
  const right = parts.map((p, i) => (p.removed ? null : p.added ? <ins key={i}>{p.value}</ins> : <span key={i}>{p.value}</span>));
  const unified = parts.map((p, i) => (p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>));
  return (
    <div className="col gap-12">
      <div className="row between row-wrap gap-12">
        <Segmented label="Comparison view" value={mode} onChange={setMode} options={[{ value: 'side', label: 'Side by side' }, { value: 'unified', label: 'Changes' }, { value: 'before', label: 'Before' }, { value: 'after', label: 'After' }]} />
        <div className="diff-legend"><span><i style={{ background: 'var(--diff-add)' }} />Added ({stats.add.toLocaleString()} chars)</span><span><i style={{ background: 'var(--diff-del)' }} />Removed ({stats.del.toLocaleString()} chars)</span></div>
      </div>
      {stats.add === 0 && stats.del === 0 && <div className="alert info">The two versions have identical text.</div>}
      {mode === 'side' ? (
        <div className="diff-cols">
          <div className="diff-col"><div className="diff-col-head">{beforeLabel}</div><div className="diff-col-body diff">{left}</div></div>
          <div className="diff-col"><div className="diff-col-head">{afterLabel}</div><div className="diff-col-body diff">{right}</div></div>
        </div>
      ) : (
        <div className="diff-col">
          <div className="diff-col-head">{mode === 'before' ? beforeLabel : mode === 'after' ? afterLabel : <span>Changes from {beforeLabel} to {afterLabel}</span>}</div>
          <div className="diff-col-body diff">{mode === 'before' ? before : mode === 'after' ? after : unified}</div>
        </div>
      )}
    </div>
  );
}

/** Grouped picker for projects and subprojects. */
export function ProjectSelect({ value, onChange, includeEmpty, id }: { value: string; onChange: (v: string) => void; includeEmpty?: string; id?: string }) {
  const tops = topProjects(true).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {includeEmpty !== undefined && <option value="">{includeEmpty}</option>}
      {tops.map((p) => (
        <optgroup key={p.id} label={p.name}>
          <option value={p.id}>{p.name} (project)</option>
          {subprojectsOf(p.id).map((s) => <option key={s.id} value={s.id}>↳ {s.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

export function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return <Segmented label="Status" value={value} onChange={onChange} options={[{ value: 'not_started', label: 'Not Started' }, { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }]} />;
}

/** Create / edit project or subproject. */
type ProjectFormProps = { open: boolean; onClose: () => void; project?: Project; parentId?: string | null; onSaved?: (p: Project) => void };
/** Mounted only while open so its form state always starts from the given project. */
export function ProjectFormModal(props: ProjectFormProps) { return props.open ? <ProjectFormInner {...props} /> : null; }
function ProjectFormInner({ open, onClose, project, parentId, onSaved }: ProjectFormProps) {
  const editing = !!project;
  const isSub = !!(project?.parent_id ?? parentId);
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [tags, setTags] = useState<string[]>(project?.tags ?? []);
  const [status, setStatus] = useState<Status>(project?.status ?? 'not_started');
  const [icon, setIcon] = useState(project?.icon ?? (isSub ? 'layers' : 'folder'));
  const [color, setColor] = useState(project?.color ?? 'indigo');
  const [pinned, setPinned] = useState(project?.pinned ?? false);
  const [favourite, setFavourite] = useState(project?.favourite ?? false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    registerTags(tags);
    const data = { name: name.trim(), description: description.trim(), tags, status, icon, color, pinned, favourite };
    let saved: Project;
    if (editing) { store.update('projects', project!.id, data); saved = { ...project!, ...data }; toast.success(`${isSub ? 'Subproject' : 'Project'} updated`); }
    else {
      const siblings = parentId ? subprojectsOf(parentId) : topProjects(true);
      saved = store.create('projects', { ...data, parent_id: parentId ?? null, sort: siblings.length + 1 });
      toast.success(`${isSub ? 'Subproject' : 'Project'} created`);
    }
    onSaved?.(saved);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${isSub ? 'subproject' : 'project'}` : `New ${isSub ? 'subproject' : 'project'}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} icon={<Check />}>{editing ? 'Save changes' : 'Create'}</Button></>}>
      <form className="col gap-16" onSubmit={(e) => { e.preventDefault(); if ((document.activeElement as HTMLElement | null)?.closest('.tag-input')) return; save(); }}>
        <Field label="Name" required error={error}><Input autoFocus value={name} maxLength={200} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder={isSub ? 'e.g. Market Research' : 'e.g. Business Development'} /></Field>
        <Field label="Description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this workspace for?" /></Field>
        <Field label="Tags" hint="Press Enter or comma to add"><TagInput value={tags} onChange={setTags} /></Field>
        <Field label="Status"><StatusSelect value={status} onChange={setStatus} /></Field>
        <Field label="Icon">
          <div className="row row-wrap gap-4">
            {Object.keys(PROJECT_ICONS).map((k) => (
              <button key={k} type="button" aria-label={k} aria-pressed={icon === k} onClick={() => setIcon(k)} className="btn btn-ghost btn-icon" style={{ outline: icon === k ? '2px solid var(--primary)' : undefined }}>
                <ProjectIcon project={{ icon: k, color }} size="sm" />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Colour">
          <div className="row row-wrap gap-4">{TONES.map((t) => <button key={t} type="button" aria-label={t} aria-pressed={color === t} onClick={() => setColor(t)} className={cx('icon-tile sm', `tone-${t}`)} style={{ border: color === t ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }}>{color === t && <Check />}</button>)}</div>
        </Field>
        <div className="col gap-12">
          <Switch label="Pin to dashboard" checked={pinned} onChange={setPinned} />
          <Switch label="Favourite" checked={favourite} onChange={setFavourite} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function NewMenuChips({ items }: { items: { label: string; icon: ReactNode; onClick: () => void }[] }) {
  return <div className="chips">{items.map((i) => <Chip key={i.label} icon={i.icon} onClick={i.onClick}>{i.label}</Chip>)}</div>;
}

export { Plus };
