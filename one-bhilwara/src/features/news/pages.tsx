import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Car, Check, CheckCheck, CloudSun, Construction, Droplets, Landmark, Thermometer, Wind, Zap, ChevronDown, ChevronRight, ChevronsUp, ChevronUp, ExternalLink, Fuel, Headphones, Heart, Mic, Pause, Play, Radio, RotateCcw, Share2, Siren, SlidersHorizontal, Trophy } from 'lucide-react';
import type { Article, CivicAlert, Match, Podcast } from '@/types/models';
import { LOCALITIES, localityName, newsCategoryName } from '@/config/catalog';
import { matches as seedMatches, podcasts as seedPodcasts, prices as seedPrices } from '@/data/seed/content';
import { useDB, useDocumentTitle, useLang, useLoading, useNow, useSession } from '@/hooks/useStore';
import { isSaved, toggleSave } from '@/services/domain/common';
import { repo } from '@/services/store';
import { ArticleCard } from '@/components/cards';
import { CityScene } from '@/components/illustrations';
import { CommentsThread, ReportButton, SaveButton, ShareButton, useRequireAuth } from '@/components/shared';
import { Badge, Button, cx, DemoBadge, EmptyState, LinkButton, MetaLine, Notice, PageHeader, Skeleton, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { durationMMSS, formatDate, formatDateTime, formatINR, formatTime, timeAgo } from '@/utils/format';
import { aqiBand, getConditions, type Conditions } from '@/services/adapters/weather';
import NotFound from '@/app/NotFound';
import { sessionStore } from '@/services/session';

const CIVIC_FILTERS: { id: string; label: string; I: typeof Zap; types: CivicAlert['type'][] }[] = [
  { id: 'electricity', label: 'Electricity', I: Zap, types: ['electricity'] },
  { id: 'water', label: 'Water', I: Droplets, types: ['water'] },
  { id: 'vip', label: 'VIP visit & traffic', I: Car, types: ['vip', 'traffic'] },
  { id: 'road', label: 'Roads', I: Construction, types: ['road'] },
  { id: 'weather', label: 'Weather', I: CloudSun, types: ['weather'] },
  { id: 'notice', label: 'Notices & camps', I: Landmark, types: ['notice', 'municipal'] },
  { id: 'emergency', label: 'Emergency', I: Siren, types: ['emergency'] }
];
const CIVIC_STYLE: Record<CivicAlert['type'], { I: typeof Zap; tint: string }> = {
  electricity: { I: Zap, tint: 'bg-amber-100 text-amber-700' }, water: { I: Droplets, tint: 'bg-sky-100 text-sky-700' }, vip: { I: Car, tint: 'bg-violet-100 text-violet-700' },
  traffic: { I: Car, tint: 'bg-orange-100 text-orange-700' }, road: { I: Construction, tint: 'bg-yellow-100 text-yellow-800' }, weather: { I: CloudSun, tint: 'bg-cyan-100 text-cyan-700' },
  notice: { I: Landmark, tint: 'bg-slate-100 text-slate-700' }, municipal: { I: Landmark, tint: 'bg-slate-100 text-slate-700' }, emergency: { I: Siren, tint: 'bg-rose-100 text-rose-700' }
};

const isLive = (publishedAt: string, status: string) => status === 'published' || (status === 'scheduled' && Date.parse(publishedAt) <= Date.now());

/** News sections. Local = city/district desks; Rajasthan = state; Global = India + world. */
const SECTIONS = [
  { id: 'local', label: 'Local', labelHi: 'स्थानीय', match: (c: string) => !['rajasthan', 'india', 'world'].includes(c) },
  { id: 'rajasthan', label: 'Rajasthan', labelHi: 'राजस्थान', match: (c: string) => c === 'rajasthan' },
  { id: 'global', label: 'Global', labelHi: 'देश-दुनिया', match: (c: string) => c === 'india' || c === 'world' },
  { id: 'civic', label: 'Civic', labelHi: 'नागरिक', match: () => false }
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const SWIPE_PX = 60;

function useReadArticles() {
  const { prefs } = useSession();
  const read = prefs.readArticles ?? [];
  const set = (ids: string[]) => sessionStore.setPrefs({ readArticles: ids });
  return {
    read,
    markRead: (id: string) => { if (!read.includes(id)) set([...read, id]); },
    toggle: (id: string) => set(read.includes(id) ? read.filter((x) => x !== id) : [...read, id]),
    markAll: (ids: string[]) => set([...new Set([...read, ...ids])]),
    clear: (ids: string[]) => set(read.filter((x) => !ids.includes(x)))
  };
}

/** Inshorts-style news: one short story per screen, swipe up for the next. */
export function NewsPage() {
  useDocumentTitle('News');
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.find((x) => x.id === params.get('section')) ?? SECTIONS[0];
  const setSection = (id: SectionId) => { const p = new URLSearchParams(); if (id !== 'local') p.set('section', id); setParams(p, { replace: true }); };
  const now = useNow();
  const loading = useLoading();
  const articles = useDB((s) => s.articles);
  const activeAlerts = useDB((s) => s.alerts.filter((x) => x.status !== 'resolved' && Date.parse(x.expiresAt) > now && Date.parse(x.startsAt) <= now).length);
  const { read, markRead, toggle, markAll, clear } = useReadArticles();
  const readRef = useRef(read);
  readRef.current = read;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [deckKey, setDeckKey] = useState(0);
  const [options, setOptions] = useState(false);

  // The deck is a snapshot: marking stories read while swiping must not reshuffle it.
  const deck = useMemo(() => {
    const live = articles.filter((x) => isLive(x.publishedAt, x.status) && section.match(x.category));
    const ids = new Set(readRef.current);
    return live.filter((x) => !unreadOnly || !ids.has(x.id)).sort((x, y) => y.publishedAt.localeCompare(x.publishedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, section.id, unreadOnly, deckKey]);
  const sectionIds = useMemo(() => articles.filter((x) => isLive(x.publishedAt, x.status) && section.match(x.category)).map((x) => x.id), [articles, section]);
  const unreadCount = sectionIds.filter((id) => !read.includes(id)).length;

  const [i, setI] = useState(0);
  const [dy, setDy] = useState(0);
  useEffect(() => { setI(0); setDy(0); }, [deck]);
  const go = useCallback((to: number) => {
    setI((cur) => {
      const next = Math.max(0, Math.min(deck.length, to));
      if (next > cur && deck[cur]) markRead(deck[cur].id); // swiping past a story marks it read
      return next;
    });
    setDy(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, read]);

  // Keyboard: ↓ / j next, ↑ / k previous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"]')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(i + 1); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(i - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, i]);

  // Touch / mouse drag.
  const start = useRef<{ x: number; y: number; vertical?: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { if ((e.target as HTMLElement).closest('a, button')) return; start.current = { x: e.clientX, y: e.clientY }; };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = start.current; if (!st) return;
    const ddx = e.clientX - st.x, ddy = e.clientY - st.y;
    if (st.vertical === undefined && Math.abs(ddx) + Math.abs(ddy) > 8) st.vertical = Math.abs(ddy) > Math.abs(ddx);
    if (st.vertical) setDy(ddy);
  };
  const onPointerUp = () => {
    const st = start.current; start.current = null;
    if (!st?.vertical) { setDy(0); return; }
    if (dy < -SWIPE_PX) go(i + 1); else if (dy > SWIPE_PX) go(i - 1); else setDy(0);
  };
  // Mouse wheel / trackpad: one story per gesture.
  const wheelLock = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 25 || Date.now() < wheelLock.current) return;
    wheelLock.current = Date.now() + 650;
    go(i + (e.deltaY > 0 ? 1 : -1));
  };

  const atEnd = i >= deck.length;
  const label = (x: (typeof SECTIONS)[number]) => (lang === 'hi' ? x.labelHi : x.label);

  return (
    <div className="mx-auto grid w-full max-w-md gap-3">
      <h1 className="sr-only">News</h1>
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="News sections" className="grid flex-1 grid-cols-4 gap-1 rounded-full border border-line bg-white p-1 shadow-sm">
          {SECTIONS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={section.id === x.id} onClick={() => setSection(x.id)}
              className={cx('min-h-10 rounded-full text-[13px] font-bold transition-colors', section.id === x.id ? 'bg-brand text-white shadow' : 'text-ink hover:bg-page')}>{label(x)}</button>
          ))}
        </div>
        <button type="button" onClick={() => setOptions(true)} className="relative grid size-11 shrink-0 place-items-center rounded-full border border-line bg-white shadow-sm hover:border-brand/40" aria-label="News options" aria-haspopup="dialog">
          <SlidersHorizontal className="size-5" aria-hidden />
          {unreadOnly && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-brand ring-2 ring-white" aria-hidden />}
        </button>
      </div>
      <div className="flex items-center justify-between px-1 text-xs text-muted">
        <span aria-live="polite">{section.id === 'civic' ? 'Civic alerts & city updates' : deck.length ? (atEnd ? 'All caught up' : `Story ${i + 1} of ${deck.length}`) : ''}{unreadOnly ? ' · unread only' : ''}</span>
        {section.id !== 'civic' && <span>{unreadCount} unread</span>}
      </div>

      {section.id === 'civic' ? <CivicUpdates /> : loading ? <Skeleton className="h-[calc(100dvh-15rem)] min-h-[440px] rounded-3xl" /> : (
        <section aria-roledescription="carousel" aria-label={`${section.label} news`}
          className="relative h-[calc(100dvh-15rem)] min-h-[440px] touch-none select-none overflow-hidden rounded-3xl lg:h-[min(calc(100dvh-12rem),760px)]"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          {deck.map((a, idx) => Math.abs(idx - i) > 1 ? null : (
            <div key={a.id} className={cx('absolute inset-0', dy === 0 && 'transition-transform duration-300 ease-out')}
              style={{ transform: `translateY(calc(${(idx - i) * 100}% + ${idx - i >= -1 && idx - i <= 1 ? dy : 0}px))`, zIndex: 10 - Math.abs(idx - i) }}
              aria-hidden={idx !== i} inert={idx !== i ? true : undefined}>
              <StoryCard a={a} isRead={read.includes(a.id)} onToggleRead={() => toggle(a.id)} lang={lang} />
            </div>
          ))}
          <div className={cx('absolute inset-0', dy === 0 && 'transition-transform duration-300 ease-out')} style={{ transform: `translateY(calc(${(deck.length - i) * 100}% + ${dy}px))` }} aria-hidden={!atEnd} inert={!atEnd ? true : undefined}>
            <CaughtUp
              empty={deck.length === 0}
              unreadOnly={unreadOnly}
              others={SECTIONS.filter((x) => x.id !== section.id && x.id !== 'civic').map((x) => ({ id: x.id, label: label(x) }))}
              onRestart={() => go(0)}
              onShowRead={() => { setUnreadOnly(false); setDeckKey((k) => k + 1); }}
              onSection={setSection}
              alerts={activeAlerts}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden justify-end gap-2 p-3 lg:flex">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white/90 shadow-md disabled:opacity-40" aria-label="Previous story"><ChevronUp className="size-5" aria-hidden /></button>
            <button type="button" onClick={() => go(i + 1)} disabled={atEnd} className="pointer-events-auto grid size-10 place-items-center rounded-full bg-brand text-white shadow-md disabled:opacity-40" aria-label="Next story"><ChevronDown className="size-5" aria-hidden /></button>
          </div>
        </section>
      )}
      {section.id !== 'civic' && !atEnd && deck.length > 0 && (
        <p className="flex items-center justify-center gap-1 text-xs font-medium text-muted lg:hidden" aria-hidden><ChevronUp className="size-4 animate-bounce" />Swipe up for next story</p>
      )}
      <button type="button" onClick={() => go(i + 1)} className="sr-only focus:not-sr-only focus:rounded-lg focus:bg-white focus:p-2">Next story</button>

      <Dialog open={options} onClose={() => setOptions(false)} title="News options" description={`${label(section)} · ${unreadCount} of ${sectionIds.length} unread`}>
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Show</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={!unreadOnly} onClick={() => { setUnreadOnly(false); setOptions(false); }} className={cx('min-h-11 rounded-xl border text-sm font-semibold', !unreadOnly ? 'border-brand bg-brand-50 text-brand' : 'border-line')}>All stories</button>
            <button type="button" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(true); setDeckKey((k) => k + 1); setOptions(false); }} className={cx('min-h-11 rounded-xl border text-sm font-semibold', unreadOnly ? 'border-brand bg-brand-50 text-brand' : 'border-line')}>Unread only</button>
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted">Actions</p>
          <OptionRow I={CheckCheck} label="Mark all as read" hint={`Every story in ${section.label}`} onClick={() => { markAll(sectionIds); setOptions(false); }} />
          <OptionRow I={RotateCcw} label="Mark all as unread" hint="Start this section fresh" onClick={() => { clear(sectionIds); setDeckKey((k) => k + 1); setOptions(false); }} />
          <OptionRow I={ChevronsUp} label="Back to first story" onClick={() => { go(0); setOptions(false); }} />
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted">More</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/news?section=civic" onClick={() => setOptions(false)} className="chip"><Siren className="size-4" aria-hidden />Civic alerts{activeAlerts ? ` (${activeAlerts})` : ''}</Link>
            <Link to="/podcasts" className="chip"><Headphones className="size-4" aria-hidden />Podcasts</Link>
            <Link to="/sports" className="chip"><Trophy className="size-4" aria-hidden />Sports</Link>
            <Link to="/prices" className="chip"><Fuel className="size-4" aria-hidden />Fuel & gold</Link>
            <Link to="/profile?tab=saved" className="chip"><Bookmark className="size-4" aria-hidden />Saved stories</Link>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function OptionRow({ I, label, hint, onClick }: { I: typeof Bookmark; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 text-left hover:border-brand/40">
      <I className="size-5 text-brand" aria-hidden /><span><span className="block text-sm font-semibold text-ink">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </button>
  );
}

function StoryCard({ a, isRead, onToggleRead, lang }: { a: Article; isRead: boolean; onToggleRead: () => void; lang: 'en' | 'hi' }) {
  const { userId } = useSession();
  const guard = useRequireAuth();
  const { toast } = useUI();
  useDB((s) => s.saved.length);
  const saved = isSaved('article', a.id);
  const liked = !!userId && a.likedBy.includes(userId);
  const headline = lang === 'hi' ? a.titleHi ?? a.title : a.titleHi ?? a.title;
  const sub = a.titleHi ? a.title : undefined;
  const text = a.summary.length < 140 && a.body[0] ? `${a.summary} ${a.body[0]}` : a.summary;
  const share = async () => {
    const url = `${window.location.origin}/news/${a.id}`;
    try { if (navigator.share) { await navigator.share({ title: a.title, url }); return; } await navigator.clipboard.writeText(url); toast('Link copied'); }
    catch (err) { if ((err as Error).name !== 'AbortError') toast('Could not share. Copy the link from the story page.', 'error'); }
  };
  const act = 'flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-semibold text-muted hover:text-brand';
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-lg">
      <div className="relative h-[34%] shrink-0">
        <CityScene seed={a.id} className="size-full" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="flex flex-wrap gap-1.5"><Badge tone="navy" className="bg-white/90">{newsCategoryName(a.category)}</Badge>{a.demo && <DemoBadge label="Sample" />}</span>
          {isRead && <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-teal"><Check className="size-3.5" aria-hidden />Read</span>}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <h2 className="text-lg font-extrabold leading-snug text-ink">{headline}</h2>
        {sub && <p className="-mt-1 text-sm font-semibold text-ink/60">{sub}</p>}
        <p className="line-clamp-[8] text-[15px] leading-relaxed text-ink/80">{text}</p>
        <p className="mt-auto text-xs text-muted">short by <span className="font-semibold text-ink/70">{a.source}</span> · {timeAgo(a.publishedAt)}{a.localityId ? ` · ${localityName(a.localityId)}` : ''}</p>
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-line bg-page/60 px-2 py-1.5">
        <Link to={`/news/${a.id}`} className="ml-1 inline-flex min-h-10 items-center gap-1 text-sm font-bold text-brand">Read full story<ChevronRight className="size-4" aria-hidden /></Link>
        <div className="flex">
          <button type="button" className={act} aria-pressed={liked} onClick={() => guard(() => repo.at('articles').mutate(a.id, (cur) => ({ likedBy: liked ? cur.likedBy.filter((x) => x !== userId) : [...cur.likedBy, userId!] })))}>
            <Heart className={cx('size-5', liked && 'fill-rose-500 text-rose-500')} aria-hidden />{a.likedBy.length || 'Like'}
          </button>
          <button type="button" className={act} aria-pressed={saved} onClick={() => guard(() => toast(toggleSave('article', a.id) ? 'Saved to your profile' : 'Removed from saved'))}>
            {saved ? <BookmarkCheck className="size-5 text-teal" aria-hidden /> : <Bookmark className="size-5" aria-hidden />}{saved ? 'Saved' : 'Save'}
          </button>
          <button type="button" className={act} onClick={share}><Share2 className="size-5" aria-hidden />Share</button>
          <button type="button" className={act} aria-pressed={isRead} onClick={onToggleRead}><CheckCheck className={cx('size-5', isRead && 'text-teal')} aria-hidden />{isRead ? 'Read' : 'Mark read'}</button>
        </div>
      </div>
    </article>
  );
}

function CaughtUp({ empty, unreadOnly, others, onRestart, onShowRead, onSection, alerts }: { empty: boolean; unreadOnly: boolean; others: { id: SectionId; label: string }[]; onRestart: () => void; onShowRead: () => void; onSection: (id: SectionId) => void; alerts: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl border border-line bg-gradient-to-b from-brand-50 to-white p-6 text-center shadow-lg">
      <span className="grid size-16 place-items-center rounded-full bg-teal/10 text-teal"><CheckCheck className="size-8" aria-hidden /></span>
      <div>
        <h2 className="text-xl font-extrabold text-ink">{empty ? (unreadOnly ? 'No unread stories here' : 'No stories yet') : 'You’re all caught up!'}</h2>
        <p className="mt-1 text-sm text-muted">{empty ? 'Check another section or come back later.' : 'You’ve seen every story in this section.'}</p>
      </div>
      <div className="grid w-full max-w-xs gap-2">
        {!empty && <Button onClick={onRestart} icon={<ChevronsUp className="size-4" aria-hidden />}>Back to first story</Button>}
        {unreadOnly && <Button variant="secondary" onClick={onShowRead}>Show read stories too</Button>}
        {others.map((o) => <Button key={o.id} variant="secondary" onClick={() => onSection(o.id)}>Read {o.label} news</Button>)}
        {alerts > 0 && <LinkButton variant="ghost" to="/news?section=civic" icon={<Siren className="size-4 text-danger" aria-hidden />}>{alerts} active civic alert{alerts === 1 ? '' : 's'}</LinkButton>}
      </div>
    </div>
  );
}

/** Civic alerts & city updates: live conditions (temperature, AQI) plus electricity, water, VIP-visit, road and notice updates. */
function CivicUpdates() {
  const now = useNow();
  const { prefs } = useSession();
  const [filter, setFilter] = useState('');
  const [nearMe, setNearMe] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const alerts = useDB((s) => s.alerts);
  const list = alerts
    .map((a) => ({ ...a, status: (a.status === 'resolved' || Date.parse(a.expiresAt) < now ? 'resolved' : Date.parse(a.startsAt) > now ? 'scheduled' : 'active') as CivicAlert['status'] }))
    .filter((a) => !filter || CIVIC_FILTERS.find((f) => f.id === filter)!.types.includes(a.type))
    .filter((a) => !nearMe || !a.localityId || a.localityId === prefs.localityId || prefs.localities.includes(a.localityId));
  const sev = (a: CivicAlert) => ['critical', 'warning', 'advisory', 'info'].indexOf(a.severity);
  const groups = [
    { id: 'active', title: 'Happening now', items: list.filter((a) => a.status === 'active').sort((a, b) => sev(a) - sev(b)) },
    { id: 'scheduled', title: 'Coming up', items: list.filter((a) => a.status === 'scheduled').sort((a, b) => a.startsAt.localeCompare(b.startsAt)) },
    { id: 'resolved', title: 'Resolved recently', items: list.filter((a) => a.status === 'resolved').sort((a, b) => b.expiresAt.localeCompare(a.expiresAt)) }
  ];
  return (
    <div className="grid gap-4">
      <ConditionsPanel />
      <div className="scroll-x" role="group" aria-label="Update type">
        <button type="button" className="chip" aria-pressed={!filter} onClick={() => setFilter('')}>All</button>
        {CIVIC_FILTERS.map(({ id, label, I }) => <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(filter === id ? '' : id)}><I className="size-4" aria-hidden />{label}</button>)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-ink"><input type="checkbox" className="size-4 accent-brand" checked={nearMe} onChange={(e) => setNearMe(e.target.checked)} />Only {localityName(prefs.localityId)} & citywide</label>
        <Link to="/settings#notifications" className="text-xs font-semibold text-brand hover:underline">Alert settings</Link>
      </div>
      {groups.map((g) => g.id === 'resolved' && !showPast ? (
        g.items.length > 0 && <Button key={g.id} variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowPast(true)}>Show {g.items.length} resolved update{g.items.length === 1 ? '' : 's'}</Button>
      ) : g.items.length > 0 && (
        <section key={g.id} aria-labelledby={`civic-${g.id}`} className="grid gap-2">
          <h2 id={`civic-${g.id}`} className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">{g.id === 'active' && <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden />}{g.title}<span className="font-semibold normal-case tracking-normal">({g.items.length})</span></h2>
          <ul className="grid gap-2">
            {g.items.map((a) => {
              const st = CIVIC_STYLE[a.type];
              return (
                <li key={a.id} className={cx('card flex gap-3 p-3', g.id === 'resolved' && 'opacity-70')}>
                  <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', st.tint)}><st.I className="size-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{ALERT_ICON[a.type]}</span>
                      {(a.severity === 'warning' || a.severity === 'critical') && g.id !== 'resolved' && <Badge tone="red" className="capitalize">{a.severity}</Badge>}
                      {a.demo && <DemoBadge label="Simulated" />}
                    </div>
                    <p className="font-bold leading-snug text-ink">{a.title}</p>
                    <p className="text-sm text-ink/75">{a.description}</p>
                    <p className="mt-1 text-xs text-muted">{a.localityId ? localityName(a.localityId) : 'Citywide'} · {g.id === 'scheduled' ? `Starts ${formatDateTime(a.startsAt)}` : g.id === 'active' ? `Until ${formatDateTime(a.expiresAt)}` : `Ended ${formatDateTime(a.expiresAt)}`}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {list.length === 0 && <EmptyState title="No updates of this type" text="Nothing to report right now." action={<Button variant="secondary" onClick={() => { setFilter(''); setNearMe(false); }}>Show all updates</Button>} />}
      <Notice tone="danger" title="In an emergency">Call <a className="font-bold underline" href="tel:112">112</a> (police, fire, ambulance) or <a className="font-bold underline" href="tel:108">108</a>. Don’t rely on this feed for emergencies.</Notice>
      <p className="text-xs text-muted">Electricity, water, VIP-visit, road and notice updates are simulated until connected to official sources (power discom, PHED, district administration, traffic police).</p>
    </div>
  );
}

function ConditionsPanel() {
  const [c, setC] = useState<Conditions | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    getConditions(ctl.signal).then(setC).catch((e) => { if ((e as Error).name !== 'AbortError') setFailed(true); });
    return () => ctl.abort();
  }, []);
  if (failed) return <Notice tone="info" title="Live conditions unavailable">Temperature and air quality couldn’t be loaded right now. Check your connection and try again later.</Notice>;
  if (!c) return <div className="grid grid-cols-2 gap-3"><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-36 rounded-2xl" /></div>;
  const band = c.aqi !== null ? aqiBand(c.aqi) : null;
  return (
    <section aria-label="Current conditions in Bhilwara" className="grid gap-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 p-4 text-white shadow-md">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/80"><Thermometer className="size-4" aria-hidden />Temperature</p>
          <p className="mt-1 text-4xl font-extrabold leading-none">{Math.round(c.tempC)}°<span className="text-xl">C</span></p>
          <p className="mt-1 text-sm text-white/90">{c.label} · feels {Math.round(c.feelsC)}°</p>
          <p className="text-xs text-white/80">H {Math.round(c.maxC)}° · L {Math.round(c.minC)}° · UV {Math.round(c.uv)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-md">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><Wind className="size-4" aria-hidden />Air quality</p>
          {band && c.aqi !== null ? (<>
            <p className="mt-1 flex items-baseline gap-2"><span className="text-4xl font-extrabold leading-none text-ink">{Math.round(c.aqi)}</span><span className="text-xs font-semibold text-muted">AQI (US)</span></p>
            <p className={cx('mt-1 flex items-center gap-1.5 text-sm font-bold', band.text)}><span className={cx('size-2.5 rounded-full', band.tone)} aria-hidden />{band.label}</p>
            <p className="text-xs text-muted">{c.pm25 !== null && `PM2.5 ${Math.round(c.pm25)}`}{c.pm10 !== null && ` · PM10 ${Math.round(c.pm10)}`} µg/m³</p>
          </>) : <p className="mt-2 text-sm text-muted">AQI not available right now.</p>}
        </div>
      </div>
      {band && <p className="rounded-xl bg-page px-3 py-2 text-xs text-ink/80"><b>Air tip:</b> {band.tip}</p>}
      <p className="text-[11px] text-muted">{c.live ? `Live · ${c.source} · updated ${formatTime(c.at)}` : <><DemoBadge label="Demo" /> {c.source}. Turn on live weather to see real readings.</>}</p>
    </section>
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

const ALERT_ICON: Record<CivicAlert['type'], string> = { road: 'Road closure', water: 'Water supply', electricity: 'Electricity', notice: 'Public notice', traffic: 'Traffic', vip: 'VIP visit', weather: 'Weather', municipal: 'Municipal', emergency: 'Emergency' };

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
