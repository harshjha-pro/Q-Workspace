import { FileText, FlaskConical, LayoutGrid, Package, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_MAP, formatPrice, INGREDIENT_MAP } from './cardData';
import type { Article, CareTopic, Ingredient, Product } from '../data/types';
import { type Relevance } from '../lib/personalise';
import type { SearchHit } from '../lib/search';
import { type RecentItem, useStore } from '../lib/store';
import { RelevanceNotes } from './Personalise';
import { CATEGORY_ICONS, EvidenceBadge, Tag, cx } from './ui';

const TYPE_ICON = { ingredient: FlaskConical, product: Package, topic: Sparkles, article: FileText, category: LayoutGrid };
const TYPE_LABEL = { ingredient: 'Ingredient', product: 'Product', topic: 'Topic', article: 'Article', category: 'Category' };

export function ProductThumb({ product, size = 56 }: { product: Product; size?: number }) {
  // Neutral illustrative thumbnail (no real product imagery is used).
  const hue = { skin: '#E8F0EA', hair: '#F1ECE1', oral: '#E7EEF2', body: '#F3EDE6' }[product.category] ?? '#EEF4EF';
  const isTube = /toothpaste|cleanser|gel|cream|lotion/i.test(product.productType + product.name);
  return (
    <div className="grid shrink-0 place-items-center rounded-xl" style={{ width: size, height: size, background: hue }} aria-hidden>
      <svg viewBox="0 0 40 40" width={size * 0.62} height={size * 0.62}>
        {isTube ? (
          <path d="M14 6h12l-1 4h-10zM13 10h14v22a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z" fill="#FFFFFF" stroke="#8FB59A" strokeWidth="1.4" />
        ) : (
          <>
            <rect x="16" y="4" width="8" height="7" rx="1.5" fill="#2F6B4A" />
            <rect x="12" y="11" width="16" height="25" rx="4" fill="#FFFFFF" stroke="#8FB59A" strokeWidth="1.4" />
            <rect x="15" y="19" width="10" height="8" rx="1" fill="#DCE9DF" />
          </>
        )}
      </svg>
    </div>
  );
}

export function SearchResultCard({ hit }: { hit: SearchHit }) {
  const { doc } = hit;
  const Icon = doc.type === 'category' ? CATEGORY_ICONS[CATEGORY_MAP[doc.id]?.icon] ?? LayoutGrid : TYPE_ICON[doc.type];
  return (
    <Link to={doc.href} className="flex gap-3 rounded-2xl border border-line bg-white p-4 shadow-card transition-colors hover:border-forest-200">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14.5px] font-semibold leading-snug text-ink">{doc.title}</h3>
          <Tag tone={doc.type === 'product' ? 'neutral' : 'green'} className="shrink-0">{TYPE_LABEL[doc.type]}</Tag>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-muted">{doc.subtitle}</p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">{doc.snippet}</p>
        <RelevanceNotes reasons={hit.reasons} cautions={hit.cautions} />
      </div>
    </Link>
  );
}

export function ProductRow({ product, rel, right }: { product: Product; rel?: Relevance; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card">
      <Link to={`/product/${product.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <ProductThumb product={product} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{product.name}</p>
          <p className="truncate text-[12.5px] text-ink-muted">
            {product.brand} · {product.netQuantity.value} {product.netQuantity.unit}
            {product.price && ` · ${formatPrice(product)}`}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {product.demo && <Tag tone="amber">Demo record</Tag>}
          </div>
          {rel && <RelevanceNotes reasons={rel.reasons} cautions={rel.cautions} />}
        </div>
      </Link>
      {right}
    </div>
  );
}

export function IngredientRow({ ingredient, rel }: { ingredient: Ingredient; rel?: Relevance }) {
  return (
    <Link to={`/ingredient/${ingredient.id}`} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest-50 text-forest-700">
        <FlaskConical size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14.5px] font-semibold text-ink">{ingredient.name}</p>
          <EvidenceBadge level={ingredient.evidence.level} />
        </div>
        <p className="text-[12.5px] text-ink-muted">{ingredient.kind}</p>
        <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{ingredient.summary}</p>
        {rel && <RelevanceNotes reasons={rel.reasons} cautions={rel.cautions} />}
      </div>
    </Link>
  );
}

export function TopicRow({ topic, rel }: { topic: CareTopic; rel?: Relevance }) {
  const rec = topic.recommendation;
  return (
    <Link to={`/topic/${topic.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14.5px] font-semibold text-ink">{topic.name}</p>
        {rec === 'not_recommended' && <Tag tone="rose">Not recommended</Tag>}
        {rec === 'use_with_caution' && <Tag tone="amber">Use with caution</Tag>}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{topic.summary}</p>
      {rel && <RelevanceNotes reasons={rel.reasons} cautions={rel.cautions} />}
    </Link>
  );
}

export function ArticleRow({ article }: { article: Article }) {
  return (
    <Link to={`/learn/${article.id}`} className="flex gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-forest-200">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ivory-100 text-forest-700">
        <FileText size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-snug text-ink">{article.title}</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">{article.readMinutes} min read</p>
        <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{article.summary}</p>
      </div>
    </Link>
  );
}

export function useTrackRecent(item: Omit<RecentItem, 'at'> | null) {
  const { addRecent } = useStore();
  const key = item ? `${item.type}:${item.id}` : '';
  useEffect(() => {
    if (item) addRecent(item);
  }, [key]);
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx('rounded-full bg-ivory-100 px-2.5 py-1 text-[12px] text-ink-muted', className)}>{children}</span>;
}

export { INGREDIENT_MAP };
