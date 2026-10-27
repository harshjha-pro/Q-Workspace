import { ArrowRight, Columns2, ScanText, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchResultCard } from '../components/Cards';
import { W1H_META } from '../components/FiveW1H';
import { PersonaliseControl } from '../components/Personalise';
import { SearchBar } from '../components/SearchBar';
import { BackButton, Card, Chip, EmptyState, Tag } from '../components/ui';
import { CATEGORIES, REGION_MAP, SUGGESTED_QUESTIONS, seasonFor, seasonalGuidance } from '../data';
import { effectiveClimate } from '../lib/personalise';
import { classifyIntent, didYouMean, INTENT_LABEL, quickAnswer, resolveComparison, search, type DocType } from '../lib/search';
import { useStore } from '../lib/store';

const TABS: { id: 'all' | DocType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'product', label: 'Products' },
  { id: 'ingredient', label: 'Ingredients' },
  { id: 'topic', label: 'Topics & practices' },
  { id: 'article', label: 'Articles' },
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const tab = (params.get('type') as 'all' | DocType) ?? 'all';
  const cat = params.get('cat') ?? '';
  const { activeProfile, profile } = useStore();
  const [limit, setLimit] = useState(20);

  const contextClimates = useMemo(() => {
    const climate = effectiveClimate(profile);
    const g = seasonalGuidance(seasonFor(new Date()), profile.regionId ? REGION_MAP[profile.regionId] : undefined);
    return climate ? [climate, ...g.climates] : g.climates;
  }, [profile]);

  const all = useMemo(() => (q ? search(q, { profile: activeProfile, contextClimates, category: cat || undefined }) : []), [q, activeProfile, contextClimates, cat]);
  const hits = tab === 'all' ? all : all.filter((h) => h.doc.type === tab);
  const intent = useMemo(() => classifyIntent(q), [q]);
  const answer = useMemo(() => (q ? quickAnswer(q, all, intent) : null), [q, all, intent]);
  const comparison = useMemo(() => (intent.intent === 'comparison' ? resolveComparison(q) : null), [q, intent]);
  const suggestion = useMemo(() => (q ? didYouMean(q) : null), [q]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, t.id === 'all' ? all.length : all.filter((h) => h.doc.type === t.id).length])), [all]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(20);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-1">
        <BackButton />
        <div className="flex-1">
          <SearchBar initial={q} autoFocus={!q} compact />
        </div>
      </div>

      {!q ? (
        <div className="space-y-5">
          <h1 className="text-[20px] font-semibold">Search CareLens</h1>
          <p className="text-[14px] text-ink-muted">Search products, brands, ingredients (including INCI names and Hindi names like haldi), concerns, Ayurvedic practices and articles — or ask a question.</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((s) => (
              <Chip key={s.q} onClick={() => navigate(`/search?q=${encodeURIComponent(s.q)}`)}>{s.q}</Chip>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <Chip key={t.id} active={tab === t.id} onClick={() => setParam('type', t.id === 'all' ? '' : t.id)}>
                {t.label} <span className="opacity-70">{counts[t.id]}</span>
              </Chip>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-[12.5px] text-ink-muted" htmlFor="cat-filter">Category</label>
            <select id="cat-filter" value={cat} onChange={(e) => setParam('cat', e.target.value)} className="min-h-[36px] rounded-full border border-line bg-white px-3 text-[13px]">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Tag tone="neutral">Intent: {INTENT_LABEL[intent.intent]}</Tag>
          </div>

          <div className="mb-4"><PersonaliseControl compact /></div>

          {suggestion && suggestion !== q.toLowerCase() && (
            <p className="mb-4 text-[14px] text-ink-soft">
              Did you mean{' '}
              <Link to={`/search?q=${encodeURIComponent(suggestion)}`} className="font-semibold text-forest-700 underline">
                {suggestion}
              </Link>
              ?
            </p>
          )}

          {comparison && (
            <Link to={comparison.href} className="mb-4 flex items-center gap-3 rounded-2xl border border-forest-200 bg-forest-50 p-4 text-forest-800">
              <Columns2 size={20} />
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{comparison.kind === 'category' ? comparison.label : `Compare ${comparison.label}`}</span>
                <span className="block text-[12.5px] opacity-80">Open a side-by-side comparison</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}

          {intent.intent === 'product_analysis' && (
            <Link to="/analyse" className="mb-4 flex items-center gap-3 rounded-2xl border border-forest-200 bg-forest-50 p-4 text-forest-800">
              <ScanText size={20} />
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">Analyse an ingredient list</span>
                <span className="block text-[12.5px] opacity-80">Paste the label to see what each ingredient does{/price|worth|value/i.test(q) ? ', or compare price per ml in Compare' : ''}</span>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}

          {answer && (
            <Card className="mb-5 p-4">
              <div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-forest-700">
                From the CareLens database{answer.section ? ` · ${W1H_META[answer.section].label}` : ''}
              </div>
              <p className="text-[15px] font-semibold text-ink">{answer.heading}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{answer.text}</p>
              {answer.points.length > 0 && (
                <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft">
                  {answer.points.map((p) => <li key={p}>• {p}</li>)}
                </ul>
              )}
              <Link to={`${answer.doc.href}${answer.section ? `?section=${answer.section}` : ''}`} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-forest-700">
                Read the full 5W1H for {answer.doc.title} <ArrowRight size={14} />
              </Link>
              <p className="mt-2 text-[11.5px] text-ink-faint">Retrieved from a reviewed record — not generated. Sources are listed on the record page.</p>
            </Card>
          )}

          {hits.length === 0 ? (
            <EmptyState icon={SearchX} title={`No results for “${q}”`}>
              Try a simpler word (e.g. “sunscreen”), an ingredient’s common name, or browse categories.{' '}
              <Link to="/explore" className="font-medium text-forest-700 underline">Explore categories</Link>
            </EmptyState>
          ) : (
            <>
              <h2 className="mb-3 text-[14px] font-semibold text-ink">{tab === 'all' ? 'Top results' : TABS.find((t) => t.id === tab)?.label}</h2>
              <div className="space-y-2.5">
                {hits.slice(0, limit).map((h) => <SearchResultCard key={h.doc.key} hit={h} />)}
              </div>
              {hits.length > limit && (
                <button type="button" onClick={() => setLimit(limit + 20)} className="mt-4 w-full rounded-xl border border-line bg-white py-3 text-[14px] font-medium text-forest-700">
                  Show more ({hits.length - limit} more)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
