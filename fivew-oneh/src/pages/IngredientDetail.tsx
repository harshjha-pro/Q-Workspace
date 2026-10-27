import { ArrowRight, FlaskConical, Layers, Tag as TagIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ProductRow, TopicRow, useTrackRecent } from '../components/Cards';
import { FiveW1H } from '../components/FiveW1H';
import { PersonaliseControl, RelevanceNotes } from '../components/Personalise';
import { BulletList, Card, cx, EvidenceBadge, Notice, PageHeader, SaveButton, SectionTitle, ShareButton, SourceList, StatusBadge, Tag } from '../components/ui';
import { CATEGORY_MAP, INGREDIENT_MAP, isPublic, PUBLIC_PRODUCTS, PUBLIC_TOPICS } from '../data';
import type { W1HKey } from '../data/types';
import { relevance } from '../lib/personalise';
import { useStore } from '../lib/store';
import NotFound from './NotFound';

const TABS = ['Overview', 'Benefits', 'Usage', 'Safety', 'More'] as const;

export function MoleculeArt() {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden>
      <circle cx="40" cy="40" r="38" fill="#EEF4EF" />
      {[[30, 32], [48, 28], [52, 46], [36, 52], [42, 40]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 4 ? 7 : 5} fill="#FFFFFF" stroke="#8FB59A" strokeWidth="1.5" />
      ))}
      <path d="M30 32 L42 40 L48 28 M42 40 L52 46 M42 40 L36 52" stroke="#8FB59A" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function IngredientDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const ing = INGREDIENT_MAP[id];
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const { activeProfile } = useStore();
  useTrackRecent(ing && isPublic(ing.status) ? { type: 'ingredient', id: ing.id, label: ing.name, href: `/ingredient/${ing.id}` } : null);
  if (!ing || !isPublic(ing.status)) return <NotFound what="ingredient" />;

  const section = params.get('section') as W1HKey | null;
  const products = PUBLIC_PRODUCTS.filter((p) => p.ingredients.some((i) => i.ingredientId === ing.id));
  const topics = PUBLIC_TOPICS.filter((t) => t.relatedIngredients?.includes(ing.id));
  const rel = relevance(activeProfile, ing.suitability);
  const alternatives = (ing.alternatives ?? []).map((a) => INGREDIENT_MAP[a]).filter(Boolean);

  return (
    <div>
      <PageHeader actions={<><SaveButton type="ingredient" id={ing.id} label={ing.name} /><ShareButton title={ing.name} /></>} />
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-forest-800">{ing.name}</h1>
          {(ing.inci || ing.synonyms[0]) && <p className="mt-0.5 text-[14px] text-forest-700">{ing.inci && ing.inci !== ing.name ? `INCI: ${ing.inci}` : ing.synonyms[0]}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag>Ingredient</Tag>
            <EvidenceBadge level={ing.evidence.level} />
            {ing.status !== 'published' && <StatusBadge status={ing.status} />}
          </div>
        </div>
        <MoleculeArt />
      </div>

      {activeProfile && (rel.reasons.length > 0 || rel.cautions.length > 0) && (
        <Card className="mb-4 p-3">
          <p className="text-[12.5px] font-medium text-ink-muted">For your preferences</p>
          <RelevanceNotes reasons={rel.reasons} cautions={rel.cautions} />
        </Card>
      )}

      <div role="tablist" className="-mx-4 mb-5 flex gap-5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cx('min-h-[44px] shrink-0 border-b-2 text-[13.5px] font-medium', tab === t ? 'border-forest-700 text-forest-800' : 'border-transparent text-ink-muted')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-6">
          <section>
            <SectionTitle>What is it?</SectionTitle>
            <p className="text-[14.5px] leading-relaxed text-ink-soft">{ing.summary}</p>
          </section>
          <Card className="divide-y divide-line">
            {[
              { icon: Layers, label: 'Category', value: `${ing.kind}` },
              { icon: FlaskConical, label: 'Functions', value: ing.functions.join(', ') },
              { icon: FlaskConical, label: 'Common uses', value: ing.productTypes.join(', ') || '—' },
              { icon: TagIcon, label: 'Also known as', value: ing.synonyms.slice(0, 6).join(', ') || '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex gap-3 px-4 py-3">
                <Icon size={18} className="mt-0.5 shrink-0 text-forest-700" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">{label}</p>
                  <p className="text-[13px] text-ink-muted">{value}</p>
                </div>
              </div>
            ))}
          </Card>
          <section>
            <SectionTitle action={<Link to={`/guide/ingredient/${ing.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-forest-600">Full 5W1H guide <ArrowRight size={14} /></Link>}>5W1H</SectionTitle>
            <FiveW1H data={ing.fiveW} initialOpen={section ?? undefined} />
          </section>
          <section>
            <SectionTitle>Evidence</SectionTitle>
            <p className="text-[14px] leading-relaxed text-ink-soft">{ing.evidence.summary}</p>
          </section>
        </div>
      )}

      {tab === 'Benefits' && (
        <div className="space-y-6">
          <section><SectionTitle>Intended benefits</SectionTitle><BulletList items={ing.benefits ?? [ing.summary]} /></section>
          <section><SectionTitle>Evidence quality</SectionTitle><div className="mb-2"><EvidenceBadge level={ing.evidence.level} /></div><p className="text-[14px] text-ink-soft">{ing.evidence.summary}</p></section>
          <section><SectionTitle>Studied concentrations</SectionTitle><p className="text-[14px] text-ink-soft">{ing.concentrations ?? 'No verified concentration range recorded. CareLens does not state concentrations it cannot verify.'}</p></section>
          <section><SectionTitle>Limitations</SectionTitle><BulletList items={ing.limitations} /></section>
        </div>
      )}

      {tab === 'Usage' && (
        <div className="space-y-6">
          {ing.applications && (
            <section>
              <SectionTitle>Applications</SectionTitle>
              <div className="space-y-2">
                {Object.entries(ing.applications).map(([k, v]) => (
                  <p key={k} className="text-[14px] text-ink-soft"><span className="font-semibold capitalize text-ink">{k}:</span> {v}</p>
                ))}
              </div>
            </section>
          )}
          {ing.fiveW?.how && <section><SectionTitle>How to use</SectionTitle><p className="text-[14px] text-ink-soft">{ing.fiveW.how.summary}</p><div className="mt-2"><BulletList items={ing.fiveW.how.points} /></div></section>}
          {ing.fiveW?.when && <section><SectionTitle>When</SectionTitle><p className="text-[14px] text-ink-soft">{ing.fiveW.when.summary}</p></section>}
          <section><SectionTitle>Compatibility</SectionTitle><BulletList items={ing.compatibility} /></section>
          {ing.forms && (
            <section>
              <SectionTitle>Forms & formulations</SectionTitle>
              <div className="space-y-2">
                {ing.forms.map((f) => (
                  <Card key={f.name} className="p-3"><p className="text-[14px] font-semibold">{f.name}</p><p className="text-[13px] text-ink-muted">{f.note}</p></Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'Safety' && (
        <div className="space-y-6">
          {ing.flags?.includes('pregnancy_caution') && <Notice tone="warn">If you are pregnant, planning pregnancy or breastfeeding, discuss this ingredient with a doctor.</Notice>}
          <section><SectionTitle>Potential side effects</SectionTitle><BulletList items={ing.adverseEffects} tone="warn" /></section>
          <section><SectionTitle>Precautions</SectionTitle><BulletList items={ing.precautions} tone="warn" /></section>
          {ing.fiveW?.who && <section><SectionTitle>Who should take care</SectionTitle><p className="text-[14px] text-ink-soft">{ing.fiveW.who.summary}</p><div className="mt-2"><BulletList items={ing.fiveW.who.points} /></div></section>}
          <Notice>This is general information, not medical advice. Stop using a product that causes persistent irritation and seek professional help for severe reactions.</Notice>
        </div>
      )}

      {tab === 'More' && (
        <div className="space-y-6">
          {ing.traditionalUse && <section><SectionTitle>Traditional use</SectionTitle><p className="text-[14px] text-ink-soft">{ing.traditionalUse}</p><p className="mt-1 text-[12px] text-ink-faint">Traditional use is context, not evidence of effectiveness.</p></section>}
          {ing.misconceptions?.length ? (
            <section>
              <SectionTitle>Common misconceptions</SectionTitle>
              <div className="space-y-2">{ing.misconceptions.map((m) => <Card key={m.myth} className="p-3"><p className="text-[13.5px] font-semibold text-rosex-700">Myth: {m.myth}</p><p className="mt-1 text-[13.5px] text-ink-soft">Fact: {m.fact}</p></Card>)}</div>
            </section>
          ) : null}
          {ing.faqs?.length ? (
            <section>
              <SectionTitle>FAQs</SectionTitle>
              <div className="space-y-2">{ing.faqs.map((f) => <Card key={f.q} className="p-3"><p className="text-[14px] font-semibold">{f.q}</p><p className="mt-1 text-[13.5px] text-ink-soft">{f.a}</p></Card>)}</div>
            </section>
          ) : null}
          {alternatives.length > 0 && (
            <section>
              <SectionTitle>Alternatives to consider</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {alternatives.map((a) => <Link key={a.id} to={`/ingredient/${a.id}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-[13px] text-forest-700 hover:bg-forest-50">{a.name}</Link>)}
                <Link to={`/compare?mode=ingredients&i=${[ing.id, alternatives[0].id].join(',')}`} className="rounded-full bg-forest-700 px-3 py-1.5 text-[13px] text-white">Compare with {alternatives[0].name}</Link>
              </div>
            </section>
          )}
          <section>
            <SectionTitle>Categories</SectionTitle>
            <div className="flex flex-wrap gap-2">{ing.categories.map((c) => CATEGORY_MAP[c] && <Link key={c} to={`/category/${c}`} className="rounded-full bg-ivory-100 px-3 py-1.5 text-[13px] text-ink-soft">{CATEGORY_MAP[c].name}</Link>)}</div>
          </section>
          <section><SectionTitle>Sources</SectionTitle><SourceList ids={ing.sources} lastReviewed={ing.lastReviewed} /></section>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {products.length > 0 && (
          <section>
            <SectionTitle>Products containing {ing.name}</SectionTitle>
            <div className="space-y-2.5">{products.slice(0, 5).map((p) => <ProductRow key={p.id} product={p} />)}</div>
          </section>
        )}
        {topics.length > 0 && (
          <section>
            <SectionTitle>Related topics</SectionTitle>
            <div className="space-y-2.5">{topics.slice(0, 4).map((t) => <TopicRow key={t.id} topic={t} />)}</div>
          </section>
        )}
        <PersonaliseControl />
        {tab !== 'More' && <p className="text-[12px] text-ink-faint">Last reviewed {ing.lastReviewed}. Sources are listed under “More”.</p>}
      </div>
    </div>
  );
}
