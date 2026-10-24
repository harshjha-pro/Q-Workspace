import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Eye, Factory, Globe, Instagram, Facebook, Megaphone, MousePointerClick, Palette, Plus, Store, UserPlus, Users } from 'lucide-react';
import type { B2BRequirement, Business, Campaign, Offer, Verification } from '@/types/models';
import { BUSINESS_CATEGORIES, localityName } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { demoCheckout } from '@/services/adapters/payments';
import { actorIds, audit, notify, sanitize } from '@/services/domain/common';
import { repo } from '@/services/store';
import { BusinessCard, EventCard, OfferCard } from '@/components/cards';
import { EnquiryInbox } from '@/components/inbox';
import { BarList, CallButton, DirectionsButton, EnquiryButton, FilterBar, LoadMore, LOCALITY_OPTIONS, ReportButton, ReviewsSection, SaveButton, SectionCard, ShareButton, useRequireAuth, usePaged } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, ImagePlaceholder, KeyValue, LinkButton, Notice, PageHeader, Rating, SkeletonList, SponsoredTag, Stat, StatusPill, VerificationBadge } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, FilePicker, Select, TextArea, TextField } from '@/components/ui/form';
import { formatDate, formatINR, formatNum, timeAgo } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

export function BusinessesPage() {
  useDocumentTitle('Business directory');
  const [params] = useSearchParams();
  const loading = useLoading();
  const all = useDB((s) => s.businesses.filter((b) => b.verification !== 'suspended'));
  const campaigns = useDB((s) => s.campaigns.filter((c) => c.status === 'live' && c.placement === 'category'));
  const init = () => ({ q: '', values: { category: params.get('category') ?? '', locality: '', price: '' } as Record<string, string>, sort: 'rating', verified: false, offers: false });
  const [f, setF] = useState(init);
  const offers = useDB((s) => s.offers.filter((o) => o.status === 'active'));
  const list = useMemo(() => {
    let l = all.filter((b) => (!f.values.category || b.category === f.values.category) && (!f.values.locality || b.localityId === f.values.locality) && (!f.values.price || b.priceRange <= Number(f.values.price)));
    if (f.q) l = l.filter((b) => `${b.name} ${b.description} ${b.products.join(' ')}`.toLowerCase().includes(f.q.toLowerCase()));
    if (f.verified) l = l.filter((b) => b.verification === 'verified');
    if (f.offers) l = l.filter((b) => offers.some((o) => o.businessId === b.id));
    return [...l].sort((a, b) => (f.sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : f.sort === 'reviews' ? b.reviewCount - a.reviewCount : b.rating - a.rating));
  }, [all, f, offers]);
  const sponsored = campaigns.find((c) => !f.values.category || c.category === f.values.category);
  const sponsoredBiz = all.find((b) => b.id === sponsored?.businessId);
  const { visible, hasMore, more } = usePaged(list, 12);
  return (
    <div className="grid gap-5">
      <PageHeader title="Local business directory" subtitle="Shops, restaurants, manufacturers, services and more." actions={<><LinkButton variant="secondary" to="/businesses/new">Add / claim business</LinkButton><LinkButton to="/advertise" icon={<Megaphone className="size-4" aria-hidden />}>Advertise</LinkButton></>} />
      <FilterBar q={f.q} onQ={(q) => setF({ ...f, q })} placeholder="Business, product or service" count={list.length}
        filters={[{ key: 'category', label: 'Category', options: BUSINESS_CATEGORIES }, { key: 'locality', label: 'Locality', options: LOCALITY_OPTIONS }, { key: 'price', label: 'Price range', options: [{ value: '1', label: '₹' }, { value: '2', label: 'Up to ₹₹' }, { value: '3', label: 'Up to ₹₹₹' }] }]}
        values={f.values} onChange={(k, v) => setF({ ...f, values: { ...f.values, [k]: v } })}
        sorts={[{ value: 'rating', label: 'Top rated' }, { value: 'reviews', label: 'Most reviewed' }, { value: 'newest', label: 'Newest' }]} sort={f.sort} onSort={(sort) => setF({ ...f, sort })}
        toggles={[{ key: 'v', label: 'Verified only', on: f.verified, set: (v) => setF({ ...f, verified: v }) }, { key: 'o', label: 'Has offers', on: f.offers, set: (v) => setF({ ...f, offers: v }) }]} onReset={() => setF({ ...init(), values: { category: '', locality: '', price: '' } })} />
      {sponsored && sponsoredBiz && <div><BusinessCard b={sponsoredBiz} sponsored /><p className="mt-1 text-xs text-muted">Sponsored placement: “{sponsored.headline}”</p></div>}
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState icon={<Store className="size-6" aria-hidden />} title="No businesses match" action={<LinkButton variant="secondary" to="/businesses/new">List your business free</LinkButton>} /> : (
        <><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((b) => <BusinessCard key={b.id} b={b} />)}</div><LoadMore hasMore={hasMore} onMore={more} /></>
      )}
    </div>
  );
}

export function BusinessPage() {
  const { id = '' } = useParams();
  const b = useDB((s) => s.businesses.find((x) => x.id === id));
  const offers = useDB((s) => s.offers.filter((o) => o.businessId === id && o.status === 'active'));
  const user = useCurrentUser();
  const guard = useRequireAuth();
  const { toast } = useUI();
  useEffect(() => { if (b) repo.at('businesses').mutate(b.id, (c) => ({ views: c.views + 1 })); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useDocumentTitle(b?.name ?? 'Business');
  if (!b || (b.verification === 'suspended' && !user)) return <NotFound />;
  const following = !!user?.following.includes(b.id);
  const track = () => repo.at('businesses').mutate(b.id, (c) => ({ clicks: c.clicks + 1 }));
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <nav className="text-sm text-muted"><Link to="/businesses" className="hover:underline">Businesses</Link> / {b.category}</nav>
      <section className="card overflow-hidden">
        <ImagePlaceholder seed={b.id + 'cover'} className="h-36" label="Cover image placeholder" />
        <div className="grid gap-3 p-5">
          <div className="-mt-14 flex items-end gap-3"><ImagePlaceholder seed={b.id} className="size-20 rounded-2xl border-4 border-white" icon={<Store className="size-8" aria-hidden />} label="Logo placeholder" /></div>
          <div className="flex flex-wrap gap-1.5"><Badge tone="navy">{b.category}</Badge><VerificationBadge status={b.verification} />{b.sponsored && <SponsoredTag />}{b.premium && <Badge tone="amber">Premium profile</Badge>}{b.demo && <DemoBadge label="Demo record" />}</div>
          <h1 className="text-2xl font-extrabold text-navy">{b.name}</h1>
          <div className="flex flex-wrap items-center gap-3"><Rating value={b.rating} count={b.reviewCount} size="md" /><span className="text-muted">{'₹'.repeat(b.priceRange)}</span></div>
          <p>{b.description}</p>
          <KeyValue items={[['Address', b.address], ['Locality', localityName(b.localityId)], ['Opening hours', <span key="h" className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{b.hours}</span>]]} />
          <div className="flex flex-wrap gap-2">
            <EnquiryButton targetType="business" targetId={b.id} targetName={b.name} ownerId={b.ownerId} purpose="So the business can respond to your enquiry." />
            <span onClick={track}><CallButton phone={b.phone} name={b.name} /></span>
            <span onClick={track}><DirectionsButton query={`${b.address}`} /></span>
            <Button variant={following ? 'teal' : 'secondary'} size="sm" aria-pressed={following} icon={<UserPlus className="size-4" aria-hidden />} onClick={() => guard(() => { repo.patch('users', user!.id, { following: following ? user!.following.filter((x) => x !== b.id) : [...user!.following, b.id] }); toast(following ? 'Unfollowed' : 'Following — you’ll see their offers'); })}>{following ? 'Following' : 'Follow'}</Button>
            <SaveButton type="business" id={b.id} /><ShareButton title={b.name} /><ReportButton targetType="business" targetId={b.id} title={b.name} />
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {b.website && <a onClick={track} href={b.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal underline"><Globe className="size-4" aria-hidden />Website</a>}
            {b.instagram && <a onClick={track} href={b.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal underline"><Instagram className="size-4" aria-hidden />Instagram</a>}
            {b.facebook && <a onClick={track} href={b.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-teal underline"><Facebook className="size-4" aria-hidden />Facebook</a>}
          </div>
          {!b.claimed && <p className="text-sm">Is this your business? <Link to={`/businesses/${b.id}/edit?claim=1`} className="font-semibold text-teal underline">Claim this listing</Link></p>}
        </div>
      </section>
      <SectionCard title="Products & services"><div className="flex flex-wrap gap-2">{b.products.map((p) => <Badge key={p} tone="navy">{p}</Badge>)}</div></SectionCard>
      {offers.length > 0 && <section><h2 className="mb-2 text-lg font-bold text-navy">Offers</h2><div className="grid gap-3 sm:grid-cols-2">{offers.map((o) => <Link key={o.id} to={`/offers?id=${o.id}`}><OfferCard o={o} /></Link>)}</div></section>}
      <SectionCard title="Photos"><div className="grid grid-cols-3 gap-2">{Array.from({ length: 3 }, (_, i) => <ImagePlaceholder key={i} seed={b.id + i} className="aspect-video rounded-lg" label={`Business photo ${i + 1} placeholder`} />)}</div></SectionCard>
      <ReviewsSection targetType="business" targetId={b.id} targetName={b.name} />
    </div>
  );
}

const VERIFY_STEPS: Verification[] = ['unverified', 'submitted', 'under_review', 'verified'];

export function BusinessDashboardPage() {
  useDocumentTitle('Business dashboard');
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'overview') as 'overview' | 'enquiries' | 'reviews' | 'offers' | 'ads' | 'verification';
  const { userId, role } = useSession();
  const ids = actorIds(userId, role);
  const mine = useDB((s) => s.businesses.filter((b) => b.ownerId && ids.includes(b.ownerId)));
  const seededFallback = useDB((s) => s.businesses.filter((b) => ['b-1', 'b-3', 'b-7'].includes(b.id)));
  const businesses = mine.length ? mine : seededFallback;
  const [selId, setSelId] = useState(businesses[0]?.id ?? '');
  const b = businesses.find((x) => x.id === selId) ?? businesses[0];
  const enquiries = useDB((s) => s.enquiries.filter((q) => q.targetId === b?.id));
  const reviews = useDB((s) => s.reviews.filter((r) => r.targetId === b?.id));
  const offers = useDB((s) => s.offers.filter((o) => o.businessId === b?.id));
  const campaigns = useDB((s) => s.campaigns.filter((c) => c.businessId === b?.id));
  const vr = useDB((s) => s.verificationRequests.find((v) => v.businessId === b?.id));
  const { toast } = useUI();
  const [reply, setReply] = useState<Record<string, string>>({});
  const [docs, setDocs] = useState<string[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  if (!b) return <EmptyState title="No business yet" action={<LinkButton to="/businesses/new">Create your business listing</LinkButton>} />;
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  return (
    <div className="grid gap-5">
      <PageHeader title="Business dashboard" subtitle="Manage your listing, enquiries, reviews, offers and promotions." badge={<DemoBadge label="Demo business" />}
        actions={<><LinkButton variant="secondary" to={`/businesses/${b.id}`}>View listing</LinkButton><LinkButton to={`/businesses/${b.id}/edit`}>Edit listing</LinkButton></>} />
      {businesses.length > 1 && <select aria-label="Business" className="input w-full sm:w-80" value={b.id} onChange={(e) => setSelId(e.target.value)}>{businesses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <Tabs label="Dashboard" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'enquiries', label: 'Enquiries', count: enquiries.filter((e) => e.status === 'new').length }, { id: 'reviews', label: 'Reviews', count: reviews.length }, { id: 'offers', label: 'Offers', count: offers.length }, { id: 'ads', label: 'Promotions', count: campaigns.length }, { id: 'verification', label: 'Verification' }]} />
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Profile views" value={formatNum(b.views)} icon={<Eye className="size-4" aria-hidden />} hint="Demo counter" />
            <Stat label="Clicks" value={formatNum(b.clicks)} icon={<MousePointerClick className="size-4" aria-hidden />} hint="Calls, directions, links" />
            <Stat label="Leads" value={b.leads + enquiries.length} icon={<Users className="size-4" aria-hidden />} hint="Enquiries received" />
            <Stat label="Rating" value={b.rating.toFixed(1)} hint={`${b.reviewCount} reviews`} />
          </div>
          <SectionCard title="Engagement (demo data)"><BarList unit="" rows={[{ label: 'Views', value: b.views }, { label: 'Clicks', value: b.clicks }, { label: 'Enquiries', value: b.leads + enquiries.length }]} /><p className="mt-2 text-xs text-muted">Simulated analytics. They don’t represent real reach or results.</p></SectionCard>
          <div className="grid gap-3 md:grid-cols-3">
            <Link to="/pricing?audience=business" className="card p-4 hover:border-navy/30"><p className="font-bold">Upgrade profile</p><p className="text-sm text-muted">More photos, catalogue, offers & analytics.</p></Link>
            <Link to="/business-assistance" className="card p-4 hover:border-navy/30"><p className="font-bold">Get design help</p><p className="text-sm text-muted">Logo, posts, website setup.</p></Link>
            <Link to="/advertise" className="card p-4 hover:border-navy/30"><p className="font-bold">Promote locally</p><p className="text-sm text-muted">Sponsored placements, clearly labelled.</p></Link>
          </div>
        </>
      )}
      {tab === 'enquiries' && <EnquiryInbox items={enquiries} />}
      {tab === 'reviews' && (reviews.length === 0 ? <EmptyState title="No reviews yet" /> : (
        <ul className="grid gap-3">{reviews.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex justify-between"><p className="font-semibold">{r.userName}</p><Rating value={r.rating} /></div><p className="text-sm">{r.text}</p><p className="text-xs text-muted">{formatDate(r.createdAt)}</p>
            {r.reply ? <p className="mt-2 rounded bg-page p-2 text-sm">Your reply: {r.reply.text}</p> : (
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = sanitize(reply[r.id] ?? '', 600); if (t.length < 2) return; repo.patch('reviews', r.id, { reply: { text: t, at: nowIso() } }); toast('Reply posted publicly'); }}>
                <input aria-label="Reply to review" className="input" placeholder="Thank the reviewer or address concerns politely" value={reply[r.id] ?? ''} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} /><Button type="submit">Reply</Button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted">Businesses can’t edit or delete reviews. If a review breaks the rules, report it for moderation.</p>
          </li>))}
        </ul>
      ))}
      {tab === 'offers' && (
        <div className="grid gap-3">
          <Button className="justify-self-start" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOfferOpen(true)}>Create offer</Button>
          {offers.length === 0 ? <EmptyState title="No offers yet" /> : (
            <ul className="grid gap-3 md:grid-cols-2">{offers.map((o) => (
              <li key={o.id} className="grid gap-2"><OfferCard o={o} />
                <div className="flex gap-2">{o.status === 'active' ? <Button size="sm" variant="secondary" onClick={() => { repo.patch('offers', o.id, { status: 'paused' }); toast('Offer paused'); }}>Pause</Button> : o.status === 'paused' && <Button size="sm" variant="secondary" onClick={() => { repo.patch('offers', o.id, { status: 'active' }); toast('Offer resumed'); }}>Resume</Button>}</div>
              </li>))}
            </ul>
          )}
          <OfferDialog open={offerOpen} onClose={() => setOfferOpen(false)} b={b} />
        </div>
      )}
      {tab === 'ads' && <CampaignManager b={b} campaigns={campaigns} />}
      {tab === 'verification' && (
        <div className="grid gap-4">
          <SectionCard title="Verification status">
            <ol className="flex flex-wrap gap-2">{VERIFY_STEPS.map((s) => <li key={s}><Badge tone={s === b.verification ? 'teal' : VERIFY_STEPS.indexOf(s) < VERIFY_STEPS.indexOf(b.verification) ? 'navy' : 'gray'}>{s.replace('_', ' ')}</Badge></li>)}</ol>
            {['rejected', 'suspended'].includes(b.verification) && <Notice tone="danger" className="mt-3">Status: {b.verification}. {vr?.note ?? 'Contact support for details.'}</Notice>}
            <p className="mt-3 text-sm text-muted">The verified badge appears only after One Bhilwara reviews your documents. Demo records are labelled.</p>
          </SectionCard>
          {['unverified', 'rejected'].includes(b.verification) ? (
            <SectionCard title="Submit for verification">
              <FilePicker label="Business documents (GST, Udyam, shop licence)" accept="application/pdf,image/*" value={docs} onChange={setDocs} hint="Demo stores names only. Production uploads go to private storage, are scanned and reviewed by staff." />
              <Button className="mt-3" disabled={!docs.length} onClick={() => {
                repo.insert('verificationRequests', { id: uid('vr'), businessId: b.id, businessName: b.name, submittedBy: userId!, documents: docs, status: 'submitted', createdAt: nowIso(), demo: true });
                repo.patch('businesses', b.id, { verification: 'submitted' }); notify('u-10', 'business', 'Verification submitted', b.name, '/admin?tab=businesses'); setDocs([]); toast('Submitted for verification');
              }}>Submit</Button>
            </SectionCard>
          ) : vr && <SectionCard title="Your submission"><p className="text-sm">Documents: {vr.documents.join(', ')}</p><p className="text-sm text-muted">Submitted {timeAgo(vr.createdAt)} · <StatusPill status={vr.status} /></p></SectionCard>}
        </div>
      )}
    </div>
  );
}

function OfferDialog({ open, onClose, b }: { open: boolean; onClose: () => void; b: Business }) {
  const { toast } = useUI();
  const [f, setF] = useState({ title: '', benefit: '', description: '', validTo: '', terms: '' });
  return (
    <Dialog open={open} onClose={onClose} title="Create offer" description={b.name}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => {
        if (!f.title.trim() || !f.benefit.trim() || !f.validTo) { toast('Title, benefit and end date are required.', 'error'); return; }
        const o: Offer = { id: uid('of'), title: sanitize(f.title, 100), businessId: b.id, businessName: b.name, description: sanitize(f.description, 500), benefit: sanitize(f.benefit, 60), category: b.category, validFrom: new Date().toISOString().slice(0, 10), validTo: f.validTo, terms: f.terms.split('\n').map((t) => sanitize(t, 200)).filter(Boolean), redemption: 'Show the voucher code at the business.', status: 'active', createdAt: nowIso(), demo: true };
        repo.insert('offers', o); onClose(); toast('Offer published');
      }}>Publish offer</Button></>}>
      <div className="grid gap-3">
        <TextField label="Offer title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <TextField label="Benefit" value={f.benefit} onChange={(e) => setF({ ...f, benefit: e.target.value })} placeholder="e.g. 10% off, max ₹100" />
        <TextArea label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <TextField label="Valid until" type="date" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} />
        <TextArea label="Terms (one per line)" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} />
      </div>
    </Dialog>
  );
}

const PLACEMENTS: { value: Campaign['placement']; label: string }[] = [
  { value: 'sponsored_card', label: 'Sponsored business card' }, { value: 'featured_listing', label: 'Featured listing' }, { value: 'feed_post', label: 'Sponsored feed post' },
  { value: 'category', label: 'Category sponsorship' }, { value: 'home', label: 'Home page placement' }, { value: 'locality', label: 'Locality placement' }, { value: 'festival', label: 'Festival promotion' }
];

function CampaignManager({ b, campaigns }: { b: Business; campaigns: Campaign[] }) {
  const { toast } = useUI();
  const [f, setF] = useState({ objective: 'enquiries' as Campaign['objective'], placement: 'home' as Campaign['placement'], localityId: 'all', category: b.category, startDate: new Date().toISOString().slice(0, 10), endDate: '', budget: '', headline: '' });
  const [creative, setCreative] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const e: Record<string, string> = {};
    if (sanitize(f.headline).length < 5) e.headline = 'Add a headline.';
    if (!f.endDate || f.endDate <= f.startDate) e.endDate = 'End date must be after start date.';
    if (!(Number(f.budget) >= 500)) e.budget = 'Minimum budget ₹500 (configurable).';
    if (/best|cheapest|no\.?\s?1|guaranteed/i.test(f.headline)) e.headline = 'Avoid unverifiable claims like “best”, “cheapest” or “guaranteed”.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const pay = await demoCheckout({ description: `Ad campaign: ${f.headline}`, amount: Number(f.budget), kind: 'ads' });
    setBusy(false);
    if (pay.status !== 'demo_success') { toast('Demo payment failed', 'error'); return; }
    repo.insert('campaigns', { id: uid('ad'), businessId: b.id, businessName: b.name, ...f, budget: Number(f.budget), headline: sanitize(f.headline, 90), creativeName: creative[0], status: 'pending_review', impressions: 0, clicks: 0, createdAt: nowIso(), demo: true });
    audit('campaign_submitted', b.name, f.headline);
    toast('Campaign submitted for review · demo payment (no money charged)');
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form className="card grid gap-3 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2 className="font-bold text-navy">New campaign</h2>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Objective" value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value as Campaign['objective'] })} options={[{ value: 'awareness', label: 'Awareness' }, { value: 'visits', label: 'Store visits' }, { value: 'enquiries', label: 'Enquiries' }, { value: 'offer', label: 'Promote an offer' }]} />
          <Select label="Placement" value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as Campaign['placement'] })} options={PLACEMENTS} />
          <Select label="Target locality" value={f.localityId} onChange={(e) => setF({ ...f, localityId: e.target.value })} options={[{ value: 'all', label: 'All Bhilwara' }, ...LOCALITY_OPTIONS]} />
          <Select label="Target category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={BUSINESS_CATEGORIES} />
          <TextField label="Start" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          <TextField label="End" type="date" value={f.endDate} error={errors.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </div>
        <TextField label="Budget (₹)" inputMode="numeric" value={f.budget} error={errors.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} />
        <TextField label="Headline" value={f.headline} error={errors.headline} maxLength={90} onChange={(e) => setF({ ...f, headline: e.target.value })} />
        <FilePicker label="Creative (image)" value={creative} onChange={setCreative} multiple={false} />
        <Notice tone="info">Every paid placement shows a “Sponsored” label. Ads are reviewed against the Advertising Policy. We don’t target ads using sensitive personal attributes.</Notice>
        <Button type="submit" loading={busy}>Pay & submit (demo)</Button>
      </form>
      <section className="grid content-start gap-3">
        <h2 className="font-bold text-navy">Your campaigns</h2>
        {campaigns.length === 0 ? <EmptyState icon={<Megaphone className="size-6" aria-hidden />} title="No campaigns yet" /> : campaigns.map((c) => (
          <article key={c.id} className="card grid gap-1 p-4">
            <div className="flex items-center justify-between gap-2"><p className="font-semibold">{c.headline}</p><StatusPill status={c.status} /></div>
            <p className="text-sm text-muted">{PLACEMENTS.find((p) => p.value === c.placement)?.label} · {formatDate(c.startDate)}–{formatDate(c.endDate)} · {formatINR(c.budget)}</p>
            <p className="text-sm">Impressions {formatNum(c.impressions)} · Clicks {formatNum(c.clicks)} · CTR {c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0'}% <DemoBadge label="Simulated metrics" /></p>
          </article>
        ))}
        <p className="text-xs text-muted">Metrics shown are simulated and do not promise real reach or results.</p>
      </section>
    </div>
  );
}

export function BusinessFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const claim = params.get('claim') === '1';
  const existing = useDB((s) => (id ? s.businesses.find((b) => b.id === id) : undefined));
  const { userId, role } = useSession();
  const nav = useNavigate();
  const { toast } = useUI();
  useDocumentTitle(claim ? 'Claim business' : existing ? 'Edit business' : 'Add business');
  const [f, setF] = useState({ name: existing?.name ?? '', category: existing?.category ?? BUSINESS_CATEGORIES[0], description: existing?.description ?? '', address: existing?.address ?? '', localityId: existing?.localityId ?? '', phone: existing?.phone ?? '', hours: existing?.hours ?? 'Mon–Sat 10:00–20:00', website: existing?.website ?? '', instagram: existing?.instagram ?? '', facebook: existing?.facebook ?? '', products: existing?.products.join(', ') ?? '', priceRange: String(existing?.priceRange ?? 2) });
  const [photos, setPhotos] = useState<string[]>([]);
  const [proof, setProof] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (id && !existing) return <NotFound />;
  const owns = existing && (actorIds(userId, role).includes(existing.ownerId ?? '') || role === 'admin');
  if (existing && !claim && !owns) return <EmptyState title="Only the owner can edit this listing" text="If this is your business, claim it first." action={<LinkButton to={`/businesses/${existing.id}/edit?claim=1`}>Claim listing</LinkButton>} />;
  const validUrl = (u: string) => !u || /^https:\/\/[^\s]+$/i.test(u);
  if (claim && existing) {
    return (
      <div className="mx-auto grid max-w-xl gap-5">
        <PageHeader title="Claim this business" subtitle={existing.name} />
        <div className="card grid gap-4 p-4">
          <p className="text-sm">Upload proof that you own or manage this business. A moderator reviews claims before you can edit the listing.</p>
          <FilePicker label="Proof of ownership" accept="application/pdf,image/*" value={proof} onChange={setProof} />
          <Checkbox checked={agree} onChange={setAgree} label="I confirm I’m authorised to manage this business and agree to the Business Listing Terms." />
          <Button disabled={!proof.length || !agree} onClick={() => {
            repo.insert('verificationRequests', { id: uid('vr'), businessId: existing.id, businessName: existing.name, submittedBy: userId!, documents: proof, status: 'submitted', note: 'Ownership claim', createdAt: nowIso(), demo: true });
            notify('u-10', 'business', 'Business claim submitted', existing.name, '/admin?tab=businesses'); toast('Claim submitted for review'); nav(`/businesses/${existing.id}`);
          }}>Submit claim</Button>
        </div>
      </div>
    );
  }
  const submit = () => {
    const e: Record<string, string> = {};
    if (sanitize(f.name).length < 3) e.name = 'Business name is required.';
    if (!f.localityId) e.localityId = 'Choose a locality.';
    if (sanitize(f.description).length < 20) e.description = 'Describe your business (20+ characters).';
    if (!validUrl(f.website)) e.website = 'Use a full https:// link.';
    if (!validUrl(f.instagram)) e.instagram = 'Use a full https:// link.';
    if (!validUrl(f.facebook)) e.facebook = 'Use a full https:// link.';
    if (!agree && !existing) e.agree = 'Please accept the Business Listing Terms.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const data = { name: sanitize(f.name, 100), category: f.category, description: sanitize(f.description, 2000), address: sanitize(f.address, 200) || `${localityName(f.localityId)}, Bhilwara`, localityId: f.localityId, phone: f.phone.replace(/\D/g, '').slice(-10) || undefined, hours: sanitize(f.hours, 80), website: f.website || undefined, instagram: f.instagram || undefined, facebook: f.facebook || undefined, products: f.products.split(',').map((p) => sanitize(p, 40)).filter(Boolean), priceRange: Number(f.priceRange) as Business['priceRange'] };
    if (existing) { repo.patch('businesses', existing.id, data); toast('Listing updated'); nav(`/businesses/${existing.id}`); return; }
    const bid = uid('b');
    repo.insert('businesses', { id: bid, ...data, tags: [], verification: 'unverified', ownerId: userId!, claimed: true, rating: 0, reviewCount: 0, views: 0, clicks: 0, leads: 0, createdAt: nowIso(), demo: true });
    toast('Business listed (unverified). Submit documents to get verified.'); nav('/business-dashboard?tab=verification');
  };
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader title={existing ? 'Edit business' : 'Add your business'} subtitle="A free basic listing. Premium features are optional." />
      <form className="card grid gap-4 p-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Business name" required value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={BUSINESS_CATEGORIES} />
          <Select label="Locality" required value={f.localityId} error={errors.localityId} placeholder="Choose" onChange={(e) => setF({ ...f, localityId: e.target.value })} options={LOCALITY_OPTIONS} />
          <TextField label="Phone (public)" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <TextField label="Opening hours" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
          <Select label="Price range" value={f.priceRange} onChange={(e) => setF({ ...f, priceRange: e.target.value })} options={[{ value: '1', label: '₹ Budget' }, { value: '2', label: '₹₹ Moderate' }, { value: '3', label: '₹₹₹ Premium' }, { value: '4', label: '₹₹₹₹ Luxury' }]} />
        </div>
        <TextField label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <TextArea label="Description" required value={f.description} error={errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <TextField label="Products / services (comma separated)" value={f.products} onChange={(e) => setF({ ...f, products: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Website" value={f.website} error={errors.website} placeholder="https://" onChange={(e) => setF({ ...f, website: e.target.value })} />
          <TextField label="Instagram" value={f.instagram} error={errors.instagram} placeholder="https://instagram.com/…" onChange={(e) => setF({ ...f, instagram: e.target.value })} />
          <TextField label="Facebook" value={f.facebook} error={errors.facebook} placeholder="https://facebook.com/…" onChange={(e) => setF({ ...f, facebook: e.target.value })} />
        </div>
        <FilePicker label="Logo, cover & photos" value={photos} onChange={setPhotos} />
        {!existing && <><Checkbox checked={agree} onChange={setAgree} label={<>I agree to the <Link className="underline" to="/policies/business-listing-terms">Business Listing Terms</Link>.</>} />{errors.agree && <p className="text-xs font-medium text-danger" role="alert">{errors.agree}</p>}</>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit">{existing ? 'Save' : 'Create listing'}</Button></div>
      </form>
    </div>
  );
}

export function AdvertisePage() {
  useDocumentTitle('Advertise');
  const { role } = useSession();
  return (
    <div className="grid gap-5">
      <PageHeader title="Advertise on One Bhilwara" subtitle="Reach residents by locality and category. Every paid placement is labelled “Sponsored”." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEMENTS.map((p) => <div key={p.value} className="card p-4"><Megaphone className="size-5 text-teal" aria-hidden /><p className="mt-2 font-semibold">{p.label}</p></div>)}
      </div>
      <Notice tone="info" title="Fair advertising">Ads are reviewed before going live. No targeting on religion, caste, health or other sensitive attributes. Reach and results are never guaranteed. See the <Link to="/policies/advertising-policy" className="underline">Advertising Policy</Link>.</Notice>
      {role === 'business' || role === 'admin' ? <LinkButton to="/business-dashboard?tab=ads" className="justify-self-start">Create a campaign</LinkButton> : <p className="text-sm">To create campaigns, list your business first (or switch to the Business demo role). <LinkButton variant="secondary" size="sm" to="/businesses/new">List a business</LinkButton></p>}
    </div>
  );
}

const PACKAGES = [
  { id: 'setup', name: 'Profile setup', price: 499, items: ['Listing setup', 'Business description writing', '10 photos optimised'] },
  { id: 'design', name: 'Design pack', price: 1499, items: ['Logo & cover design', '5 promotional post designs'] },
  { id: 'web', name: 'Simple website', price: 4999, items: ['1–3 page website enquiry', 'Social links', 'Listing optimisation'] }
];

export function BusinessAssistancePage() {
  useDocumentTitle('Business assistance');
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [pkg, setPkg] = useState(PACKAGES[0].id);
  const [notes, setNotes] = useState('');
  const [requests, setRequests] = useState<{ pkg: string; status: string; at: string }[]>([]);
  return (
    <div className="grid gap-5">
      <PageHeader title="Business profile & website assistance" subtitle="Optional help to improve your online presence." badge={<DemoBadge label="Demo service" />} />
      <div className="grid gap-3 md:grid-cols-3">
        {PACKAGES.map((p) => (
          <label key={p.id} className={`card cursor-pointer p-4 ${pkg === p.id ? 'border-navy ring-2 ring-navy/15' : ''}`}>
            <input type="radio" className="sr-only" name="pkg" checked={pkg === p.id} onChange={() => setPkg(p.id)} />
            <p className="font-bold">{p.name}</p><p className="text-xl font-extrabold text-navy">{formatINR(p.price)}</p>
            <ul className="mt-2 list-disc pl-5 text-sm">{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </label>
        ))}
      </div>
      <form className="card grid gap-3 p-4" onSubmit={(e) => { e.preventDefault(); guard(() => { setRequests([{ pkg, status: 'received', at: nowIso() }, ...requests]); setNotes(''); toast('Request received (demo). No payment taken.'); }); }}>
        <TextArea label="Tell us about your business and what you need" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button type="submit" className="justify-self-start" icon={<Palette className="size-4" aria-hidden />}>Request this package</Button>
      </form>
      {requests.length > 0 && <SectionCard title="Your requests">{requests.map((r, i) => <div key={i} className="flex justify-between py-1 text-sm"><span>{PACKAGES.find((p) => p.id === r.pkg)?.name}</span><StatusPill status={r.status} /></div>)}</SectionCard>}
      <SectionCard title="Sample deliverables (illustrations)"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{['Logo', 'Cover', 'Offer post', 'Website'].map((x) => <div key={x}><ImagePlaceholder seed={x} className="aspect-square rounded-lg" label={`${x} sample placeholder`} /><p className="mt-1 text-center text-xs text-muted">{x}</p></div>)}</div></SectionCard>
    </div>
  );
}

export function B2BPage() {
  useDocumentTitle('Textile & B2B');
  const suppliers = useDB((s) => s.businesses.filter((b) => b.b2b));
  const reqs = useDB((s) => s.b2b);
  const events = useDB((s) => s.events.filter((e) => e.category === 'Exhibition' || e.category === 'Business'));
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [tab, setTab] = useState<'suppliers' | 'requirements' | 'events'>('suppliers');
  const [f, setF] = useState({ company: '', kind: 'buy' as B2BRequirement['kind'], product: '', quantity: '', details: '' });
  return (
    <div className="grid gap-5">
      <PageHeader title="Textile & B2B directory" subtitle="Manufacturers, fabric suppliers, traders, machinery and bulk enquiries." badge={<Badge tone="amber">Coming soon — preview</Badge>} />
      <Notice tone="info">Preview with sample records. Certifications, inventory and capacity are shown only when supplied and verified.</Notice>
      <Tabs label="B2B" value={tab} onChange={setTab} tabs={[{ id: 'suppliers', label: 'Supplier directory', count: suppliers.length }, { id: 'requirements', label: 'Buy / sell requirements', count: reqs.length }, { id: 'events', label: 'Trade events' }]} />
      {tab === 'suppliers' && <div className="grid gap-3 md:grid-cols-2">{suppliers.map((b) => <div key={b.id} className="grid gap-2"><BusinessCard b={b} /><EnquiryButton targetType="b2b" targetId={b.id} targetName={b.name} label="Bulk enquiry" variant="secondary" /></div>)}</div>}
      {tab === 'requirements' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ul className="grid content-start gap-3">{reqs.map((r) => (
            <li key={r.id} className="card p-4"><div className="flex gap-1.5"><Badge tone={r.kind === 'buy' ? 'blue' : 'green'}>{r.kind === 'buy' ? 'Buying' : 'Selling'}</Badge>{r.demo && <DemoBadge />}</div><p className="mt-1 font-semibold">{r.product}</p><p className="text-sm text-muted">{r.company} · {r.quantity} · {localityName(r.localityId)}</p><p className="text-sm">{r.details}</p>
              <div className="mt-2"><EnquiryButton targetType="b2b" targetId={r.id} targetName={r.company} label="Respond" variant="secondary" /></div></li>))}
          </ul>
          <form className="card grid content-start gap-3 p-4" onSubmit={(e) => { e.preventDefault(); guard(() => {
            if (!f.company.trim() || !f.product.trim()) { toast('Company and product are required.', 'error'); return; }
            repo.insert('b2b', { id: uid('bb'), company: sanitize(f.company, 100), kind: f.kind, product: sanitize(f.product, 120), quantity: sanitize(f.quantity, 60), localityId: 'riico', details: sanitize(f.details, 1000), status: 'open', createdAt: nowIso(), demo: true });
            toast('Requirement posted'); setF({ ...f, product: '', quantity: '', details: '' });
          }); }}>
            <h2 className="flex items-center gap-2 font-bold text-navy"><Factory className="size-5" aria-hidden />Post a requirement</h2>
            <TextField label="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            <Select label="I want to" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as B2BRequirement['kind'] })} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
            <TextField label="Product" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} />
            <TextField label="Quantity" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
            <TextArea label="Details" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
            <Button type="submit">Post</Button>
          </form>
        </div>
      )}
      {tab === 'events' && <div className="grid gap-3 md:grid-cols-2">{events.map((e) => <EventCard key={e.id} e={e} />)}</div>}
    </div>
  );
}

