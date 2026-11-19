import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ListOrdered, Plus, MoreVertical, Pencil, Trash2, PlayCircle, RotateCcw, PackageOpen, ArrowUp, ArrowDown, X, Check, Copy, ChevronLeft, ChevronRight, MessageSquarePlus, ListPlus, ExternalLink, CheckCircle2, FileText,
} from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { collectionsOf, stepsOf, promptsOf, getProject } from '../../lib/data';
import { copyText, timeAgo, plural, useIsMobile, matches, cx } from '../../lib/util';
import { fillVariables, mergeVariableMeta, missingRequired } from '../../../shared/variables';
import { Button, IconButton, Card, CardHead, EmptyState, Field, Input, Textarea, ProgressBar, TypeBadge, Checkbox, SearchBox, Badge } from '../../components/ui';
import { ActionMenu, Modal, confirmDialog, promptDialog, toast } from '../../components/overlay';
import { PromptText, VariableForm } from '../../components/domain';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import type { Collection, Prompt } from '../../../shared/schema';

export function collectionState(c: Collection) {
  const steps = stepsOf(c.id);
  const done = steps.filter((s) => s.completed).length;
  return { steps, done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0, label: !steps.length ? 'Empty' : done === steps.length ? 'Completed' : done || c.workflow_status === 'running' ? 'In progress' : 'Not started' };
}

export function CollectionFormModal({ projectId, collection, onClose, onSaved }: { projectId: string; collection?: Collection; onClose: () => void; onSaved?: (c: Collection) => void }) {
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const prompts = promptsOf(projectId).filter((p) => matches(q, p.title, p.content));
  const save = () => {
    if (!name.trim()) return;
    if (collection) { store.update('collections', collection.id, { name: name.trim(), description }); toast.success('Collection updated'); onSaved?.(collection); onClose(); return; }
    const c = store.create('collections', { project_id: projectId, name: name.trim(), description, sort: collectionsOf(projectId).length + 1 });
    selected.forEach((pid, i) => store.create('collection_steps', { collection_id: c.id, prompt_id: pid, sort: i + 1 }));
    toast.success('Collection created');
    onSaved?.(c);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={collection ? 'Edit collection' : 'New collection'} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!name.trim()}>{collection ? 'Save' : 'Create collection'}</Button></>}>
      <Field label="Name" required><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Complete Business Research" maxLength={200} /></Field>
      <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this workflow produce?" /></Field>
      {!collection && (
        <Field label={`Prompts in order of selection (${selected.length})`} hint="You can add, remove and reorder prompts later.">
          <SearchBox value={q} onChange={setQ} placeholder="Filter prompts…" />
          <div className="card list" style={{ maxHeight: 300, overflow: 'auto' }}>
            {prompts.length ? prompts.map((p) => {
              const i = selected.indexOf(p.id);
              return (
                <label key={p.id} className="list-row clickable" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={i >= 0} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
                  <div className="grow"><div className="truncate">{p.title}</div></div>
                  {i >= 0 && <span className="badge badge-mandatory">#{i + 1}</span>}
                  <TypeBadge type={p.type} />
                </label>
              );
            }) : <p className="card-body small muted">No prompts in this project yet.</p>}
          </div>
        </Field>
      )}
    </Modal>
  );
}

export default function CollectionsTab() {
  useStoreVersion();
  const { project, base } = useWs();
  const nav = useNavigate();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState<Collection | null>(null);
  usePageMeta(`${project.name} · Collections`, base);
  useEffect(() => { if (params.get('new')) { params.delete('new'); setParams(params, { replace: true }); } }, []);
  const cols = collectionsOf(project.id);
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div><h2>Prompt collections</h2><p className="small muted">Group prompts into ordered workflows and run them step by step.</p></div>
        {!mobile && <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Create collection</Button>}
      </div>
      {!cols.length ? (
        <Card><EmptyState icon={<ListOrdered />} title="No collections yet" action={<Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Create collection</Button>}>For example “Complete Business Research”: industry research → market analysis → competitor analysis → final report.</EmptyState></Card>
      ) : (
        <div className="grid grid-cards">
          {cols.map((c) => {
            const s = collectionState(c);
            return (
              <Card key={c.id} className="col" style={{ gap: 0 }}>
                <Link to={`${base}/collections/${c.id}`} className="card-pad col gap-12" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="row between"><span className="icon-tile sm tone-amber"><ListOrdered /></span><span onClick={(e) => e.preventDefault()}><CollectionMenu c={c} onEdit={() => setEditing(c)} /></span></div>
                  <div><div className="strong">{c.name}</div><div className="small muted clamp-2">{c.description || plural(s.total, 'step')}</div></div>
                  <div className="col gap-4"><div className="row between tiny muted"><span>{s.done} of {s.total} completed</span><span>{s.label}</span></div><ProgressBar value={s.pct} size="sm" /></div>
                </Link>
                <div className="row" style={{ padding: '0 20px 16px' }}>
                  <Button size="sm" variant="soft" icon={<PlayCircle />} disabled={!s.total} onClick={() => nav(`${base}/collections/${c.id}?run=1`)}>{s.done && s.done < s.total ? 'Resume' : s.done === s.total && s.total ? 'Review' : 'Start'}</Button>
                  <Button size="sm" variant="ghost" icon={<PackageOpen />} disabled={!s.total} onClick={() => nav(`${base}/collections/${c.id}/pack`)}>Pack</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {mobile && <button className="fab" aria-label="Create collection" onClick={() => setCreating(true)}><Plus /></button>}
      {creating && <CollectionFormModal projectId={project.id} onClose={() => setCreating(false)} onSaved={(c) => nav(`${base}/collections/${c.id}`)} />}
      {editing && <CollectionFormModal projectId={project.id} collection={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CollectionMenu({ c, onEdit }: { c: Collection; onEdit: () => void }) {
  const nav = useNavigate();
  const base = `/p/${c.project_id}`;
  return (
    <ActionMenu title={c.name} items={[
      { label: 'Edit name & description', icon: <Pencil />, onClick: onEdit },
      { label: 'Generate prompt pack', icon: <PackageOpen />, onClick: () => nav(`${base}/collections/${c.id}/pack`) },
      { label: 'Reset progress', icon: <RotateCcw />, onClick: () => resetProgress(c) },
      { divider: true, label: '' },
      { label: 'Delete collection', icon: <Trash2 />, danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete “${c.name}”?`, message: 'The collection is moved to the trash. The prompts themselves are not deleted.', danger: true, confirmLabel: 'Delete' })) { store.remove('collections', c.id); toast.success('Collection deleted'); if (location.pathname.includes(c.id)) nav(`${base}/collections`); } } },
    ]} trigger={(t) => <IconButton size="sm" label="Collection actions" icon={<MoreVertical />} {...t} />} />
  );
}

async function resetProgress(c: Collection) {
  if (!(await confirmDialog({ title: 'Reset workflow progress?', message: 'All steps will be marked as not completed.', confirmLabel: 'Reset' }))) return;
  for (const s of stepsOf(c.id)) if (s.completed) store.update('collection_steps', s.id, { completed: false, completed_at: null });
  store.update('collections', c.id, { workflow_status: 'idle', current_step_id: null, started_at: null, finished_at: null });
  toast.success('Progress reset');
}

export function CollectionDetail() {
  useStoreVersion();
  const { project, base } = useWs();
  const { cid } = useParams();
  const nav = useNavigate();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const c = cid ? store.get('collections', cid) : undefined;
  usePageMeta(c?.name ?? 'Collection', `${base}/collections`);
  if (!c) return <Card pad>Collection not found. <Link to={`${base}/collections`}>Back</Link></Card>;
  const st = collectionState(c);
  if (params.get('run') === '1' && st.total) return <WorkflowRunner c={c} onExit={() => { params.delete('run'); setParams(params, { replace: true }); }} />;
  const move = (i: number, d: -1 | 1) => {
    const ids = st.steps.map((s) => s.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ids.forEach((id, k) => store.update('collection_steps', id, { sort: k + 1 }));
  };
  const editInstructions = async (stepId: string, current: string) => {
    const v = await promptDialog({ title: 'Instructions for this step', label: 'Shown before the prompt in the workflow and prompt pack', defaultValue: current, confirmLabel: 'Save' });
    if (v !== null) store.update('collection_steps', stepId, { instructions: v });
  };
  return (
    <>
      <div className="row between row-wrap gap-12" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          {!mobile && <Link to={`${base}/collections`} className="small muted">← All collections</Link>}
          <h2 style={{ fontSize: 20 }}>{c.name}</h2>
          {c.description && <p className="muted small">{c.description}</p>}
        </div>
        <div className="row row-wrap">
          <Button variant="primary" icon={<PlayCircle />} disabled={!st.total} onClick={() => setParams({ run: '1' })}>{st.done && st.done < st.total ? 'Resume workflow' : st.done === st.total && st.total ? 'Review workflow' : 'Start workflow'}</Button>
          <Button icon={<PackageOpen />} disabled={!st.total} onClick={() => nav(`${base}/collections/${c.id}/pack`)}>Generate pack</Button>
          <CollectionMenu c={c} onEdit={() => setEditing(true)} />
        </div>
      </div>
      <Card>
        <CardHead title={`${st.done} of ${st.total} completed`} sub={c.started_at ? `Started ${timeAgo(c.started_at)}${c.finished_at ? ` · finished ${timeAgo(c.finished_at)}` : ''}` : 'Not started'} actions={<Button size="sm" icon={<ListPlus />} onClick={() => setAdding(true)}>Add prompts</Button>} />
        <div className="card-body">
          <ProgressBar value={st.pct} />
          {!st.total ? <EmptyState icon={<ListOrdered />} title="No steps yet" action={<Button variant="primary" icon={<ListPlus />} onClick={() => setAdding(true)}>Add prompts</Button>}>Add existing prompts from this {project.parent_id ? 'subproject' : 'project'} in the order they should run.</EmptyState> : (
            <div className="mt-8">
              {st.steps.map((s, i) => (
                <div key={s.id} className={cx('wf-step', s.completed && 'done', c.current_step_id === s.id && !s.completed && 'current')}>
                  <button className="wf-dot" aria-label={s.completed ? 'Mark step as not completed' : 'Mark step as completed'} onClick={() => store.update('collection_steps', s.id, { completed: !s.completed })}>{s.completed ? <Check /> : <span className="tiny">{i + 1}</span>}</button>
                  <div className="grow col gap-4" style={{ minWidth: 0 }}>
                    <div className="row gap-8 row-wrap"><Link to={`${base}/prompts/${s.prompt.id}`} className="strong" style={{ color: 'var(--text)' }}>{s.prompt.title}</Link><TypeBadge type={s.prompt.type} />{s.completed && <span className="tiny success-text">Completed {timeAgo(s.completed_at)}</span>}</div>
                    {s.instructions ? <button className="small muted pre" style={{ border: 0, background: 'var(--surface-2)', borderRadius: 6, padding: '6px 10px', textAlign: 'left', cursor: 'pointer' }} onClick={() => editInstructions(s.id, s.instructions)}>{s.instructions}</button>
                      : <button className="small" style={{ border: 0, background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, textAlign: 'left' }} onClick={() => editInstructions(s.id, '')}><MessageSquarePlus style={{ width: 14, height: 14, display: 'inline', verticalAlign: '-2px' }} /> Add instructions</button>}
                  </div>
                  <div className="row gap-4">
                    <IconButton size="sm" label="Move up" icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} />
                    <IconButton size="sm" label="Move down" icon={<ArrowDown />} disabled={i === st.steps.length - 1} onClick={() => move(i, 1)} />
                    <IconButton size="sm" label="Remove from collection" icon={<X />} onClick={() => { store.remove('collection_steps', s.id); toast.success('Removed from collection (the prompt is kept)'); }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      {adding && <AddPromptsModal c={c} onClose={() => setAdding(false)} />}
      {editing && <CollectionFormModal projectId={project.id} collection={c} onClose={() => setEditing(false)} />}
    </>
  );
}

function AddPromptsModal({ c, onClose }: { c: Collection; onClose: () => void }) {
  const existing = new Set(stepsOf(c.id).map((s) => s.prompt_id));
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const prompts = promptsOf(c.project_id).filter((p) => !existing.has(p.id) && matches(q, p.title, p.content));
  const add = () => {
    const start = stepsOf(c.id).length;
    sel.forEach((pid, i) => store.create('collection_steps', { collection_id: c.id, prompt_id: pid, sort: start + i + 1 }));
    toast.success(`Added ${plural(sel.length, 'prompt')}`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Add prompts to collection" size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!sel.length} onClick={add}>Add {sel.length || ''}</Button></>}>
      <SearchBox value={q} onChange={setQ} placeholder="Search prompts…" autoFocus />
      <div className="card list" style={{ maxHeight: 380, overflow: 'auto' }}>
        {prompts.length ? prompts.map((p) => (
          <label key={p.id} className="list-row clickable" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
            <div className="grow"><div className="truncate">{p.title}</div><div className="meta truncate">{p.content.slice(0, 100)}</div></div>
            {sel.includes(p.id) && <span className="badge badge-mandatory">#{sel.indexOf(p.id) + 1}</span>}
            <TypeBadge type={p.type} />
          </label>
        )) : <p className="card-body small muted">{existing.size ? 'All prompts in this project are already in the collection.' : 'No prompts found.'}</p>}
      </div>
    </Modal>
  );
}

function WorkflowRunner({ c, onExit }: { c: Collection; onExit: () => void }) {
  const st = collectionState(c);
  const mobile = useIsMobile();
  const project = getProject(c.project_id)!;
  const firstOpen = st.steps.findIndex((s) => !s.completed);
  const startIdx = Math.max(0, st.steps.findIndex((s) => s.id === c.current_step_id) >= 0 ? st.steps.findIndex((s) => s.id === c.current_step_id) : firstOpen >= 0 ? firstOpen : 0);
  const [idx, setIdx] = useState(startIdx);
  const [values, setValues] = useState<Record<string, string>>({ ...(project.variable_values || {}) });
  useEffect(() => {
    if (c.workflow_status !== 'running' && firstOpen >= 0) store.update('collections', c.id, { workflow_status: 'running', started_at: c.started_at ?? new Date().toISOString() });
  }, []);
  const step = st.steps[Math.min(idx, st.steps.length - 1)];
  useEffect(() => { if (step && c.current_step_id !== step.id) store.update('collections', c.id, { current_step_id: step.id }); }, [step?.id]);
  if (!step) return null;
  const p: Prompt = step.prompt;
  const meta = mergeVariableMeta(p.content, p.variables, p.instructions);
  const text = fillVariables(p.content, values) + (p.instructions ? `\n\n${fillVariables(p.instructions, values)}` : '');
  const missing = missingRequired(meta, values);
  const saveVals = () => {
    const keep = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    if (JSON.stringify(keep) !== JSON.stringify(Object.fromEntries(Object.entries(project.variable_values || {}).filter(([, v]) => v)))) store.update('projects', project.id, { variable_values: { ...project.variable_values, ...keep } });
  };
  const complete = () => {
    if (!step.completed) store.update('collection_steps', step.id, { completed: true });
    saveVals();
    const remaining = st.steps.filter((s) => !s.completed && s.id !== step.id);
    if (!remaining.length) {
      store.update('collections', c.id, { workflow_status: 'done', finished_at: new Date().toISOString(), current_step_id: null });
      toast.success('Workflow complete!');
      onExit();
      return;
    }
    const next = st.steps.findIndex((s, i) => i > idx && !s.completed);
    setIdx(next >= 0 ? next : st.steps.indexOf(remaining[0]));
  };
  const stepList = (
    <Card>
      <CardHead title="Steps" sub={`${st.done} of ${st.total} completed`} />
      <div className="list">
        {st.steps.map((s, i) => (
          <button key={s.id} className={cx('list-row', i === idx && 'active')} onClick={() => setIdx(i)}>
            {s.completed ? <CheckCircle2 style={{ width: 18, color: 'var(--success)' }} /> : <span className="badge" style={{ minWidth: 24, justifyContent: 'center' }}>{i + 1}</span>}
            <span className="grow truncate" style={{ textAlign: 'left' }}>{s.prompt.title}</span>
            <TypeBadge type={s.prompt.type} />
          </button>
        ))}
      </div>
    </Card>
  );
  return (
    <div className="col gap-16">
      <div className="row between row-wrap gap-12">
        <div><div className="small muted">{c.name}</div><h2>Step {idx + 1} of {st.total}</h2></div>
        <Button icon={<X />} onClick={() => { saveVals(); onExit(); }}>Exit workflow</Button>
      </div>
      <ProgressBar value={st.pct} />
      <div className="split" style={{ gridTemplateColumns: mobile ? undefined : 'minmax(0, 1fr) 300px' }}>
        <Card className="col" style={{ gap: 0 }}>
          <div className="card-head"><div className="col gap-4" style={{ minWidth: 0 }}><h2 className="truncate">{p.title}</h2><div className="row gap-4"><TypeBadge type={p.type} />{step.completed && <Badge tone="success">Completed</Badge>}</div></div><Link to={`/p/${p.project_id}/prompts/${p.id}`} className="small row gap-4"><ExternalLink style={{ width: 14 }} />Open prompt</Link></div>
          <div className="card-body col gap-16">
            {step.instructions && <div className="alert info pre"><FileText />{fillVariables(step.instructions, values)}</div>}
            {meta.length > 0 && <VariableForm meta={meta} values={values} onChange={setValues} compact={mobile} />}
            <PromptText content={p.content} values={values} />
            {p.instructions && <div className="small"><span className="strong">Additional instructions: </span>{fillVariables(p.instructions, values)}</div>}
            {missing.length > 0 && <div className="tiny warning-text">{missing.length} required variable{missing.length === 1 ? '' : 's'} not filled.</div>}
            <ol className="small muted" style={{ margin: 0, paddingLeft: 18 }}><li>Copy the prompt.</li><li>Run it in your AI tool.</li><li>Upload the result under AI Outputs, then mark this step complete.</li></ol>
          </div>
          <div className="sticky-actions" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '0 0 12px 12px', flexWrap: 'wrap' }}>
            <IconButton label="Previous step" icon={<ChevronLeft />} disabled={idx === 0} onClick={() => setIdx(idx - 1)} />
            <Button variant="soft" icon={<Copy />} onClick={async () => { await copyText(text); saveVals(); toast.success('Prompt copied — paste it into your AI tool'); }}>Copy prompt</Button>
            <div className="grow" />
            {step.completed ? <Button icon={<ChevronRight />} disabled={idx === st.total - 1} onClick={() => setIdx(idx + 1)}>Next</Button>
              : <Button variant="primary" icon={<Check />} onClick={complete}>{st.steps.filter((s) => !s.completed).length === 1 ? 'Complete workflow' : 'Mark complete & next'}</Button>}
          </div>
        </Card>
        {!mobile && <div className="sticky-panel">{stepList}</div>}
      </div>
      {mobile && stepList}
    </div>
  );
}

export { Checkbox, useMemo };
