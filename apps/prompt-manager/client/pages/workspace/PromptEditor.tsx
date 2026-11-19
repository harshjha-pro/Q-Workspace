import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { Save, X, Wand2 } from 'lucide-react';
import { store, useStoreVersion } from '../../lib/store';
import { promptsOf, registerTags } from '../../lib/data';
import { useIsMobile } from '../../lib/util';
import { mergeVariableMeta } from '../../../shared/variables';
import { Button, Card, Field, Input, Textarea, IconButton } from '../../components/ui';
import { TagInput, VariableMetaEditor, PromptText } from '../../components/domain';
import { confirmDialog, toast } from '../../components/overlay';
import { useWs } from './Workspace';
import { usePageMeta } from '../../layout/AppShell';
import type { PromptType, VariableMeta } from '../../../shared/schema';

/** Shared editor for project prompts and library templates. */
export function PromptForm({ initial, onSave, onCancel, kind, saveLabel }: {
  initial: { title: string; content: string; description: string; purpose: string; type: PromptType; tags: string[]; instructions: string; variables: VariableMeta[] };
  onSave: (v: typeof initial & { note: string }) => void; onCancel: () => void; kind: 'prompt' | 'template'; saveLabel: string;
}) {
  const mobile = useIsMobile();
  const [v, setV] = useState(initial);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const saved = useRef(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const meta = useMemo(() => mergeVariableMeta(v.content, v.variables, v.instructions), [v.content, v.variables, v.instructions]);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: val })); setErrors((e) => ({ ...e, [k]: '' })); };

  // Guard against losing unsaved edits (in-app navigation and tab close).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirmDialog({ title: 'Discard changes?', message: 'You have unsaved changes to this prompt.', confirmLabel: 'Discard', danger: true }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker.state]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty && !saved.current) { e.preventDefault(); } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!v.title.trim()) e.title = 'Enter a title';
    if (!v.content.trim()) e.content = 'Enter the prompt content';
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please fill in the required fields'); return; }
    saved.current = true;
    onSave({ ...v, title: v.title.trim(), variables: meta, note: note.trim() });
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); submit(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <div className="full-editor">
      <Card pad className="col gap-16">
        <Field label="Prompt title" required error={errors.title} htmlFor="pt"><Input id="pt" value={v.title} onChange={(e) => set('title', e.target.value)} maxLength={300} placeholder="e.g. Market Research Prompt" autoFocus={!initial.title} invalid={!!errors.title} /></Field>
        <Field label="Prompt content" required error={errors.content} htmlFor="pc" hint={<>Use <span className="var-chip">{'{variable_name}'}</span> for fillable fields. Line breaks and formatting are preserved.</>}
          action={meta.length > 0 && <Button size="sm" variant="ghost" icon={<Wand2 />} onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</Button>}>
          {preview ? <PromptText content={v.content} /> : <Textarea id="pc" className="editor-area" value={v.content} onChange={(e) => set('content', e.target.value)} placeholder="Write the full prompt…" invalid={!!errors.content} spellCheck />}
        </Field>
        <Field label="Classification">
          <div className="radio-cards" style={{ gridTemplateColumns: mobile ? '1fr' : '1fr 1fr' }}>
            <label className="radio-card"><input type="radio" name="ptype" checked={v.type === 'mandatory'} onChange={() => set('type', 'mandatory')} /><span><span className="strong">Mandatory</span><br /><span className="small muted">Always included in complete prompt packs</span></span></label>
            <label className="radio-card"><input type="radio" name="ptype" checked={v.type === 'optional'} onChange={() => set('type', 'optional')} /><span><span className="strong">Optional</span><br /><span className="small muted">Selected only when needed</span></span></label>
          </div>
        </Field>
      </Card>
      <Card pad className="col gap-16">
        <h3>Organisation</h3>
        <Field label="Description"><Input value={v.description} onChange={(e) => set('description', e.target.value)} placeholder="Short summary shown in lists" /></Field>
        <Field label="Purpose / intended use"><Input value={v.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="When should this prompt be used?" /></Field>
        <Field label="Tags" hint="Press Enter or comma to add"><TagInput value={v.tags} onChange={(t) => set('tags', t)} /></Field>
        <Field label="Additional instructions" hint="Appended after the prompt when copied or included in packs."><Textarea rows={3} value={v.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="e.g. Respond in a table. Cite sources." /></Field>
      </Card>
      <Card pad className="col gap-12">
        <div className="row between"><h3>Variables</h3><span className="tiny muted">Detected automatically from the content</span></div>
        <VariableMetaEditor meta={meta} onChange={(m) => set('variables', m)} />
      </Card>
      {kind === 'prompt' && initial.title && (
        <Card pad><Field label="Change description (optional)" hint="Saved with this version in the history."><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tightened scope to EU markets" /></Field></Card>
      )}
      <div className="sticky-actions">
        <Button onClick={onCancel} icon={<X />}>Cancel</Button>
        <div className="grow" />
        <Button variant="primary" size="lg" icon={<Save />} onClick={submit}>{saveLabel}</Button>
      </div>
    </div>
  );
}

export default function PromptEditorPage() {
  useStoreVersion();
  const { project, base } = useWs();
  const { pid } = useParams();
  const nav = useNavigate();
  const editing = pid ? store.get('prompts', pid) : undefined;
  usePageMeta(editing ? 'Edit prompt' : 'New prompt', editing ? `${base}/prompts/${pid}` : `${base}/prompts`);
  const mobile = useIsMobile();
  if (pid && !editing) return <Card pad>Prompt not found.</Card>;
  const initial = editing
    ? { title: editing.title, content: editing.content, description: editing.description, purpose: editing.purpose, type: editing.type, tags: editing.tags, instructions: editing.instructions, variables: editing.variables }
    : { title: '', content: '', description: '', purpose: '', type: (store.all('prompts').length ? 'optional' : 'mandatory') as PromptType, tags: [], instructions: '', variables: [] };
  return (
    <div style={{ maxWidth: 880 }}>
      {!mobile && <div className="row between" style={{ marginBottom: 12 }}><h2>{editing ? `Edit “${editing.title}”` : 'Add prompt'}</h2><IconButton label="Close" icon={<X />} onClick={() => nav(editing ? `${base}/prompts/${pid}` : `${base}/prompts`)} /></div>}
      <PromptForm key={pid ?? 'new'} kind="prompt" initial={initial} saveLabel={editing ? 'Save changes' : 'Save prompt'}
        onCancel={() => nav(editing ? `${base}/prompts/${pid}` : `${base}/prompts`)}
        onSave={({ note, ...v }) => {
          registerTags(v.tags);
          if (editing) {
            store.update('prompts', editing.id, v, { note: note || undefined });
            toast.success('Prompt saved — previous version kept in history');
            nav(`${base}/prompts/${editing.id}`);
          } else {
            const p = store.create('prompts', { ...v, project_id: project.id, sort: promptsOf(project.id).length + 1 });
            toast.success('Prompt added');
            nav(`${base}/prompts/${p.id}`);
          }
        }} />
    </div>
  );
}
