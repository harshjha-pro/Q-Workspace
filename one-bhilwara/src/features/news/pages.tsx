import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, ExternalLink, Fuel, Headphones, Heart, Mic, Pause, Play, Radio, Siren, Trophy } from 'lucide-react';
import type { CivicAlert, Match, Podcast } from '@/types/models';
import { LOCALITIES, localityName, NEWS_CATEGORIES, newsCategoryName } from '@/config/catalog';
import { matches as seedMatches, podcasts as seedPodcasts, prices as seedPrices } from '@/data/seed/content';
import { useDB, useDocumentTitle, useLoading, useNow, useSession } from '@/hooks/useStore';
import { repo } from '@/services/store';
import { ArticleCard } from '@/components/cards';
import { CityScene } from '@/components/illustrations';
import { CommentsThread, LoadMore, ReportButton, SaveButton, ShareButton, useRequireAuth, usePaged } from '@/components/shared';
import { Badge, Button, cx, DemoBadge, EmptyState, MetaLine, Notice, PageHeader, SectionHeader, SkeletonList, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs } from '@/components/ui/overlay';
import { durationMMSS, formatDate, formatDateTime, formatINR, timeAgo } from '@/utils/format';
import NotFound from '@/app/NotFound';

const isLive = (publishedAt: string, status: string) => status === 'published' || (status === 'scheduled' && Date.parse(publishedAt) <= Date.now());

export function NewsPage() {
  useDocumentTitle('News');
  const [params, setParams] = useSearchParams();
  const cat = params.get('category') ?? 'all';
  const loc = params.get('locality') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const { prefs } = useSession();
  const loading = useLoading();
  const now = useNow();
  const articles = useDB((s) => s.articles.filter((a) => isLive(a.publishedAt, a.status)));
  const alerts = useDB((s) => s.alerts.filter((a) => a.status !== 'resolved' && Date.parse(a.expiresAt) > now && Date.parse(a.startsAt) <= now));
  const list = useMemo(() => {
    let l = articles.filter((a) => (cat === 'all' || a.category === cat) && (!loc || a.localityId === loc));
    if (sort === 'local') l = [...l].sort((a, b) => Number(b.localityId === prefs.localityId) - Number(a.localityId === prefs.localityId));
    else l = [...l].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return l;
  }, [articles, cat, loc, sort, prefs.localityId]);
  const { visible, hasMore, more } = usePaged(list, 8);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v && v !== 'all') p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  return (
    <div className="grid gap-4">
      <PageHeader title="News" badge={<DemoBadge label="Demo newsroom" />} />
      <Tabs label="News categories" value={cat} onChange={(v) => set('category', v)} tabs={[{ id: 'all', label: 'All' }, ...NEWS_CATEGORIES.map((c) => ({ id: c.id, label: c.name }))]} />
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="n-loc">Locality</label>
        <select id="n-loc" className="chip w-auto max-w-[48%]" value={loc} onChange={(e) => set('locality', e.target.value)}>
          <option value="">All localities</option>{LOCALITIES.filter((l) => l.id !== 'all').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="n-sort">Sort</label>
        <select id="n-sort" className="chip w-auto max-w-[48%]" value={sort} onChange={(e) => set('sort', e.target.value)}>
          <option value="newest">Newest first</option><option value="local">My locality first</option>
        </select>
        {(cat !== 'all' || loc) && <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>Reset</Button>}
      </div>
      {loading ? <SkeletonList rows={4} /> : list.length === 0 ? (
        <EmptyState title="No stories here yet" text="Try another category or locality." action={<Button variant="secondary" onClick={() => setParams({})}>Show all news</Button>} />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">{visible.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
          <LoadMore hasMore={hasMore} onMore={more} />
        </>
      )}

      <section className="mt-2">
        <SectionHeader title="Civic Alerts" to="/alerts" linkLabel="View All" />
        {alerts.length === 0 ? <p className="text-sm text-muted">No active alerts right now.</p> : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {alerts.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link to="/alerts" className={cx('flex gap-3 rounded-2xl border p-4', a.severity === 'warning' || a.severity === 'critical' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50')}>
                  <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', a.severity === 'warning' || a.severity === 'critical' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700')}><Siren className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block font-bold', a.severity === 'warning' || a.severity === 'critical' ? 'text-rose-700' : 'text-amber-800')}>{a.title}</span>
                    <span className="block text-sm text-ink/75">{a.description}</span>
                    <span className="mt-1 block text-xs text-muted">{a.localityId ? localityName(a.localityId) : 'Citywide'} · {a.source}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 self-center text-rose-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold text-ink">More from One Bhilwara</h2>
        <div className="scroll-x">
          <Link to="/community" className="chip">Community</Link>
          <Link to="/polls" className="chip">Polls</Link>
          <Link to="/podcasts" className="chip"><Headphones className="size-4" aria-hidden />Podcasts</Link>
          <Link to="/sports" className="chip"><Trophy className="size-4" aria-hidden />Sports</Link>
          <Link to="/prices" className="chip"><Fuel className="size-4" aria-hidden />Fuel & gold</Link>
          <Link to="/agriculture" className="chip">Mandi</Link>
        </div>
      </section>
    </div>
  );
}

export function ArticlePage() {
  const { id = '' } = useParams();
  const { userId } = useSession();
  const a = useDB((s) => s.articles.find((x) => x.id === id));
  const related = useDB((s) => s.articles.filter((x) => x.id !== id && x.status === 'published' && (x.category === a?.category || x.localityId === a?.localityId)).slice(0, 3));
  const guard = useRequireAuth();
  useDocumentTitle(a?.title ?? 'Article');
  if (!a || !isLive(a.publishedAt, a.status)) return <NotFound />;
  const liked = !!userId && a.likedBy.includes(userId);
  return (
    <article className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/news" className="hover:underline">News</Link> / <Link to={`/news?category=${a.category}`} className="hover:underline">{newsCategoryName(a.category)}</Link></nav>
      <header className="grid gap-3">
        <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{newsCategoryName(a.category)}</Badge>{a.localityId && <Badge>{localityName(a.localityId)}</Badge>}{a.demo && <DemoBadge label="Demo story — sample content" />}</div>
        <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{a.titleHi ?? a.title}</h1>
        {a.titleHi && <p className="text-lg font-semibold text-ink/80">{a.title}</p>}
        <p className="text-lg text-muted">{a.summary}</p>
        <MetaLine><span className="font-semibold text-ink">{a.source}</span><span>Published {formatDateTime(a.publishedAt)}</span>{a.updatedAt && <span>Updated {formatDateTime(a.updatedAt)}</span>}</MetaLine>
        <div className="flex flex-wrap gap-2">
          <Button variant={liked ? 'teal' : 'secondary'} size="sm" aria-pressed={liked} icon={<Heart className={cx('size-4', liked && 'fill-white')} aria-hidden />}
            onClick={() => guard(() => repo.at('articles').mutate(a.id, (cur) => ({ likedBy: liked ? cur.likedBy.filter((x) => x !== userId) : [...cur.likedBy, userId!] })))}>{a.likedBy.length || ''} Like</Button>
          <SaveButton type="article" id={a.id} /><ShareButton title={a.title} /><ReportButton targetType="article" targetId={a.id} title={a.title} />
        </div>
      </header>
      <CityScene seed={a.id} className="h-56 w-full rounded-2xl" label="Illustration — no photo supplied" />
      <div className="grid gap-4 text-[17px] leading-relaxed text-ink">{a.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      <Notice tone={a.demo ? 'demo' : 'info'} title="Source">
        {a.sourceUrl ? <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">{a.source} <ExternalLink className="size-3.5" aria-hidden /></a>
          : <>{a.source}. {a.demo ? 'This is a demo story written for this prototype — it does not report a real event and has no original article link.' : 'Original link not provided.'}</>}
      </Notice>
      {related.length > 0 && (
        <section><h2 className="mb-3 text-lg font-bold text-navy">Related stories</h2><div className="grid gap-3">{related.map((r) => <ArticleCard key={r.id} a={r} />)}</div></section>
      )}
      <CommentsThread targetType="article" targetId={a.id} title={a.title} />
    </article>
  );
}

const ALERT_ICON: Record<CivicAlert['type'], string> = { road: 'Road closure', water: 'Water supply', electricity: 'Electricity', notice: 'Public notice', traffic: 'Traffic', weather: 'Weather', municipal: 'Municipal', emergency: 'Emergency' };

export function AlertsPage() {
  useDocumentTitle('Civic alerts');
  const now = useNow();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('active');
  const [loc, setLoc] = useState('');
  const alerts = useDB((s) => s.alerts);
  const list = alerts
    .map((a) => ({ ...a, status: (a.status === 'resolved' ? 'resolved' : Date.parse(a.expiresAt) < now ? 'resolved' : Date.parse(a.startsAt) > now ? 'scheduled' : 'active') as CivicAlert['status'] }))
    .filter((a) => (!type || a.type === type) && (!status || a.status === status) && (!loc || a.localityId === loc || !a.localityId))
    .sort((a, b) => ['critical', 'warning', 'advisory', 'info'].indexOf(a.severity) - ['critical', 'warning', 'advisory', 'info'].indexOf(b.severity));
  return (
    <div className="grid gap-5">
      <PageHeader title="Civic alerts" subtitle="Road, water, electricity, traffic, weather and municipal updates." badge={<DemoBadge label="Simulated alerts" />} />
      <Notice tone="danger" title="In an emergency">Call <a className="font-bold underline" href="tel:112">112</a> (police, fire, ambulance) or <a className="font-bold underline" href="tel:108">108</a> (ambulance). Don’t rely on this feed for emergencies.</Notice>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select aria-label="Alert type" className="input min-h-10 text-sm" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(ALERT_ICON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Status" className="input min-h-10 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="resolved">Resolved / expired</option></select>
        <select aria-label="Locality" className="input min-h-10 text-sm" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">All localities</option>{LOCALITIES.filter((l) => l.id !== 'all').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </div>
      {list.length === 0 ? <EmptyState title="No alerts match" text="No alerts for these filters right now." action={<Button variant="secondary" onClick={() => { setType(''); setStatus(''); setLoc(''); }}>Reset filters</Button>} /> : (
        <ul className="grid gap-3">
          {list.map((a) => (
            <li key={a.id} className={cx('card border-l-4 p-4', a.severity === 'critical' ? 'border-l-danger' : a.severity === 'warning' ? 'border-l-amber' : a.severity === 'advisory' ? 'border-l-blue-500' : 'border-l-teal')}>
              <div className="flex flex-wrap items-center gap-1.5"><Badge tone={a.severity === 'critical' || a.severity === 'warning' ? 'red' : 'amber'} className="capitalize">{a.severity}</Badge><Badge>{ALERT_ICON[a.type]}</Badge><StatusPill status={a.status} />{a.demo && <DemoBadge label="Simulated" />}</div>
              <h2 className="mt-1 font-bold">{a.title}</h2>
              <p className="text-sm">{a.description}</p>
              <MetaLine><span>{a.localityId ? localityName(a.localityId) : 'Citywide'}</span><span>From {formatDateTime(a.startsAt)}</span><span>Until {formatDateTime(a.expiresAt)}</span><span>Source: {a.source}</span></MetaLine>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PodcastsPage() {
  useDocumentTitle('Podcasts');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [current, setCurrent] = useState<Podcast | null>(null);
  const list = seedPodcasts().filter((p) => (!cat || p.category === cat) && (!q || `${p.title} ${p.description} ${p.host}`.toLowerCase().includes(q.toLowerCase())));
  const cats = Array.from(new Set(seedPodcasts().map((p) => p.category)));
  return (
    <div className="grid gap-5">
      <PageHeader title="Podcasts & audio" subtitle="Local conversations. Episodes without uploaded audio are marked." badge={<DemoBadge label="Demo episodes" />} />
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
        <input aria-label="Search episodes" type="search" className="input" placeholder="Search episodes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Category" className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {current && <AudioPlayer ep={current} />}
      {list.length === 0 ? <EmptyState title="No episodes found" action={<Button variant="secondary" onClick={() => { setQ(''); setCat(''); }}>Reset</Button>} /> : (
        <ul className="grid gap-3">
          {list.map((p) => (
            <li key={p.id} className="card flex gap-3 p-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand text-white"><Mic className="size-6" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p.title}</p>
                <p className="text-sm text-muted">{p.host} · {p.category} · {durationMMSS(p.durationSec)} · {formatDate(p.publishedAt)}</p>
                <p className="mt-1 text-sm">{p.description}</p>
                <div className="mt-2">
                  {p.audioUrl ? <Button size="sm" icon={<Play className="size-4" aria-hidden />} onClick={() => setCurrent(p)}>{current?.id === p.id ? 'Loaded in player' : 'Play'}</Button>
                    : <Badge tone="gray">Audio not uploaded yet</Badge>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AudioPlayer({ ep }: { ep: Podcast }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(ep.durationSec);
  const [err, setErr] = useState('');
  useEffect(() => { setPlaying(false); setPos(0); setErr(''); }, [ep.id]);
  return (
    <section className="card sticky top-20 z-10 p-4" aria-label="Audio player">
      <audio ref={ref} src={ep.audioUrl} preload="metadata" onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration || ep.durationSec)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setErr('This audio could not be loaded. It may need a connection.')} />
      <div className="flex items-center gap-3">
        <Button aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? ref.current?.pause() : ref.current?.play().catch(() => setErr('Playback was blocked. Tap play again.')))} icon={playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{ep.title}</p>
          <input type="range" min={0} max={dur || 1} step={0.1} value={pos} aria-label="Playback position" onChange={(e) => { if (ref.current) ref.current.currentTime = Number(e.target.value); }} className="w-full accent-navy" />
          <p className="text-xs text-muted tabular-nums">{durationMMSS(pos)} / {durationMMSS(dur)} · Sample audio (tone) for demo</p>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </section>
  );
}

export function SportsPage() {
  useDocumentTitle('Sports');
  const [tab, setTab] = useState<Match['status']>('live');
  const [card, setCard] = useState<Match | null>(null);
  const all = seedMatches();
  const list = all.filter((m) => m.status === tab);
  return (
    <div className="grid gap-5">
      <PageHeader title="Sports" subtitle="Cricket, kabaddi and football around Bhilwara." badge={<DemoBadge label="Demo scores" />} />
      <Notice tone="demo" title="No live sports feed connected">Scores below are labelled demo data. Connecting a licensed sports API (via a server proxy) will make this live — see Settings → Integrations.</Notice>
      <Tabs label="Match status" value={tab} onChange={setTab} tabs={[{ id: 'live', label: 'Live', count: all.filter((m) => m.status === 'live').length }, { id: 'upcoming', label: 'Upcoming', count: all.filter((m) => m.status === 'upcoming').length }, { id: 'completed', label: 'Results', count: all.filter((m) => m.status === 'completed').length }]} />
      {list.length === 0 ? <EmptyState title="No matches" /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="flex items-center justify-between text-xs text-muted"><span className="capitalize">{m.sport} · {m.tournament}</span>{m.status === 'live' && <Badge tone="red"><Radio className="size-3" aria-hidden />LIVE (demo)</Badge>}</div>
              <div className="mt-2 grid gap-1">
                <div className="flex justify-between font-semibold"><span>{m.teamA}</span><span className="tabular-nums">{m.scoreA ?? '—'}</span></div>
                <div className="flex justify-between font-semibold"><span>{m.teamB}</span><span className="tabular-nums">{m.scoreB ?? '—'}</span></div>
              </div>
              <p className="mt-2 text-sm text-muted">{m.result ?? (m.status === 'upcoming' ? `Starts ${formatDateTime(m.startsAt)}` : m.overs ? `Overs: ${m.overs}` : '')} · {m.venue}</p>
              {m.scorecard && <Button variant="secondary" size="sm" className="mt-2" onClick={() => setCard(m)}>Scorecard</Button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!card} onClose={() => setCard(null)} title="Scorecard (demo)" description={card ? `${card.teamA} vs ${card.teamB}` : ''}>
        <table className="w-full text-sm"><thead><tr className="text-left text-muted"><th className="py-1">Batter</th><th className="py-1 text-right">R</th><th className="py-1 text-right">B</th></tr></thead>
          <tbody>{card?.scorecard?.map((s) => <tr key={s.batter} className="border-t border-line"><td className="py-2">{s.batter}</td><td className="py-2 text-right">{s.runs}</td><td className="py-2 text-right">{s.balls}</td></tr>)}</tbody></table>
      </Dialog>
    </div>
  );
}

export function PricesPage() {
  useDocumentTitle('Fuel & commodity prices');
  const rows = seedPrices();
  return (
    <div className="grid gap-5">
      <PageHeader title="Fuel & commodity prices" subtitle="Petrol, diesel, gold and silver." badge={<DemoBadge label="Sample data" />} />
      <Notice tone="warning" title="Not live prices">These are illustrative round numbers to demonstrate the dashboard. Check official oil-company or bullion sources before you buy or sell. A verified market-data source must be connected for live prices.</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between"><p className="font-semibold">{r.item}</p><DemoBadge label="Sample" /></div>
            <p className="mt-1 text-2xl font-extrabold text-navy">{formatINR(r.price)} <span className="text-sm font-normal text-muted">{r.unit}</span></p>
            <p className="text-xs text-muted">{r.market} · {formatDate(r.date)} · Source: {r.source}</p>
          </div>
        ))}
      </div>
      <Link to="/agriculture" className="card flex items-center justify-between p-4 font-semibold hover:border-brand/30">Mandi crop prices (sample) <span aria-hidden>→</span></Link>
      <p className="text-xs text-muted">Updated {timeAgo(new Date().toISOString())} (demo timestamp).</p>
    </div>
  );
}
