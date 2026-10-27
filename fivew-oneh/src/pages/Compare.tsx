import { Check, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProductThumb } from '../components/Cards';
import { PersonaliseControl, Sheet } from '../components/Personalise';
import { Button, Card, Chip, EmptyState, EvidenceBadge, formatINR, Notice, PageHeader, SectionTitle, Tag, cx } from '../components/ui';
import { INGREDIENT_MAP, PRODUCT_MAP, PUBLIC_INGREDIENTS, PUBLIC_PRODUCTS, unitPrice } from '../data';
import type { Ingredient, Product } from '../data/types';
import { areComparable, ingredientDiff, productRows, summarise } from '../lib/compare';
import { LABELS, productRelevance } from '../lib/personalise';
import { search } from '../lib/search';
import { useStore } from '../lib/store';

const MAX = 4;

function Row({ label, cells, highlight }: { label: string; cells: ReactNode[]; highlight?: boolean }) {
  return (
    <>
      <div className={cx('col-span-full mt-3 px-1 text-[12px] font-semibold uppercase tracking-wide text-ink-muted', highlight && 'text-forest-700')}>{label}</div>
      {cells.map((c, i) => (
        <div key={i} className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-snug text-ink-soft">{c}</div>
      ))}
    </>
  );
}

function Picker({ open, onClose, onPick, mode, exclude, category }: { open: boolean; onClose: () => void; onPick: (id: string) => void; mode: 'products' | 'ingredients'; exclude: string[]; category?: string }) {
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    if (mode === 'products') {
      const base = PUBLIC_PRODUCTS.filter((p) => !exclude.includes(p.id) && (!category || p.category === category));
      if (!q.trim()) return base.map((p) => ({ id: p.id, title: p.name, sub: `${p.brand} · ${p.netQuantity.value} ${p.netQuantity.unit}` }));
      const ids = search(q, { types: ['product'] }).map((h) => h.doc.id);
      return ids.map((id) => base.find((p) => p.id === id)).filter(Boolean).map((p) => ({ id: p!.id, title: p!.name, sub: p!.brand }));
    }
    const base = PUBLIC_INGREDIENTS.filter((i) => i.tier === 'full' && !exclude.includes(i.id));
    if (!q.trim()) return base.map((i) => ({ id: i.id, title: i.name, sub: i.kind }));
    const ids = search(q, { types: ['ingredient'] }).map((h) => h.doc.id);
    return ids.map((id) => base.find((i) => i.id === id)).filter(Boolean).map((i) => ({ id: i!.id, title: i!.name, sub: i!.kind }));
  }, [q, mode, exclude, category]);
  return (
    <Sheet open={open} onClose={onClose} title={mode === 'products' ? 'Choose a product' : 'Choose an ingredient'}>
      <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3">
        <Search size={16} className="text-ink-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search options" className="h-full flex-1 bg-transparent text-[14px] outline-none" />
      </label>
      {category && <p className="mb-2 text-[12.5px] text-ink-muted">Showing products in the same category so the comparison stays meaningful.</p>}
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {options.length === 0 && <p className="py-6 text-center text-[13.5px] text-ink-muted">No matching options.</p>}
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => { onPick(o.id); setQ(''); }} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-line bg-white px-3 text-left hover:border-forest-200">
            <span className="flex-1"><span className="block text-[14px] font-medium">{o.title}</span><span className="block text-[12px] text-ink-muted">{o.sub}</span></span>
            <Plus size={16} className="text-forest-700" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'ingredients' ? 'ingredients' : 'products';
  const ids = (params.get(mode === 'products' ? 'p' : 'i') ?? '').split(',').filter(Boolean);
  const [picker, setPicker] = useState<{ open: boolean; replace?: string }>({ open: false });
  const [saved, setSaved] = useState(false);
  const { activeProfile, saveComparison, setCompareTray } = useStore();

  const setIds = (next: string[], m = mode) => {
    const np = new URLSearchParams();
    if (m === 'ingredients') np.set('mode', 'ingredients');
    if (next.length) np.set(m === 'products' ? 'p' : 'i', next.join(','));
    setParams(np, { replace: true });
    if (m === 'products') setCompareTray(next);
    setSaved(false);
  };

  const products = mode === 'products' ? (ids.map((id) => PRODUCT_MAP[id]).filter(Boolean) as Product[]) : [];
  const ingredients = mode === 'ingredients' ? (ids.map((id) => INGREDIENT_MAP[id]).filter(Boolean) as Ingredient[]) : [];
  const count = mode === 'products' ? products.length : ingredients.length;
  const category = products[0]?.category;

  const pick = (id: string) => {
    const cur = mode === 'products' ? products.map((p) => p.id) : ingredients.map((i) => i.id);
    const next = picker.replace ? cur.map((x) => (x === picker.replace ? id : x)) : [...cur, id].slice(0, MAX);
    setIds(next);
    setPicker({ open: false });
  };

  const cols = { gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(150px, 1fr))` };

  return (
    <div>
      <PageHeader title="Compare" subtitle="Side by side — what differs, what matters, and what can't be concluded." back={false} />
      <div className="mb-4 flex gap-2">
        <Chip active={mode === 'products'} onClick={() => setIds([], 'products')}>Products</Chip>
        <Chip active={mode === 'ingredients'} onClick={() => { const np = new URLSearchParams({ mode: 'ingredients' }); setParams(np, { replace: true }); }}>Ingredients</Chip>
      </div>

      {count === 0 ? (
        <div className="space-y-4">
          <EmptyState title={`Choose ${mode} to compare`} action={<Button onClick={() => setPicker({ open: true })}><Plus size={16} /> Add {mode === 'products' ? 'a product' : 'an ingredient'}</Button>}>
            Add two to four {mode}. {mode === 'products' ? 'Products must be in the same category.' : ''}
          </EmptyState>
          {mode === 'products' && (
            <div>
              <SectionTitle>Quick comparisons</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {[
                  ['Niacinamide serums', ['demo-niacinamide-10-zinc', 'demo-niacinamide-5-ha']],
                  ['Sunscreens', ['demo-mineral-sunscreen', 'demo-chemical-sunscreen', 'demo-hybrid-sunscreen']],
                  ['Toothpastes', ['demo-fluoride-toothpaste', 'demo-sensitive-toothpaste', 'demo-herbal-toothpaste']],
                  ['Deodorant vs antiperspirant', ['demo-deodorant', 'demo-antiperspirant']],
                  ['Hair oils', ['demo-coconut-oil', 'demo-amla-oil']],
                ].map(([label, list]) => (
                  <Chip key={label as string} onClick={() => setIds(list as string[])}>{label as string}</Chip>
                ))}
              </div>
            </div>
          )}
          {mode === 'ingredients' && (
            <div className="flex flex-wrap gap-2">
              {[['Niacinamide vs Vitamin C', ['niacinamide', 'vitamin-c']], ['Salicylic acid vs Benzoyl peroxide', ['salicylic-acid', 'benzoyl-peroxide']], ['Zinc oxide vs Titanium dioxide', ['zinc-oxide', 'titanium-dioxide']], ['Glycerin vs Hyaluronic acid', ['glycerin', 'hyaluronic-acid']]].map(([l, list]) => (
                <Chip key={l as string} onClick={() => setIds(list as string[], 'ingredients')}>{l as string}</Chip>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {mode === 'products' && !areComparable(products) && <div className="mb-4"><Notice tone="warn">These products are from different categories, so most rows aren't directly comparable.</Notice></div>}
          {products.some((p) => p.demo) && <div className="mb-4"><Notice tone="warn">Fictional demonstration records — names, formulas and prices are invented for illustration.</Notice></div>}

          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid gap-2" style={cols}>
              {(mode === 'products' ? products : ingredients).map((x) => (
                <Card key={x.id} className="relative p-3">
                  <button type="button" onClick={() => setIds(ids.filter((i) => i !== x.id))} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full text-ink-faint hover:bg-ivory-100" aria-label={`Remove ${x.name}`}>
                    <X size={16} />
                  </button>
                  {'brand' in x ? <ProductThumb product={x} size={64} /> : <div className="h-2" />}
                  <Link to={'brand' in x ? `/product/${x.id}` : `/ingredient/${x.id}`} className="mt-2 block pr-6 text-[13.5px] font-semibold leading-snug text-ink hover:underline">{x.name}</Link>
                  {'brand' in x ? (
                    <p className="mt-0.5 text-[12px] text-ink-muted">{x.brand}<br />{x.price ? formatINR(x.price.amount) : '—'} · {x.netQuantity.value} {x.netQuantity.unit}</p>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-ink-muted">{x.kind}</p>
                  )}
                  <button type="button" onClick={() => setPicker({ open: true, replace: x.id })} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-forest-700">
                    <RefreshCw size={12} /> Replace
                  </button>
                </Card>
              ))}
              {mode === 'products'
                ? products.length > 0 && <ProductTable products={products} />
                : <IngredientTable ingredients={ingredients} />}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {count < MAX && <Button variant="secondary" onClick={() => setPicker({ open: true })}><Plus size={16} /> Add {mode === 'products' ? 'product' : 'ingredient'}</Button>}
            {count >= 2 && (
              <Button
                onClick={() => {
                  saveComparison({ mode, ids, label: (mode === 'products' ? products : ingredients).map((x) => x.name).join(' vs ') });
                  setSaved(true);
                }}
              >
                {saved ? <><Check size={16} /> Saved</> : 'Save comparison'}
              </Button>
            )}
          </div>

          {mode === 'products' && products.length >= 2 && <Summary products={products} />}
          {mode === 'ingredients' && ingredients.length >= 2 && <IngredientSummary ingredients={ingredients} />}
          {count === 1 && <p className="mt-4 text-[13.5px] text-ink-muted">Add at least one more to see differences.</p>}
          <div className="mt-6"><PersonaliseControl /></div>
          {activeProfile && mode === 'products' && (
            <Card className="mt-3 p-4">
              <p className="mb-2 text-[13.5px] font-semibold">For your preferences</p>
              {products.map((p) => {
                const r = productRelevance(activeProfile, p);
                return <p key={p.id} className="text-[13px] text-ink-soft"><span className="font-medium text-ink">{p.name}:</span> {[...r.reasons, ...r.cautions].join(' · ') || 'No specific notes'}</p>;
              })}
            </Card>
          )}
        </>
      )}
      <Picker open={picker.open} onClose={() => setPicker({ open: false })} onPick={pick} mode={mode} exclude={ids} category={mode === 'products' ? category : undefined} />
    </div>
  );
}

function ProductTable({ products }: { products: Product[] }) {
  const diff = ingredientDiff(products);
  const rows = products.map(productRows);
  const fmtSuit = (p: Product) => {
    const s = p.suitability ?? {};
    const parts = [...(s.skinTypes ?? []).map((t) => LABELS.skinType[t]), ...(s.skinConcerns ?? []).map((c) => LABELS.skinConcerns[c]), ...(s.hairConcerns ?? []).map((c) => LABELS.hairConcerns[c]), ...(s.oralConcerns ?? []).map((c) => LABELS.oralConcerns[c])];
    return parts.length ? parts.join(', ') : 'Not specified';
  };
  return (
    <>
      <Row label="Category" cells={rows.map((r) => r.category)} />
      <Row label="Intended purpose" cells={products.map((p) => p.intendedUse)} />
      <Row label="Key ingredients" highlight cells={products.map((p) => diff.keyActives[p.id].length ? diff.keyActives[p.id].map((a) => (
        <span key={a.ingredient.id} className="block">{a.ingredient.name}{a.concentration ? ` ${a.concentration}` : <span className="text-ink-faint"> (strength not declared)</span>}</span>
      )) : 'None with a full guide')} />
      <Row label="Only in this product" cells={products.map((p) => diff.unique[p.id].length ? diff.unique[p.id].map((i) => i.name).join(', ') : '—')} />
      <Row label="Benefits" cells={products.map((p) => p.benefits?.join('; ') ?? '—')} />
      <Row label="Limitations" cells={products.map((p) => p.limitations?.join('; ') ?? '—')} />
      <Row label="Suitable for" cells={products.map(fmtSuit)} />
      <Row label="Warnings & precautions" cells={products.map((p) => p.warnings?.join(' ') ?? '—')} />
      <Row label="Price" cells={products.map((p) => p.price ? `${formatINR(p.price.amount)}${p.price.verified ? '' : ' (not verified)'}` : 'Not available')} />
      <Row label="Quantity" cells={products.map((p) => `${p.netQuantity.value} ${p.netQuantity.unit}`)} />
      <Row label="Price per unit" highlight cells={products.map((p) => { const u = unitPrice(p); return u ? `₹${u.perUnit.toFixed(1)} per ${u.unit} · ₹${Math.round(u.per100)}/100 ${u.unit}` : '—'; })} />
      <Row label="Strongest evidence among actives" cells={rows.map((r) => r.evidence ? <EvidenceBadge level={r.evidence} /> : '—')} />
      <Row label="Data completeness" cells={rows.map((r, i) => <span key={i}>{r.completeness.score}%{r.completeness.missing.length ? <span className="block text-[11.5px] text-ink-faint">Missing: {r.completeness.missing.join(', ')}</span> : null}</span>)} />
      <Row label="Full ingredient list" cells={products.map((p) => <details key={p.id}><summary className="cursor-pointer text-forest-700">{p.ingredients.length} ingredients</summary><p className="mt-1 text-[12px]">{p.ingredients.map((i) => i.label).join(', ')}</p></details>)} />
    </>
  );
}

function Summary({ products }: { products: Product[] }) {
  const { activeProfile } = useStore();
  const s = summarise(products, activeProfile);
  return (
    <Card className="mt-5 bg-forest-50/50 p-4">
      <p className="mb-2 text-[15px] font-semibold">Key differences</p>
      <ul className="space-y-1.5 text-[13.5px] text-ink-soft">{s.points.map((p) => <li key={p}>• {p}</li>)}</ul>
      {s.preferable.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 text-[13.5px] font-semibold">Where each may be preferable</p>
          <ul className="space-y-1.5 text-[13.5px] text-ink-soft">{s.preferable.map((p) => <li key={p.productId}>• {p.text}</li>)}</ul>
        </>
      )}
      <p className="mb-1.5 mt-4 text-[13.5px] font-semibold">What can't be concluded</p>
      <ul className="space-y-1.5 text-[13px] text-ink-muted">{s.cannotConclude.map((p) => <li key={p}>• {p}</li>)}</ul>
      <p className="mt-3 text-[11.5px] text-ink-faint">Rule-based summary from the records above. CareLens does not rank products or declare a "best" product.</p>
    </Card>
  );
}

function IngredientTable({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <>
      <Row label="Type" cells={ingredients.map((i) => i.kind)} />
      <Row label="Functions" cells={ingredients.map((i) => i.functions.join(', '))} />
      <Row label="Evidence" highlight cells={ingredients.map((i) => <span key={i.id}><EvidenceBadge level={i.evidence.level} /><span className="mt-1 block text-[12px]">{i.evidence.summary}</span></span>)} />
      <Row label="Studied concentrations" cells={ingredients.map((i) => i.concentrations ?? 'Not recorded')} />
      <Row label="Benefits" cells={ingredients.map((i) => i.benefits?.join('; ') ?? '—')} />
      <Row label="Limitations" cells={ingredients.map((i) => i.limitations?.join('; ') ?? '—')} />
      <Row label="Side effects" cells={ingredients.map((i) => i.adverseEffects?.join('; ') ?? '—')} />
      <Row label="Who may benefit" cells={ingredients.map((i) => i.fiveW?.who?.summary ?? '—')} />
      <Row label="Compatibility" cells={ingredients.map((i) => i.compatibility?.join('; ') ?? '—')} />
      <Row label="Precautions" cells={ingredients.map((i) => i.precautions?.join('; ') || '—')} />
    </>
  );
}

function IngredientSummary({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <Card className="mt-5 bg-forest-50/50 p-4">
      <p className="mb-2 text-[15px] font-semibold">Key differences</p>
      <ul className="space-y-1.5 text-[13.5px] text-ink-soft">
        {ingredients.map((i) => (
          <li key={i.id}>• <span className="font-medium text-ink">{i.name}</span> is mainly used for {i.functions.slice(0, 2).join(' and ').toLowerCase()} ({i.evidence.level} evidence).</li>
        ))}
        {ingredients.every((i) => i.flags?.length === 0 || !i.flags) ? null : (
          <li>• Precaution flags: {ingredients.filter((i) => i.flags?.length).map((i) => i.name).join(', ')} — see each ingredient's Safety tab.</li>
        )}
      </ul>
      <p className="mb-1.5 mt-4 text-[13.5px] font-semibold">What can't be concluded</p>
      <ul className="space-y-1.5 text-[13px] text-ink-muted">
        <li>• Which is "better" — they often serve different purposes and many people use them together.</li>
        <li>• How a specific product performs — that depends on concentration and formulation.</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5">{ingredients.map((i) => <Tag key={i.id}><Link to={`/guide/ingredient/${i.id}`}>{i.name} 5W1H</Link></Tag>)}</div>
    </Card>
  );
}
