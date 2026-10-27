import { ArrowRight, Stethoscope } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { IngredientRow, TopicRow, useTrackRecent } from '../components/Cards';
import { FiveW1H } from '../components/FiveW1H';
import { PersonaliseControl, RelevanceNotes } from '../components/Personalise';
import { BulletList, Card, EvidenceBadge, Notice, PageHeader, SaveButton, SectionTitle, ShareButton, SourceList, StatusBadge, Tag } from '../components/ui';
import { INGREDIENT_MAP, isPublic, PUBLIC_ARTICLES, TOPIC_MAP } from '../data';
import type { W1HKey } from '../data/types';
import { relevance } from '../lib/personalise';
import { useStore } from '../lib/store';
import NotFound from './NotFound';

const KIND_LABEL = { practice: 'Practice', ayurvedic: 'Ayurvedic & traditional', home_remedy: 'Home remedy', lifestyle: 'Lifestyle & prevention', concern: 'Concern' };

export default function TopicDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const t = TOPIC_MAP[id];
  const { activeProfile } = useStore();
  useTrackRecent(t && isPublic(t.status) ? { type: 'topic', id: t.id, label: t.name, href: `/topic/${t.id}` } : null);
  if (!t || !isPublic(t.status)) return <NotFound what="topic" />;
  const rel = relevance(activeProfile, t.suitability);
  const ingredients = (t.relatedIngredients ?? []).map((i) => INGREDIENT_MAP[i]).filter((i) => i && isPublic(i.status));
  const topics = (t.relatedTopics ?? []).map((x) => TOPIC_MAP[x]).filter((x) => x && isPublic(x.status));
  const articles = PUBLIC_ARTICLES.filter((a) => a.relatedTopics?.includes(t.id));
  const traditional = t.kind === 'ayurvedic' || t.kind === 'home_remedy';

  return (
    <div>
      <PageHeader actions={<><SaveButton type="topic" id={t.id} label={t.name} /><ShareButton title={t.name} /></>} />
      <div className="flex flex-wrap gap-1.5">
        <Tag>{KIND_LABEL[t.kind]}</Tag>
        {t.recommendation === 'not_recommended' && <Tag tone="rose">Not recommended</Tag>}
        {t.recommendation === 'use_with_caution' && <Tag tone="amber">Use with caution</Tag>}
        {t.status !== 'published' && <StatusBadge status={t.status} />}
      </div>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-forest-800">{t.name}</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">{t.summary}</p>

      {t.recommendation === 'not_recommended' && <div className="mt-4"><Notice tone="danger" title="Not recommended">The risks of this practice outweigh any supported benefit. See safer alternatives below.</Notice></div>}
      {activeProfile && (rel.reasons.length > 0 || rel.cautions.length > 0) && (
        <Card className="mt-4 p-3"><p className="text-[12.5px] font-medium text-ink-muted">For your preferences</p><RelevanceNotes reasons={rel.reasons} cautions={rel.cautions} /></Card>
      )}

      {t.traditionalPurpose && (
        <section className="mt-6">
          <SectionTitle>Traditional purpose</SectionTitle>
          <p className="text-[14px] text-ink-soft">{t.traditionalPurpose}</p>
        </section>
      )}

      {t.claims?.length ? (
        <section className="mt-6">
          <SectionTitle>{traditional ? 'Belief vs evidence' : 'What the evidence says'}</SectionTitle>
          <div className="space-y-2">
            {t.claims.map((c) => (
              <Card key={c.claim} className="p-3">
                <EvidenceBadge level={c.level} />
                <p className="mt-1.5 text-[14px] text-ink">{c.claim}</p>
                {c.note && <p className="text-[12.5px] text-ink-muted">{c.note}</p>}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <SectionTitle action={<Link to={`/guide/topic/${t.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-forest-600">Full 5W1H guide <ArrowRight size={14} /></Link>}>5W1H</SectionTitle>
        <FiveW1H data={t.fiveW} initialOpen={(params.get('section') as W1HKey) ?? undefined} />
      </section>

      {(t.risks?.length || t.precautions?.length) ? (
        <section className="mt-6">
          <SectionTitle>Risks & precautions</SectionTitle>
          <BulletList items={[...(t.risks ?? []), ...(t.precautions ?? [])]} tone="warn" />
        </section>
      ) : null}
      {t.hygiene?.length ? (
        <section className="mt-6"><SectionTitle>Hygiene & contamination</SectionTitle><BulletList items={t.hygiene} /></section>
      ) : null}
      {t.seeProfessional?.length ? (
        <section className="mt-6">
          <Card className="border-forest-100 p-4">
            <p className="mb-2 flex items-center gap-2 text-[14px] font-semibold"><Stethoscope size={17} className="text-forest-700" /> See a doctor or dentist if</p>
            <BulletList items={t.seeProfessional} />
            <p className="mt-2 text-[12px] text-ink-muted">Don't delay professional care for a home remedy.</p>
          </Card>
        </section>
      ) : null}

      {ingredients.length > 0 && (
        <section className="mt-7"><SectionTitle>{t.recommendation === 'not_recommended' ? 'Evidence-based alternatives' : 'Related ingredients'}</SectionTitle><div className="space-y-2.5">{ingredients.map((i) => <IngredientRow key={i.id} ingredient={i} />)}</div></section>
      )}
      {topics.length > 0 && (
        <section className="mt-7"><SectionTitle>Related topics</SectionTitle><div className="space-y-2.5">{topics.map((x) => <TopicRow key={x.id} topic={x} />)}</div></section>
      )}
      {articles.length > 0 && (
        <section className="mt-7"><SectionTitle>Read more</SectionTitle><div className="flex flex-wrap gap-2">{articles.map((a) => <Link key={a.id} to={`/learn/${a.id}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-[13px] text-forest-700">{a.title}</Link>)}</div></section>
      )}

      <section className="mt-7"><SectionTitle>Sources</SectionTitle><SourceList ids={t.sources} lastReviewed={t.lastReviewed} /></section>
      <div className="mt-6"><PersonaliseControl /></div>
    </div>
  );
}
