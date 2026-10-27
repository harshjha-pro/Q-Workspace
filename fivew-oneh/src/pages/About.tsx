import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Chip, EvidenceBadge, EVIDENCE_META, Notice, PageHeader, SectionTitle, StatusBadge } from '../components/ui';
import { ALL, STATUS_LABEL } from '../data';
import type { EvidenceLevel, ReviewStatus } from '../data/types';

export default function About() {
  return (
    <div>
      <PageHeader title="About CareLens" subtitle="An information and decision-support platform for personal care in India." />
      <div className="space-y-6 text-[14.5px] leading-relaxed text-ink-soft">
        <Notice tone="warn" title="Educational information, not medical advice">
          CareLens does not diagnose or treat conditions. See a doctor, dermatologist or dentist for symptoms that are severe, painful, spreading or not improving.
        </Notice>
        <section>
          <SectionTitle>What we do</SectionTitle>
          <p>CareLens helps you understand products, ingredients and practices through a consistent 5W1H framework — What, Why, When, Who, Where and How — with the evidence level stated every time. It is not a shop and has no paid placements, ratings or rankings.</p>
        </section>
        <section>
          <SectionTitle>Evidence levels</SectionTitle>
          <div className="space-y-2">
            {(Object.keys(EVIDENCE_META) as EvidenceLevel[]).map((l) => (
              <Card key={l} className="p-3"><EvidenceBadge level={l} /><p className="mt-1 text-[13.5px]">{EVIDENCE_META[l].description}</p></Card>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle>About the data</SectionTitle>
          <ul className="space-y-2">
            <li>• <strong>Ingredients, topics and articles</strong> are editorial summaries referencing regulators, professional bodies and government sources. Sources link to the publisher's official site; each record shows its review date and status.</li>
            <li>• <strong>All products are fictional demonstration records</strong> (brand prefix “DemoLab”). Their formulas and prices are illustrative and are clearly labelled. No real product formulations, prices, ratings or reviews are shown.</li>
            <li>• <strong>Concentrations</strong> are only stated where widely documented (for example, regulator monographs).</li>
            <li>• <strong>Weather</strong> is only shown when a provider is configured; otherwise seasonal guidance is general and labelled as such.</li>
            <li>• Search, the analyser and comparisons run entirely on your device — no AI service is used and nothing is sent to a server.</li>
          </ul>
        </section>
        <section>
          <SectionTitle>Content workflow</SectionTitle>
          <p>Records move through <em>Draft → Needs verification → Reviewed → Published → Archived</em>. Draft and archived records never appear in public pages. See the <Link className="text-forest-700 underline" to="/content">content status</Link> page.</p>
        </section>
      </div>
    </div>
  );
}

export function ContentStatus() {
  const [status, setStatus] = useState<ReviewStatus | 'all'>('all');
  const rows = useMemo(() => {
    const r = [
      ...ALL.INGREDIENTS.map((x) => ({ type: 'Ingredient', id: x.id, title: x.name, status: x.status, date: x.lastReviewed, sources: x.sources.length, href: `/ingredient/${x.id}` })),
      ...ALL.TOPICS.map((x) => ({ type: 'Topic', id: x.id, title: x.name, status: x.status, date: x.lastReviewed, sources: x.sources.length, href: `/topic/${x.id}` })),
      ...ALL.ARTICLES.map((x) => ({ type: 'Article', id: x.id, title: x.title, status: x.status, date: x.lastReviewed, sources: x.sources.length, href: `/learn/${x.id}` })),
      ...ALL.PRODUCTS.map((x) => ({ type: x.demo ? 'Product (demo)' : 'Product', id: x.id, title: x.name, status: x.status, date: x.lastVerified, sources: x.sources.length, href: `/product/${x.id}` })),
    ];
    return r.filter((x) => status === 'all' || x.status === status);
  }, [status]);
  const counts = (s: ReviewStatus) => [...ALL.INGREDIENTS, ...ALL.TOPICS, ...ALL.ARTICLES, ...ALL.PRODUCTS].filter((x) => x.status === s).length;

  return (
    <div>
      <PageHeader title="Content status" subtitle="Read-only view of every record's review status. Editing happens through the documented content workflow (see README)." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={status === 'all'} onClick={() => setStatus('all')}>All</Chip>
        {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]} · {counts(s)}</Chip>)}
      </div>
      <Card className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.type + r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              {r.status === 'draft' || r.status === 'archived' ? <p className="text-[14px] font-medium">{r.title}</p> : <Link to={r.href} className="text-[14px] font-medium hover:underline">{r.title}</Link>}
              <p className="text-[12px] text-ink-muted">{r.type} · {r.sources} source{r.sources === 1 ? '' : 's'} · reviewed {r.date}</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </Card>
    </div>
  );
}
