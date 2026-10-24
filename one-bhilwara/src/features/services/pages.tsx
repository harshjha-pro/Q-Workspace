import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, CircleAlert, ClipboardList, Hammer, HardHat, Headset, LayoutGrid, MapPin, Plus, Search, Sparkles, UserCheck, Users } from 'lucide-react';
import type { ConciergeRequest, LabourPost, Provider, ServiceRequest } from '@/types/models';
import { localityName, SERVICE_CATEGORIES, serviceName } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useNow, useSession } from '@/hooks/useStore';
import { currentUserId, notify, sanitize } from '@/services/domain/common';
import { confirmProvider, isActiveWithin, rankProviders } from '@/services/domain/serviceMatching';
import { repo, store } from '@/services/store';
import { ProviderCard } from '@/components/cards';
import { CallButton, EnquiryButton, FilterBar, LoadMore, LOCALITY_OPTIONS, ReportButton, ReviewsSection, SaveButton, SectionCard, ShareButton, useRequireAuth, usePaged } from '@/components/shared';
import { Badge, Button, cx, DemoBadge, EmptyState, SectionHeader, ImagePlaceholder, KeyValue, LinkButton, Notice, PageHeader, Rating, SkeletonList, StatusPill, StarInput, VerificationBadge } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, FilePicker, RadioCards, Select, TextArea, TextField } from '@/components/ui/form';
import { Icon } from '@/components/ui/Icon';
import { formatDate, formatDateTime, formatINR, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

const CIRCLE_TINTS = ['bg-sky-100 text-sky-600', 'bg-amber-100 text-amber-600', 'bg-indigo-100 text-indigo-600', 'bg-fuchsia-100 text-fuchsia-600', 'bg-emerald-100 text-emerald-600', 'bg-rose-100 text-rose-600', 'bg-orange-100 text-orange-600', 'bg-teal-100 text-teal-700'];
const FEATURED_SERVICES = ['plumber', 'electrician', 'ac', 'cleaning'];

export function ServicesPage() {
  useDocumentTitle('Local services');
  const nav = useNavigate();
  const seasonal = useDB((s) => s.providers.filter((p) => p.seasonal));
  const providers = useDB((s) => s.providers);
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const top = useMemo(() => providers.filter((p) => p.verification === 'verified' && (!area || p.localityId === area)).sort((a, b) => b.rating - a.rating).slice(0, 4), [providers, area]);
  const cats = all ? SERVICE_CATEGORIES : FEATURED_SERVICES.map((id) => SERVICE_CATEGORIES.find((c) => c.id === id)!);
  const shortName: Record<string, string> = { plumber: 'Plumber', electrician: 'Electrician', ac: 'AC Repair', cleaning: 'Cleaning' };
  return (
    <div className="grid gap-5">
      <PageHeader title="Local Services" hideActionsOnMobile actions={<LinkButton variant="secondary" size="sm" to="/service-requests" icon={<ClipboardList className="size-4" aria-hidden />}>My requests</LinkButton>} />
      <form role="search" className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 shadow-sm" onSubmit={(e) => { e.preventDefault(); const p = new URLSearchParams(); if (q) p.set('q', q); if (area) p.set('locality', area); nav(`/services/all?${p}`); }}>
        <MapPin className="size-5 shrink-0 text-brand" aria-hidden />
        <label htmlFor="svc-area" className="sr-only">Area</label>
        <select id="svc-area" value={area} onChange={(e) => setArea(e.target.value)} className="min-h-12 max-w-[42%] bg-transparent text-sm font-semibold text-ink outline-none">
          <option value="">All Areas</option>{LOCALITY_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <span className="h-6 w-px bg-line" aria-hidden />
        <label htmlFor="svc-q" className="sr-only">Search services</label>
        <input id="svc-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="min-h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        <button type="submit" className="grid size-9 place-items-center rounded-full text-ink hover:bg-page" aria-label="Search"><Search className="size-5" aria-hidden /></button>
      </form>
      <ul className={cx('grid gap-y-4', all ? 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8' : 'grid-cols-5')}>
        {cats.map((c, i) => (
          <li key={c.id}><Link to={`/services/${c.id}`} className="flex flex-col items-center gap-1.5 text-center text-xs font-medium text-ink">
            <span className={cx('grid size-14 place-items-center rounded-full', CIRCLE_TINTS[i % CIRCLE_TINTS.length])}><Icon name={c.icon} className="size-6" /></span>{shortName[c.id] ?? c.name}
          </Link></li>
        ))}
        <li><button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="flex w-full flex-col items-center gap-1.5 text-center text-xs font-medium text-ink">
          <span className="grid size-14 place-items-center rounded-full bg-slate-100 text-ink"><LayoutGrid className="size-6" aria-hidden /></span>{all ? 'Less' : 'More'}
        </button></li>
      </ul>

      <section>
        <SectionHeader title="Top Rated Service Providers" to={`/services/all${area ? `?locality=${area}` : ''}`} linkLabel="View All" />
        {top.length === 0 ? <EmptyState title="No verified providers in this area yet" action={<LinkButton to="/service-requests/new">Post a request</LinkButton>} /> : <div className="grid gap-3 lg:grid-cols-2">{top.map((p) => <ProviderCard key={p.id} p={p} />)}</div>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <div><p className="font-bold text-brand">Need a different service?</p><p className="text-sm text-muted">Post your request and get multiple quotes</p></div>
        <LinkButton to="/service-requests/new" size="sm">Post Request</LinkButton>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Link to="/assistance" className="card flex gap-3 p-4 hover:border-brand/30"><Headset className="size-7 shrink-0 text-brand" aria-hidden /><span><span className="block font-bold">One Bhilwara Assistance</span><span className="text-sm text-muted">Let a coordinator arrange it for you.</span></span></Link>
        <Link to="/labour" className="card flex gap-3 p-4 hover:border-brand/30"><HardHat className="size-7 shrink-0 text-brand" aria-hidden /><span><span className="block font-bold">Contractor & labour connect</span><span className="text-sm text-muted">Post requirements or find work.</span></span></Link>
        <Link to="/services/all?emergency=1" className="card flex gap-3 p-4 hover:border-brand/30"><CircleAlert className="size-7 shrink-0 text-danger" aria-hidden /><span><span className="block font-bold">Same-day & urgent</span><span className="text-sm text-muted">Providers who take urgent jobs.</span></span></Link>
      </div>
      <section>
        <SectionHeader title="Festival & seasonal help" to="/services/all?seasonal=1" linkLabel="View All" icon={<Sparkles className="size-5 text-amber" aria-hidden />} />
        <p className="mb-3 text-sm text-muted">Diwali cleaning, temporary helpers, event setup, wedding helpers, loading and unloading. Per-day prices are illustrative and set by each provider.</p>
        <div className="grid gap-3 lg:grid-cols-2">{seasonal.slice(0, 4).map((p) => <ProviderCard key={p.id} p={p} />)}</div>
      </section>
    </div>
  );
}

export function ServiceCategoryPage() {
  const { category = 'all' } = useParams();
  const [params] = useSearchParams();
  const now = useNow(60_000);
  const loading = useLoading();
  const cat = SERVICE_CATEGORIES.find((c) => c.id === category);
  useDocumentTitle(cat?.name ?? 'All services');
  const providers = useDB((s) => s.providers);
  const { prefs } = useSession();
  const init = () => ({ q: params.get('q') ?? '', values: { locality: params.get('locality') ?? '', rating: '', price: '', category: '' } as Record<string, string>, sort: 'relevance', available: params.get('available') === '1', verified: false, emergency: params.get('emergency') === '1', active: false, seasonal: params.get('seasonal') === '1' });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = providers.filter((p) => (category === 'all' ? !f.values.category || p.category === f.values.category : p.category === category) && p.verification !== 'suspended');
    if (f.q) l = l.filter((p) => `${p.name} ${p.description} ${serviceName(p.category)}`.toLowerCase().includes(f.q.toLowerCase()));
    if (f.values.locality) l = l.filter((p) => p.localityId === f.values.locality);
    if (f.values.rating) l = l.filter((p) => p.rating >= Number(f.values.rating));
    if (f.values.price) l = l.filter((p) => p.priceFrom !== undefined && p.priceFrom <= Number(f.values.price));
    if (f.available) l = l.filter((p) => p.availability === 'available');
    if (f.verified) l = l.filter((p) => p.verification === 'verified');
    if (f.emergency) l = l.filter((p) => p.emergency);
    if (f.active) l = l.filter((p) => isActiveWithin(p, 24, now));
    if (f.seasonal) l = l.filter((p) => p.seasonal);
    if (f.sort === 'rating') l = [...l].sort((a, b) => b.rating - a.rating);
    else if (f.sort === 'price') l = [...l].sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
    else {
      const ranked = rankProviders({ category: '', localityId: f.values.locality || prefs.localityId, urgency: f.emergency ? 'emergency' : 'normal' }, l.map((p) => ({ ...p, category: '' })));
      l = ranked.map((r) => l.find((p) => p.id === r.provider.id)!);
    }
    return l;
  }, [providers, category, f, now, prefs.localityId]);
  const { visible, hasMore, more } = usePaged(list, 9);
  return (
    <div className="grid gap-5">
      <nav className="text-sm text-muted"><Link to="/services" className="hover:underline">Services</Link> / {cat?.name ?? 'All'}</nav>
      <PageHeader title={cat?.name ?? 'All service providers'} subtitle="Compare by rating, availability, price and verification." actions={<LinkButton to={`/service-requests/new${cat ? `?category=${cat.id}` : ''}`}>Post a request</LinkButton>} />
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Search providers" count={list.length}
        filters={[
          ...(category === 'all' ? [{ key: 'category', label: 'Service', options: SERVICE_CATEGORIES.map((c) => ({ value: c.id, label: c.name })) }] : []),
          { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS },
          { key: 'rating', label: 'Rating', options: [{ value: '4.5', label: '4.5+' }, { value: '4', label: '4.0+' }, { value: '3.5', label: '3.5+' }] },
          { key: 'price', label: 'Max price', options: [{ value: '250', label: 'Up to ₹250' }, { value: '500', label: 'Up to ₹500' }, { value: '1000', label: 'Up to ₹1,000' }] }
        ]}
        values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        sorts={[{ value: 'relevance', label: 'Best match' }, { value: 'rating', label: 'Highest rated' }, { value: 'price', label: 'Lowest price' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
        toggles={[
          { key: 'available', label: 'Available now', on: f.available, set: (v) => setF({ ...f, available: v }) },
          { key: 'verified', label: 'Verified only', on: f.verified, set: (v) => setF({ ...f, verified: v }) },
          { key: 'emergency', label: 'Urgent / same-day', on: f.emergency, set: (v) => setF({ ...f, emergency: v }) },
          { key: 'active', label: 'Active in last 24h', on: f.active, set: (v) => setF({ ...f, active: v }) },
          { key: 'seasonal', label: 'Seasonal help', on: f.seasonal, set: (v) => setF({ ...f, seasonal: v }) }
        ]}
        onReset={() => setF({ ...init(), available: false, emergency: false, seasonal: false })} />
      {f.active && <p className="text-xs text-muted">“Active in last 24h” only includes providers who agreed to share activity status. In demo mode activity times are simulated.</p>}
      {loading ? <SkeletonList /> : list.length === 0 ? (
        <EmptyState title="No providers match" text="Try removing a filter, or post a request so providers can respond." action={<LinkButton to={`/service-requests/new${cat ? `?category=${cat.id}` : ''}`}>Post a request</LinkButton>} />
      ) : (
        <><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((p) => <ProviderCard key={p.id} p={p} />)}</div><LoadMore hasMore={hasMore} onMore={more} /></>
      )}
    </div>
  );
}

export function ProviderPage() {
  const { id = '' } = useParams();
  const p = useDB((s) => s.providers.find((x) => x.id === id));
  const now = useNow(60_000);
  useDocumentTitle(p?.name ?? 'Provider');
  if (!p) return <NotFound />;
  return (
    <div className="grid gap-6">
      <nav className="text-sm text-muted"><Link to="/services" className="hover:underline">Services</Link> / <Link to={`/services/${p.category}`} className="hover:underline">{serviceName(p.category)}</Link></nav>
      <section className="card grid gap-4 p-5 md:grid-cols-[auto_1fr]">
        <ImagePlaceholder seed={p.id} className="size-24 rounded-2xl" icon={<Hammer className="size-10" aria-hidden />} label={`${p.name} profile photo placeholder`} />
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-1.5"><VerificationBadge status={p.verification} />{p.demo && <DemoBadge label="Demo provider" />}{p.emergency && <Badge tone="red">Takes urgent jobs</Badge>}</div>
          <h1 className="text-2xl font-extrabold text-navy">{p.name}</h1>
          <p className="text-muted">{serviceName(p.category)} · {localityName(p.localityId)}</p>
          <Rating value={p.rating} count={p.reviewCount} size="md" />
          <p>{p.description}</p>
          <KeyValue items={[
            ['Indicative price', p.priceFrom ? `From ${formatINR(p.priceFrom)}/${p.priceUnit}` : 'Quote required'], ['Availability', <span className="capitalize" key="a">{p.availability}</span>],
            ['Experience', `${p.experienceYears} years (as supplied)`], ['Languages', p.languages.join(', ')],
            ['Last active', p.activityConsent && p.lastActiveAt ? `${isActiveWithin(p, 24, now) ? 'Within 24 hours' : 'More than a day ago'}${p.demo ? ' (simulated)' : ''}` : 'Not shared by provider']
          ]} />
          <div className="mt-2 flex flex-wrap gap-2">
            <LinkButton to={`/service-requests/new?category=${p.category}&provider=${p.id}`}>Request service</LinkButton>
            <EnquiryButton targetType="provider" targetId={p.id} targetName={p.name} ownerId={p.ownerId} variant="secondary" />
            <CallButton name={p.name} /><SaveButton type="provider" id={p.id} /><ShareButton title={p.name} />
            <ReportButton targetType="provider" targetId={p.id} title={p.name} />
          </div>
        </div>
      </section>
      <Notice tone="info" title="Fair-use rules">Prices are indicative and set by the provider. Agree the final price before work starts. Never pay large advances. Reviews must be first-hand.</Notice>
      <ReviewsSection targetType="provider" targetId={p.id} targetName={p.name} />
    </div>
  );
}

/* --------------------------- Service requests --------------------------- */

export function ServiceRequestsPage() {
  useDocumentTitle('My service requests');
  const { userId } = useSession();
  const reqs = useDB((s) => s.serviceRequests.filter((r) => r.userId === userId));
  const concierge = useDB((s) => s.concierge.filter((r) => r.userId === userId));
  return (
    <div className="grid gap-5">
      <PageHeader title="My service requests" actions={<LinkButton to="/service-requests/new" icon={<Plus className="size-4" aria-hidden />}>New request</LinkButton>} />
      {reqs.length === 0 ? <EmptyState title="No requests yet" text="Describe what you need and nearby providers can respond." action={<LinkButton to="/service-requests/new">Request a service</LinkButton>} /> : (
        <ul className="grid gap-3">
          {reqs.map((r) => (
            <li key={r.id}><Link to={`/service-requests/${r.id}`} className="card flex items-center gap-3 p-4 hover:border-brand/30">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{serviceName(r.category)}</span><span className="block truncate text-sm text-muted">{r.description}</span><span className="text-xs text-muted">{localityName(r.localityId)} · {formatDate(r.preferredDate)} · {r.responses.length} response(s)</span></span>
              <StatusPill status={r.status} />
            </Link></li>
          ))}
        </ul>
      )}
      {concierge.length > 0 && <SectionCard title="Assistance requests">{concierge.map((c) => <Link key={c.id} to="/assistance" className="flex justify-between py-2 text-sm"><span>{c.serviceType}</span><StatusPill status={c.status} /></Link>)}</SectionCard>}
    </div>
  );
}

export function NewServiceRequestPage() {
  useDocumentTitle('Request a service');
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { prefs } = useSession();
  const { toast } = useUI();
  const [f, setF] = useState({ category: params.get('category') ?? '', description: '', localityId: prefs.localityId === 'all' ? '' : prefs.localityId, preferredDate: new Date().toISOString().slice(0, 10), preferredTime: 'Morning', urgency: 'normal' as ServiceRequest['urgency'] });
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const preferred = params.get('provider');
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.category) e.category = 'Choose a service.';
    if (sanitize(f.description).length < 10) e.description = 'Describe the job in at least 10 characters.';
    if (!f.localityId) e.localityId = 'Choose a locality.';
    if (!f.preferredDate || f.preferredDate < new Date().toISOString().slice(0, 10)) e.preferredDate = 'Choose today or a future date.';
    setErrors(e);
    if (Object.keys(e).length || busy) return;
    setBusy(true);
    const id = uid('sr');
    const req: ServiceRequest = { id, userId: currentUserId()!, category: f.category, description: sanitize(f.description), localityId: f.localityId, preferredDate: f.preferredDate, preferredTime: f.preferredTime, urgency: f.urgency, photos, status: 'open', responses: [], history: [{ status: 'open', at: nowIso() }], createdAt: nowIso(), demo: true };
    repo.insert('serviceRequests', req);
    simulateResponses(id, preferred);
    toast('Request posted. Provider responses below are simulated in demo mode.');
    nav(`/service-requests/${id}`);
  };
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader title="Request a service" subtitle="Tell providers what you need. You choose who to confirm." />
      {f.urgency === 'emergency' && <Notice tone="danger" title="Is anyone in danger?">For fire, medical or police emergencies call <a href="tel:112" className="font-bold underline">112</a> now. This form is for urgent household repairs only.</Notice>}
      <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Select label="Service" required value={f.category} error={errors.category} placeholder="Choose a service" onChange={(e) => setF({ ...f, category: e.target.value })} options={SERVICE_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))} />
        <TextArea label="Describe the job" required value={f.description} error={errors.description} maxLength={1000} onChange={(e) => setF({ ...f, description: e.target.value })} hint="E.g. ‘Bathroom tap leaking, need replacement’. Don’t share your full address here." />
        <Select label="Locality" required value={f.localityId} error={errors.localityId} placeholder="Choose locality" onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Preferred date" type="date" required value={f.preferredDate} error={errors.preferredDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, preferredDate: e.target.value })} />
          <Select label="Preferred time" value={f.preferredTime} onChange={(e) => setF({ ...f, preferredTime: e.target.value })} options={['Morning', 'Afternoon', 'Evening', 'Any time']} />
        </div>
        <RadioCards label="Urgency" value={f.urgency} onChange={(urgency) => setF({ ...f, urgency })} options={[{ value: 'normal', label: 'Normal', description: 'In the next few days' }, { value: 'same_day', label: 'Same day', description: 'Today if possible' }, { value: 'emergency', label: 'Urgent', description: 'Leak, power fault, lock-out' }]} />
        <FilePicker label="Photos (optional)" value={photos} onChange={setPhotos} />
        {preferred && <p className="text-sm text-muted">Preferred provider will be notified first (simulated).</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit" loading={busy}>Submit request</Button></div>
      </form>
    </div>
  );
}

/** DEMO: adds labelled simulated responses from the top-ranked providers after a short delay. */
function simulateResponses(requestId: string, preferred: string | null) {
  setTimeout(() => {
    const req = repo.get('serviceRequests', requestId);
    if (!req || req.status !== 'open') return;
    const ranked = rankProviders(req, store.getState().providers).filter((r) => r.provider.availability !== 'offline');
    const pick = [...(preferred ? ranked.filter((r) => r.provider.id === preferred) : []), ...ranked.filter((r) => r.provider.id !== preferred)].slice(0, 2);
    if (!pick.length) return;
    repo.at('serviceRequests').mutate(requestId, (cur) => ({
      status: 'responded',
      responses: [...cur.responses, ...pick.map(({ provider: p }) => ({ providerId: p.id, providerName: p.name, message: `Simulated response: can visit ${cur.preferredTime.toLowerCase()} on ${formatDate(cur.preferredDate)}.`, quote: p.priceFrom, at: nowIso(), status: 'pending' as const }))],
      history: [...cur.history, { status: 'responded', at: nowIso(), note: 'Simulated provider responses (demo)' }]
    }));
    notify(req.userId, 'service', 'Providers responded (simulated)', `${pick.length} response(s) to your ${serviceName(req.category)} request`, `/service-requests/${requestId}`);
  }, 2500);
}

export function ServiceRequestPage() {
  const { id = '' } = useParams();
  const r = useDB((s) => s.serviceRequests.find((x) => x.id === id));
  const providers = useDB((s) => s.providers);
  const user = useCurrentUser();
  const { userId, role } = useSession();
  const { toast, confirm } = useUI();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  useDocumentTitle('Service request');
  if (!r || (r.userId !== userId && role !== 'admin' && role !== 'provider')) return <NotFound />;
  const declinedOrTaken = r.responses.map((x) => x.providerId);
  const suggestions = rankProviders(r, providers, declinedOrTaken).slice(0, 3);
  const closed = r.status === 'completed' || r.status === 'cancelled';
  const confirmed = providers.find((p) => p.id === r.confirmedProviderId);
  const setStatus = (status: ServiceRequest['status'], note?: string) => repo.at('serviceRequests').mutate(r.id, (cur) => ({ status, history: [...cur.history, { status, at: nowIso(), note }] }));

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/service-requests" className="hover:underline">My requests</Link> / {serviceName(r.category)}</nav>
      <header className="card grid gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} />{r.urgency !== 'normal' && <Badge tone="red">{r.urgency === 'emergency' ? 'Urgent' : 'Same day'}</Badge>}{r.demo && <DemoBadge label="Demo request" />}</div>
        <h1 className="text-xl font-extrabold text-navy">{serviceName(r.category)}</h1>
        <p>{r.description}</p>
        <p className="text-sm text-muted"><CalendarClock className="mr-1 inline size-4" aria-hidden />{localityName(r.localityId)} · {formatDate(r.preferredDate)} · {r.preferredTime}{r.photos.length ? ` · ${r.photos.length} photo(s)` : ''}</p>
      </header>

      <Notice tone="demo">Demo mode: no real provider has been contacted. Responses marked “simulated” are generated from sample data.</Notice>

      {confirmed && (
        <SectionCard title="Confirmed provider">
          <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/service-providers/${confirmed.id}`} className="font-semibold text-navy">{confirmed.name}</Link><Rating value={confirmed.rating} /></div>
          {!closed && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status === 'confirmed' && <Button variant="secondary" onClick={() => { setStatus('in_progress'); toast('Marked as in progress'); }}>Mark work started</Button>}
              <Button variant="teal" icon={<CheckCircle2 className="size-4" aria-hidden />} onClick={async () => { if (await confirm({ title: 'Mark job complete?', message: 'Only confirm when the work is done to your satisfaction.' })) { setStatus('completed'); toast('Job completed — please leave a review'); setReviewOpen(true); } }}>Mark complete</Button>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title={`Responses (${r.responses.length})`}>
        {r.responses.length === 0 ? <p className="text-sm text-muted">Waiting for providers… (in demo mode, simulated responses appear within a few seconds).</p> : (
          <ul className="grid gap-3">
            {r.responses.map((resp) => (
              <li key={resp.providerId} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/service-providers/${resp.providerId}`} className="font-semibold">{resp.providerName}</Link><StatusPill status={resp.status} /></div>
                <p className="text-sm">{resp.message}</p>
                <p className="text-xs text-muted">{resp.quote ? `Quote: ${formatINR(resp.quote)} (indicative)` : 'Quote on inspection'} · {timeAgo(resp.at)}</p>
                {resp.status === 'pending' && !r.confirmedProviderId && !closed && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => {
                      try { repo.patch('serviceRequests', r.id, confirmProvider(r, resp.providerId, nowIso())); toast(`${resp.providerName} confirmed (demo)`); }
                      catch (e) { toast((e as Error).message, 'error'); }
                    }}>Confirm this provider</Button>
                    <Button size="sm" variant="secondary" onClick={() => { repo.at('serviceRequests').mutate(r.id, (cur) => ({ responses: cur.responses.map((x) => (x.providerId === resp.providerId ? { ...x, status: 'declined' as const } : x)) })); toast('Response declined'); }}>Decline</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {!r.confirmedProviderId && !closed && (
        <SectionCard title="Suggested providers">
          <p className="mb-3 text-sm text-muted">Ranked by availability, verification, rating, same locality and urgent-job capability. Distance isn’t used because exact locations aren’t stored.</p>
          {suggestions.length === 0 ? <p className="text-sm text-muted">No more matching providers. Try One Bhilwara Assistance.</p> : (
            <ul className="grid gap-2">
              {suggestions.map(({ provider: p, reasons, score }, i) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                  <span className="grid size-8 place-items-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1"><Link to={`/service-providers/${p.id}`} className="font-semibold">{p.name}</Link><span className="block text-xs text-muted">{reasons.join(' · ')} · score {score}</span></span>
                  <Button size="sm" variant="secondary" onClick={() => {
                    repo.at('serviceRequests').mutate(r.id, (cur) => ({ status: 'responded', responses: [...cur.responses, { providerId: p.id, providerName: p.name, message: 'Simulated: invited by you and accepted the enquiry.', quote: p.priceFrom, at: nowIso(), status: 'pending' }] }));
                    toast(`Invited ${p.name} (simulated)`);
                  }}>Invite (demo)</Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <SectionCard title="Status history">
        <ol className="grid gap-2 border-l-2 border-line pl-4">
          {r.history.map((h, i) => <li key={i} className="text-sm"><span className="font-semibold capitalize">{h.status.replace('_', ' ')}</span> · <span className="text-muted">{formatDateTime(h.at)}</span>{h.note && <span className="block text-xs text-muted">{h.note}</span>}</li>)}
        </ol>
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        {!closed && <Button variant="secondary" onClick={async () => { if (await confirm({ title: 'Cancel request?', message: 'Providers will see it as cancelled.', danger: true, confirmLabel: 'Cancel request' })) { setStatus('cancelled'); toast('Request cancelled'); } }}>Cancel request</Button>}
        {r.status === 'completed' && !r.reviewed && <Button onClick={() => setReviewOpen(true)}>Rate & review</Button>}
        {confirmed && <ReportButton kind="complaint" targetType="provider" targetId={confirmed.id} title={`${confirmed.name} — request ${r.id}`} label="Raise a complaint" />}
      </div>

      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Rate this service" description={confirmed?.name}
        footer={<><Button variant="secondary" onClick={() => setReviewOpen(false)}>Later</Button><Button onClick={() => {
          if (!rating || text.trim().length < 10) { toast('Add a rating and at least 10 characters.', 'error'); return; }
          repo.insert('reviews', { id: uid('r'), targetType: 'provider', targetId: r.confirmedProviderId!, userId: userId!, userName: user?.name ?? 'User', rating, text: sanitize(text, 1500), verifiedTransaction: false, createdAt: nowIso(), demo: true });
          repo.patch('serviceRequests', r.id, { reviewed: true });
          setReviewOpen(false); toast('Thanks for your review');
        }}>Submit review</Button></>}>
        <div className="grid gap-3"><StarInput value={rating} onChange={setRating} /><TextArea label="Your review" value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-xs text-muted">The “verified transaction” label is only shown for jobs paid through a real payment integration — not for demo requests.</p></div>
      </Dialog>
    </div>
  );
}

/* --------------------------- Concierge --------------------------- */

export function AssistancePage() {
  useDocumentTitle('One Bhilwara Assistance');
  const { userId } = useSession();
  const { prefs } = useSession();
  const fee = useDB((s) => s.settings.fees.conciergeFee);
  const mine = useDB((s) => s.concierge.filter((c) => c.userId === userId));
  const providers = useDB((s) => s.providers);
  const guard = useRequireAuth();
  const { toast, confirm } = useUI();
  const [f, setF] = useState({ serviceType: '', localityId: prefs.localityId === 'all' ? '' : prefs.localityId, preferredTime: '', budget: '', notes: '' });
  const [feeOk, setFeeOk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = () => guard(() => {
    const e: Record<string, string> = {};
    if (sanitize(f.serviceType).length < 3) e.serviceType = 'What do you need help with?';
    if (!f.localityId) e.localityId = 'Choose a locality.';
    if (!f.preferredTime) e.preferredTime = 'Choose a preferred date.';
    if (!(Number(f.budget) > 0)) e.budget = 'Enter an approximate budget in ₹.';
    if (!feeOk) e.fee = 'Please accept the assistance fee to continue.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const c: ConciergeRequest = { id: uid('cr'), userId: userId!, serviceType: sanitize(f.serviceType, 120), localityId: f.localityId, preferredTime: f.preferredTime, budget: Number(f.budget), notes: sanitize(f.notes, 1000), feeAccepted: true, status: 'received', suggestions: [], history: [{ status: 'received', at: nowIso() }], createdAt: nowIso(), demo: true };
    repo.insert('concierge', c);
    setTimeout(() => {
      const top = providers.filter((p) => `${p.name} ${p.description} ${serviceName(p.category)}`.toLowerCase().split(/\W+/).some((w) => w.length > 3 && c.serviceType.toLowerCase().includes(w))).slice(0, 3).map((p) => p.id);
      repo.at('concierge').mutate(c.id, (cur) => ({ status: 'coordinator_assigned', coordinator: 'Coordinator (Demo)', suggestions: top, history: [...cur.history, { status: 'coordinator_assigned', at: nowIso(), note: 'Simulated assignment — no real coordinator in demo' }] }));
    }, 2000);
    setF({ serviceType: '', localityId: f.localityId, preferredTime: '', budget: '', notes: '' }); setFeeOk(false);
    toast('Assistance request received (demo)');
  });
  return (
    <div className="grid gap-5">
      <PageHeader title="One Bhilwara Assistance" subtitle="Don’t want to coordinate yourself? A coordinator arranges suitable providers for you." badge={<DemoBadge label="Demo service" />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <TextField label="What do you need?" required value={f.serviceType} error={errors.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value })} placeholder="e.g. Deep cleaning for 3 BHK before Diwali" />
          <Select label="Locality" required value={f.localityId} error={errors.localityId} placeholder="Choose" onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Preferred date" type="date" required value={f.preferredTime} error={errors.preferredTime} onChange={(e) => setF({ ...f, preferredTime: e.target.value })} />
            <TextField label="Budget (₹)" inputMode="numeric" required value={f.budget} error={errors.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} />
          </div>
          <TextArea label="Additional notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <div className="rounded-lg bg-amber-50 p-3 text-sm">
            <p className="font-semibold">Assistance fee: {formatINR(fee)} (configurable)</p>
            <p className="text-muted">Charged only after a coordinator shares options, in a live deployment. Provider charges are separate and paid to the provider. In this demo nothing is charged.</p>
            <div className="mt-2"><Checkbox checked={feeOk} onChange={setFeeOk} label="I understand and accept the assistance fee." /></div>
            {errors.fee && <p className="mt-1 text-xs font-medium text-danger" role="alert">{errors.fee}</p>}
          </div>
          <Button type="submit">Request assistance</Button>
        </form>
        <section className="grid content-start gap-3">
          <h2 className="text-lg font-bold text-navy">Your assistance requests</h2>
          {mine.length === 0 ? <EmptyState title="No requests yet" text="Submitted requests and their status appear here." /> : mine.map((c) => (
            <article key={c.id} className="card grid gap-2 p-4">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{c.serviceType}</p><StatusPill status={c.status} /></div>
              <p className="text-sm text-muted">{localityName(c.localityId)} · {c.preferredTime} · Budget {formatINR(c.budget)}</p>
              {c.coordinator && <p className="text-sm"><UserCheck className="mr-1 inline size-4 text-teal" aria-hidden />Coordinator: {c.coordinator}</p>}
              {c.suggestions.length > 0 && <div className="text-sm"><p className="font-semibold">Suggested providers</p><ul className="list-disc pl-5">{c.suggestions.map((id) => <li key={id}><Link className="text-navy underline" to={`/service-providers/${id}`}>{providers.find((p) => p.id === id)?.name}</Link></li>)}</ul></div>}
              <ol className="border-l-2 border-line pl-3 text-xs text-muted">{c.history.map((h, i) => <li key={i}>{h.status.replace(/_/g, ' ')} · {formatDateTime(h.at)}{h.note ? ` — ${h.note}` : ''}</li>)}</ol>
              <div className="flex flex-wrap gap-2">
                {!['closed', 'cancelled'].includes(c.status) && <Button size="sm" variant="secondary" onClick={async () => { if (await confirm({ title: 'Cancel assistance?', message: 'No fee applies in demo mode.', danger: true })) { repo.at('concierge').mutate(c.id, (cur) => ({ status: 'cancelled', history: [...cur.history, { status: 'cancelled', at: nowIso() }] })); toast('Cancelled'); } }}>Cancel</Button>}
                <ReportButton kind="complaint" targetType="concierge" targetId={c.id} title={c.serviceType} label="Complaint" />
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

/* --------------------------- Provider dashboard --------------------------- */

export function ProviderDashboardPage() {
  useDocumentTitle('Provider dashboard');
  const { userId } = useSession();
  const providers = useDB((s) => s.providers);
  const me: Provider = providers.find((p) => p.ownerId === userId) ?? providers.find((p) => p.ownerId === 'u-5')!;
  const requests = useDB((s) => s.serviceRequests.filter((r) => r.category === me.category && r.status !== 'cancelled'));
  const reviews = useDB((s) => s.reviews.filter((r) => r.targetType === 'provider' && r.targetId === me.id));
  const [tab, setTab] = useState<'open' | 'mine' | 'reviews'>('open');
  const [respond, setRespond] = useState<ServiceRequest | null>(null);
  const [msg, setMsg] = useState('');
  const [quote, setQuote] = useState('');
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const { toast } = useUI();
  const open = requests.filter((r) => !r.confirmedProviderId && !r.responses.some((x) => x.providerId === me.id) && ['open', 'responded'].includes(r.status));
  const mine = requests.filter((r) => r.responses.some((x) => x.providerId === me.id));
  return (
    <div className="grid gap-5">
      <PageHeader title="Provider dashboard" subtitle={`${me.name} · ${serviceName(me.category)}`} badge={<DemoBadge label="Demo provider profile" />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-sm text-muted">Availability</p>
          <select aria-label="Availability" className="input mt-1" value={me.availability} onChange={(e) => { repo.patch('providers', me.id, { availability: e.target.value as Provider['availability'], lastActiveAt: nowIso() }); toast('Availability updated'); }}>
            <option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option>
          </select></div>
        <div className="card p-4"><p className="text-sm text-muted">Open requests in your category</p><p className="text-2xl font-bold text-navy">{open.length}</p></div>
        <div className="card p-4"><p className="text-sm text-muted">Rating</p><Rating value={me.rating} count={me.reviewCount} size="md" /></div>
      </div>
      <Tabs label="Dashboard" value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Open requests', count: open.length }, { id: 'mine', label: 'My jobs', count: mine.length }, { id: 'reviews', label: 'Reviews', count: reviews.length }]} />
      {tab === 'open' && (open.length === 0 ? <EmptyState title="No open requests" text="New requests in your category will appear here." /> : (
        <ul className="grid gap-3">{open.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} />{r.urgency !== 'normal' && <Badge tone="red">{r.urgency === 'emergency' ? 'Urgent' : 'Same day'}</Badge>}<span className="text-xs text-muted">{timeAgo(r.createdAt)}</span></div>
            <p className="mt-1">{r.description}</p>
            <p className="text-sm text-muted">{localityName(r.localityId)} · {formatDate(r.preferredDate)} {r.preferredTime} · {r.responses.length} other response(s)</p>
            <Button size="sm" className="mt-2" onClick={() => { setRespond(r); setMsg(''); setQuote(me.priceFrom ? String(me.priceFrom) : ''); }}>Respond / claim</Button>
          </li>))}
        </ul>
      ))}
      {tab === 'mine' && (mine.length === 0 ? <EmptyState title="No jobs yet" /> : (
        <ul className="grid gap-3">{mine.map((r) => {
          const myResp = r.responses.find((x) => x.providerId === me.id)!;
          const lost = !!r.confirmedProviderId && r.confirmedProviderId !== me.id;
          return (
            <li key={r.id} className="card p-4">
              <div className="flex items-center justify-between"><p className="font-semibold">{r.description}</p><StatusPill status={lost ? 'not selected' : r.confirmedProviderId === me.id ? r.status : myResp.status} /></div>
              <p className="text-sm text-muted">{localityName(r.localityId)} · {formatDate(r.preferredDate)}</p>
              {r.confirmedProviderId === me.id && r.status === 'confirmed' && <Button size="sm" className="mt-2" onClick={() => { repo.at('serviceRequests').mutate(r.id, (cur) => ({ status: 'in_progress', history: [...cur.history, { status: 'in_progress', at: nowIso(), note: 'Provider started work' }] })); toast('Marked in progress'); }}>Start job</Button>}
              {myResp.status === 'pending' && !r.confirmedProviderId && <Button size="sm" variant="secondary" className="mt-2" onClick={() => { repo.at('serviceRequests').mutate(r.id, (cur) => ({ responses: cur.responses.map((x) => (x.providerId === me.id ? { ...x, status: 'withdrawn' as const } : x)) })); toast('Response withdrawn'); }}>Withdraw</Button>}
            </li>
          );
        })}</ul>
      ))}
      {tab === 'reviews' && (reviews.length === 0 ? <EmptyState title="No reviews yet" /> : (
        <ul className="grid gap-3">{reviews.map((rv) => (
          <li key={rv.id} className="card p-4">
            <div className="flex justify-between"><p className="font-semibold">{rv.userName}</p><Rating value={rv.rating} /></div><p className="text-sm">{rv.text}</p>
            {rv.reply ? <p className="mt-2 rounded bg-page p-2 text-sm">Your reply: {rv.reply.text}</p> : (
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = sanitize(replyText[rv.id] ?? '', 500); if (t.length < 2) return; repo.patch('reviews', rv.id, { reply: { text: t, at: nowIso() } }); toast('Reply posted'); }}>
                <input aria-label="Reply" className="input" placeholder="Reply publicly and politely" value={replyText[rv.id] ?? ''} onChange={(e) => setReplyText({ ...replyText, [rv.id]: e.target.value })} />
                <Button type="submit">Reply</Button>
              </form>
            )}
          </li>))}
        </ul>
      ))}
      <Dialog open={!!respond} onClose={() => setRespond(null)} title="Respond to request" description={respond?.description}
        footer={<><Button variant="secondary" onClick={() => setRespond(null)}>Cancel</Button><Button onClick={() => {
          const cur = respond && repo.get('serviceRequests', respond.id);
          if (!cur) return;
          if (cur.confirmedProviderId) { toast('Another provider has already been confirmed for this request.', 'error'); setRespond(null); return; }
          if (sanitize(msg).length < 5) { toast('Add a short message.', 'error'); return; }
          repo.at('serviceRequests').mutate(cur.id, (c) => ({ status: 'responded', responses: [...c.responses, { providerId: me.id, providerName: me.name, message: sanitize(msg, 500), quote: Number(quote) || undefined, at: nowIso(), status: 'pending' }], history: [...c.history, { status: 'responded', at: nowIso(), note: `${me.name} responded` }] }));
          notify(cur.userId, 'service', 'New provider response', `${me.name} responded to your request`, `/service-requests/${cur.id}`);
          setRespond(null); toast('Response sent. The customer decides whom to confirm.');
        }}>Send response</Button></>}>
        <div className="grid gap-3">
          <TextArea label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <TextField label="Quote (₹, optional)" inputMode="numeric" value={quote} onChange={(e) => setQuote(e.target.value.replace(/\D/g, ''))} />
          <p className="text-xs text-muted">Only one provider can be confirmed per request. If the customer confirms someone else, your response is closed automatically.</p>
        </div>
      </Dialog>
    </div>
  );
}

/* --------------------------- Contractor & labour --------------------------- */

export function LabourPage() {
  useDocumentTitle('Contractor & labour connect');
  const [tab, setTab] = useState<'worker' | 'contractor'>('worker');
  const posts = useDB((s) => s.labour);
  const user = useCurrentUser();
  const { userId } = useSession();
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [interest, setInterest] = useState<LabourPost | null>(null);
  const [avail, setAvail] = useState('');
  const [form, setForm] = useState({ title: '', skill: 'Mason', workers: '2', wage: '', wageUnit: 'day' as LabourPost['wageUnit'], localityId: '', duration: '', startDate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mine = posts.filter((p) => p.contractorId === userId);
  const myApps = posts.filter((p) => p.interests.some((i) => i.userId === userId));
  return (
    <div className="grid gap-5">
      <PageHeader title="Contractor & labour connect" subtitle="Skilled and unskilled work, posted by contractors. Wages are as offered by the contractor." />
      <Notice tone="warning" title="Safety first">Never pay to get work. Confirm the site, wage and duration in writing. Use safety gear on construction sites. Report anything suspicious — reports go to moderators.</Notice>
      <Tabs label="View" value={tab} onChange={setTab} tabs={[{ id: 'worker', label: 'Find work' }, { id: 'contractor', label: 'Contractor dashboard' }]} />
      {tab === 'worker' ? (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {posts.filter((p) => p.status === 'open').map((p) => {
              const applied = p.interests.find((i) => i.userId === userId);
              return (
                <li key={p.id} className="card p-4">
                  <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{p.skill}</Badge>{p.demo && <DemoBadge />}</div>
                  <p className="mt-1 font-bold">{p.title}</p>
                  <p className="text-sm text-muted">{p.contractorName} · {localityName(p.localityId)}</p>
                  <KeyValue items={[['Wage offered', `${formatINR(p.wage)}/${p.wageUnit}`], ['Workers needed', String(p.workers)], ['Duration', p.duration], ['Starts', formatDate(p.startDate)]]} />
                  <div className="mt-3 flex gap-2">
                    {applied ? <StatusPill status={applied.status} /> : <Button size="sm" onClick={() => guard(() => { setInterest(p); setAvail(''); })}>I’m interested</Button>}
                    <ReportButton targetType="labour" targetId={p.id} title={p.title} compact />
                  </div>
                </li>
              );
            })}
          </ul>
          {myApps.length > 0 && <SectionCard title="My applications">{myApps.map((p) => <div key={p.id} className="flex justify-between py-1.5 text-sm"><span>{p.title}</span><StatusPill status={p.interests.find((i) => i.userId === userId)!.status} /></div>)}</SectionCard>}
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <form className="card grid gap-3 p-4" noValidate onSubmit={(e) => {
            e.preventDefault();
            guard(() => {
              const er: Record<string, string> = {};
              if (sanitize(form.title).length < 5) er.title = 'Add a clear title.';
              if (!(Number(form.wage) > 0)) er.wage = 'Enter the wage you will pay.';
              if (!form.localityId) er.localityId = 'Choose a site locality.';
              if (!form.startDate) er.startDate = 'Choose a start date.';
              setErrors(er);
              if (Object.keys(er).length) return;
              repo.insert('labour', { id: uid('l'), contractorId: userId!, contractorName: user!.name, title: sanitize(form.title, 120), skill: form.skill, workers: Number(form.workers) || 1, wage: Number(form.wage), wageUnit: form.wageUnit, localityId: form.localityId, duration: sanitize(form.duration, 60) || 'Not specified', startDate: form.startDate, interests: [], status: 'open', createdAt: nowIso(), demo: true });
              toast('Requirement posted'); setForm({ ...form, title: '', wage: '', duration: '' });
            });
          }}>
            <h2 className="font-bold text-navy">Post a requirement</h2>
            <TextField label="Title" required value={form.title} error={errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Skill" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} options={['Mason', 'Helper', 'Carpenter', 'Painter', 'Electrician', 'Plumber', 'Event staff', 'Loader']} />
              <TextField label="Workers" inputMode="numeric" value={form.workers} onChange={(e) => setForm({ ...form, workers: e.target.value.replace(/\D/g, '') })} />
              <TextField label="Wage (₹)" required inputMode="numeric" value={form.wage} error={errors.wage} onChange={(e) => setForm({ ...form, wage: e.target.value.replace(/\D/g, '') })} />
              <Select label="Per" value={form.wageUnit} onChange={(e) => setForm({ ...form, wageUnit: e.target.value as LabourPost['wageUnit'] })} options={[{ value: 'day', label: 'Day' }, { value: 'job', label: 'Whole job' }]} />
            </div>
            <Select label="Site locality" required value={form.localityId} error={errors.localityId} placeholder="Choose" onChange={(e) => setForm({ ...form, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Duration" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 2 weeks" />
              <TextField label="Start date" type="date" required value={form.startDate} error={errors.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <Button type="submit">Post requirement</Button>
          </form>
          <section className="grid content-start gap-3">
            <h2 className="font-bold text-navy">Your postings</h2>
            {mine.length === 0 ? <EmptyState icon={<Users className="size-6" aria-hidden />} title="No postings yet" text="Post a requirement to receive interest from workers." /> : mine.map((p) => (
              <article key={p.id} className="card p-4">
                <div className="flex items-center justify-between"><p className="font-semibold">{p.title}</p><StatusPill status={p.status} /></div>
                <p className="text-sm text-muted">{p.interests.length} interested · {formatINR(p.wage)}/{p.wageUnit}</p>
                <ul className="mt-2 grid gap-2">{p.interests.map((i) => (
                  <li key={i.userId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2 text-sm">
                    <span>{i.name} · {i.availability}</span>
                    {i.status === 'interested' ? <span className="flex gap-1">
                      <Button size="sm" onClick={() => { repo.at('labour').mutate(p.id, (c) => ({ interests: c.interests.map((x) => (x.userId === i.userId ? { ...x, status: 'accepted' as const } : x)) })); notify(i.userId, 'job', 'Work offer accepted', p.title, '/labour'); toast('Accepted'); }}>Accept</Button>
                      <Button size="sm" variant="secondary" onClick={() => { repo.at('labour').mutate(p.id, (c) => ({ interests: c.interests.map((x) => (x.userId === i.userId ? { ...x, status: 'declined' as const } : x)) })); toast('Declined'); }}>Decline</Button>
                    </span> : <StatusPill status={i.status} />}
                  </li>
                ))}</ul>
                {p.status === 'open' && <Button size="sm" variant="ghost" className="mt-2" onClick={() => { repo.patch('labour', p.id, { status: 'filled' }); toast('Marked as filled'); }}>Mark filled</Button>}
              </article>
            ))}
          </section>
        </div>
      )}
      <Dialog open={!!interest} onClose={() => setInterest(null)} title="Express interest" description={interest?.title}
        footer={<><Button variant="secondary" onClick={() => setInterest(null)}>Cancel</Button><Button onClick={() => {
          if (!avail.trim()) { toast('Tell the contractor when you are available.', 'error'); return; }
          repo.at('labour').mutate(interest!.id, (c) => ({ interests: [...c.interests, { userId: userId!, name: user!.name, availability: sanitize(avail, 100), at: nowIso(), status: 'interested' }] }));
          setInterest(null); toast('Interest sent (demo)');
        }}>Send</Button></>}>
        <TextField label="Your availability" value={avail} onChange={(e) => setAvail(e.target.value)} placeholder="e.g. From Monday, full days" />
        <p className="mt-2 text-xs text-muted">Your name is shared with the contractor. Your phone number is shared only if you choose to in your profile privacy settings.</p>
      </Dialog>
    </div>
  );
}

