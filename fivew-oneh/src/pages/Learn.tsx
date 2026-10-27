import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArticleRow, IngredientRow, ProductRow, TopicRow, useTrackRecent } from '../components/Cards';
import { Card, Chip, EmptyState, PageHeader, SaveButton, SectionTitle, ShareButton, SourceList, Tag, formatDate } from '../components/ui';
import { ARTICLE_MAP, INGREDIENT_MAP, isPublic, PRODUCT_MAP, PUBLIC_ARTICLES, REGION_MAP, TOPIC_MAP } from '../data';
import type { ArticleType } from '../data/types';
import { effectiveClimate } from '../lib/personalise';
import { search } from '../lib/search';
import { useStore } from '../lib/store';
import NotFound from './NotFound';

export const ARTICLE_TYPE_LABEL: Record<ArticleType, string> = {
  beginner_guide: "Beginner's guide",
  ingredient_explainer: 'Ingredient explainer',
  label_literacy: 'Label literacy',
  claim_literacy: 'Marketing claims',
  myths: 'Myths',
  faq: 'FAQ',
  mistakes: 'Common mistakes',
  value: 'Cost vs value',
  safety: 'Safety',
  evidence: 'Evidence',
};

export default function Learn() {
  const [type, setType] = useState<ArticleType | 'all'>('all');
  const [q, setQ] = useState('');
  const { profile } = useStore();
  const climate = effectiveClimate(profile);
  const types = [...new Set(PUBLIC_ARTICLES.map((a) => a.type))];
  const list = useMemo(() => {
    let items = PUBLIC_ARTICLES.filter((a) => type === 'all' || a.type === type);
    if (q.trim()) {
      const ids = search(q, { types: ['article'] }).map((h) => h.doc.id);
      items = ids.map((id) => items.find((a) => a.id === id)).filter(Boolean) as typeof items;
    }
    return items;
  }, [type, q]);
  const forYou = climate ? PUBLIC_ARTICLES.filter((a) => a.climates?.includes(climate)) : [];

  return (
    <div>
      <PageHeader title="Learn" subtitle="Guides, label and claim literacy, myths and evidence — concise and sourced." back={false} />
      <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3">
        <Search size={16} className="text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" className="h-full flex-1 bg-transparent text-[14px] outline-none" />
      </label>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={type === 'all'} onClick={() => setType('all')}>All</Chip>
        {types.map((t) => <Chip key={t} active={type === t} onClick={() => setType(t)}>{ARTICLE_TYPE_LABEL[t]}</Chip>)}
      </div>
      {forYou.length > 0 && type === 'all' && !q && (
        <section className="mb-6">
          <SectionTitle>Relevant to {profile.regionId ? REGION_MAP[profile.regionId]?.name : 'your climate'}</SectionTitle>
          <div className="space-y-2.5">{forYou.slice(0, 2).map((a) => <ArticleRow key={a.id} article={a} />)}</div>
        </section>
      )}
      {list.length ? (
        <div className="space-y-2.5">{list.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
      ) : (
        <EmptyState title="No articles match">Try a different word or filter.</EmptyState>
      )}
      <Link to="/ingredients" className="mt-6 block rounded-2xl border border-line bg-white p-4 text-[14px] font-medium text-forest-700 shadow-card">Browse ingredient explainers in the database →</Link>
    </div>
  );
}

function HeaderArt() {
  return (
    <svg viewBox="0 0 320 110" className="h-28 w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="110" fill="#F5F2EA" />
      <ellipse cx="90" cy="70" rx="60" ry="22" fill="#FFFFFF" />
      <ellipse cx="90" cy="64" rx="44" ry="14" fill="#EEEAE0" />
      <path d="M210 100c10-40 40-70 90-80-10 50-50 76-90 80z" fill="#3F7F59" />
      <path d="M180 104c-4-36 14-64 44-80 4 40-16 66-44 80z" fill="#245A3D" />
    </svg>
  );
}

export function ArticlePage() {
  const { id = '' } = useParams();
  const a = ARTICLE_MAP[id];
  useTrackRecent(a && isPublic(a.status) ? { type: 'article', id: a.id, label: a.title, href: `/learn/${a.id}` } : null);
  if (!a || !isPublic(a.status)) return <NotFound what="article" />;
  const ingredients = (a.relatedIngredients ?? []).map((i) => INGREDIENT_MAP[i]).filter((x) => x && isPublic(x.status));
  const topics = (a.relatedTopics ?? []).map((i) => TOPIC_MAP[i]).filter((x) => x && isPublic(x.status));
  const products = (a.relatedProducts ?? []).map((i) => PRODUCT_MAP[i]).filter(Boolean);

  return (
    <article>
      <PageHeader actions={<><SaveButton type="article" id={a.id} label={a.title} /><ShareButton title={a.title} /></>} />
      <div className="mb-4 overflow-hidden rounded-2xl border border-line"><HeaderArt /></div>
      <Tag>{ARTICLE_TYPE_LABEL[a.type]}</Tag>
      <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">{a.title}</h1>
      <p className="mt-2 text-[12.5px] text-ink-muted">
        {a.author} · Published {formatDate(a.published)} · Last reviewed {formatDate(a.lastReviewed)} · {a.readMinutes} min read
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{a.summary}</p>

      {a.takeaways.length > 0 && (
        <Card className="mt-5 bg-ivory-100/60 p-4">
          <p className="mb-2 text-[14px] font-semibold">Key takeaways</p>
          <ul className="space-y-1 text-[13.5px] text-ink-soft">{a.takeaways.map((t) => <li key={t}>• {t}</li>)}</ul>
        </Card>
      )}

      {a.sections.map((s) => (
        <section key={s.heading} className="mt-6">
          <h2 className="mb-2 text-[17px] font-semibold">{s.heading}</h2>
          {s.body.map((p) => <p key={p} className="mb-2 text-[14.5px] leading-relaxed text-ink-soft">{p}</p>)}
          {s.bullets && <ul className="space-y-1.5 text-[14px] text-ink-soft">{s.bullets.map((b) => <li key={b}>• {b}</li>)}</ul>}
        </section>
      ))}

      {ingredients.length > 0 && <section className="mt-8"><SectionTitle>Related ingredients</SectionTitle><div className="space-y-2.5">{ingredients.map((i) => <IngredientRow key={i.id} ingredient={i} />)}</div></section>}
      {topics.length > 0 && <section className="mt-8"><SectionTitle>Related topics</SectionTitle><div className="space-y-2.5">{topics.map((t) => <TopicRow key={t.id} topic={t} />)}</div></section>}
      {products.length > 0 && <section className="mt-8"><SectionTitle>Example products (demo)</SectionTitle><div className="space-y-2.5">{products.map((p) => <ProductRow key={p.id} product={p} />)}</div></section>}
      <section className="mt-8"><SectionTitle>Sources</SectionTitle><SourceList ids={a.sources} lastReviewed={a.lastReviewed} /></section>
    </article>
  );
}
