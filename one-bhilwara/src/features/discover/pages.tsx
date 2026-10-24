import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Search, SearchX, TrendingUp, X } from 'lucide-react';
import { DISCOVER, LOCALITIES } from '@/config/catalog';
import { useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { addRecentSearch } from '@/services/domain/common';
import { buildIndex, POPULAR_SEARCHES, search, SEARCH_TYPES, suggestions, type SearchResult, type SearchType } from '@/services/domain/search';
import { store } from '@/services/store';
import { BusinessCard, EventCard, JobCard, OfferCard, PropertyCard, ProviderCard } from '@/components/cards';
import { Badge, Button, LinkButton, PageHeader, SkeletonList, VerificationBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { LoadMore, usePaged } from '@/components/shared';
import NotFound from '@/app/NotFound';

export function DiscoverPage() {
  useDocumentTitle('Discover');
  return (
    <div className="grid gap-6">
      <PageHeader title="Discover Bhilwara" subtitle="Browse every part of the city in one place." />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {DISCOVER.map((c) => (
          <li key={c.slug}>
            <Link to={`/discover/${c.slug}`} className="card flex h-full flex-col gap-3 p-4 hover:border-brand/30">
              <span className="grid size-11 place-items-center rounded-xl bg-brand text-white"><Icon name={c.icon} /></span>
              <span className="font-semibold leading-tight text-ink">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Collections />
    </div>
  );
}

function Collections() {
  const db = useDB((s) => s);
  const cols = [
    { title: 'Available right now', link: '/services?available=1', items: db.providers.filter((p) => p.availability === 'available').slice(0, 4).map((p) => ({ id: p.id, label: p.name, to: `/service-providers/${p.id}` })) },
    { title: 'Student essentials', link: '/property/students', items: [...db.properties.filter((p) => p.student).slice(0, 2).map((p) => ({ id: p.id, label: p.title, to: `/property/${p.id}` })), ...db.jobs.filter((j) => j.type === 'part_time').slice(0, 2).map((j) => ({ id: j.id, label: `Job: ${j.title}`, to: `/jobs/${j.id}` }))] },
    { title: 'Wedding season', link: '/weddings', items: db.businesses.filter((b) => b.wedding).slice(0, 4).map((b) => ({ id: b.id, label: b.name, to: `/weddings/${b.id}` })) },
    { title: 'Textile & B2B', link: '/b2b', items: db.businesses.filter((b) => b.b2b).slice(0, 4).map((b) => ({ id: b.id, label: b.name, to: `/businesses/${b.id}` })) }
  ];
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {cols.map((c) => (
        <div key={c.title} className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-bold text-navy">{c.title}</h2><Link to={c.link} className="text-sm font-semibold text-brand">See all →</Link></div>
          <ul className="divide-y divide-line">{c.items.map((i) => <li key={i.id}><Link to={i.to} className="block py-2 text-sm hover:text-brand">{i.label}</Link></li>)}</ul>
        </div>
      ))}
    </section>
  );
}

/** Each Discover category has its own landing page mixing the most relevant collections. */
export function CategoryLandingPage() {
  const { slug = '' } = useParams();
  const cat = DISCOVER.find((c) => c.slug === slug);
  const db = useDB((s) => s);
  useDocumentTitle(cat?.name ?? 'Category');
  if (!cat) return <NotFound />;
  const content = (() => {
    switch (slug) {
      case 'services': return { lead: 'Trusted local help — plumbers, electricians, cleaners and more.', body: <div className="grid gap-3 md:grid-cols-3">{db.providers.slice(0, 6).map((p) => <ProviderCard key={p.id} p={p} />)}</div> };
      case 'jobs': return { lead: 'Full-time, part-time, internships and seasonal work.', body: <div className="grid gap-3 md:grid-cols-2">{db.jobs.filter((j) => j.status === 'open').slice(0, 6).map((j) => <JobCard key={j.id} j={j} />)}</div> };
      case 'property': return { lead: 'Homes, shops, plots, PGs and student rooms.', body: <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{db.properties.slice(0, 6).map((p) => <PropertyCard key={p.id} p={p} />)}</div> };
      case 'food-shopping': return { lead: 'Restaurants, groceries, clothing, electronics and local offers.', body: <><div className="grid gap-3 md:grid-cols-3">{db.businesses.filter((b) => ['Grocery', 'Restaurants & cafes', 'Clothing', 'Electronics', 'Retail', 'Jewellery'].includes(b.category)).map((b) => <BusinessCard key={b.id} b={b} />)}</div><h2 className="mt-6 mb-3 text-lg font-bold text-navy">Offers</h2><div className="grid gap-3 sm:grid-cols-3">{db.offers.filter((o) => o.status === 'active').map((o) => <Link key={o.id} to={`/offers?id=${o.id}`}><OfferCard o={o} /></Link>)}</div></> };
      case 'directory': return { lead: 'Every listed local business, by category.', body: <div className="grid gap-3 md:grid-cols-3">{db.businesses.slice(0, 9).map((b) => <BusinessCard key={b.id} b={b} />)}</div> };
      case 'weddings-events': return { lead: 'Venues, vendors and what’s on in the city.', body: <div className="grid gap-3 md:grid-cols-3">{db.events.slice(0, 6).map((e) => <EventCard key={e.id} e={e} />)}</div> };
      case 'news-community': return { lead: 'Local news, civic alerts, discussions and polls.', body: <div className="grid gap-2 sm:grid-cols-2">{[['Local news', '/news'], ['Civic alerts', '/alerts'], ['Community', '/community'], ['Polls', '/polls'], ['Podcasts', '/podcasts'], ['Sports', '/sports']].map(([l, to]) => <Link key={to} to={to} className="card p-4 font-semibold hover:border-brand/30">{l} →</Link>)}</div> };
      default: return { lead: 'Open the full section to browse, filter and take action.', body: null };
    }
  })();
  return (
    <div className="grid gap-5">
      <PageHeader title={cat.name} subtitle={content.lead} actions={<LinkButton to={cat.route}>Open {cat.name}</LinkButton>} />
      {content.body ?? <LinkButton variant="secondary" to={cat.route} className="justify-self-start">Go to {cat.name} →</LinkButton>}
      <nav aria-label="Other categories" className="scroll-x">{DISCOVER.filter((c) => c.slug !== slug).map((c) => <Link key={c.slug} to={`/discover/${c.slug}`} className="chip">{c.name}</Link>)}</nav>
    </div>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const types = (params.get('types')?.split(',').filter(Boolean) ?? []) as SearchType[];
  const loc = params.get('locality') ?? '';
  const sort = (params.get('sort') ?? 'relevance') as 'relevance' | 'newest' | 'price_asc' | 'price_desc';
  const verified = params.get('verified') === '1';
  const available = params.get('available') === '1';
  const [input, setInput] = useState(q);
  const [focus, setFocus] = useState(false);
  const db = useDB((s) => s);
  const { prefs } = useSession();
  const recent = useDB((s) => s.searches);
  const loading = useLoading(250);
  useDocumentTitle(q ? `Search: ${q}` : 'Search');
  useEffect(() => setInput(q), [q]);
  useEffect(() => { if (q) addRecentSearch(q); }, [q]);

  const index = useMemo(() => buildIndex(db), [db]);
  const results = useMemo(() => (q || types.length ? search(index, { q, types, localityId: loc, sort, verifiedOnly: verified, availableNow: available }) : []), [index, q, types.join(), loc, sort, verified, available]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugg = useMemo(() => suggestions(index, input), [index, input]);
  const { visible, hasMore, more } = usePaged(results, 15);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const go = (v: string) => { setFocus(false); set('q', v.trim()); };
  const counts = useMemo(() => {
    const all = q ? search(index, { q, localityId: loc }) : [];
    return Object.fromEntries(SEARCH_TYPES.map((t) => [t.id, all.filter((r) => r.type === t.id).length]));
  }, [index, q, loc]);

  return (
    <div className="grid gap-5">
      <PageHeader title="Search" subtitle="News, businesses, services, jobs, property, events, schemes and more." />
      <form role="search" className="relative" onSubmit={(e) => { e.preventDefault(); go(input); }}>
        <label htmlFor="s-q" className="sr-only">Search One Bhilwara</label>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input id="s-q" type="search" autoFocus className="input min-h-14 rounded-2xl pl-12 pr-24 text-base" placeholder="What are you looking for in Bhilwara?" value={input}
          onChange={(e) => setInput(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} aria-autocomplete="list" aria-controls="s-sugg" autoComplete="off" />
        <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2">Search</Button>
        {focus && sugg.length > 0 && (
          <ul id="s-sugg" role="listbox" className="card absolute inset-x-0 top-full z-20 mt-1 overflow-hidden">
            {sugg.map((s) => <li key={s.link} role="option" aria-selected={false}><Link to={s.link} className="block px-4 py-2.5 text-sm hover:bg-page"><span className="font-medium">{s.title}</span> <span className="text-muted">· {SEARCH_TYPES.find((t) => t.id === s.type)?.label}</span></Link></li>)}
          </ul>
        )}
      </form>

      {!q && !types.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold text-navy"><Clock className="size-4" aria-hidden />Recent searches</h2>
              {recent.length > 0 && <Button variant="ghost" size="sm" onClick={() => store.update(() => ({ searches: [] }))}>Clear</Button>}</div>
            {recent.length ? <div className="flex flex-wrap gap-2">{recent.map((r) => <button key={r} type="button" className="chip" onClick={() => go(r)}>{r}</button>)}</div> : <p className="text-sm text-muted">Your recent searches appear here.</p>}
          </section>
          <section className="card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-navy"><TrendingUp className="size-4" aria-hidden />Popular in Bhilwara</h2>
            <div className="flex flex-wrap gap-2">{POPULAR_SEARCHES.map((r) => <button key={r} type="button" className="chip" onClick={() => go(r)}>{r}</button>)}</div>
          </section>
        </div>
      ) : (
        <>
          <div className="scroll-x" role="group" aria-label="Filter by category">
            <button type="button" className="chip" aria-pressed={!types.length} onClick={() => set('types', '')}>All</button>
            {SEARCH_TYPES.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={types.includes(t.id)} onClick={() => set('types', (types.includes(t.id) ? types.filter((x) => x !== t.id) : [...types, t.id]).join(','))}>
                {t.label}{q && <span className="text-xs opacity-70">{counts[t.id]}</span>}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select aria-label="Locality" className="input min-h-10 text-sm" value={loc} onChange={(e) => set('locality', e.target.value)}>
              <option value="">All localities</option>{LOCALITIES.filter((l) => l.id !== 'all').map((l) => <option key={l.id} value={l.id}>{l.name}{l.id === prefs.localityId ? ' (mine)' : ''}</option>)}
            </select>
            <select aria-label="Sort" className="input min-h-10 text-sm" value={sort} onChange={(e) => set('sort', e.target.value === 'relevance' ? '' : e.target.value)}>
              <option value="relevance">Most relevant</option><option value="newest">Newest first</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
            </select>
            <button type="button" className="chip justify-center" aria-pressed={verified} onClick={() => set('verified', verified ? '' : '1')}>Verified only</button>
            <button type="button" className="chip justify-center" aria-pressed={available} onClick={() => set('available', available ? '' : '1')}>Available now</button>
          </div>
          <div className="flex items-center justify-between text-sm text-muted" aria-live="polite">
            <span>{results.length} result{results.length === 1 ? '' : 's'}{q ? ` for “${q}”` : ''}</span>
            <Button variant="ghost" size="sm" icon={<X className="size-4" aria-hidden />} onClick={() => { setParams({}); setInput(''); }}>Clear search</Button>
          </div>
          {loading ? <SkeletonList rows={4} /> : results.length === 0 ? (
            <div className="card grid justify-items-center gap-3 p-8 text-center">
              <SearchX className="size-10 text-muted" aria-hidden />
              <h2 className="font-bold">No results{q ? ` for “${q}”` : ''}</h2>
              <p className="max-w-md text-sm text-muted">Check the spelling, remove filters, or try a broader word. You can also ask the AI assistant or post a request.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => setParams(q ? { q } : {})}>Remove filters</Button>
                <LinkButton variant="secondary" to={`/ai?q=${encodeURIComponent(q)}`}>Ask AI</LinkButton>
                <LinkButton to="/service-requests/new">Post a service request</LinkButton>
              </div>
            </div>
          ) : (
            <>
              <ul className="grid gap-2">{visible.map((r) => <ResultRow key={`${r.type}-${r.id}`} r={r} />)}</ul>
              <LoadMore hasMore={hasMore} onMore={more} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ResultRow({ r }: { r: SearchResult }) {
  return (
    <li>
      <Link to={r.link} className="card flex items-center gap-3 p-3 hover:border-brand/30">
        <Badge tone="navy" className="w-24 justify-center">{SEARCH_TYPES.find((t) => t.id === r.type)?.label}</Badge>
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.title}</span><span className="block truncate text-sm text-muted">{r.subtitle}</span></span>
        {r.verified && <VerificationBadge status="verified" />}
        {r.availableNow && <Badge tone="teal">Available</Badge>}
      </Link>
    </li>
  );
}
