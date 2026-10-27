import { ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArticleRow, IngredientRow, ProductRow, ProductThumb, TopicRow } from '../components/Cards';
import { PersonaliseControl } from '../components/Personalise';
import { Chip, EmptyState, EVIDENCE_META, PageHeader, SectionTitle } from '../components/ui';
import { CATEGORY_MAP, PUBLIC_ARTICLES, PUBLIC_INGREDIENTS, PUBLIC_PRODUCTS, PUBLIC_TOPICS } from '../data';
import type { EvidenceLevel } from '../data/types';
import { normalize } from '../lib/ingredientMatch';
import { productRelevance, relevance } from '../lib/personalise';
import { search } from '../lib/search';
import { useStore } from '../lib/store';
import { inSubcategory } from '../lib/taxonomy';
import NotFound from './NotFound';

type Kind = 'all' | 'product' | 'ingredient' | 'topic' | 'article';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'product', label: 'Products' },
  { id: 'ingredient', label: 'Ingredients' },
  { id: 'topic', label: 'Topics & practices' },
  { id: 'article', label: 'Articles' },
];

export default function CategoryPage() {
  const { id = '' } = useParams();
  const cat = CATEGORY_MAP[id];
  const [params, setParams] = useSearchParams();
  const sub = params.get('sub') ?? 'all';
  const kind = (params.get('kind') as Kind) ?? 'all';
  const evidence = params.get('evidence') as EvidenceLevel | null;
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const { activeProfile } = useStore();

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const data = useMemo(() => {
    if (!cat) return null;
    const subName = cat.subcategories.find((s) => s.id === sub)?.name ?? '';
    const matchesQuery = q.trim() ? new Set(search(q, { category: cat.id }).map((h) => h.doc.key)) : null;
    const keep = (key: string) => !matchesQuery || matchesQuery.has(key);
    const ev = (lvl: EvidenceLevel) => !evidence || lvl === evidence;

    let products = PUBLIC_PRODUCTS.filter((p) => p.category === cat.id && inSubcategory(cat.id, sub, { type: 'product', v: p }, subName) && keep(`product:${p.id}`));
    let ingredients = PUBLIC_INGREDIENTS.filter(
      (i) => i.categories.includes(cat.id) && (cat.id === 'ingredients' || i.tier === 'full' || sub !== 'all') && inSubcategory(cat.id, sub, { type: 'ingredient', v: i }, subName) && ev(i.evidence.level) && keep(`ingredient:${i.id}`),
    );
    let topics = PUBLIC_TOPICS.filter((t) => t.categories.includes(cat.id) && inSubcategory(cat.id, sub, { type: 'topic', v: t }, subName) && (!evidence || t.claims?.some((c) => c.level === evidence)) && keep(`topic:${t.id}`));
    const articles = PUBLIC_ARTICLES.filter((a) => a.categories.includes(cat.id) && (sub === 'all' || inSubcategory(cat.id, sub, { type: 'article', v: a }, subName)) && keep(`article:${a.id}`));

    const pr = new Map(products.map((p) => [p.id, productRelevance(activeProfile, p)]));
    const ir = new Map(ingredients.map((i) => [i.id, relevance(activeProfile, i.suitability)]));
    const tr = new Map(topics.map((t) => [t.id, relevance(activeProfile, t.suitability)]));
    if (activeProfile) {
      const byScore = <T extends { id: string }>(m: Map<string, { score: number }>) => (a: T, b: T) => (m.get(b.id)!.score - m.get(a.id)!.score);
      products = [...products].sort(byScore(pr));
      ingredients = [...ingredients].sort(byScore(ir));
      topics = [...topics].sort(byScore(tr));
      if (mineOnly) {
        products = products.filter((p) => pr.get(p.id)!.score > 0);
        ingredients = ingredients.filter((i) => ir.get(i.id)!.score > 0);
        topics = topics.filter((t) => tr.get(t.id)!.score > 0);
      }
    }
    return { products, ingredients, topics, articles, pr, ir, tr };
  }, [cat, sub, q, evidence, activeProfile, mineOnly]);

  if (!cat || !data) return <NotFound />;
  const show = (k: Kind) => kind === 'all' || kind === k;
  const total = data.products.length + data.ingredients.length + data.topics.length + data.articles.length;
  const subCounts = (sid: string) => {
    const name = cat.subcategories.find((s) => s.id === sid)!.name;
    return (
      PUBLIC_PRODUCTS.filter((p) => p.category === cat.id && inSubcategory(cat.id, sid, { type: 'product', v: p }, name)).length +
      PUBLIC_INGREDIENTS.filter((i) => i.categories.includes(cat.id) && inSubcategory(cat.id, sid, { type: 'ingredient', v: i }, name)).length +
      PUBLIC_TOPICS.filter((t) => t.categories.includes(cat.id) && inSubcategory(cat.id, sid, { type: 'topic', v: t }, name)).length
    );
  };

  return (
    <div>
      <PageHeader title={cat.name} subtitle={cat.description} />

      <label className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3">
        <Search size={16} className="text-ink-faint" />
        <span className="sr-only">Search within {cat.name}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search within ${cat.name}`} className="h-full flex-1 bg-transparent text-[14px] outline-none" />
      </label>

      <SectionTitle>Subcategories</SectionTitle>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={sub === 'all'} onClick={() => setParam('sub', null)}>All</Chip>
        {cat.subcategories.map((s) => (
          <Chip key={s.id} active={sub === s.id} onClick={() => setParam('sub', s.id)}>{s.name}</Chip>
        ))}
      </div>

      <SectionTitle>Filter & personalise</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip key={k.id} active={kind === k.id} onClick={() => setParam('kind', k.id)}>{k.label}</Chip>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="ev" className="text-[12.5px] text-ink-muted">Evidence</label>
        <select id="ev" value={evidence ?? ''} onChange={(e) => setParam('evidence', e.target.value || null)} className="min-h-[36px] rounded-full border border-line bg-white px-3 text-[13px]">
          <option value="">Any level</option>
          {(Object.keys(EVIDENCE_META) as EvidenceLevel[]).map((l) => <option key={l} value={l}>{EVIDENCE_META[l].label}</option>)}
        </select>
        {activeProfile && (
          <Chip active={mineOnly} onClick={() => setMineOnly(!mineOnly)}>Relevant to me only</Chip>
        )}
      </div>
      <div className="mb-6"><PersonaliseControl /></div>

      {sub === 'all' && !q && kind === 'all' && !evidence && (
        <section className="mb-6">
          <SectionTitle>Popular in {cat.short}</SectionTitle>
          <div className="space-y-2.5">
            {cat.subcategories.map((s) => {
              const sample = PUBLIC_PRODUCTS.find((p) => p.category === cat.id && p.subcategory === s.id);
              return (
                <button key={s.id} type="button" onClick={() => setParam('sub', s.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left shadow-card hover:border-forest-200">
                  {sample ? <ProductThumb product={sample} /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-forest-50 text-[18px] font-semibold text-forest-700">{s.name[0]}</div>}
                  <span className="flex-1">
                    <span className="block text-[14px] font-semibold text-ink">{s.name}</span>
                    <span className="block text-[12.5px] text-ink-muted">{s.description} · {subCounts(s.id)} records</span>
                  </span>
                  <ChevronRight size={18} className="text-ink-faint" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {total === 0 ? (
        <EmptyState title="Nothing matches these filters">Try clearing filters or searching for a broader term.</EmptyState>
      ) : (
        <div className="space-y-7">
          {show('topic') && data.topics.length > 0 && (
            <section>
              <SectionTitle>Topics, concerns & practices</SectionTitle>
              <div className="space-y-2.5">{data.topics.map((t) => <TopicRow key={t.id} topic={t} rel={data.tr.get(t.id)} />)}</div>
            </section>
          )}
          {show('ingredient') && data.ingredients.length > 0 && (
            <section>
              <SectionTitle action={<Link to="/ingredients" className="text-[13px] font-medium text-forest-600">Ingredient database</Link>}>Ingredients</SectionTitle>
              <div className="space-y-2.5">{data.ingredients.map((i) => <IngredientRow key={i.id} ingredient={i} rel={data.ir.get(i.id)} />)}</div>
            </section>
          )}
          {show('product') && data.products.length > 0 && (
            <section>
              <SectionTitle action={<Link to={`/compare?p=${data.products.slice(0, 2).map((p) => p.id).join(',')}`} className="text-[13px] font-medium text-forest-600">Compare</Link>}>Products</SectionTitle>
              <div className="space-y-2.5">{data.products.map((p) => <ProductRow key={p.id} product={p} rel={data.pr.get(p.id)} />)}</div>
            </section>
          )}
          {show('article') && data.articles.length > 0 && (
            <section>
              <SectionTitle>Learn</SectionTitle>
              <div className="space-y-2.5">{data.articles.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
            </section>
          )}
          {kind !== 'all' && { product: data.products, ingredient: data.ingredients, topic: data.topics, article: data.articles }[kind].length === 0 && (
            <EmptyState title="Nothing in this section">No {kind}s match the current filters.</EmptyState>
          )}
        </div>
      )}
      {q && <p className="mt-4 text-[12px] text-ink-faint">Filtering “{normalize(q)}” within {cat.name}.</p>}
    </div>
  );
}
