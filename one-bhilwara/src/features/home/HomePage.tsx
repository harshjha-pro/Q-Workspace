import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, CloudSun, Download, Landmark, MessagesSquare, Search, Settings2, Siren, Sparkles, TrendingUp, Vote } from 'lucide-react';
import { DISCOVER, HOME_SECTIONS, localityName } from '@/config/catalog';
import { mandi } from '@/data/seed/content';
import { useCurrentUser, useDB, useDocumentTitle, useLang, useLoading, useNow, useSession, useT } from '@/hooks/useStore';
import { getWeather, type Weather } from '@/services/adapters/weather';
import { participation, pollPhase } from '@/services/domain/polls';
import { rankProviders } from '@/services/domain/serviceMatching';
import { sessionStore } from '@/services/session';
import { usePWA } from '@/app/pwa';
import { ArticleCard, BusinessCard, ClassifiedCard, EventCard, JobCard, OfferCard, PropertyCard, ProviderCard } from '@/components/cards';
import { Badge, Button, cx, DemoBadge, SectionHeader, Skeleton, SkeletonList, SponsoredTag } from '@/components/ui/primitives';
import { Dialog, useUI } from '@/components/ui/overlay';
import { Icon } from '@/components/ui/Icon';
import { Checkbox } from '@/components/ui/form';
import { formatINR, timeAgo } from '@/utils/format';

export default function HomePage() {
  const t = useT();
  useDocumentTitle('');
  const loading = useLoading(300);
  const user = useCurrentUser();
  const { prefs } = useSession();
  const lang = useLang();
  const [customise, setCustomise] = useState(false);
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('greetingMorning') : hour < 17 ? t('greetingAfternoon') : t('greetingEvening');
  const show = (id: string) => prefs.homeSections.includes(id);

  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-teal">{localityName(prefs.localityId, lang)}, Bhilwara</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{greet}{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
            <p className="text-muted">{t('tagline')}</p>
          </div>
          <Button variant="ghost" size="sm" icon={<Settings2 className="size-4" aria-hidden />} onClick={() => setCustomise(true)}>{t('customiseHome')}</Button>
        </div>
        <HomeSearch />
      </section>

      {show('alerts') && <AlertStrip />}

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <QuickGrid />
        <div className="grid content-start gap-4">
          <WeatherWidget />
          <InstallCard />
        </div>
      </div>

      {loading ? <SkeletonList rows={3} /> : (
        <>
          {show('news') && <NewsSection />}
          {show('community') && <CommunitySection />}
          <AICallout />
          {show('services') && <ServicesSection />}
          {show('jobs') && <JobsSection />}
          {show('property') && <PropertySection />}
          {show('marketplace') && <MarketSection />}
          {show('events') && <EventsSection />}
          {show('mandi') && <MandiSection />}
          {show('government') && <GovSection />}
          {show('businesses') && <BusinessesSection />}
          {show('offers') && <OffersSection />}
          {show('recommended') && <RecommendedSection />}
        </>
      )}

      <CustomiseDialog open={customise} onClose={() => setCustomise(false)} />
    </div>
  );
}

function HomeSearch() {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`); }} className="relative">
      <label htmlFor="home-search" className="sr-only">{t('searchPlaceholder')}</label>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
      <input id="home-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className="input min-h-14 rounded-2xl pl-12 pr-28 text-base shadow-sm" />
      <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2">{t('search')}</Button>
    </form>
  );
}

function AlertStrip() {
  const t = useT();
  const { prefs } = useSession();
  const alerts = useDB((s) => s.alerts.filter((a) => a.status === 'active' && (!a.localityId || a.localityId === prefs.localityId || prefs.localities.includes(a.localityId))));
  const breaking = useDB((s) => s.articles.find((a) => a.breaking && a.status === 'published'));
  if (!alerts.length && !breaking) return null;
  return (
    <section aria-label={t('breaking')} className="grid gap-2">
      {alerts.slice(0, 2).map((a) => (
        <Link key={a.id} to="/alerts" className={cx('flex items-center gap-3 rounded-xl border p-3 text-sm', a.severity === 'warning' || a.severity === 'critical' ? 'border-danger/30 bg-danger-50' : 'border-amber/30 bg-amber-50')}>
          <Siren className={cx('size-5 shrink-0', a.severity === 'warning' || a.severity === 'critical' ? 'text-danger' : 'text-amber-700')} aria-hidden />
          <span className="flex-1"><span className="font-semibold">{a.title}</span> <span className="text-muted">· {a.localityId ? localityName(a.localityId) : 'Citywide'}</span></span>
          <DemoBadge label="Simulated" />
        </Link>
      ))}
      {breaking && (
        <Link to={`/news/${breaking.id}`} className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white p-3 text-sm">
          <Badge tone="navy">{t('breaking')}</Badge><span className="flex-1 font-semibold">{breaking.title}</span><DemoBadge label="Demo story" />
        </Link>
      )}
    </section>
  );
}

function QuickGrid() {
  const t = useT();
  const items = [...DISCOVER.slice(0, 11), { slug: 'offers', name: 'Offers', icon: 'Store', route: '/offers' }];
  return (
    <section aria-labelledby="quick-h">
      <h2 id="quick-h" className="mb-3 text-lg font-bold text-navy">{t('quickAccess')}</h2>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {items.map((c) => (
          <li key={c.slug}>
            <Link to={c.route} className="flex h-full flex-col items-center gap-1.5 rounded-xl bg-white p-2.5 text-center text-xs font-semibold text-ink shadow-[var(--shadow-card)] ring-1 ring-line hover:ring-navy/30">
              <span className="grid size-10 place-items-center rounded-full bg-navy-50 text-navy"><Icon name={c.icon} /></span>
              <span className="leading-tight">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeatherWidget() {
  const t = useT();
  const [w, setW] = useState<Weather | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    getWeather(ctl.signal).then(setW).catch((e: Error) => { if (e.name !== 'AbortError') setErr('Weather unavailable right now.'); });
    return () => ctl.abort();
  }, []);
  return (
    <section className="card p-4" aria-labelledby="wx-h">
      <div className="flex items-center justify-between"><h2 id="wx-h" className="text-sm font-semibold text-muted">{t('weather')} · Bhilwara</h2>{w && !w.live && <DemoBadge label="Demo" />}</div>
      {err ? <p className="mt-2 text-sm text-muted">{err}</p> : !w ? <div className="mt-2 grid gap-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-3 w-32" /></div> : (
        <div className="mt-1 flex items-center gap-3">
          <CloudSun className="size-10 text-amber" aria-hidden />
          <div>
            <p className="text-3xl font-extrabold text-navy">{Math.round(w.tempC)}°C</p>
            <p className="text-sm text-muted">{w.label} · Humidity {Math.round(w.humidity)}%</p>
          </div>
        </div>
      )}
      {w && <p className="mt-2 text-xs text-muted">Source: {w.source}</p>}
    </section>
  );
}

function InstallCard() {
  const { canInstall, install, standalone } = usePWA();
  const t = useT();
  const { toast } = useUI();
  if (standalone) return null;
  return (
    <section className="card bg-navy p-4 text-white">
      <p className="font-bold">{t('installApp')}</p>
      <p className="text-sm text-white/75">Works offline for pages you’ve visited. No app store needed.</p>
      {canInstall ? (
        <Button variant="amber" size="sm" className="mt-3" icon={<Download className="size-4" aria-hidden />} onClick={async () => { if (await install()) toast('Installed!'); }}>{t('install')}</Button>
      ) : (
        <Link to="/help#install" className="mt-3 inline-flex text-sm font-semibold text-amber underline">How to install</Link>
      )}
    </section>
  );
}

function NewsSection() {
  const t = useT();
  const { prefs } = useSession();
  const articles = useDB((s) => s.articles.filter((a) => a.status === 'published' && Date.parse(a.publishedAt) <= Date.now()));
  const sorted = useMemo(() => [...articles].sort((a, b) => Number(b.localityId === prefs.localityId) - Number(a.localityId === prefs.localityId) || b.publishedAt.localeCompare(a.publishedAt)), [articles, prefs.localityId]);
  const [hero, ...rest] = sorted;
  if (!hero) return null;
  return (
    <section>
      <SectionHeader title={t('localNews')} to="/news" linkLabel={t('seeAll')} />
      <div className="grid gap-4 md:grid-cols-2">
        <ArticleCard a={hero} variant="hero" />
        <div className="card divide-y divide-line px-4">{rest.slice(0, 4).map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)}</div>
      </div>
    </section>
  );
}

function CommunitySection() {
  const t = useT();
  const now = useNow();
  const posts = useDB((s) => s.posts.filter((p) => p.status === 'published').slice(0, 3));
  const votes = useDB((s) => s.votes);
  const polls = useDB((s) => s.polls.filter((p) => pollPhase(p, now) === 'open'));
  return (
    <section>
      <SectionHeader title={t('trending')} to="/community" linkLabel={t('seeAll')} icon={<TrendingUp className="size-5 text-teal" aria-hidden />} />
      <div className="grid gap-3 md:grid-cols-2">
        <ul className="card divide-y divide-line">
          {posts.map((p) => (
            <li key={p.id}><Link to={`/community/${p.id}`} className="flex gap-3 p-3 hover:bg-page/60">
              <MessagesSquare className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden />
              <span><span className="line-clamp-2 text-sm font-medium">{p.text}</span><span className="text-xs text-muted">{p.userName} · {localityName(p.localityId)} · {timeAgo(p.createdAt)}</span></span>
            </Link></li>
          ))}
        </ul>
        <div className="grid gap-3">
          {polls.slice(0, 2).map((p) => (
            <Link key={p.id} to={`/polls/${p.id}`} className="card flex items-start gap-3 p-4 hover:border-navy/30">
              <Vote className="size-6 shrink-0 text-navy" aria-hidden />
              <span className="flex-1"><span className="block font-semibold">{p.question}</span><span className="text-sm text-muted">{participation(p, votes)} votes · tap to vote</span></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function AICallout() {
  const t = useT();
  return (
    <Link to="/ai" className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-navy to-navy-deep p-5 text-white">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10"><Bot className="size-6 text-amber" aria-hidden /></span>
      <span className="flex-1"><span className="block text-lg font-bold">{t('askAI')}</span><span className="text-sm text-white/75">“Find a plumber near me” · “Part-time jobs” · “Explain PM-KISAN”</span></span>
      <Sparkles className="size-5 text-amber" aria-hidden />
    </Link>
  );
}

function ServicesSection() {
  const t = useT();
  const { prefs } = useSession();
  const providers = useDB((s) => s.providers);
  const top = useMemo(() => providers.filter((p) => p.availability === 'available').sort((a, b) => Number(b.localityId === prefs.localityId) - Number(a.localityId === prefs.localityId) || b.rating - a.rating).slice(0, 3), [providers, prefs.localityId]);
  return (
    <section>
      <SectionHeader title={t('nearbyServices')} to="/services" linkLabel={t('seeAll')} />
      <div className="grid gap-3 md:grid-cols-3">{top.map((p) => <ProviderCard key={p.id} p={p} />)}</div>
    </section>
  );
}

function JobsSection() {
  const t = useT();
  const jobs = useDB((s) => s.jobs.filter((j) => j.status === 'open').sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 4));
  return (<section><SectionHeader title={t('localJobs')} to="/jobs" linkLabel={t('seeAll')} /><div className="grid gap-3 md:grid-cols-2">{jobs.map((j) => <JobCard key={j.id} j={j} />)}</div></section>);
}

function PropertySection() {
  const t = useT();
  const list = useDB((s) => s.properties.filter((p) => p.status === 'active').slice(0, 3));
  return (<section><SectionHeader title={t('propertyPg')} to="/property" linkLabel={t('seeAll')} /><div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{list.map((p) => <PropertyCard key={p.id} p={p} />)}</div></section>);
}

function MarketSection() {
  const t = useT();
  const list = useDB((s) => s.classifieds.filter((c) => c.status === 'active').slice(0, 4));
  return (<section><SectionHeader title={t('buySell')} to="/marketplace" linkLabel={t('seeAll')} /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{list.map((c) => <ClassifiedCard key={c.id} c={c} />)}</div></section>);
}

function EventsSection() {
  const t = useT();
  const list = useDB((s) => s.events.filter((e) => e.status === 'published').sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 3));
  const vendors = useDB((s) => s.businesses.filter((b) => b.wedding).slice(0, 3));
  return (
    <section>
      <SectionHeader title={t('eventsWeddings')} to="/events" linkLabel={t('seeAll')} />
      <div className="grid gap-3 md:grid-cols-3">{list.map((e) => <EventCard key={e.id} e={e} />)}</div>
      <div className="mt-3 scroll-x">{vendors.map((v) => <Link key={v.id} to={`/weddings/${v.id}`} className="chip">{v.wedding}: {v.name}</Link>)}<Link to="/weddings" className="chip">All wedding vendors →</Link></div>
    </section>
  );
}

function MandiSection() {
  const t = useT();
  const lang = useLang();
  const rows = mandi().slice(0, 5);
  return (
    <section>
      <SectionHeader title={t('mandiPrices')} to="/agriculture" linkLabel={t('seeAll')} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="p-3 text-left text-xs text-muted"><DemoBadge label="Sample data" /> Illustrative prices only — not today’s market rates.</caption>
          <thead><tr className="border-y border-line text-left text-muted"><th className="p-3 font-medium">Crop</th><th className="p-3 font-medium">Market</th><th className="p-3 text-right font-medium">Modal (₹/qtl)</th></tr></thead>
          <tbody>{rows.map((m) => <tr key={m.id} className="border-b border-line last:border-0"><td className="p-3 font-semibold">{lang === 'hi' ? m.commodityHi : m.commodity}</td><td className="p-3 text-muted">{m.market}</td><td className="p-3 text-right tabular-nums">{formatINR(m.modal)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function GovSection() {
  const t = useT();
  const schemes = useDB((s) => s.schemes.slice(0, 4));
  return (
    <section>
      <SectionHeader title={t('govServices')} to="/government" linkLabel={t('seeAll')} icon={<Landmark className="size-5 text-teal" aria-hidden />} />
      <div className="grid gap-2 sm:grid-cols-2">
        {schemes.map((s) => <Link key={s.id} to={`/government/schemes/${s.id}`} className="card p-3 hover:border-navy/30"><p className="font-semibold">{s.name}</p><p className="text-sm text-muted">{s.level === 'central' ? 'Central' : 'Rajasthan'} · {s.category}</p></Link>)}
      </div>
      <p className="mt-2 text-xs text-muted">One Bhilwara is not a government authority. Always apply through official portals.</p>
    </section>
  );
}

function BusinessesSection() {
  const t = useT();
  const live = useDB((s) => s.campaigns.filter((c) => c.status === 'live' && c.placement === 'home'));
  const list = useDB((s) => s.businesses.filter((b) => b.verification === 'verified' && !b.wedding).sort((a, b) => b.rating - a.rating).slice(0, 3));
  const sponsoredBiz = useDB((s) => s.businesses.find((b) => b.id === live[0]?.businessId));
  return (
    <section>
      <SectionHeader title={t('featuredBusinesses')} to="/businesses" linkLabel={t('seeAll')} />
      {live[0] && sponsoredBiz && (
        <Link to={`/businesses/${sponsoredBiz.id}`} className="card mb-3 flex items-center gap-3 border-violet-200 p-4">
          <SponsoredTag /><span className="flex-1"><span className="block font-bold">{live[0].headline}</span><span className="text-sm text-muted">{sponsoredBiz.name}</span></span>
        </Link>
      )}
      <div className="grid gap-3 md:grid-cols-3">{list.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
    </section>
  );
}

function OffersSection() {
  const t = useT();
  const offers = useDB((s) => s.offers.filter((o) => o.status === 'active').slice(0, 3));
  return (<section><SectionHeader title={t('offers')} to="/offers" linkLabel={t('seeAll')} /><div className="grid gap-3 sm:grid-cols-3">{offers.map((o) => <Link key={o.id} to={`/offers?id=${o.id}`}><OfferCard o={o} /></Link>)}</div></section>);
}

/** Recommendations use only interests and locality the user chose — no inferred sensitive attributes. */
function RecommendedSection() {
  const t = useT();
  const { prefs } = useSession();
  const db = useDB((s) => s);
  const recs = useMemo(() => {
    const out: { label: string; link: string; why: string }[] = [];
    if (prefs.interests.includes('Jobs')) db.jobs.filter((j) => j.status === 'open' && (prefs.jobCategories.length === 0 || prefs.jobCategories.includes(j.category))).slice(0, 2).forEach((j) => out.push({ label: j.title, link: `/jobs/${j.id}`, why: 'Because you follow Jobs' }));
    if (prefs.interests.includes('Services')) rankProviders({ category: 'electrician', localityId: prefs.localityId, urgency: 'normal' }, db.providers).slice(0, 1).forEach((r) => out.push({ label: r.provider.name, link: `/service-providers/${r.provider.id}`, why: `Near ${localityName(prefs.localityId)}` }));
    if (prefs.interests.includes('Events')) db.events.filter((e) => e.status === 'published').slice(0, 1).forEach((e) => out.push({ label: e.title, link: `/events/${e.id}`, why: 'Because you follow Events' }));
    if (prefs.interests.includes('Agriculture')) out.push({ label: 'Mandi price dashboard', link: '/agriculture', why: 'Because you follow Agriculture' });
    if (prefs.interests.includes('Education')) out.push({ label: 'Coaching & libraries', link: '/education', why: 'Because you follow Education' });
    return out.slice(0, 6);
  }, [db, prefs]);
  return (
    <section>
      <SectionHeader title={t('recommended')} to="/settings#personalisation" linkLabel="Edit interests" />
      {recs.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">{recs.map((r) => <li key={r.link}><Link to={r.link} className="card block p-3 hover:border-navy/30"><p className="font-semibold">{r.label}</p><p className="text-xs text-muted">{r.why}</p></Link></li>)}</ul>
      ) : <p className="text-sm text-muted">Choose interests in Settings to get recommendations.</p>}
    </section>
  );
}

function CustomiseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs } = useSession();
  const [sel, setSel] = useState<string[]>(prefs.homeSections);
  const { toast } = useUI();
  useEffect(() => { if (open) setSel(prefs.homeSections); }, [open, prefs.homeSections]);
  return (
    <Dialog open={open} onClose={onClose} title="Customise home" description="Choose which sections appear on your home screen."
      footer={<><Button variant="secondary" onClick={() => setSel(HOME_SECTIONS.map((s) => s.id))}>Show all</Button><Button onClick={() => { sessionStore.setPrefs({ homeSections: sel }); toast('Home updated'); onClose(); }}>Save</Button></>}>
      <div className="grid gap-3">
        {HOME_SECTIONS.map((s) => <Checkbox key={s.id} label={s.name} checked={sel.includes(s.id)} onChange={(v) => setSel(v ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />)}
      </div>
    </Dialog>
  );
}
