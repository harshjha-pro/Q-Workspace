import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Upload, Copy, Pencil, Trash2, MoreVertical, History, CopyPlus, ListPlus, BookmarkPlus, FolderInput, GripVertical, ArrowUp, ArrowDown,
  FileText, ListOrdered, Tag as TagIcon, CheckCircle2, Circle, RotateCcw, GitCompare, Eye, PackageOpen, ArrowUpDown, X,
} from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { promptsOf, collectionsOf, stepsOf, versionsOfPrompt, getProject, projectLabel, registerTags } from '../../lib/data';
import { api } from '../../lib/api';
import { copyText, matches, timeAgo, formatDateTime, useIsMobile, plural, cx } from '../../lib/util';
import { fillVariables, missingRequired, humanizeVariable } from '../../../shared/variables';
import { Button, IconButton, Card, CardHead, EmptyState, SearchBox, TypeBadge, Tags, Segmented, Field, Select, Input, Tabs, Chip, ButtonLink } from '../../components/ui';
import { ActionMenu, Modal, confirmDialog, toast } from '../../components/overlay';
import { PromptText, VariableForm, DiffView, ProjectSelect } from '../../components/domain';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import type { Prompt, PromptVersion } from '../../../shared/schema';

type Filter = { kind: 'all' | 'mandatory' | 'optional' | 'collection' | 'tag'; value?: string };

export default function PromptsPage() {
  useStoreVersion();
  const { project, base } = useWs();
  const { pid } = useParams();
  const mobile = useIsMobile();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [filter, setFilter] = useState<Filter>({ kind: (params.get('type') as Filter['kind']) || 'all' });
  const [reorder, setReorder] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const all = promptsOf(project.id);
  const collections = collectionsOf(project.id);
  const tags = useMemo(() => [...new Set(all.flatMap((p) => p.tags))].sort(), [store.version, project.id]);
  usePageMeta(pid && mobile ? (store.get('prompts', pid)?.title ?? 'Prompt') : `${project.name} · Prompts`, pid && mobile ? `${base}/prompts` : base);

  const inCollection = (cid: string) => new Set(stepsOf(cid).map((s) => s.prompt_id));
  const list = all.filter((p) => {
    if (filter.kind === 'mandatory' && p.type !== 'mandatory') return false;
    if (filter.kind === 'optional' && p.type !== 'optional') return false;
    if (filter.kind === 'tag' && !p.tags.includes(filter.value!)) return false;
    if (filter.kind === 'collection' && !inCollection(filter.value!).has(p.id)) return false;
    return matches(q, p.title, p.content, p.description, p.tags, p.purpose);
  });
  const selected = pid ? store.get('prompts', pid) : undefined;
  useEffect(() => { if (q) params.set('q', q); else params.delete('q'); setParams(params, { replace: true }); }, [q]);

  const move = (id: string, dir: -1 | 1) => {
    const ids = all.map((p) => p.id);
    const i = ids.indexOf(id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
  };
  const applyOrder = (ids: string[]) => ids.forEach((id, i) => { const p = store.get('prompts', id); if (p && p.sort !== i + 1) store.update('prompts', id, { sort: i + 1 }); });
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = all.map((p) => p.id).filter((x) => x !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    applyOrder(ids);
    setDragId(null); setOverId(null);
  };

  const counts = { all: all.length, mandatory: all.filter((p) => p.type === 'mandatory').length, optional: all.filter((p) => p.type === 'optional').length };
  const rail = (
    <div className="filter-rail card" style={{ padding: 8 }}>
      <button className="nav-filter" aria-pressed={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}><FileText />All<span className="n">{counts.all}</span></button>
      <button className="nav-filter" aria-pressed={filter.kind === 'mandatory'} onClick={() => setFilter({ kind: 'mandatory' })}><CheckCircle2 />Mandatory<span className="n">{counts.mandatory}</span></button>
      <button className="nav-filter" aria-pressed={filter.kind === 'optional'} onClick={() => setFilter({ kind: 'optional' })}><Circle />Optional<span className="n">{counts.optional}</span></button>
      {collections.length > 0 && <h4>By collection</h4>}
      {collections.map((c) => <button key={c.id} className="nav-filter" aria-pressed={filter.kind === 'collection' && filter.value === c.id} onClick={() => setFilter({ kind: 'collection', value: c.id })}><ListOrdered /><span className="truncate">{c.name}</span><span className="n">{stepsOf(c.id).length}</span></button>)}
      {tags.length > 0 && <h4>Tags</h4>}
      {tags.slice(0, 20).map((t) => <button key={t} className="nav-filter" aria-pressed={filter.kind === 'tag' && filter.value === t} onClick={() => setFilter({ kind: 'tag', value: t })}><TagIcon /><span className="truncate">{t}</span></button>)}
    </div>
  );

  const header = (
    <div className="row row-wrap gap-8" style={{ marginBottom: 12 }}>
      <SearchBox value={q} onChange={setQ} placeholder="Search prompts…" className="grow" />
      {!mobile && <Button icon={<Upload />} onClick={() => nav(`/import?dest=${project.id}`)}>Import</Button>}
      {!mobile && <Button icon={<PackageOpen />} onClick={() => nav(`${base}/pack`)}>Pack</Button>}
      {!mobile && <Button variant="primary" icon={<Plus />} onClick={() => nav(`${base}/prompts/new`)}>Add Prompt</Button>}
    </div>
  );

  const listView = (
    <div className="col" style={{ gap: 0 }}>
      {mobile && (
        <div className="chips" style={{ marginBottom: 12 }}>
          <Chip active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>All ({counts.all})</Chip>
          <Chip active={filter.kind === 'mandatory'} onClick={() => setFilter({ kind: 'mandatory' })}>Mandatory ({counts.mandatory})</Chip>
          <Chip active={filter.kind === 'optional'} onClick={() => setFilter({ kind: 'optional' })}>Optional ({counts.optional})</Chip>
          {collections.map((c) => <Chip key={c.id} active={filter.kind === 'collection' && filter.value === c.id} onClick={() => setFilter({ kind: 'collection', value: c.id })}>{c.name}</Chip>)}
          {tags.map((t) => <Chip key={t} active={filter.kind === 'tag' && filter.value === t} onClick={() => setFilter({ kind: 'tag', value: t })}>#{t}</Chip>)}
        </div>
      )}
      <Card>
        <div className="card-head" style={{ padding: '10px 12px' }}>
          <span className="small muted">{plural(list.length, 'prompt')}{filter.kind !== 'all' || q ? ' (filtered)' : ''}</span>
          {all.length > 1 && filter.kind === 'all' && !q && <Button size="sm" variant={reorder ? 'primary' : 'ghost'} icon={reorder ? <CheckCircle2 /> : <ArrowUpDown />} onClick={() => setReorder(!reorder)}>{reorder ? 'Done' : 'Reorder'}</Button>}
        </div>
        {list.length === 0 ? (
          all.length === 0 ? (
            <EmptyState icon={<FileText />} title="No prompts yet" action={<><Button variant="primary" icon={<Plus />} onClick={() => nav(`${base}/prompts/new`)}>Add prompt</Button><Button icon={<Upload />} onClick={() => nav(`/import?dest=${project.id}`)}>Bulk import</Button><ButtonLink to="/library">Use a template</ButtonLink></>}>Add prompts one by one, import hundreds from CSV, Excel or JSON, or insert templates from your library.</EmptyState>
          ) : <EmptyState icon={<FileText />} title="No matching prompts">Try another search or filter.</EmptyState>
        ) : (
          <div className="list">
            {list.map((p, i) => (
              <div key={p.id}
                className={cx('list-row clickable', p.type === 'mandatory' && 'mandatory', selected?.id === p.id && 'active', dragId === p.id && 'dragging', overId === p.id && 'drop-target')}
                draggable={reorder && !mobile} onDragStart={() => setDragId(p.id)} onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(p.id); } }} onDragEnd={() => { setDragId(null); setOverId(null); }} onDrop={(e) => { e.preventDefault(); drop(p.id); }}
                onClick={() => !reorder && nav(`${base}/prompts/${p.id}`)} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' && !reorder) nav(`${base}/prompts/${p.id}`); }} style={{ cursor: reorder ? 'default' : 'pointer' }}>
                {reorder && !mobile && <span className="drag-handle" aria-hidden><GripVertical style={{ width: 16 }} /></span>}
                <div className="grow">
                  <div className="row gap-4"><span className="strong truncate">{p.title}</span></div>
                  <div className="meta truncate">{p.description || p.content.replace(/\s+/g, ' ').slice(0, 140)}</div>
                  <div className="row gap-4 mt-4 row-wrap"><TypeBadge type={p.type} />{p.variables.length > 0 && <span className="badge badge-outline">{plural(p.variables.length, 'variable')}</span>}<Tags tags={p.tags} max={2} />{store.isLocal('prompts', p.id) && <span className="badge badge-warning">Not synced</span>}</div>
                </div>
                {reorder ? (
                  <span className="row gap-4" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="sm" label="Move up" icon={<ArrowUp />} disabled={i === 0} onClick={() => move(p.id, -1)} />
                    <IconButton size="sm" label="Move down" icon={<ArrowDown />} disabled={i === list.length - 1} onClick={() => move(p.id, 1)} />
                  </span>
                ) : (
                  <span className="row gap-4" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="sm" label="Copy prompt" icon={<Copy />} onClick={async () => { await copyText(p.content); toast.success('Prompt copied'); }} />
                    <PromptMenu prompt={p} />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  if (mobile) {
    if (selected) return <PromptDetail prompt={selected} />;
    return (
      <>
        {header}
        {listView}
        <button className="fab" aria-label="Add prompt" onClick={() => nav(`${base}/prompts/new`)}><Plus /></button>
      </>
    );
  }
  return (
    <>
      {header}
      <div className="split-3">
        <div className="sticky-panel">{rail}</div>
        <div>{listView}</div>
        <div className="sticky-panel">{selected ? <PromptDetail prompt={selected} embedded /> : <Card><EmptyState icon={<Eye />} title="Select a prompt">Pick a prompt to fill its variables, copy it, view its history or edit it.</EmptyState></Card>}</div>
      </div>
    </>
  );
}

export function PromptMenu({ prompt: p, onDeleted }: { prompt: Prompt; onDeleted?: () => void }) {
  const nav = useNavigate();
  const [addTo, setAddTo] = useState(false);
  const [moveTo, setMoveTo] = useState(false);
  const base = `/p/${p.project_id}`;
  return (
    <>
      <ActionMenu title={p.title} items={[
        { label: 'Edit', icon: <Pencil />, onClick: () => nav(`${base}/prompts/${p.id}/edit`) },
        { label: 'Copy prompt text', icon: <Copy />, onClick: async () => { await copyText(p.content); toast.success('Copied'); } },
        { label: 'Duplicate', icon: <CopyPlus />, onClick: () => { const c = store.create('prompts', { project_id: p.project_id, title: `${p.title} (copy)`, content: p.content, description: p.description, purpose: p.purpose, type: p.type, tags: p.tags, instructions: p.instructions, variables: p.variables, sort: p.sort + 0.5 }, { note: `Duplicated from “${p.title}”` }); toast.success('Duplicated'); nav(`${base}/prompts/${c.id}`); } },
        { label: 'Version history', icon: <History />, onClick: () => nav(`${base}/prompts/${p.id}?tab=history`) },
        { label: 'Add to collection', icon: <ListPlus />, onClick: () => setAddTo(true) },
        { label: 'Save as template', icon: <BookmarkPlus />, onClick: async () => { try { await store.sync(); await api(`/api/prompts/${p.id}/save-as-template`, { method: 'POST' }); await store.sync(); toast.success('Saved to the Prompt Library', { label: 'Open', onClick: () => nav('/library') }); } catch (e) { toast.error(navigator.onLine ? (e as Error).message : 'Saving as a template needs a connection.'); } } },
        { label: 'Move to another project', icon: <FolderInput />, onClick: () => setMoveTo(true) },
        { divider: true, label: '' },
        { label: 'Delete', icon: <Trash2 />, danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete “${p.title}”?`, message: 'The prompt and its version history move to the trash. It is also removed from any collections.', danger: true, confirmLabel: 'Move to trash' })) { store.remove('prompts', p.id); toast.success('Moved to trash'); onDeleted?.(); if (location.pathname.includes(p.id)) nav(`${base}/prompts`); } } },
      ]} trigger={(t) => <IconButton size="sm" label="Prompt actions" icon={<MoreVertical />} {...t} />} />
      {addTo && <AddToCollectionModal prompt={p} onClose={() => setAddTo(false)} />}
      {moveTo && <MovePromptModal prompt={p} onClose={() => setMoveTo(false)} />}
    </>
  );
}

function AddToCollectionModal({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const cols = collectionsOf(prompt.project_id);
  const [cid, setCid] = useState(cols[0]?.id ?? '__new');
  const [name, setName] = useState('');
  const save = () => {
    let id = cid;
    if (cid === '__new') { if (!name.trim()) return; id = store.create('collections', { project_id: prompt.project_id, name: name.trim() }).id; }
    if (stepsOf(id).some((s) => s.prompt_id === prompt.id)) { toast.info('Already in that collection'); onClose(); return; }
    store.create('collection_steps', { collection_id: id, prompt_id: prompt.id, sort: stepsOf(id).length + 1 });
    toast.success('Added to collection');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Add to collection" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add</Button></>}>
      <Field label="Collection"><Select value={cid} onChange={(e) => setCid(e.target.value)}>{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">+ New collection…</option></Select></Field>
      {cid === '__new' && <Field label="New collection name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Complete Business Research" /></Field>}
    </Modal>
  );
}

function MovePromptModal({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const [target, setTarget] = useState(prompt.project_id);
  const nav = useNavigate();
  return (
    <Modal open onClose={onClose} title="Move prompt" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={target === prompt.project_id} onClick={() => { store.update('prompts', prompt.id, { project_id: target }); toast.success(`Moved to ${projectLabel(target)}`); onClose(); nav(`/p/${target}/prompts/${prompt.id}`); }}>Move</Button></>}>
      <p className="small muted">Collections in the current project will keep a link to this prompt.</p>
      <Field label="Destination"><ProjectSelect value={target} onChange={setTarget} /></Field>
    </Modal>
  );
}

// ---------- Detail ----------
export function PromptDetail({ prompt: p, embedded }: { prompt: Prompt; embedded?: boolean }) {
  useStoreVersion();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'use' | 'details' | 'history') || 'use';
  const setTab = (t: string) => { params.set('tab', t); setParams(params, { replace: true }); };
  const project = getProject(p.project_id)!;
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(project?.variable_values || {}) }));
  useEffect(() => { setValues({ ...(getProject(p.project_id)?.variable_values || {}) }); }, [p.id]);
  const filled = fillVariables(p.content, values);
  const missing = missingRequired(p.variables, values);
  const versions = versionsOfPrompt(p.id);
  const base = `/p/${p.project_id}`;
  const remember = () => {
    const keep = Object.fromEntries(Object.entries(values).filter(([k, v]) => p.variables.some((m) => m.name === k) && v.trim()));
    if (Object.keys(keep).length) store.update('projects', p.project_id, { variable_values: { ...project.variable_values, ...keep } });
  };
  const copyFilled = async () => {
    if (missing.length && !(await confirmDialog({ title: 'Some required fields are empty', message: `Missing: ${missing.map(humanizeVariable).join(', ')}. Copy anyway?`, confirmLabel: 'Copy anyway' }))) return;
    await copyText(filled + (p.instructions ? `\n\n${fillVariables(p.instructions, values)}` : ''));
    remember();
    toast.success('Completed prompt copied');
  };
  return (
    <Card className="col" style={{ gap: 0 }}>
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div className="col gap-4" style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 17 }}>{p.title}</h2>
          <div className="row gap-4 row-wrap"><TypeBadge type={p.type} /><span className="tiny muted">v{p.version_no} · updated {timeAgo(p.updated_at)}</span></div>
        </div>
        <div className="row gap-4">
          <Button size="sm" variant="soft" icon={<Pencil />} onClick={() => nav(`${base}/prompts/${p.id}/edit`)}>Edit</Button>
          <PromptMenu prompt={p} />
          {embedded && <IconButton size="sm" label="Close" icon={<X />} onClick={() => nav(`${base}/prompts`)} />}
        </div>
      </div>
      <div style={{ padding: '0 12px' }}><Tabs value={tab} onChange={setTab} tabs={[{ value: 'use', label: 'Use' }, { value: 'details', label: 'Details' }, { value: 'history', label: 'History', count: versions.length }]} /></div>
      <div className="card-body col gap-16">
        {tab === 'use' && (
          <>
            {p.variables.length > 0 && <div className="col gap-8"><h3>Fill variables</h3><VariableForm meta={p.variables} values={values} onChange={setValues} compact={embedded} /></div>}
            <div className="col gap-8">
              <div className="row between"><h3>{p.variables.length ? 'Completed prompt' : 'Prompt'}</h3>{missing.length > 0 && <span className="tiny warning-text">{missing.length} required field{missing.length === 1 ? '' : 's'} empty</span>}</div>
              <PromptText content={p.content} values={values} />
              {p.instructions && <div className="alert info" style={{ whiteSpace: 'pre-wrap' }}><span><span className="strong">Additional instructions: </span>{fillVariables(p.instructions, values)}</span></div>}
            </div>
            <div className="row row-wrap">
              <Button variant="primary" icon={<Copy />} onClick={copyFilled}>{p.variables.length ? 'Copy completed prompt' : 'Copy prompt'}</Button>
              {p.variables.length > 0 && <Button icon={<Copy />} onClick={async () => { await copyText(p.content); toast.success('Original template copied'); }}>Copy original</Button>}
            </div>
            <p className="tiny faint">Filling variables never changes the saved prompt.</p>
          </>
        )}
        {tab === 'details' && (
          <dl className="col gap-12" style={{ margin: 0 }}>
            <Detail label="Description" value={p.description} />
            <Detail label="Purpose / intended use" value={p.purpose} />
            <Detail label="Additional instructions" value={p.instructions} />
            <Detail label="Tags" value={p.tags.length ? <Tags tags={p.tags} max={20} /> : ''} />
            <Detail label="Variables" value={p.variables.length ? <div className="col gap-4">{p.variables.map((v) => <div key={v.name} className="row gap-8 row-wrap"><span className="var-chip">{`{${v.name}}`}</span><span className="tiny">{v.required ? 'Required' : 'Optional'}</span>{v.description && <span className="tiny muted">— {v.description}</span>}</div>)}</div> : ''} />
            <Detail label="Collections" value={store.all('collection_steps').filter((s) => s.prompt_id === p.id).map((s) => store.get('collections', s.collection_id)).filter(Boolean).map((c) => <Link key={c!.id} to={`/p/${c!.project_id}/collections/${c!.id}`} className="tag">{c!.name}</Link>)} />
            <Detail label="Location" value={projectLabel(p.project_id)} />
            {p.source_template_id && <Detail label="Created from template" value={store.get('templates', p.source_template_id)?.title ?? 'Deleted template'} />}
            <Detail label="Created" value={formatDateTime(p.created_at)} />
            <Detail label="Last modified" value={formatDateTime(p.updated_at)} />
          </dl>
        )}
        {tab === 'history' && <PromptHistory prompt={p} versions={versions} />}
      </div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</dt><dd className="pre" style={{ margin: '2px 0 0' }}>{value || <span className="faint">—</span>}</dd></div>;
}

function PromptHistory({ prompt, versions }: { prompt: Prompt; versions: PromptVersion[] }) {
  const [view, setView] = useState<PromptVersion | null>(null);
  const [cmp, setCmp] = useState<[number, number] | null>(null);
  const [a, setA] = useState(versions[1]?.version_no ?? versions[0]?.version_no ?? 1);
  const [b, setB] = useState(versions[0]?.version_no ?? 1);
  const restore = async (v: PromptVersion) => {
    if (!(await confirmDialog({ title: `Restore version ${v.version_no}?`, message: `The current version (v${prompt.version_no}) stays in the history. Restoring creates a new version with the content of v${v.version_no}.`, confirmLabel: 'Restore' }))) return;
    if (navigator.onLine) {
      try { await store.sync(); await api(`/api/prompts/${prompt.id}/restore`, { body: { version_no: v.version_no } }); await store.sync(); toast.success(`Restored version ${v.version_no}`); setView(null); return; } catch (e) { toast.error((e as Error).message); return; }
    }
    store.update('prompts', prompt.id, { title: v.title, content: v.content, description: v.description, purpose: v.purpose, type: v.type, tags: v.tags, instructions: v.instructions }, { note: `Restored from version ${v.version_no}` });
    toast.success(`Restored version ${v.version_no} (will sync when online)`);
    setView(null);
  };
  if (!versions.length) return <p className="muted small">Version history appears after the first sync.</p>;
  const va = versions.find((v) => v.version_no === cmp?.[0]); const vb = versions.find((v) => v.version_no === cmp?.[1]);
  return (
    <div className="col gap-12">
      {versions.length > 1 && (
        <div className="row row-wrap gap-8">
          <Select value={a} onChange={(e) => setA(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Older version">{versions.map((v) => <option key={v.id} value={v.version_no}>v{v.version_no}</option>)}</Select>
          <span className="muted small">vs</span>
          <Select value={b} onChange={(e) => setB(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Newer version">{versions.map((v) => <option key={v.id} value={v.version_no}>v{v.version_no}</option>)}</Select>
          <Button size="sm" icon={<GitCompare />} onClick={() => setCmp([Math.min(a, b), Math.max(a, b)])} disabled={a === b}>Compare</Button>
        </div>
      )}
      <div className="list card">
        {versions.map((v) => (
          <div key={v.id} className="list-row">
            <span className={cx('badge', v.version_no === prompt.version_no ? 'badge-success' : '')}>v{v.version_no}</span>
            <div className="grow"><div className="small truncate">{v.change_note || 'Edited'}</div><div className="tiny muted">{formatDateTime(v.created_at)}{v.version_no === prompt.version_no ? ' · current' : ''}</div></div>
            <IconButton size="sm" label={`View version ${v.version_no}`} icon={<Eye />} onClick={() => setView(v)} />
            {v.version_no !== prompt.version_no && <IconButton size="sm" label={`Restore version ${v.version_no}`} icon={<RotateCcw />} onClick={() => restore(v)} />}
          </div>
        ))}
      </div>
      <Modal open={!!view} onClose={() => setView(null)} size="wide" title={view ? `Version ${view.version_no}${view.version_no === prompt.version_no ? ' (current)' : ''}` : ''}
        footer={view && <><Button icon={<Copy />} onClick={async () => { await copyText(view.content); toast.success('Copied'); }}>Copy</Button>{view.version_no !== prompt.version_no && <Button variant="primary" icon={<RotateCcw />} onClick={() => restore(view)}>Restore this version</Button>}</>}>
        {view && <>
          <div className="row row-wrap gap-8"><span className="strong">{view.title}</span><TypeBadge type={view.type} /><span className="tiny muted">{formatDateTime(view.created_at)}</span></div>
          {view.change_note && <div className="alert info">{view.change_note}</div>}
          <PromptText content={view.content} />
          {view.instructions && <div className="small"><span className="strong">Additional instructions: </span>{view.instructions}</div>}
        </>}
      </Modal>
      <Modal open={!!cmp} onClose={() => setCmp(null)} size="xwide" title={cmp ? `Compare v${cmp[0]} → v${cmp[1]}` : ''}>
        {va && vb && <>
          {va.title !== vb.title && <div className="alert info">Title changed: “{va.title}” → “{vb.title}”</div>}
          {va.type !== vb.type && <div className="alert info">Classification changed: {va.type} → {vb.type}</div>}
          <DiffView before={va.content} after={vb.content} beforeLabel={`Version ${va.version_no} · ${formatDateTime(va.created_at)}`} afterLabel={`Version ${vb.version_no} · ${formatDateTime(vb.created_at)}`} />
        </>}
      </Modal>
    </div>
  );
}

export { registerTags };
