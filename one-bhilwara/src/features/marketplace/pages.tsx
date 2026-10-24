import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, ShieldAlert, ShoppingBag } from 'lucide-react';
import type { Classified } from '@/types/models';
import { CLASSIFIED_CATEGORIES, localityName } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { sanitize } from '@/services/domain/common';
import { repo } from '@/services/store';
import { ClassifiedCard, conditionLabel } from '@/components/cards';
import { EnquiryButton, FilterBar, LoadMore, LOCALITY_OPTIONS, ReportButton, SaveButton, SectionCard, ShareButton, usePaged } from '@/components/shared';
import { Avatar, Badge, Button, DemoBadge, EmptyState, ImagePlaceholder, KeyValue, LinkButton, Notice, PageHeader, SkeletonList, StatusPill } from '@/components/ui/primitives';
import { Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, FilePicker, Select, TextArea, TextField } from '@/components/ui/form';
import { formatDate, formatINR, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import { EnquiryInbox } from '@/components/inbox';
import NotFound from '@/app/NotFound';

const CONDITIONS: { value: Classified['condition']; label: string }[] = [{ value: 'new', label: 'New' }, { value: 'like_new', label: 'Like new' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }];
const VEHICLE = ['Cars', 'Two-wheelers'];
const isExpired = (c: Classified) => Date.parse(c.expiresAt) < Date.now();

export function MarketplacePage() {
  useDocumentTitle('Buy & sell');
  const loading = useLoading();
  const { userId } = useSession();
  const all = useDB((s) => s.classifieds);
  const enquiries = useDB((s) => s.enquiries.filter((q) => q.targetType === 'classified' && q.ownerId === userId));
  const [tab, setTab] = useState<'browse' | 'mine' | 'enquiries'>('browse');
  const init = () => ({ q: '', values: { category: '', condition: '', locality: '', min: '', max: '' } as Record<string, string>, sort: 'newest', negotiable: false, sold: false });
  const [f, setF] = useState(init);
  const list = useMemo(() => {
    let l = all.filter((c) => (f.sold ? ['active', 'sold'].includes(c.status) : c.status === 'active') && !isExpired(c));
    l = l.filter((c) => (!f.values.category || c.category === f.values.category) && (!f.values.condition || c.condition === f.values.condition) && (!f.values.locality || c.localityId === f.values.locality));
    if (f.q) l = l.filter((c) => `${c.title} ${c.description}`.toLowerCase().includes(f.q.toLowerCase()));
    if (f.values.min) l = l.filter((c) => c.price >= Number(f.values.min));
    if (f.values.max) l = l.filter((c) => c.price <= Number(f.values.max));
    if (f.negotiable) l = l.filter((c) => c.negotiable);
    return [...l].sort((a, b) => f.sort === 'price_asc' ? a.price - b.price : f.sort === 'price_desc' ? b.price - a.price : b.createdAt.localeCompare(a.createdAt));
  }, [all, f]);
  const mine = all.filter((c) => c.sellerId === userId && c.status !== 'removed');
  const { visible, hasMore, more } = usePaged(list, 12);
  return (
    <div className="grid gap-5">
      <PageHeader title="Buy & sell" subtitle="Used and new goods from people near you." actions={<LinkButton to="/marketplace/new" icon={<Plus className="size-4" aria-hidden />}>Sell something</LinkButton>} />
      <Tabs label="Marketplace" value={tab} onChange={setTab} tabs={[{ id: 'browse', label: 'Browse' }, { id: 'mine', label: 'My listings', count: mine.length }, { id: 'enquiries', label: 'Enquiries', count: enquiries.filter((e) => e.status === 'new').length }]} />
      {tab === 'browse' && (
        <>
          <div className="scroll-x">{['', ...CLASSIFIED_CATEGORIES].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={f.values.category === c} onClick={() => setF({ ...f, values: { ...f.values, category: c } })}>{c || 'All'}</button>)}</div>
          <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Search items" count={list.length}
            filters={[{ key: 'condition', label: 'Condition', options: CONDITIONS }, { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS },
              { key: 'min', label: 'Min price', options: [{ value: '1000', label: '₹1,000' }, { value: '5000', label: '₹5,000' }, { value: '20000', label: '₹20,000' }] },
              { key: 'max', label: 'Max price', options: [{ value: '5000', label: '₹5,000' }, { value: '20000', label: '₹20,000' }, { value: '100000', label: '₹1 L' }, { value: '500000', label: '₹5 L' }] }]}
            values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
            sorts={[{ value: 'newest', label: 'Newest' }, { value: 'price_asc', label: 'Price: low–high' }, { value: 'price_desc', label: 'Price: high–low' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
            toggles={[{ key: 'n', label: 'Negotiable', on: f.negotiable, set: (v) => setF({ ...f, negotiable: v }) }, { key: 's', label: 'Include sold', on: f.sold, set: (v) => setF({ ...f, sold: v }) }]}
            onReset={() => setF(init())} />
          {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState icon={<ShoppingBag className="size-6" aria-hidden />} title="Nothing found" text="Try another category or price range." action={<LinkButton variant="secondary" to="/marketplace/new">Post a listing</LinkButton>} /> : (
            <><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{visible.map((c) => <ClassifiedCard key={c.id} c={c} />)}</div><LoadMore hasMore={hasMore} onMore={more} /></>
          )}
        </>
      )}
      {tab === 'mine' && (mine.length === 0 ? <EmptyState title="You haven’t listed anything" action={<LinkButton to="/marketplace/new">Sell something</LinkButton>} /> : (
        <ul className="grid gap-3">{mine.map((c) => <MyListingRow key={c.id} c={c} />)}</ul>
      ))}
      {tab === 'enquiries' && <EnquiryInbox items={enquiries} />}
    </div>
  );
}

function MyListingRow({ c }: { c: Classified }) {
  const { toast, confirm } = useUI();
  const expired = isExpired(c);
  return (
    <li className="card flex flex-wrap items-center gap-3 p-4">
      <span className="min-w-0 flex-1"><Link to={`/marketplace/${c.id}`} className="font-semibold">{c.title}</Link><span className="block text-sm text-muted">{formatINR(c.price)} · {expired ? 'Expired' : `Expires ${formatDate(c.expiresAt)}`}</span></span>
      <StatusPill status={expired && c.status === 'active' ? 'expired' : c.status} />
      <SellerActions c={c} onToast={toast} onConfirm={confirm} />
    </li>
  );
}

function SellerActions({ c, onToast, onConfirm }: { c: Classified; onToast: (s: string) => void; onConfirm: (o: { title: string; message: string; danger?: boolean; confirmLabel?: string }) => Promise<boolean> }) {
  const nav = useNavigate();
  return (
    <span className="flex flex-wrap gap-2">
      {c.status === 'active' && <Button size="sm" variant="teal" onClick={() => { repo.patch('classifieds', c.id, { status: 'sold' }); onToast('Marked as sold'); }}>Mark sold</Button>}
      {(isExpired(c) || c.status === 'expired') && <Button size="sm" variant="secondary" onClick={() => { repo.patch('classifieds', c.id, { status: 'active', expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() }); onToast('Renewed for 30 days'); }}>Renew</Button>}
      <Button size="sm" variant="secondary" onClick={() => nav(`/marketplace/${c.id}/edit`)}>Edit</Button>
      <Button size="sm" variant="ghost" onClick={async () => { if (await onConfirm({ title: 'Delete listing?', message: 'This cannot be undone.', danger: true, confirmLabel: 'Delete' })) { repo.patch('classifieds', c.id, { status: 'removed' }); onToast('Listing deleted'); } }}>Delete</Button>
    </span>
  );
}

export function ClassifiedPage() {
  const { id = '' } = useParams();
  const c = useDB((s) => s.classifieds.find((x) => x.id === id));
  const { userId } = useSession();
  const { toast, confirm } = useUI();
  useDocumentTitle(c?.title ?? 'Listing');
  if (!c || c.status === 'removed') return <NotFound />;
  const own = c.sellerId === userId;
  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-4">
        <nav className="text-sm text-muted"><Link to="/marketplace" className="hover:underline">Buy & sell</Link> / {c.category}</nav>
        <ImagePlaceholder seed={c.id} className="aspect-[4/3] rounded-2xl" icon={<ShoppingBag className="size-12" aria-hidden />} label={`${c.title} photo placeholder (${c.photos} photos)`} />
        <SectionCard title="Description"><p className="whitespace-pre-line">{c.description}</p></SectionCard>
        {c.vehicle && (
          <SectionCard title="Vehicle details">
            <KeyValue items={[['Make', c.vehicle.make], ['Model', c.vehicle.model], ['Year', String(c.vehicle.year)], ['Kilometres', c.vehicle.km.toLocaleString('en-IN')], c.vehicle.owners !== undefined && ['Owners', String(c.vehicle.owners)]]} />
            <p className="mt-2 text-xs text-muted">Registration numbers and documents are shared by the seller in person, not published here. Check RC, insurance and challans on official portals before paying.</p>
          </SectionCard>
        )}
      </div>
      <aside className="grid content-start gap-4">
        <div className="card grid gap-3 p-4">
          <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{c.category}</Badge><Badge>{conditionLabel(c.condition)}</Badge>{c.status === 'sold' && <Badge tone="red">Sold</Badge>}{c.demo && <DemoBadge label="Demo listing" />}</div>
          <h1 className="text-xl font-extrabold text-navy">{c.title}</h1>
          <p className="text-2xl font-bold">{formatINR(c.price)} {c.negotiable && <span className="text-sm font-normal text-muted">Negotiable</span>}</p>
          <p className="text-sm text-muted">{localityName(c.localityId)} · Posted {timeAgo(c.createdAt)} · Expires {formatDate(c.expiresAt)}</p>
          <div className="flex items-center gap-2 border-t border-line pt-3"><Avatar name={c.sellerName} size={36} /><span><span className="block text-sm font-semibold">{c.sellerName}</span><span className="text-xs text-muted">Prefers {c.contactPref}</span></span></div>
          {own ? <SellerActions c={c} onToast={toast} onConfirm={confirm} /> : c.status === 'active' && <EnquiryButton block targetType="classified" targetId={c.id} targetName={c.title} ownerId={c.sellerId} label="Message seller" purpose="So the seller can reply about this item." />}
          <div className="flex flex-wrap gap-2"><SaveButton type="classified" id={c.id} /><ShareButton title={c.title} /><ReportButton targetType="classified" targetId={c.id} title={c.title} /></div>
        </div>
        <Notice tone="warning" title="Buy safely">
          <ul className="mt-1 list-disc pl-4"><li>Meet in a public place; inspect before paying.</li><li>Never pay an advance to “book” an item or for delivery/courier charges.</li><li>Don’t share OTPs or scan QR codes to “receive” money.</li><li>One Bhilwara doesn’t offer escrow or payment protection.</li></ul>
        </Notice>
      </aside>
    </div>
  );
}

export function ClassifiedFormPage() {
  const { id } = useParams();
  const existing = useDB((s) => (id ? s.classifieds.find((c) => c.id === id) : undefined));
  const user = useCurrentUser();
  const { userId } = useSession();
  const nav = useNavigate();
  const { toast } = useUI();
  useDocumentTitle(existing ? 'Edit listing' : 'Sell something');
  const [f, setF] = useState({ title: existing?.title ?? '', category: existing?.category ?? CLASSIFIED_CATEGORIES[2], condition: existing?.condition ?? 'good' as Classified['condition'], price: String(existing?.price ?? ''), negotiable: existing?.negotiable ?? true, description: existing?.description ?? '', localityId: existing?.localityId ?? '', contactPref: existing?.contactPref ?? 'chat' as Classified['contactPref'] });
  const [v, setV] = useState({ make: existing?.vehicle?.make ?? '', model: existing?.vehicle?.model ?? '', year: String(existing?.vehicle?.year ?? ''), km: String(existing?.vehicle?.km ?? ''), owners: String(existing?.vehicle?.owners ?? '') });
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (id && !existing) return <NotFound />;
  if (existing && existing.sellerId !== userId) return <EmptyState title="You can only edit your own listings" />;
  const isVehicle = VEHICLE.includes(f.category);
  const submit = () => {
    const e: Record<string, string> = {};
    if (sanitize(f.title).length < 4) e.title = 'Add a title.';
    if (!(Number(f.price) > 0)) e.price = 'Enter a price.';
    if (!f.localityId) e.localityId = 'Choose a locality.';
    if (sanitize(f.description).length < 10) e.description = 'Describe the item (10+ characters).';
    if (isVehicle && (!v.make || !v.model || !(Number(v.year) > 1980))) e.vehicle = 'Add make, model and year.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = { title: sanitize(f.title, 100), category: f.category, condition: f.condition, price: Number(f.price), negotiable: f.negotiable, description: sanitize(f.description, 3000), localityId: f.localityId, contactPref: f.contactPref,
      vehicle: isVehicle ? { make: sanitize(v.make, 40), model: sanitize(v.model, 40), year: Number(v.year), km: Number(v.km) || 0, owners: v.owners ? Number(v.owners) : undefined } : undefined };
    if (existing) { repo.patch('classifieds', existing.id, { ...data, photos: existing.photos + photos.length }); toast('Listing updated'); nav(`/marketplace/${existing.id}`); return; }
    const cid = uid('c');
    repo.insert('classifieds', { id: cid, ...data, sellerId: userId!, sellerName: user!.name, status: 'active', expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), photos: photos.length, createdAt: nowIso(), demo: true });
    toast('Listing published for 30 days'); nav(`/marketplace/${cid}`);
  };
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader title={existing ? 'Edit listing' : 'Sell something'} subtitle="Listings stay live for 30 days and can be renewed." />
      <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Item title" required value={f.title} error={errors.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CLASSIFIED_CATEGORIES} />
          <Select label="Condition" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as Classified['condition'] })} options={CONDITIONS} />
          <TextField label="Asking price (₹)" required inputMode="numeric" value={f.price} error={errors.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} />
          <Select label="Locality" required value={f.localityId} error={errors.localityId} placeholder="Choose" onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
          <Select label="Contact preference" value={f.contactPref} onChange={(e) => setF({ ...f, contactPref: e.target.value as Classified['contactPref'] })} options={[{ value: 'chat', label: 'In-app messages' }, { value: 'call', label: 'Phone call' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
        </div>
        <Checkbox checked={f.negotiable} onChange={(x) => setF({ ...f, negotiable: x })} label="Price is negotiable" />
        {isVehicle && (
          <fieldset className="grid gap-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Vehicle details</legend>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Make" value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} />
              <TextField label="Model" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
              <TextField label="Year" inputMode="numeric" value={v.year} onChange={(e) => setV({ ...v, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
              <TextField label="Kilometres" inputMode="numeric" value={v.km} onChange={(e) => setV({ ...v, km: e.target.value.replace(/\D/g, '') })} />
              <TextField label="Number of owners (optional)" inputMode="numeric" value={v.owners} onChange={(e) => setV({ ...v, owners: e.target.value.replace(/\D/g, '') })} />
            </div>
            <p className="text-xs text-muted">Don’t publish the registration number or upload RC/insurance documents. Share them with serious buyers in person.</p>
            {errors.vehicle && <p className="text-xs font-medium text-danger" role="alert">{errors.vehicle}</p>}
          </fieldset>
        )}
        <TextArea label="Description" required value={f.description} error={errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <FilePicker label="Photos" value={photos} onChange={setPhotos} />
        <Notice tone="info"><ShieldAlert className="mr-1 inline size-4" aria-hidden />Prohibited: weapons, drugs, wildlife products, counterfeit goods, prescription medicines. Listings may be removed by moderators.</Notice>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit">{existing ? 'Save' : 'Publish listing'}</Button></div>
      </form>
    </div>
  );
}
