import type { ReactNode } from 'react';
import { mandi } from '@/data/seed/content';
import { newsCategoryName, serviceName } from '@/config/catalog';
import { useDB, useDocumentTitle, useNow } from '@/hooks/useStore';
import { pollResults } from '@/services/domain/polls';
import { BarList, Sparkline } from '@/components/shared';
import { DemoBadge, Notice, PageHeader } from '@/components/ui/primitives';
import { formatDate } from '@/utils/format';

/** Aggregate counts only — no individual user activity is exposed. */
function countBy<T>(items: T[], key: (t: T) => string, top = 6) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, value]) => ({ label, value }));
}

function InsightCard({ title, source, sample, children }: { title: string; source: string; sample: number; children: ReactNode }) {
  return (
    <section className="card grid content-start gap-3 p-4">
      <div className="flex items-start justify-between gap-2"><h2 className="font-bold text-navy">{title}</h2><DemoBadge label="Demo data" /></div>
      {children}
      <p className="text-xs text-muted">Source: {source} · n = {sample}</p>
    </section>
  );
}

export function InsightsPage() {
  useDocumentTitle('City insights');
  const now = useNow();
  const db = useDB((s) => s);
  const revealed = db.polls.map((p) => ({ p, r: pollResults(p, db.votes, now) })).filter((x) => x.r);
  const crops = mandi();
  return (
    <div className="grid gap-5">
      <PageHeader title="City insights" subtitle="Aggregated activity on One Bhilwara. Available to administrators and authorised business subscribers." badge={<DemoBadge label="Demo data" />} />
      <Notice tone="warning" title="Limitations">All figures come from this demo database (seeded sample records plus actions in this browser). Date range: since {formatDate(db.seededAt)}. They do not represent the city’s real activity and should not be used for decisions. Production dashboards would use aggregated, privacy-preserving server data.</Notice>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <InsightCard title="News by category" source="Published articles" sample={db.articles.filter((a) => a.status === 'published').length}><BarList unit="" rows={countBy(db.articles.filter((a) => a.status === 'published'), (a) => newsCategoryName(a.category))} /></InsightCard>
        <InsightCard title="Community poll results" source="Revealed polls only" sample={revealed.length}>
          <ul className="grid gap-2 text-sm">{revealed.slice(0, 4).map(({ p, r }) => { const i = r!.counts.indexOf(Math.max(...r!.counts)); return <li key={p.id}><b>{p.question}</b><br /><span className="text-muted">Top: {p.options[i].label} ({r!.percentages[i]}%) · {r!.total} votes</span></li>; })}</ul>
        </InsightCard>
        <InsightCard title="Business listings by category" source="Business directory" sample={db.businesses.length}><BarList unit="" rows={countBy(db.businesses, (b) => b.category)} /></InsightCard>
        <InsightCard title="Open jobs by category" source="Job postings" sample={db.jobs.filter((j) => j.status === 'open').length}><BarList unit="" rows={countBy(db.jobs.filter((j) => j.status === 'open'), (j) => j.category)} /></InsightCard>
        <InsightCard title="Property listings by type" source="Property listings" sample={db.properties.length}><BarList unit="" rows={countBy(db.properties, (p) => p.category)} /></InsightCard>
        <InsightCard title="Service request demand" source="Service requests" sample={db.serviceRequests.length}><BarList unit="" rows={countBy(db.serviceRequests, (r) => serviceName(r.category))} /></InsightCard>
        <InsightCard title="Events & participation" source="Events and ticket counts" sample={db.events.length}><BarList unit="" rows={db.events.slice(0, 6).map((e) => ({ label: e.title.replace(' (Sample)', ''), value: e.ticketTypes.reduce((a, t) => a + t.sold, 0) }))} /></InsightCard>
        <InsightCard title="Marketplace activity" source="Classified listings" sample={db.classifieds.length}><BarList unit="" rows={countBy(db.classifieds, (c) => c.category)} /></InsightCard>
        <InsightCard title="Mandi price trends (sample)" source="Sample mandi data" sample={crops.length}>
          <ul className="grid gap-2">{crops.slice(0, 4).map((m) => <li key={m.id}><p className="text-sm font-semibold">{m.commodity}</p><Sparkline values={m.history.map((h) => h.modal)} label={`${m.commodity} sample trend`} height={40} /></li>)}</ul>
        </InsightCard>
      </div>
    </div>
  );
}
