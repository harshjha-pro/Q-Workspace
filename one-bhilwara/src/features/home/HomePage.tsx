import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Briefcase, CalendarDays, ChevronDown, Download, GraduationCap, Home, Landmark, LayoutGrid, MapPin, MessagesSquare, Mic, Newspaper, Search, Settings2, ShoppingBag, Siren, Sparkles, Sun, TrendingUp, Vote, Wrench } from 'lucide-react';
import { HOME_SECTIONS, localityName } from '@/config/catalog';
import { mandi } from '@/data/seed/content';
import { useDB, useDocumentTitle, useLang, useLoading, useNow, useSession, useT } from '@/hooks/useStore';
import { getWeather, type Weather } from '@/services/adapters/weather';
import { participation, pollPhase } from '@/services/domain/polls';
import { recommend } from '@/features/activity/recommend';
import { sessionStore } from '@/services/session';
import { usePWA } from '@/app/pwa';
import { ArticleCard, BusinessCard, ClassifiedCard, EventCard, JobCard, OfferCard, PropertyCard, ProviderCard } from '@/components/cards';
import { Badge, Button, cx, DemoBadge, SectionHeader, Skeleton, SkeletonList, SponsoredTag } from '@/components/ui/primitives';
import { Dialog, useUI } from '@/components/ui/overlay';
import { CityScene } from '@/components/illustrations';
import { LocalityDialog } from '@/layouts/AppShell';
import { Checkbox } from '@/components/ui/form';
import { formatINR, timeAgo } from '@/utils/format';

export default function HomePage() {
  const t = useT();
  useDocumentTitle('');
  const loading = useLoading(300);
  const { prefs } = useSession();
  const [customise, setCustomise] = useState(false);
  const show = (id: string) => prefs.homeSections.includes(id);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <LocationRow />
        <HomeSearch />
        <Hero />
      </div>
      <CategoryGrid />
      {show('news') && <NewsSection />}
      {show('alerts') && <AlertStrip />}

      {loading ? <SkeletonList rows={3} /> : (
        <>
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
          <InstallCard />
          <Button variant="ghost" className="justify-self-center" icon={<Settings2 className="size-4" aria-hidden />} onClick={() => setCustomise(true)}>{t('customiseHome')}</Button>
        </>
      )}

      <CustomiseDialog open={customise} onClose={() => setCustomise(false)} />
    </div>
  );
}

function LocationRow() {
  const { prefs } = useSession();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full text-sm font-semibold text-ink" aria-label={`Locality: ${localityName(prefs.localityId, lang)}. Change`}>
        <MapPin className="size-4 fill-brand text-white" aria-hidden />{prefs.localityId === 'all' ? 'Bhilwara' : `${localityName(prefs.localityId, lang)}, Bhilwara`}<ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      <WeatherPill />
      <LocalityDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function WeatherPill() {
  const [w, setW] = useState<Weather | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    getWeather(ctl.signal).then(setW).catch(() => undefined);
    return () => ctl.abort();
  }, []);
  if (!w) return <Skeleton className="h-7 w-20 rounded-full" />;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700" title={`${w.label} · Source: ${w.source}`}>
      <Sun className="size-4" aria-hidden />{Math.round(w.tempC)}°C{!w.live && <span className="text-[10px] font-bold uppercase">demo</span>}
    </span>
  );
}

function HomeSearch() {
  const nav = useNavigate();
  const { toast } = useUI();
  const lang = useLang();
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const voice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) { toast('Voice search isn’t supported in this browser.', 'info'); return; }
    const rec = new R();
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    rec.onresult = (e) => { const text = e.results[0][0].transcript; setQ(text); nav(`/search?q=${encodeURIComponent(text)}`); };
    rec.onerror = () => toast('Couldn’t hear that. Please try again.', 'error');
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`); }} className="relative">
      <label htmlFor="home-search" className="sr-only">Search services, jobs, products</label>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
      <input id="home-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services, jobs, products, etc..." className="input-pill pl-12 pr-14 shadow-sm" />
      <button type="button" onClick={voice} className={cx('absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full', listening ? 'bg-brand text-white' : 'text-ink hover:bg-page')} aria-label={listening ? 'Listening…' : 'Search by voice'}>
        <Mic className="size-5" aria-hidden />
      </button>
    </form>
  );
}

interface SpeechRec { lang: string; start: () => void; onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void; onerror: () => void; onend: () => void }

function Hero() {
  return (
    <Link to="/discover" className="relative block h-40 overflow-hidden rounded-2xl shadow-[var(--shadow-card)] sm:h-52">
      <CityScene seed="hero-bhilwara" className="absolute inset-0 h-full w-full" label="Illustration of a Rajasthani palace at sunset" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy/85 via-navy/40 to-transparent" />
      <div className="relative flex h-full flex-col justify-center p-5 text-white sm:p-8">
        <p className="max-w-[16ch] text-2xl font-extrabold leading-tight sm:text-3xl">Together for a Better Bhilwara</p>
        <p className="mt-2 text-sm text-white/85">Local services | Opportunities | Community</p>
      </div>
    </Link>
  );
}

const CATEGORY_TILES = [
  { to: '/jobs', label: 'Jobs', I: Briefcase, g: 'from-emerald-400 to-emerald-600' },
  { to: '/property', label: 'Property', I: Home, g: 'from-violet-400 to-violet-600' },
  { to: '/marketplace', label: 'Buy & Sell', I: ShoppingBag, g: 'from-rose-400 to-rose-600' },
  { to: '/services', label: 'Services', I: Wrench, g: 'from-sky-400 to-blue-600' },
  { to: '/education', label: 'Education', I: GraduationCap, g: 'from-teal-400 to-teal-600' },
  { to: '/events', label: 'Events', I: CalendarDays, g: 'from-orange-400 to-orange-600' },
  { to: '/news', label: 'News', I: Newspaper, g: 'from-indigo-400 to-indigo-600' },
  { to: '/discover', label: 'More', I: LayoutGrid, g: 'from-slate-100 to-slate-200', muted: true }
];

function CategoryGrid() {
  return (
    <nav aria-label="Categories">
      <ul className="grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-8">
        {CATEGORY_TILES.map(({ to, label, I, g, muted }) => (
          <li key={to}>
            <Link to={to} className="flex flex-col items-center gap-2 text-center text-[13px] font-medium text-ink">
              <span className={cx('grid size-14 place-items-center rounded-2xl bg-gradient-to-br shadow-sm', g, muted ? 'text-ink' : 'text-white')}><I className="size-7" aria-hidden /></span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
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

function InstallCard() {
  const { canInstall, install, standalone } = usePWA();
  const t = useT();
  const { toast } = useUI();
  if (standalone) return null;
  return (
    <section className="card border-0 bg-gradient-to-br from-brand to-brand-600 p-4 text-white">
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
  if (!sorted.length) return null;
  return (
    <section>
      <SectionHeader title={t('localNews')} to="/news" linkLabel="View All" />
      <div className="grid gap-3 md:grid-cols-2">{sorted.slice(0, 4).map((a) => <ArticleCard key={a.id} a={a} />)}</div>
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
            <Link key={p.id} to={`/polls/${p.id}`} className="card flex items-start gap-3 p-4 hover:border-brand/30">
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
        {schemes.map((s) => <Link key={s.id} to={`/government/schemes/${s.id}`} className="card p-3 hover:border-brand/30"><p className="font-semibold">{s.name}</p><p className="text-sm text-muted">{s.level === 'central' ? 'Central' : 'Rajasthan'} · {s.category}</p></Link>)}
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

/** Recommendations use only interests, localities and in-app activity the user chose — no inferred sensitive attributes. */
function RecommendedSection() {
  const t = useT();
  const { prefs, userId } = useSession();
  const db = useDB((s) => s);
  const recs = useMemo(() => recommend(db, prefs, userId, 4), [db, prefs, userId]);
  return (
    <section>
      <SectionHeader title={t('recommended')} to="/activity" linkLabel={t('seeAll')} />
      {recs.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">{recs.map((r) => <li key={r.id}><Link to={r.link} className="card block p-3 hover:border-brand/30"><p className="truncate font-semibold">{r.title}</p><p className="text-xs text-muted">{r.why}</p></Link></li>)}</ul>
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
