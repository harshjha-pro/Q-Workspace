import { Link, useParams } from 'react-router-dom';
import { Expandable, FiveW1H } from '../components/FiveW1H';
import { BulletList, Card, EvidenceBadge, PageHeader, SaveButton, SourceList } from '../components/ui';
import { INGREDIENT_MAP, isPublic, PRODUCT_MAP, TOPIC_MAP } from '../data';
import type { EvidenceClaim, FiveW1H as FiveData } from '../data/types';
import { productFiveW } from '../lib/productFiveW';
import { MoleculeArt } from './IngredientDetail';
import NotFound from './NotFound';

interface GuideModel {
  title: string;
  href: string;
  fiveW: FiveData;
  benefits?: string[];
  limitations?: string[];
  sideEffects?: string[];
  compatibility?: string[];
  alternatives?: { id: string; name: string; href: string }[];
  claims?: EvidenceClaim[];
  evidence?: { level: EvidenceClaim['level']; summary: string };
  sources: string[];
  lastReviewed: string;
}

function model(kind: string, id: string): GuideModel | null {
  if (kind === 'ingredient') {
    const i = INGREDIENT_MAP[id];
    if (!i || !isPublic(i.status) || !i.fiveW) return null;
    return {
      title: i.name, href: `/ingredient/${i.id}`, fiveW: i.fiveW, benefits: i.benefits, limitations: i.limitations, sideEffects: [...(i.adverseEffects ?? []), ...(i.precautions ?? [])],
      compatibility: i.compatibility, alternatives: (i.alternatives ?? []).map((a) => INGREDIENT_MAP[a]).filter(Boolean).map((a) => ({ id: a.id, name: a.name, href: `/ingredient/${a.id}` })),
      evidence: i.evidence, sources: i.sources, lastReviewed: i.lastReviewed,
    };
  }
  if (kind === 'topic') {
    const t = TOPIC_MAP[id];
    if (!t || !isPublic(t.status)) return null;
    return {
      title: t.name, href: `/topic/${t.id}`, fiveW: t.fiveW, sideEffects: [...(t.risks ?? []), ...(t.precautions ?? [])], claims: t.claims,
      alternatives: (t.relatedIngredients ?? []).map((a) => INGREDIENT_MAP[a]).filter(Boolean).map((a) => ({ id: a.id, name: a.name, href: `/ingredient/${a.id}` })),
      sources: t.sources, lastReviewed: t.lastReviewed,
    };
  }
  if (kind === 'product') {
    const p = PRODUCT_MAP[id];
    if (!p || !isPublic(p.status)) return null;
    return { title: p.name, href: `/product/${p.id}`, fiveW: productFiveW(p), benefits: p.benefits, limitations: p.limitations, sideEffects: p.warnings, sources: p.sources, lastReviewed: p.lastVerified };
  }
  return null;
}

/** The dedicated 5W1H guide view, shared by ingredients, topics and products. */
export default function Guide() {
  const { kind = '', id = '' } = useParams();
  const m = model(kind, id);
  if (!m) return <NotFound what="guide" />;
  return (
    <div>
      <PageHeader actions={kind !== 'product' ? <SaveButton type={kind === 'topic' ? 'topic' : 'ingredient'} id={id} label={m.title} /> : undefined} />
      <Card className="mb-5 flex items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-forest-800">{m.title}</h1>
          <p className="mt-1 text-[14px] text-forest-700">5W1H Guide</p>
          <Link to={m.href} className="mt-2 inline-block text-[13px] font-medium text-forest-600 underline-offset-2 hover:underline">Open full record</Link>
        </div>
        <MoleculeArt />
      </Card>

      <FiveW1H data={m.fiveW} variant="cards" />

      <h2 className="mb-1 mt-7 text-[15px] font-semibold">Additional information</h2>
      <Card className="px-4">
        <Expandable title="Benefits" count={m.benefits?.length}><BulletList items={m.benefits} /></Expandable>
        <Expandable title="Limitations" count={m.limitations?.length}><BulletList items={m.limitations} /></Expandable>
        <Expandable title="Potential side effects & precautions" count={m.sideEffects?.length}><BulletList items={m.sideEffects} tone="warn" /></Expandable>
        <Expandable title="Compatibility" count={m.compatibility?.length}><BulletList items={m.compatibility} /></Expandable>
        <Expandable title={kind === 'topic' ? 'Related ingredients' : 'Alternatives'} count={m.alternatives?.length}>
          {m.alternatives?.length ? (
            <div className="flex flex-wrap gap-2">{m.alternatives.map((a) => <Link key={a.id} to={a.href} className="rounded-full border border-line px-3 py-1.5 text-[13px] text-forest-700">{a.name}</Link>)}</div>
          ) : <p className="text-[13.5px] text-ink-muted">Nothing recorded.</p>}
        </Expandable>
        <Expandable title="Evidence & sources">
          {m.evidence && <div className="mb-3"><EvidenceBadge level={m.evidence.level} /><p className="mt-2 text-[13.5px] text-ink-soft">{m.evidence.summary}</p></div>}
          {m.claims && (
            <ul className="mb-3 space-y-2">
              {m.claims.map((c) => <li key={c.claim} className="text-[13.5px]"><EvidenceBadge level={c.level} /> <span className="ml-1 text-ink-soft">{c.claim}</span>{c.note && <span className="block text-[12.5px] text-ink-muted">{c.note}</span>}</li>)}
            </ul>
          )}
          <SourceList ids={m.sources} lastReviewed={m.lastReviewed} label={kind === 'product' ? 'Last verified' : 'Last reviewed'} />
        </Expandable>
      </Card>
    </div>
  );
}
