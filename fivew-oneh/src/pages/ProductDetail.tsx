import { AlertTriangle, ArrowRight, Check, Columns2, Hand, Plus, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductRow, ProductThumb, useTrackRecent } from '../components/Cards';
import { formatPrice } from '../components/cardData';
import { FiveW1H } from '../components/FiveW1H';
import { PersonaliseControl, RelevanceNotes } from '../components/Personalise';
import { Button, Card, DemoNotice, EvidenceBadge, PageHeader, SaveButton, SectionTitle, ShareButton, SourceList, Tag } from '../components/ui';
import { CATEGORY_MAP, completeness, INGREDIENT_MAP, isPublic, PRODUCT_MAP, PUBLIC_PRODUCTS, unitPrice } from '../data';
import { productRelevance } from '../lib/personalise';
import { productFiveW } from '../lib/productFiveW';
import { useStore } from '../lib/store';
import NotFound from './NotFound';

export default function ProductDetail() {
  const { id = '' } = useParams();
  const p = PRODUCT_MAP[id];
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const { activeProfile, owned, toggleOwned, compareTray, setCompareTray } = useStore();
  useTrackRecent(p && isPublic(p.status) ? { type: 'product', id: p.id, label: p.name, href: `/product/${p.id}` } : null);
  if (!p || !isPublic(p.status)) return <NotFound what="product" />;

  const cat = CATEGORY_MAP[p.category];
  const sub = cat?.subcategories.find((s) => s.id === p.subcategory);
  const u = unitPrice(p);
  const comp = completeness(p);
  const rel = productRelevance(activeProfile, p);
  const keyIngredients = p.ingredients.filter((i) => i.ingredientId && INGREDIENT_MAP[i.ingredientId]?.tier === 'full');
  const similar = PUBLIC_PRODUCTS.filter((x) => x.id !== p.id && x.subcategory === p.subcategory).slice(0, 3);
  const inTray = compareTray.includes(p.id);
  const isOwned = owned.includes(p.id);

  return (
    <div>
      <PageHeader actions={<><SaveButton type="product" id={p.id} label={p.name} /><ShareButton title={p.name} /></>} />
      <div className="mb-4 grid place-items-center rounded-3xl border border-line bg-white py-6">
        <ProductThumb product={p} size={140} />
      </div>
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{p.name}</h1>
      <p className="mt-1 text-[14px] text-ink-muted">{p.brand}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cat && <Tag>{cat.short}</Tag>}
        {sub && <Tag>{sub.name}</Tag>}
        {p.demo && <Tag tone="amber">Demo record</Tag>}
      </div>
      <div className="mt-4 flex items-end gap-3">
        <p className="text-[26px] font-semibold">{p.price ? formatPrice(p).replace(' (illustrative)', '') : '—'}</p>
        <p className="pb-1.5 text-[13px] text-ink-muted">
          {p.netQuantity.value} {p.netQuantity.unit}
          {u && ` · ₹${u.perUnit.toFixed(1)}/${u.unit}`}
          {p.price && !p.price.verified && ' · price not verified'}
        </p>
      </div>
      <p className="mt-1 text-[12px] text-ink-faint">No ratings or reviews are shown — CareLens does not display ratings it cannot verify.</p>

      {p.demo && <div className="mt-4"><DemoNotice /></div>}

      {activeProfile && (rel.reasons.length > 0 || rel.cautions.length > 0) && (
        <Card className="mt-4 p-3">
          <p className="text-[12.5px] font-medium text-ink-muted">For your preferences</p>
          <RelevanceNotes reasons={rel.reasons} cautions={rel.cautions} />
        </Card>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Button
          variant={inTray ? 'secondary' : 'primary'}
          onClick={() => {
            const next = inTray ? compareTray.filter((x) => x !== p.id) : [...compareTray.filter((x) => PRODUCT_MAP[x]?.category === p.category), p.id].slice(-4);
            setCompareTray(next);
            if (!inTray) navigate(`/compare?p=${next.join(',')}`);
          }}
        >
          <Columns2 size={17} /> {inTray ? 'In comparison' : 'Compare'}
        </Button>
        <Button variant="secondary" onClick={() => toggleOwned(p.id)}>
          {isOwned ? <Check size={17} /> : <Plus size={17} />} {isOwned ? 'In my products' : 'I own this'}
        </Button>
      </div>

      <section className="mt-7">
        <SectionTitle>Key ingredients</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {keyIngredients.length ? keyIngredients.map((k) => (
            <Link key={k.label} to={`/ingredient/${k.ingredientId}`} className="rounded-full border border-forest-100 bg-forest-50 px-3 py-1.5 text-[13px] font-medium text-forest-700">
              {INGREDIENT_MAP[k.ingredientId!].name}{k.concentration ? ` ${k.concentration}` : ''}
            </Link>
          )) : <p className="text-[13.5px] text-ink-muted">No ingredients with a full guide identified.</p>}
        </div>
      </section>

      <section className="mt-7">
        <SectionTitle>About this product</SectionTitle>
        <p className="text-[14.5px] leading-relaxed text-ink-soft">{p.description}</p>
        <Card className="mt-4 divide-y divide-line">
          <div className="flex gap-3 p-4"><UserCheck size={18} className="mt-0.5 text-forest-700" /><div><p className="text-[13.5px] font-semibold">Intended for</p><p className="text-[13px] text-ink-muted">{p.intendedUse}</p></div></div>
          <div className="flex gap-3 p-4"><Hand size={18} className="mt-0.5 text-forest-700" /><div><p className="text-[13.5px] font-semibold">How to use</p><p className="text-[13px] text-ink-muted">{p.directions ?? 'Not provided.'}</p></div></div>
          <div className="flex gap-3 p-4"><AlertTriangle size={18} className="mt-0.5 text-amberx-700" /><div><p className="text-[13.5px] font-semibold">Warnings</p><p className="text-[13px] text-ink-muted">{p.warnings?.join(' ') ?? 'None listed.'}</p></div></div>
        </Card>
      </section>

      {(p.benefits?.length || p.limitations?.length) && (
        <section className="mt-7 grid gap-3 sm:grid-cols-2">
          <Card className="p-4"><p className="mb-2 text-[13.5px] font-semibold">What it may offer</p><ul className="space-y-1 text-[13px] text-ink-soft">{(p.benefits ?? []).map((b) => <li key={b}>• {b}</li>)}</ul></Card>
          <Card className="p-4"><p className="mb-2 text-[13.5px] font-semibold">Limitations</p><ul className="space-y-1 text-[13px] text-ink-soft">{(p.limitations ?? []).map((b) => <li key={b}>• {b}</li>)}</ul></Card>
        </section>
      )}

      <section className="mt-7">
        <SectionTitle action={<span className="text-[12px] text-ink-muted">{p.ingredients.length} ingredients</span>}>Full ingredient list</SectionTitle>
        <p className="mb-3 text-[12.5px] text-ink-muted">{p.ingredientListVerified ? 'Verified against the product label.' : 'Not independently verified.'} Tap an ingredient to open its explanation.</p>
        <Card className="divide-y divide-line">
          {(showAll ? p.ingredients : p.ingredients.slice(0, 8)).map((i, idx) => {
            const ing = i.ingredientId ? INGREDIENT_MAP[i.ingredientId] : null;
            const body = (
              <>
                <span className="w-6 shrink-0 text-[12px] text-ink-faint">{idx + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-ink">{i.label}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{ing ? ing.functions.slice(0, 2).join(' · ') : 'Not in the CareLens database yet'}</span>
                </span>
                {ing && ing.tier === 'full' && <EvidenceBadge level={ing.evidence.level} />}
                {ing && <ArrowRight size={15} className="shrink-0 text-ink-faint" />}
              </>
            );
            return ing ? (
              <Link key={i.label} to={`/ingredient/${ing.id}`} className="flex min-h-[52px] items-center gap-2 px-4 py-2 hover:bg-ivory-100/60">{body}</Link>
            ) : (
              <div key={i.label} className="flex min-h-[52px] items-center gap-2 px-4 py-2">{body}</div>
            );
          })}
        </Card>
        {p.ingredients.length > 8 && (
          <Button variant="primary" className="mt-3 w-full" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer ingredients' : 'View full ingredients'}</Button>
        )}
        <Link to={`/analyse?from=${p.id}`} className="mt-2 block text-center text-[13px] font-medium text-forest-700">Open in the ingredient-list analyser</Link>
      </section>

      <section className="mt-7">
        <SectionTitle action={<Link to={`/guide/product/${p.id}`} className="text-[13px] font-medium text-forest-600">Full guide</Link>}>5W1H for this product</SectionTitle>
        <FiveW1H data={productFiveW(p)} />
      </section>

      <section className="mt-7">
        <SectionTitle>Data completeness</SectionTitle>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between text-[13px]"><span>Record completeness</span><span className="font-semibold">{comp.score}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ivory-200"><div className="h-full rounded-full bg-forest-500" style={{ width: `${comp.score}%` }} /></div>
          {comp.missing.length > 0 && <p className="mt-2 text-[12.5px] text-ink-muted">Missing or unverified: {comp.missing.join(', ')}.</p>}
          <p className="mt-1 text-[12.5px] text-ink-muted">Verification status: {p.verification.replace('_', ' ')}.</p>
          <div className="mt-3"><SourceList ids={p.sources} lastReviewed={p.lastVerified} label="Last verified" /></div>
          {p.officialUrl && <a href={p.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] text-forest-700 underline">Official product page</a>}
        </Card>
      </section>

      {similar.length > 0 && (
        <section className="mt-7">
          <SectionTitle>Similar products</SectionTitle>
          <div className="space-y-2.5">{similar.map((s) => <ProductRow key={s.id} product={s} />)}</div>
        </section>
      )}
      <div className="mt-6"><PersonaliseControl /></div>
    </div>
  );
}
