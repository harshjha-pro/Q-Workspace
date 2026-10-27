import { Bookmark, CalendarClock, Columns2, Database, Info, Package, Search, SlidersHorizontal, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductRow } from '../components/Cards';
import { PersonaliseForm } from '../components/Personalise';
import { Button, Card, Chip, EmptyState, ListRow, Notice, PageHeader, SectionTitle } from '../components/ui';
import { ARTICLE_MAP, INGREDIENT_MAP, PRODUCT_MAP, PUBLIC_PRODUCTS, TOPIC_MAP } from '../data';
import { hasPreferences } from '../lib/personalise';
import { type Routine, type SavedType, uid, useStore } from '../lib/store';

export default function Profile() {
  const { saved, routines, comparisons, owned, profile, history, clearAll, clearHistory, recent, clearRecent } = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <PageHeader title="My Profile" back={false} />
      <Card className="mb-5 flex items-center gap-4 p-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-forest-50 text-forest-700"><User size={26} /></div>
        <div>
          <p className="text-[15px] font-semibold">Guest</p>
          <p className="text-[12.5px] text-ink-muted">No account needed. Your data stays on this device.</p>
        </div>
      </Card>

      <Card className="divide-y divide-line">
        <ListRow to="/profile/personalise" icon={<SlidersHorizontal size={18} />} title="Personalisation" subtitle={hasPreferences(profile) ? 'Skin, hair, region and preferences set' : 'Skin, hair, preferences and more'} />
        <ListRow to="/profile/saved" icon={<Bookmark size={18} />} title="Saved items" subtitle={`${saved.length} saved · products, ingredients, articles`} />
        <ListRow to="/profile/routines" icon={<CalendarClock size={18} />} title="My routine" subtitle={routines.length ? `${routines.length} routine${routines.length > 1 ? 's' : ''}` : 'Optional — track your usage'} />
        <ListRow to="/profile/comparisons" icon={<Columns2 size={18} />} title="Comparison lists" subtitle={`${comparisons.length} saved comparison${comparisons.length === 1 ? '' : 's'}`} />
        <ListRow to="/profile/products" icon={<Package size={18} />} title="My products" subtitle={`${owned.length} product${owned.length === 1 ? '' : 's'} you already use`} />
      </Card>

      <SectionTitle><span className="mt-6 block">About</span></SectionTitle>
      <Card className="divide-y divide-line">
        <ListRow to="/about" icon={<Info size={18} />} title="About CareLens & methodology" subtitle="Evidence levels, sources and limitations" />
        <ListRow to="/content" icon={<Database size={18} />} title="Content status" subtitle="Review status of every record" />
      </Card>

      <h2 className="mb-3 mt-6 text-[15px] font-semibold">Your data</h2>
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[14px]"><Search size={16} className="text-ink-faint" /> Search history ({history.length})</span>
          <Button variant="secondary" onClick={clearHistory} disabled={!history.length}>Clear</Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px]">Recently viewed ({recent.length})</span>
          <Button variant="secondary" onClick={clearRecent} disabled={!recent.length}>Clear</Button>
        </div>
        {confirm ? (
          <Notice tone="danger" title="Delete everything stored on this device?">
            This removes preferences, saved items, routines, comparisons and history.
            <div className="mt-2 flex gap-2">
              <Button variant="danger" onClick={() => { clearAll(); setConfirm(false); }}>Yes, delete</Button>
              <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            </div>
          </Notice>
        ) : (
          <Button variant="danger" className="w-full" onClick={() => setConfirm(true)}><Trash2 size={16} /> Clear all my data</Button>
        )}
      </Card>
    </div>
  );
}

export function PersonalisePage() {
  const [done, setDone] = useState(false);
  return (
    <div>
      <PageHeader title="Personalise for better results" />
      {done && <div className="mb-4"><Notice>Preferences saved. Search, categories and comparisons now use them — you can switch personalisation off at any time.</Notice></div>}
      <PersonaliseForm onDone={() => setDone(true)} />
    </div>
  );
}

const SAVED_LABEL: Record<SavedType, string> = { product: 'Products', ingredient: 'Ingredients', article: 'Articles', topic: 'Topics', comparison: 'Comparisons' };

function resolveSaved(type: SavedType, id: string) {
  switch (type) {
    case 'product': return PRODUCT_MAP[id] ? { title: PRODUCT_MAP[id].name, href: `/product/${id}` } : null;
    case 'ingredient': return INGREDIENT_MAP[id] ? { title: INGREDIENT_MAP[id].name, href: `/ingredient/${id}` } : null;
    case 'article': return ARTICLE_MAP[id] ? { title: ARTICLE_MAP[id].title, href: `/learn/${id}` } : null;
    case 'topic': return TOPIC_MAP[id] ? { title: TOPIC_MAP[id].name, href: `/topic/${id}` } : null;
    default: return null;
  }
}

export function SavedPage() {
  const { saved, toggleSaved } = useStore();
  const [filter, setFilter] = useState<SavedType | 'all'>('all');
  const items = saved.filter((s) => filter === 'all' || s.type === filter);
  return (
    <div>
      <PageHeader title="Saved items" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
        {(['product', 'ingredient', 'article', 'topic'] as SavedType[]).map((t) => <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>{SAVED_LABEL[t]}</Chip>)}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Bookmark} title="Nothing saved yet">Use the bookmark icon on any product, ingredient, topic or article.</EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {items.map((s) => {
            const r = resolveSaved(s.type, s.id);
            return (
              <div key={s.type + s.id} className="flex items-center">
                <div className="flex-1">
                  {r ? <ListRow to={r.href} title={r.title} subtitle={SAVED_LABEL[s.type]} /> : <p className="px-4 py-3 text-[13.5px] text-ink-muted">{s.label ?? s.id} (no longer available)</p>}
                </div>
                <button type="button" onClick={() => toggleSaved(s.type, s.id)} className="mr-2 grid h-10 w-10 place-items-center rounded-full text-ink-faint hover:bg-ivory-100" aria-label="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

export function ComparisonsPage() {
  const { comparisons, removeComparison } = useStore();
  return (
    <div>
      <PageHeader title="Comparison lists" />
      {comparisons.length === 0 ? (
        <EmptyState icon={Columns2} title="No saved comparisons" action={<Link to="/compare" className="font-medium text-forest-700 underline">Start a comparison</Link>}>Use “Save comparison” on the Compare page.</EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {comparisons.map((c) => (
            <div key={c.id} className="flex items-center">
              <div className="flex-1"><ListRow to={c.mode === 'products' ? `/compare?p=${c.ids.join(',')}` : `/compare?mode=ingredients&i=${c.ids.join(',')}`} title={c.label} subtitle={`${c.mode === 'products' ? 'Products' : 'Ingredients'} · saved ${new Date(c.savedAt).toLocaleDateString('en-IN')}`} /></div>
              <button type="button" onClick={() => removeComparison(c.id)} className="mr-2 grid h-10 w-10 place-items-center rounded-full text-ink-faint hover:bg-ivory-100" aria-label="Delete comparison"><Trash2 size={16} /></button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function MyProductsPage() {
  const { owned, toggleOwned } = useStore();
  const [adding, setAdding] = useState(false);
  const mine = owned.map((id) => PRODUCT_MAP[id]).filter(Boolean);
  return (
    <div>
      <PageHeader title="My products" subtitle="Products you already own — useful for comparisons and avoiding duplicates." />
      {mine.length === 0 ? (
        <EmptyState icon={Package} title="No products added">Tap “I own this” on a product page, or add one below.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {mine.map((p) => <ProductRow key={p.id} product={p} right={<button type="button" onClick={() => toggleOwned(p.id)} className="grid h-10 w-10 place-items-center rounded-full text-ink-faint hover:bg-ivory-100" aria-label={`Remove ${p.name}`}><Trash2 size={16} /></button>} />)}
        </div>
      )}
      <Button variant="secondary" className="mt-4" onClick={() => setAdding(!adding)}>{adding ? 'Done' : 'Add a product'}</Button>
      {adding && (
        <div className="mt-3 flex flex-wrap gap-2">
          {PUBLIC_PRODUCTS.filter((p) => !owned.includes(p.id)).map((p) => <Chip key={p.id} onClick={() => toggleOwned(p.id)}>{p.name}</Chip>)}
        </div>
      )}
    </div>
  );
}

export function RoutinesPage() {
  const { routines, upsertRoutine, removeRoutine, owned } = useStore();
  const [draft, setDraft] = useState<Routine | null>(null);
  const [stepText, setStepText] = useState('');
  const newRoutine = (): Routine => ({ id: uid(), name: 'Morning routine', time: 'morning', steps: [], createdAt: new Date().toISOString() });

  return (
    <div>
      <PageHeader title="My routine" subtitle="Optional. Keep a simple list of steps and an in-app reminder time." />
      <Notice>Routines are entirely optional. Reminders appear on the Home screen when the app is open; CareLens does not send push notifications.</Notice>

      <div className="mt-5 space-y-3">
        {routines.length === 0 && !draft && <EmptyState icon={CalendarClock} title="No routines yet" />}
        {routines.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[15px] font-semibold">{r.name}</p>
                <p className="text-[12.5px] capitalize text-ink-muted">{r.time}{r.reminder ? ` · reminder ${r.reminder}` : ''}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => setDraft(r)}>Edit</Button>
                <Button variant="ghost" onClick={() => removeRoutine(r.id)}>Delete</Button>
              </div>
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] text-ink-soft">
              {r.steps.map((s) => <li key={s.id}>{s.productId && PRODUCT_MAP[s.productId] ? <Link className="text-forest-700 underline" to={`/product/${s.productId}`}>{s.text}</Link> : s.text}</li>)}
            </ol>
          </Card>
        ))}
      </div>

      {draft ? (
        <Card className="mt-4 space-y-3 p-4">
          <label className="block text-[13px] font-medium">Name
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[14px]" />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['morning', 'evening', 'weekly', 'other'] as const).map((t) => <Chip key={t} active={draft.time === t} onClick={() => setDraft({ ...draft, time: t })}><span className="capitalize">{t}</span></Chip>)}
          </div>
          <label className="block text-[13px] font-medium">Reminder time (optional, in-app)
            <input type="time" value={draft.reminder ?? ''} onChange={(e) => setDraft({ ...draft, reminder: e.target.value || undefined })} className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[14px]" />
          </label>
          <div>
            <p className="mb-1 text-[13px] font-medium">Steps</p>
            <ol className="mb-2 list-decimal space-y-1 pl-5 text-[13.5px]">
              {draft.steps.map((s) => (
                <li key={s.id}>{s.text} <button type="button" className="ml-2 text-[12px] text-rosex-700" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((x) => x.id !== s.id) })}>remove</button></li>
              ))}
            </ol>
            <div className="flex gap-2">
              <input value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder="e.g. Gentle cleanser" aria-label="New step" className="h-11 flex-1 rounded-xl border border-line px-3 text-[14px]" />
              <Button variant="secondary" onClick={() => { if (stepText.trim()) { setDraft({ ...draft, steps: [...draft.steps, { id: uid(), text: stepText.trim() }] }); setStepText(''); } }}>Add</Button>
            </div>
            {owned.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-[12px] text-ink-muted">From my products:</span>
                {owned.map((id) => PRODUCT_MAP[id] && <Chip key={id} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: uid(), text: PRODUCT_MAP[id].name, productId: id }] })}>{PRODUCT_MAP[id].name}</Chip>)}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { upsertRoutine(draft); setDraft(null); }} disabled={!draft.name.trim()}>Save routine</Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <Button className="mt-4" onClick={() => setDraft(newRoutine())}>Create a routine</Button>
      )}
    </div>
  );
}
