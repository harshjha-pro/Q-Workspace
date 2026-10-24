import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BedDouble, Building, Check, GraduationCap, House, Plus, Utensils } from 'lucide-react';
import type { Property, StudentDetails } from '@/types/models';
import { localityName, PROPERTY_CATEGORIES } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { actorIds, sanitize } from '@/services/domain/common';
import { repo } from '@/services/store';
import { PropertyCard } from '@/components/cards';
import { CallButton, DirectionsButton, EnquiryButton, FilterBar, LoadMore, LOCALITY_OPTIONS, ReportButton, SaveButton, SectionCard, ShareButton, usePaged } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, ImagePlaceholder, KeyValue, LinkButton, Notice, PageHeader, SkeletonList, Stat, StatusPill, VerificationBadge } from '@/components/ui/primitives';
import { Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, FilePicker, Select, TextArea, TextField, Toggle } from '@/components/ui/form';
import { formatDate, formatINR, formatINRShort, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';
import { EnquiryInbox } from '@/components/inbox';

const STUDENT_CATS = ['PG', 'Hostel', 'Student room', 'Shared accommodation'];

export function PropertyPage() {
  useDocumentTitle('Property & rentals');
  const [params] = useSearchParams();
  const loading = useLoading();
  const all = useDB((s) => s.properties.filter((p) => p.status === 'active'));
  const init = () => ({ q: '', values: { type: params.get('type') ?? '', category: '', locality: '', budget: '', beds: '', furnishing: '' } as Record<string, string>, sort: 'newest', verified: false, available: false });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = all.filter((p) => (!f.values.type || p.listingType === f.values.type) && (!f.values.category || p.category === f.values.category) && (!f.values.locality || p.localityId === f.values.locality) && (!f.values.furnishing || p.furnishing === f.values.furnishing));
    if (f.q) l = l.filter((p) => `${p.title} ${p.description} ${p.amenities.join(' ')}`.toLowerCase().includes(f.q.toLowerCase()));
    if (f.values.budget) l = l.filter((p) => p.price <= Number(f.values.budget));
    if (f.values.beds) l = l.filter((p) => (p.bedrooms ?? 0) >= Number(f.values.beds));
    if (f.verified) l = l.filter((p) => p.verification === 'verified');
    if (f.available) l = l.filter((p) => p.available);
    return [...l].sort((a, b) => f.sort === 'price_asc' ? a.price - b.price : f.sort === 'price_desc' ? b.price - a.price : b.createdAt.localeCompare(a.createdAt));
  }, [all, f]);
  const { visible, hasMore, more } = usePaged(list, 9);
  return (
    <div className="grid gap-5">
      <PageHeader title="Property & rentals" subtitle="Homes, shops, offices, plots, PGs and student rooms."
        actions={<><LinkButton variant="secondary" to="/property/students" icon={<GraduationCap className="size-4" aria-hidden />}>Student stays</LinkButton><LinkButton to="/property/new" icon={<Plus className="size-4" aria-hidden />}>List property</LinkButton></>} />
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Search by title, amenity…" count={list.length}
        filters={[{ key: 'type', label: 'Buy/Rent', options: [{ value: 'rent', label: 'Rent' }, { value: 'sale', label: 'Buy' }] }, { key: 'category', label: 'Type', options: PROPERTY_CATEGORIES }, { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS },
          { key: 'budget', label: 'Budget', options: [{ value: '5000', label: 'Up to ₹5,000' }, { value: '10000', label: 'Up to ₹10,000' }, { value: '25000', label: 'Up to ₹25,000' }, { value: '3000000', label: 'Up to ₹30 L' }, { value: '7500000', label: 'Up to ₹75 L' }] },
          { key: 'beds', label: 'Bedrooms', options: [{ value: '1', label: '1+' }, { value: '2', label: '2+' }, { value: '3', label: '3+' }] }, { key: 'furnishing', label: 'Furnishing', options: [{ value: 'furnished', label: 'Furnished' }, { value: 'semi', label: 'Semi-furnished' }, { value: 'unfurnished', label: 'Unfurnished' }] }]}
        values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        sorts={[{ value: 'newest', label: 'Newest' }, { value: 'price_asc', label: 'Price: low–high' }, { value: 'price_desc', label: 'Price: high–low' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
        toggles={[{ key: 'v', label: 'Verified', on: f.verified, set: (v) => setF({ ...f, verified: v }) }, { key: 'a', label: 'Available now', on: f.available, set: (v) => setF({ ...f, available: v }) }]}
        onReset={() => setF({ ...init(), values: { type: '', category: '', locality: '', budget: '', beds: '', furnishing: '' } })} />
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState icon={<House className="size-6" aria-hidden />} title="No properties match" text="Try a wider budget or another locality." action={<LinkButton variant="secondary" to="/property/new">List your property</LinkButton>} /> : (
        <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map((p) => <PropertyCard key={p.id} p={p} />)}</div><LoadMore hasMore={hasMore} onMore={more} /></>
      )}
    </div>
  );
}

export function StudentStaysPage() {
  useDocumentTitle('Student accommodation');
  const all = useDB((s) => s.properties.filter((p) => p.status === 'active' && p.student));
  const [f, setF] = useState({ cat: '', meals: false, furnished: false, max: '', occupancy: '', available: true });
  const list = all.filter((p) => (!f.cat || p.category === f.cat) && (!f.meals || p.student!.meals) && (!f.furnished || p.furnishing === 'furnished') && (!f.max || p.price <= Number(f.max)) && (!f.occupancy || p.student!.occupancy === f.occupancy) && (!f.available || p.available));
  return (
    <div className="grid gap-5">
      <PageHeader title="Student accommodation" subtitle="PGs, hostels, rooms and shared flats — including near medical and other colleges." />
      <Notice tone="info">Distances to institutions are shown only when the owner supplies them and are approximate. Visit before paying a deposit and get a written receipt.</Notice>
      <div className="card grid gap-3 p-3">
        <div className="scroll-x">{['', ...STUDENT_CATS].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={f.cat === c} onClick={() => setF({ ...f, cat: c })}>{c || 'All'}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="chip" aria-pressed={f.meals} onClick={() => setF({ ...f, meals: !f.meals })}><Utensils className="size-4" aria-hidden />Meals included</button>
          <button type="button" className="chip" aria-pressed={f.furnished} onClick={() => setF({ ...f, furnished: !f.furnished })}>Furnished</button>
          <button type="button" className="chip" aria-pressed={f.available} onClick={() => setF({ ...f, available: !f.available })}>Available now</button>
          <select aria-label="Occupancy" className="input min-h-9 w-auto text-sm" value={f.occupancy} onChange={(e) => setF({ ...f, occupancy: e.target.value })}><option value="">Any room</option><option value="single">Single</option><option value="shared">Shared</option></select>
          <select aria-label="Maximum rent" className="input min-h-9 w-auto text-sm" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })}><option value="">Any rent</option><option value="4000">Up to ₹4,000</option><option value="6000">Up to ₹6,000</option><option value="8000">Up to ₹8,000</option></select>
          <Button variant="ghost" size="sm" onClick={() => setF({ cat: '', meals: false, furnished: false, max: '', occupancy: '', available: false })}>Reset</Button>
          <span className="ml-auto text-sm text-muted">{list.length} results</span>
        </div>
      </div>
      {list.length === 0 ? <EmptyState title="No stays match" text="Loosen a filter or check back soon." /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((p) => (
            <li key={p.id} className="card flex gap-3 p-3">
              <ImagePlaceholder seed={p.id} className="size-24 shrink-0 rounded-lg" icon={<BedDouble className="size-7" aria-hidden />} label="Room photo placeholder" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{p.category}</Badge>{p.student!.restriction && p.student!.restriction !== 'none' && <Badge tone="violet">{p.student!.restriction === 'women_only' ? 'Women only (as stated by provider)' : 'Men only (as stated by provider)'}</Badge>}<VerificationBadge status={p.verification} compact /></div>
                <Link to={`/property/${p.id}`} className="mt-0.5 block font-bold hover:text-navy">{p.title}</Link>
                <p className="text-sm text-muted">{localityName(p.localityId)}{p.student!.nearInstitution ? ` · ${p.student!.nearInstitution}` : ''}</p>
                <p className="text-sm"><span className="font-bold text-navy">{formatINR(p.price)}/mo</span> · Deposit {formatINR(p.student!.deposit)} · {p.student!.meals ? 'Meals' : 'No meals'} · {p.student!.occupancy}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PropertyDetailPage() {
  const { id = '' } = useParams();
  const p = useDB((s) => s.properties.find((x) => x.id === id));
  useEffect(() => { if (p) repo.at('properties').mutate(p.id, (c) => ({ views: c.views + 1 })); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useDocumentTitle(p?.title ?? 'Property');
  if (!p || p.status === 'removed') return <NotFound />;
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <nav className="text-sm text-muted"><Link to="/property" className="hover:underline">Property</Link> / {p.category}</nav>
      <div className="grid grid-cols-4 gap-2">
        <ImagePlaceholder seed={p.id} className="col-span-4 h-56 rounded-2xl sm:col-span-2 sm:row-span-2 sm:h-full" icon={<Building className="size-12" aria-hidden />} label="Main photo placeholder" />
        {Array.from({ length: Math.min(4, p.photos) }, (_, i) => <ImagePlaceholder key={i} seed={p.id + i} className="hidden h-28 rounded-xl sm:grid" label={`Photo ${i + 2} placeholder`} />)}
      </div>
      <header className="card grid gap-3 p-5">
        <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{p.listingType === 'sale' ? 'For sale' : 'For rent'}</Badge><VerificationBadge status={p.verification} />{!p.available && <Badge tone="red">Not available</Badge>}{p.demo && <DemoBadge label="Demo listing" />}</div>
        <h1 className="text-2xl font-extrabold text-navy">{p.title}</h1>
        <p className="text-2xl font-bold">{p.listingType === 'sale' ? formatINRShort(p.price) : `${formatINR(p.price)}/month`}</p>
        <KeyValue items={[['Type', p.category], ['Locality', localityName(p.localityId)], p.areaSqft !== undefined && ['Area', `${p.areaSqft.toLocaleString('en-IN')} sq ft`], p.bedrooms !== undefined && ['Bedrooms', String(p.bedrooms)], p.bathrooms !== undefined && ['Bathrooms', String(p.bathrooms)], ['Furnishing', p.furnishing], ['Listed by', `${p.ownerName} (${p.ownerType})`], ['Listed', formatDate(p.createdAt)]]} />
        <div className="flex flex-wrap gap-2">
          <EnquiryButton targetType="property" targetId={p.id} targetName={p.title} ownerId={p.ownerId} purpose="So the owner/agent can answer your question or arrange a visit." />
          <CallButton name={p.ownerName} /><DirectionsButton query={`${localityName(p.localityId)}, Bhilwara`} /><SaveButton type="property" id={p.id} /><ShareButton title={p.title} /><ReportButton targetType="property" targetId={p.id} title={p.title} />
        </div>
        <p className="text-xs text-muted">Map link opens the locality only — exact addresses are shared by the owner after you enquire.</p>
      </header>
      <SectionCard title="Description"><p>{p.description}</p></SectionCard>
      {p.amenities.length > 0 && <SectionCard title="Amenities"><ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{p.amenities.map((a) => <li key={a} className="flex items-center gap-2 text-sm"><Check className="size-4 text-teal" aria-hidden />{a}</li>)}</ul></SectionCard>}
      {p.student && (
        <SectionCard title="Student stay details">
          <KeyValue items={[['Meals', p.student.meals ? 'Included' : 'Not included'], ['Deposit', formatINR(p.student.deposit)], ['Room', p.student.occupancy], p.student.nearInstitution && ['Near', p.student.nearInstitution], p.student.restriction && p.student.restriction !== 'none' && ['Occupancy rule', `${p.student.restriction === 'women_only' ? 'Women only' : 'Men only'} — as stated by the provider`]]} />
          <p className="mt-3 text-sm font-semibold">House rules</p><ul className="list-disc pl-5 text-sm">{p.student.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        </SectionCard>
      )}
      <Notice tone="warning" title="Avoid rental scams">Never pay a token or deposit before visiting. Verify ownership documents. One Bhilwara doesn’t hold deposits.</Notice>
    </div>
  );
}

export function PropertyFormPage() {
  const { id } = useParams();
  const existing = useDB((s) => (id ? s.properties.find((p) => p.id === id) : undefined));
  const user = useCurrentUser();
  const { userId, role } = useSession();
  const nav = useNavigate();
  const { toast } = useUI();
  useDocumentTitle(existing ? 'Edit property' : 'List property');
  const [f, setF] = useState({
    title: existing?.title ?? '', listingType: existing?.listingType ?? 'rent' as Property['listingType'], category: existing?.category ?? 'Residential', price: String(existing?.price ?? ''), localityId: existing?.localityId ?? '',
    areaSqft: String(existing?.areaSqft ?? ''), bedrooms: String(existing?.bedrooms ?? ''), bathrooms: String(existing?.bathrooms ?? ''), furnishing: existing?.furnishing ?? 'semi' as Property['furnishing'],
    amenities: existing?.amenities.join(', ') ?? '', description: existing?.description ?? '', ownerType: existing?.ownerType ?? 'owner' as Property['ownerType'], available: existing?.available ?? true
  });
  const [student, setStudent] = useState<StudentDetails>(existing?.student ?? { meals: false, deposit: 0, rules: [], occupancy: 'shared', restriction: 'none' });
  const [rules, setRules] = useState(existing?.student?.rules.join(', ') ?? '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (id && !existing) return <NotFound />;
  if (existing && !actorIds(userId, role).includes(existing.ownerId ?? '') && role !== 'admin') return <EmptyState title="You can only edit your own listings" action={<LinkButton to="/property">Back to property</LinkButton>} />;
  const isStudent = STUDENT_CATS.includes(f.category);
  const submit = () => {
    const e: Record<string, string> = {};
    if (sanitize(f.title).length < 5) e.title = 'Add a descriptive title.';
    if (!(Number(f.price) > 0)) e.price = 'Enter a valid price.';
    if (!f.localityId) e.localityId = 'Choose a locality.';
    if (sanitize(f.description).length < 20) e.description = 'Describe the property (20+ characters).';
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = {
      title: sanitize(f.title, 120), listingType: f.listingType, category: f.category, price: Number(f.price), localityId: f.localityId, areaSqft: Number(f.areaSqft) || undefined,
      bedrooms: f.bedrooms ? Number(f.bedrooms) : undefined, bathrooms: f.bathrooms ? Number(f.bathrooms) : undefined, furnishing: f.furnishing, amenities: f.amenities.split(',').map((a) => sanitize(a, 40)).filter(Boolean),
      description: sanitize(f.description, 3000), ownerType: f.ownerType, available: f.available, student: isStudent ? { ...student, rules: rules.split(',').map((r) => sanitize(r, 80)).filter(Boolean) } : undefined
    };
    if (existing) { repo.patch('properties', existing.id, { ...data, photos: existing.photos + photos.length }); toast('Listing updated'); nav(`/property/${existing.id}`); return; }
    const pid = uid('pr');
    // Verification status is never self-declared; new listings start unverified and pending review.
    repo.insert('properties', { id: pid, ...data, ownerName: user!.name, ownerId: userId!, verification: 'unverified', photos: photos.length, views: 0, enquiries: 0, status: 'pending_review', createdAt: nowIso(), demo: true });
    toast('Listing submitted for review'); nav('/owner-dashboard');
  };
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader title={existing ? 'Edit property' : 'List your property'} subtitle="Listings are reviewed before going live. Verification is done separately by One Bhilwara." />
      <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Title" required value={f.title} error={errors.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Listing" value={f.listingType} onChange={(e) => setF({ ...f, listingType: e.target.value as Property['listingType'] })} options={[{ value: 'rent', label: 'For rent' }, { value: 'sale', label: 'For sale' }]} />
          <Select label="Property type" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={PROPERTY_CATEGORIES} />
          <TextField label={f.listingType === 'rent' ? 'Monthly rent (₹)' : 'Sale price (₹)'} required inputMode="numeric" value={f.price} error={errors.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} />
          <Select label="Locality" required value={f.localityId} error={errors.localityId} placeholder="Choose" onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
          <TextField label="Area (sq ft)" inputMode="numeric" value={f.areaSqft} onChange={(e) => setF({ ...f, areaSqft: e.target.value.replace(/\D/g, '') })} />
          <Select label="Furnishing" value={f.furnishing} onChange={(e) => setF({ ...f, furnishing: e.target.value as Property['furnishing'] })} options={[{ value: 'furnished', label: 'Furnished' }, { value: 'semi', label: 'Semi-furnished' }, { value: 'unfurnished', label: 'Unfurnished' }]} />
          <TextField label="Bedrooms" inputMode="numeric" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value.replace(/\D/g, '') })} />
          <TextField label="Bathrooms" inputMode="numeric" value={f.bathrooms} onChange={(e) => setF({ ...f, bathrooms: e.target.value.replace(/\D/g, '') })} />
          <Select label="You are the" value={f.ownerType} onChange={(e) => setF({ ...f, ownerType: e.target.value as Property['ownerType'] })} options={[{ value: 'owner', label: 'Owner' }, { value: 'agent', label: 'Agent' }]} />
        </div>
        <TextField label="Amenities (comma separated)" value={f.amenities} onChange={(e) => setF({ ...f, amenities: e.target.value })} />
        <TextArea label="Description" required value={f.description} error={errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {isStudent && (
          <fieldset className="grid gap-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Student stay details</legend>
            <Checkbox checked={student.meals} onChange={(v) => setStudent({ ...student, meals: v })} label="Meals included" />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Deposit (₹)" inputMode="numeric" value={String(student.deposit || '')} onChange={(e) => setStudent({ ...student, deposit: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              <Select label="Room" value={student.occupancy} onChange={(e) => setStudent({ ...student, occupancy: e.target.value as StudentDetails['occupancy'] })} options={[{ value: 'single', label: 'Single' }, { value: 'shared', label: 'Shared' }]} />
              <TextField label="Nearby institution (optional)" value={student.nearInstitution ?? ''} onChange={(e) => setStudent({ ...student, nearInstitution: e.target.value })} />
              <Select label="Occupancy rule" value={student.restriction ?? 'none'} onChange={(e) => setStudent({ ...student, restriction: e.target.value as StudentDetails['restriction'] })} options={[{ value: 'none', label: 'Open to all' }, { value: 'women_only', label: 'Women only' }, { value: 'men_only', label: 'Men only' }]} hint="Only set a restriction where it is lawful and necessary; it is shown as stated by you." />
            </div>
            <TextField label="House rules (comma separated)" value={rules} onChange={(e) => setRules(e.target.value)} />
          </fieldset>
        )}
        <FilePicker label="Photos" value={photos} onChange={setPhotos} />
        <Toggle label="Available now" checked={f.available} onChange={(v) => setF({ ...f, available: v })} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit">{existing ? 'Save' : 'Submit listing'}</Button></div>
      </form>
    </div>
  );
}

export function OwnerDashboardPage() {
  useDocumentTitle('Property dashboard');
  const { userId, role } = useSession();
  const ids = actorIds(userId, role);
  const listings = useDB((s) => s.properties.filter((p) => p.ownerId && ids.includes(p.ownerId) && p.status !== 'removed'));
  const enquiries = useDB((s) => s.enquiries.filter((q) => q.targetType === 'property' && listings.some((l) => l.id === q.targetId)));
  const [tab, setTab] = useState<'listings' | 'enquiries'>('listings');
  const { toast, confirm } = useUI();
  return (
    <div className="grid gap-5">
      <PageHeader title="Property dashboard" subtitle="Manage listings, availability and enquiries." badge={<DemoBadge label="Demo owner" />} actions={<LinkButton to="/property/new" icon={<Plus className="size-4" aria-hidden />}>Add property</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Listings" value={listings.length} /><Stat label="Active" value={listings.filter((l) => l.status === 'active').length} />
        <Stat label="Total views" value={listings.reduce((a, l) => a + l.views, 0)} hint="Demo counter" /><Stat label="Enquiries" value={enquiries.length} />
      </div>
      <Tabs label="Dashboard" value={tab} onChange={setTab} tabs={[{ id: 'listings', label: 'Listings' }, { id: 'enquiries', label: 'Enquiries', count: enquiries.filter((e) => e.status === 'new').length }]} />
      {tab === 'listings' ? (listings.length === 0 ? <EmptyState title="No listings yet" action={<LinkButton to="/property/new">Add property</LinkButton>} /> : (
        <ul className="grid gap-3">{listings.map((l) => (
          <li key={l.id} className="card grid gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/property/${l.id}`} className="font-semibold">{l.title}</Link><div className="flex gap-1.5"><StatusPill status={l.status} /><VerificationBadge status={l.verification} /></div></div>
            <p className="text-sm text-muted">{formatINR(l.price)}{l.listingType === 'rent' ? '/mo' : ''} · {l.views} views · {enquiries.filter((e) => e.targetId === l.id).length} enquiries · listed {timeAgo(l.createdAt)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Toggle label="Available" checked={l.available} onChange={(v) => { repo.patch('properties', l.id, { available: v }); toast(v ? 'Marked available' : 'Marked unavailable'); }} />
              <LinkButton size="sm" variant="secondary" to={`/property/${l.id}/edit`}>Edit</LinkButton>
              {l.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => { repo.patch('properties', l.id, { status: 'inactive' }); toast('Listing deactivated'); }}>Deactivate</Button>
                : l.status === 'inactive' && <Button size="sm" variant="ghost" onClick={() => { repo.patch('properties', l.id, { status: 'active' }); toast('Listing reactivated'); }}>Reactivate</Button>}
              <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: 'Delete listing?', message: 'This removes the listing permanently.', danger: true, confirmLabel: 'Delete' })) { repo.patch('properties', l.id, { status: 'removed' }); toast('Listing deleted'); } }}>Delete</Button>
            </div>
          </li>))}
        </ul>
      )) : <EnquiryInbox items={enquiries} />}
    </div>
  );
}
