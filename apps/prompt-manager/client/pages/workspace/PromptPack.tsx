import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, ArrowUp, ArrowDown, Copy, FileDown, FileText, ChevronLeft, ChevronRight, PackageOpen, Check, Save } from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { promptsOf, stepsOf, subprojectsOf, getProject } from '../../lib/data';
import { copyText, saveText, safeFileName, renderMarkdown, plural, useIsMobile } from '../../lib/util';
import { buildPackText, buildPackMarkdown, type PackItem } from '../../../shared/pack';
import { mergeVariableMeta, missingRequired, humanizeVariable } from '../../../shared/variables';
import { Button, Card, CardHead, Checkbox, Stepper, TypeBadge, Switch, Segmented, IconButton, EmptyState } from '../../components/ui';
import { VariableForm } from '../../components/domain';
import { toast, confirmDialog } from '../../components/overlay';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import type { Prompt } from '../../../shared/schema';

interface Entry { key: string; prompt: Prompt; stepInstructions?: string; group?: string }

export default function PromptPackPage() {
  useStoreVersion();
  const { project, parent, base } = useWs();
  const { cid } = useParams();
  const nav = useNavigate();
  const mobile = useIsMobile();
  const collection = cid ? store.get('collections', cid) : undefined;
  usePageMeta('Prompt pack', collection ? `${base}/collections/${cid}` : base);
  const [includeSubs, setIncludeSubs] = useState(false);
  const subs = !project.parent_id && !collection ? subprojectsOf(project.id, false) : [];

  // Candidate prompts in their defined sequence.
  const entries: Entry[] = useMemo(() => {
    if (collection) return stepsOf(collection.id).map((s) => ({ key: s.id, prompt: s.prompt, stepInstructions: s.instructions }));
    const own = promptsOf(project.id).map((p) => ({ key: p.id, prompt: p }));
    if (!includeSubs) return own;
    return [...own, ...subs.flatMap((s) => promptsOf(s.id).map((p) => ({ key: p.id, prompt: p, group: s.name })))];
  }, [store.version, project.id, collection?.id, includeSubs]);

  const mandatory = entries.filter((e) => e.prompt.type === 'mandatory');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({ ...(project.variable_values || {}) });
  const [format, setFormat] = useState<'md' | 'txt'>('md');

  // Mandatory prompts are always included and cannot be deselected.
  const selected = entries.filter((e) => e.prompt.type === 'mandatory' || chosen.has(e.key));
  const ordered = order ? order.map((k) => selected.find((e) => e.key === k)).filter(Boolean) as Entry[] : selected;
  const finalList = [...ordered, ...selected.filter((e) => !ordered.includes(e))];
  const meta = useMemo(() => {
    const m = new Map<string, ReturnType<typeof mergeVariableMeta>[number]>();
    for (const e of finalList) for (const v of mergeVariableMeta(e.prompt.content, e.prompt.variables, (e.prompt.instructions || '') + (e.stepInstructions || ''))) {
      const ex = m.get(v.name);
      m.set(v.name, ex ? { ...ex, required: ex.required || v.required, description: ex.description || v.description } : v);
    }
    return [...m.values()];
  }, [finalList.map((e) => e.key).join()]);
  const missing = missingRequired(meta, values);

  const items: PackItem[] = finalList.map((e) => ({ title: e.group ? `${e.prompt.title} — ${e.group}` : e.prompt.title, content: e.prompt.content, type: e.prompt.type, instructions: e.prompt.instructions, stepInstructions: e.stepInstructions, inputs: e.prompt.variables }));
  const input = { projectName: parent ? parent.name : project.name, subprojectName: parent ? project.name : undefined, collectionName: collection?.name, description: collection?.description || project.description, items, values: Object.fromEntries(meta.map((m) => [m.name, values[m.name] ?? ''])), generatedAt: new Date() };
  const text = useMemo(() => (step === 2 ? (format === 'md' ? buildPackMarkdown(input) : buildPackText(input)) : ''), [step, format, JSON.stringify(items), JSON.stringify(values)]);
  const fileBase = safeFileName(`${collection?.name || project.name}-prompt-pack`);

  const move = (i: number, d: -1 | 1) => {
    const keys = finalList.map((e) => e.key); const j = i + d;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setOrder(keys);
  };
  const guardMandatory = () => {
    const missingM = mandatory.filter((m) => !finalList.some((e) => e.key === m.key));
    if (missingM.length) { toast.error('Mandatory prompts must be included.'); return false; }
    return true;
  };
  const next = async () => {
    if (step === 0 && !finalList.length) { toast.error('Select at least one prompt.'); return; }
    if (!guardMandatory()) return;
    if (step === 1 && missing.length && !(await confirmDialog({ title: 'Some required inputs are empty', message: `Missing: ${missing.map(humanizeVariable).join(', ')}. They will stay as {placeholders} in the pack.`, confirmLabel: 'Generate anyway' }))) return;
    setStep(step + 1);
    window.scrollTo(0, 0);
  };
  const saveValues = () => {
    const keep = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    store.update('projects', project.id, { variable_values: { ...project.variable_values, ...keep } });
    toast.success(`Values saved to ${project.name}`);
  };

  if (!entries.length && !includeSubs) {
    return <Card><EmptyState icon={<PackageOpen />} title="Nothing to pack yet" action={<Button variant="primary" onClick={() => nav(collection ? `${base}/collections/${cid}` : `${base}/prompts/new`)}>{collection ? 'Add prompts to the collection' : 'Add a prompt'}</Button>}>{collection ? 'This collection has no prompts.' : 'Add prompts to this project first.'}{subs.length > 0 && <><br /><Button variant="ghost" onClick={() => setIncludeSubs(true)}>Include subproject prompts</Button></>}</EmptyState></Card>;
  }

  return (
    <div className="col gap-16" style={{ maxWidth: 960 }}>
      <div><h2 className="row gap-8"><PackageOpen style={{ width: 20 }} />Generate prompt pack</h2><p className="small muted">{collection ? `From collection “${collection.name}”` : parent ? `${parent.name} › ${project.name}` : project.name} · mandatory prompts are always included.</p></div>
      <Stepper steps={['Select prompts', 'Fill inputs', 'Review & export']} current={step} />

      {step === 0 && (
        <Card>
          <CardHead title={`${plural(finalList.length, 'prompt')} selected`} sub={`${mandatory.length} mandatory (locked) · ${entries.length - mandatory.length} optional`}
            actions={entries.length - mandatory.length > 0 && <><Button size="sm" variant="ghost" onClick={() => setChosen(new Set(entries.filter((e) => e.prompt.type === 'optional').map((e) => e.key)))}>All optional</Button><Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>None</Button></>} />
          {subs.length > 0 && <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}><Switch label="Include subproject prompts" hint={`Adds prompts from ${plural(subs.length, 'subproject')}`} checked={includeSubs} onChange={setIncludeSubs} /></div>}
          <div className="list">
            {entries.map((e, i) => {
              const m = e.prompt.type === 'mandatory';
              return (
                <label key={e.key} className={`list-row clickable${m ? ' mandatory' : ''}`} style={{ cursor: m ? 'default' : 'pointer' }}>
                  {m ? <Lock style={{ width: 18, height: 18, color: 'var(--primary)' }} aria-label="Always included" /> : <input type="checkbox" checked={chosen.has(e.key)} onChange={(ev) => { const n = new Set(chosen); if (ev.target.checked) n.add(e.key); else n.delete(e.key); setChosen(n); }} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />}
                  <span className="tiny faint num" style={{ width: 22 }}>{i + 1}</span>
                  <div className="grow"><div className="truncate strong" style={{ fontWeight: 500 }}>{e.prompt.title}</div><div className="meta truncate">{e.group ? `${e.group} · ` : ''}{e.prompt.description || e.prompt.content.slice(0, 100)}</div></div>
                  <TypeBadge type={e.prompt.type} />
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {step === 1 && (
        <>
          <Card>
            <CardHead title="Inputs" sub={meta.length ? `${meta.length} across the selected prompts${missing.length ? ` · ${missing.length} required empty` : ''}` : 'No inputs in the selected prompts'} actions={meta.length > 0 && <Button size="sm" variant="ghost" icon={<Save />} onClick={saveValues}>Save to project</Button>} />
            <div className="card-body"><VariableForm meta={meta} values={values} onChange={setValues} /></div>
          </Card>
          <Card>
            <CardHead title="Sequence" sub="Arrange the order prompts appear in the pack" />
            <div className="list">
              {finalList.map((e, i) => (
                <div key={e.key} className={`list-row${e.prompt.type === 'mandatory' ? ' mandatory' : ''}`}>
                  <span className="badge" style={{ minWidth: 28, justifyContent: 'center' }}>{i + 1}</span>
                  <span className="grow truncate">{e.prompt.title}</span>
                  <TypeBadge type={e.prompt.type} />
                  <IconButton size="sm" label="Move up" icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton size="sm" label="Move down" icon={<ArrowDown />} disabled={i === finalList.length - 1} onClick={() => move(i, 1)} />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {step === 2 && (
        <Card>
          <CardHead title={`Prompt pack · ${plural(items.length, 'prompt')}`} actions={<Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'md', label: 'Markdown' }, { value: 'txt', label: 'Plain text' }]} />} />
          <div className="card-body col gap-12">
            <div className="row row-wrap">
              <Button variant="primary" icon={<Copy />} onClick={async () => { await copyText(text); toast.success('Prompt pack copied'); }}>Copy entire pack</Button>
              <Button icon={<FileText />} onClick={() => saveText(buildPackText(input), `${fileBase}.txt`)}>Download TXT</Button>
              <Button icon={<FileDown />} onClick={() => saveText(buildPackMarkdown(input), `${fileBase}.md`, 'text/markdown')}>Download Markdown</Button>
            </div>
            {format === 'md' ? <div className="markdown prompt-text" style={{ whiteSpace: 'normal', maxHeight: mobile ? 'none' : '65vh' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} /> : <pre className="prompt-text" style={{ margin: 0, maxHeight: mobile ? 'none' : '65vh' }}>{text}</pre>}
          </div>
        </Card>
      )}

      <div className="sticky-actions">
        {step > 0 ? <Button icon={<ChevronLeft />} onClick={() => setStep(step - 1)}>Back</Button> : <Button onClick={() => nav(-1)}>Cancel</Button>}
        <div className="grow" />
        {step < 2 ? <Button variant="primary" icon={step === 1 ? <Check /> : <ChevronRight />} onClick={next}>{step === 1 ? 'Generate pack' : `Continue with ${finalList.length}`}</Button> : <Button variant="primary" icon={<Copy />} onClick={async () => { await copyText(text); toast.success('Prompt pack copied'); }}>Copy pack</Button>}
      </div>
    </div>
  );
}

export { Checkbox, getProject };
