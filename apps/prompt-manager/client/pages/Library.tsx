import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Library as LibraryIcon, Plus, Upload, MoreVertical, Pencil, CopyPlus, Trash2, Star, FolderInput, Copy, ArrowRight, Eye } from 'lucide-react';
import { store, useStoreVersion } from '../lib/store';
import { registerTags, topProjects, projectLabel, promptsOf, byUpdated } from '../lib/data';
import { copyText, matches, plural, timeAgo, useIsMobile, formatDateTime } from '../lib/util';
import { fillVariables } from '../../shared/variables';
import { Button, IconButton, Card, CardHead, EmptyState, PageHead, SearchBox, Chip, TypeBadge, Tags, FavStar, Field, Input, Segmented, Stepper, ButtonLink } from '../components/ui';
import { ActionMenu, Modal, confirmDialog, toast } from '../components/overlay';
import { PromptText, VariableForm, ProjectSelect } from '../components/domain';
import { PromptForm } from './workspace/PromptEditor';
import { usePageMeta } from '../layout/AppShell';
import type { Template, PromptType } from '../../shared/schema';

export function UseTemplateModal({ template: t, onClose, defaultProject }: { template: Template; onClose: () => void; defaultProject?: string }) {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(defaultProject ?? topProjects()[0]?.id ?? '');
  const project = store.get('projects', target);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fill, setFill] = useState<'fill' | 'keep'>('keep');
  const [title, setTitle] = useState(t.title);
  const [type, setType] = useState<PromptType>(t.type);
  const vals = { ...(project?.variable_values || {}), ...values };
  const save = () => {
    const content = fill === 'fill' ? fillVariables(t.content, vals) : t.content;
    const p = store.create('prompts', {
      project_id: target, title: title.trim() || t.title, content, description: t.description, purpose: t.purpose, type, tags: t.tags,
      instructions: fill === 'fill' ? fillVariables(t.instructions, vals) : t.instructions, variables: t.variables, source_template_id: t.id, sort: promptsOf(target).length + 1,
    }, { note: `Created from template “${t.title}”` });
    const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    if (Object.keys(filled).length && project) store.update('projects', target, { variable_values: { ...project.variable_values, ...filled } });
    toast.success(`Added to ${projectLabel(target)} as an independent copy`);
    onClose();
    nav(`/p/${target}/prompts/${p.id}`);
  };
  const hasProjects = topProjects(true).length > 0;
  return (
    <Modal open onClose={onClose} size="wide" title={`Use template · ${t.title}`}
      footer={hasProjects ? <>{step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : <Button onClick={onClose}>Cancel</Button>}{step < 2 ? <Button variant="primary" disabled={!target} onClick={() => setStep(step + 1)}>Next</Button> : <Button variant="primary" onClick={save}>Save to project</Button>}</> : <ButtonLink to="/projects" variant="primary">Create a project first</ButtonLink>}>
      <Stepper steps={['Destination', 'Variables', 'Preview']} current={step} />
      {step === 0 && <Field label="Add to project or subproject"><ProjectSelect value={target} onChange={setTarget} /></Field>}
      {step === 0 && <p className="small muted">A project-specific copy is created. Editing it never changes this template.</p>}
      {step === 1 && (
        <>
          <VariableForm meta={t.variables} values={vals} onChange={(v) => setValues(v)} />
          {t.variables.length > 0 && <Field label="When saving"><Segmented label="Variable handling" value={fill} onChange={setFill} options={[{ value: 'keep', label: 'Keep as fillable fields' }, { value: 'fill', label: 'Insert these values' }]} /></Field>}
          <Field label="Prompt title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Classification"><Segmented label="Classification" value={type} onChange={setType} options={[{ value: 'mandatory', label: 'Mandatory' }, { value: 'optional', label: 'Optional' }]} /></Field>
        </>
      )}
      {step === 2 && (
        <>
          <div className="row gap-8 row-wrap"><span className="strong">{title}</span><TypeBadge type={type} /><span className="small muted">→ {projectLabel(target)}</span></div>
          <PromptText content={fill === 'fill' ? fillVariables(t.content, vals) : t.content} values={fill === 'keep' ? vals : undefined} />
          <Button size="sm" icon={<Copy />} onClick={async () => { await copyText(fillVariables(t.content, vals)); toast.success('Completed prompt copied'); }}>Copy completed prompt</Button>
        </>
      )}
    </Modal>
  );
}

function TemplateMenu({ t, onUse }: { t: Template; onUse: () => void }) {
  const nav = useNavigate();
  return (
    <ActionMenu title={t.title} items={[
      { label: 'Use template', icon: <FolderInput />, onClick: onUse },
      { label: 'Edit', icon: <Pencil />, onClick: () => nav(`/library/${t.id}/edit`) },
      { label: 'Duplicate', icon: <CopyPlus />, onClick: () => { const c = store.create('templates', { title: `${t.title} (copy)`, content: t.content, description: t.description, purpose: t.purpose, type: t.type, tags: t.tags, instructions: t.instructions, variables: t.variables }); toast.success('Template duplicated'); nav(`/library/${c.id}`); } },
      { label: 'Copy text', icon: <Copy />, onClick: async () => { await copyText(t.content); toast.success('Copied'); } },
      { label: t.favourite ? 'Remove favourite' : 'Favourite', icon: <Star />, onClick: () => store.update('templates', t.id, { favourite: !t.favourite }) },
      { divider: true, label: '' },
      { label: 'Delete', icon: <Trash2 />, danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete template “${t.title}”?`, message: 'Prompts already created from it are not affected.', danger: true, confirmLabel: 'Delete' })) { store.remove('templates', t.id); toast.success('Template deleted'); nav('/library'); } } },
    ]} trigger={(p) => <IconButton size="sm" label="Template actions" icon={<MoreVertical />} {...p} />} />
  );
}

export default function LibraryPage() {
  useStoreVersion();
  usePageMeta('Prompt Library');
  const nav = useNavigate();
  const mobile = useIsMobile();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [using, setUsing] = useState<Template | null>(null);
  const all = store.all('templates');
  const tags = useMemo(() => [...new Set(all.flatMap((t) => t.tags))].sort(), [store.version]);
  const list = all.filter((t) => (!tag || t.tags.includes(tag)) && (!favOnly || t.favourite) && matches(q, t.title, t.content, t.description, t.tags)).sort((a, b) => Number(b.favourite) - Number(a.favourite) || byUpdated(a, b));
  return (
    <>
      <PageHead title="Prompt Template Library" sub={`${plural(all.length, 'reusable template')} available across every project`}
        actions={!mobile && <><Button icon={<Upload />} onClick={() => nav('/import?dest=library')}>Import templates</Button><Button variant="primary" icon={<Plus />} onClick={() => nav('/library/new')}>Create template</Button></>} />
      <SearchBox value={q} onChange={setQ} placeholder="Search templates…" />
      <div className="chips mt-12" style={{ marginBottom: 16 }}>
        <Chip active={!tag && !favOnly} onClick={() => { setTag(''); setFavOnly(false); }}>All</Chip>
        <Chip active={favOnly} onClick={() => setFavOnly(!favOnly)} icon={<Star />}>Favourites</Chip>
        {tags.map((t) => <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? '' : t)}>{t}</Chip>)}
      </div>
      {!list.length ? (
        <Card><EmptyState icon={<LibraryIcon />} title={all.length ? 'No matching templates' : 'Your library is empty'} action={!all.length && <><Button variant="primary" icon={<Plus />} onClick={() => nav('/library/new')}>Create template</Button><Button icon={<Upload />} onClick={() => nav('/import?dest=library')}>Bulk import</Button></>}>{all.length ? 'Try a different search or tag.' : 'Save prompts you reuse — market analysis, SWOT, summaries — and insert them into any project with variables filled in.'}</EmptyState></Card>
      ) : (
        <div className="grid grid-cards">
          {list.map((t) => (
            <Card key={t.id} className="col" style={{ gap: 0 }}>
              <Link to={`/library/${t.id}`} className="card-pad col gap-8" style={{ color: 'inherit', textDecoration: 'none', flex: 1 }}>
                <div className="row between"><span className="icon-tile sm tone-indigo"><LibraryIcon /></span><span className="row" onClick={(e) => e.preventDefault()}><FavStar on={t.favourite} onToggle={() => store.update('templates', t.id, { favourite: !t.favourite })} /><TemplateMenu t={t} onUse={() => setUsing(t)} /></span></div>
                <div className="strong">{t.title}</div>
                <div className="small muted clamp-2">{t.description || t.content}</div>
                <div className="row gap-4 row-wrap mt-4"><TypeBadge type={t.type} />{t.variables.length > 0 && <span className="badge badge-outline">{plural(t.variables.length, 'variable')}</span>}<Tags tags={t.tags} max={2} /></div>
              </Link>
              <div className="row between" style={{ padding: '0 20px 16px' }}>
                <span className="tiny faint">Updated {timeAgo(t.updated_at)}</span>
                <Button size="sm" variant="soft" icon={<ArrowRight />} onClick={() => setUsing(t)}>Use Template</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {mobile && <button className="fab" aria-label="Create template" onClick={() => nav('/library/new')}><Plus /></button>}
      {mobile && <div className="mt-16"><Button block icon={<Upload />} onClick={() => nav('/import?dest=library')}>Bulk import templates</Button></div>}
      {using && <UseTemplateModal template={using} onClose={() => setUsing(null)} />}
    </>
  );
}

export function TemplateDetail() {
  useStoreVersion();
  const { tid } = useParams();
  const nav = useNavigate();
  const [using, setUsing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const t = tid ? store.get('templates', tid) : undefined;
  usePageMeta(t?.title ?? 'Template', '/library');
  if (!t) return <Card><EmptyState icon={<LibraryIcon />} title="Template not found" action={<ButtonLink to="/library" variant="primary">Back to library</ButtonLink>} /></Card>;
  const usedBy = store.all('prompts').filter((p) => p.source_template_id === t.id);
  return (
    <>
      <PageHead crumbs={[{ label: 'Prompt Library', to: '/library' }, { label: t.title }]} title={t.title} sub={t.description}
        actions={<><Button icon={<Pencil />} onClick={() => nav(`/library/${t.id}/edit`)}>Edit</Button><Button variant="primary" icon={<FolderInput />} onClick={() => setUsing(true)}>Use template</Button><TemplateMenu t={t} onUse={() => setUsing(true)} /></>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', alignItems: 'start' }} data-tpl-grid>
        <Card>
          <CardHead title="Template" actions={<div className="row gap-4"><TypeBadge type={t.type} /><FavStar on={t.favourite} onToggle={() => store.update('templates', t.id, { favourite: !t.favourite })} /></div>} />
          <div className="card-body col gap-16">
            {t.variables.length > 0 && <><h3>Try it with values</h3><VariableForm meta={t.variables} values={values} onChange={setValues} /></>}
            <PromptText content={t.content} values={values} />
            {t.instructions && <div className="small"><span className="strong">Additional instructions: </span>{t.instructions}</div>}
            <div className="row row-wrap"><Button icon={<Copy />} onClick={async () => { await copyText(fillVariables(t.content, values)); toast.success('Copied'); }}>Copy {t.variables.length ? 'completed' : ''}</Button><Button variant="primary" icon={<FolderInput />} onClick={() => setUsing(true)}>Use in a project</Button></div>
          </div>
        </Card>
        <Card>
          <CardHead title="Details" />
          <dl className="card-body col gap-8 small" style={{ margin: 0 }}>
            <div><dt className="muted">Purpose</dt><dd style={{ margin: 0 }}>{t.purpose || '—'}</dd></div>
            <div><dt className="muted">Tags</dt><dd style={{ margin: 0 }}>{t.tags.length ? <Tags tags={t.tags} max={20} /> : '—'}</dd></div>
            <div><dt className="muted">Variables</dt><dd style={{ margin: 0 }}>{t.variables.map((v) => <span key={v.name} className="var-chip" style={{ marginRight: 4 }}>{v.name}{v.required ? '' : '?'}</span>)}{!t.variables.length && '—'}</dd></div>
            <div><dt className="muted">Used in</dt><dd style={{ margin: 0 }}>{usedBy.length ? usedBy.map((p) => <div key={p.id}><Link to={`/p/${p.project_id}/prompts/${p.id}`}>{projectLabel(p.project_id)} › {p.title}</Link></div>) : 'Not used yet'}</dd></div>
            <div><dt className="muted">Created</dt><dd style={{ margin: 0 }}>{formatDateTime(t.created_at)}</dd></div>
            <div><dt className="muted">Last modified</dt><dd style={{ margin: 0 }}>{formatDateTime(t.updated_at)}</dd></div>
          </dl>
        </Card>
      </div>
      <style>{`@media (max-width: 960px) { [data-tpl-grid] { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
      {using && <UseTemplateModal template={t} onClose={() => setUsing(false)} />}
    </>
  );
}

export function TemplateEditor() {
  useStoreVersion();
  const { tid } = useParams();
  const nav = useNavigate();
  const t = tid ? store.get('templates', tid) : undefined;
  usePageMeta(t ? 'Edit template' : 'New template', t ? `/library/${t.id}` : '/library');
  if (tid && !t) return <Card pad>Template not found.</Card>;
  const initial = t ? { title: t.title, content: t.content, description: t.description, purpose: t.purpose, type: t.type, tags: t.tags, instructions: t.instructions, variables: t.variables }
    : { title: '', content: '', description: '', purpose: '', type: 'optional' as PromptType, tags: [], instructions: '', variables: [] };
  return (
    <div style={{ maxWidth: 880 }}>
      <PageHead crumbs={[{ label: 'Prompt Library', to: '/library' }, { label: t ? t.title : 'New template' }]} title={t ? 'Edit template' : 'Create template'} sub="Templates are independent of projects. Using one creates a project-specific copy." />
      <PromptForm kind="template" initial={initial} saveLabel={t ? 'Save template' : 'Create template'} onCancel={() => nav(t ? `/library/${t.id}` : '/library')}
        onSave={({ note: _n, ...v }) => {
          registerTags(v.tags);
          if (t) { store.update('templates', t.id, v); toast.success('Template saved'); nav(`/library/${t.id}`); }
          else { const c = store.create('templates', v); toast.success('Template created'); nav(`/library/${c.id}`); }
        }} />
    </div>
  );
}

export { Eye };
