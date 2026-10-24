import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Camera, EyeOff, Heart, Lock, MapPin, Minus, Plus, ShieldCheck, Ticket, UserX } from 'lucide-react';
import type { Booking, MatrimonialProfile } from '@/types/models';
import { EVENT_CATEGORIES, localityName, WEDDING_CATEGORIES } from '@/config/catalog';
import { useCurrentUser, useDB, useDocumentTitle, useLoading, useSession } from '@/hooks/useStore';
import { demoCheckout } from '@/services/adapters/payments';
import { notify, sanitize } from '@/services/domain/common';
import { repo } from '@/services/store';
import { BusinessCard, EventCard } from '@/components/cards';
import { CallButton, CommentsThread, EnquiryButton, ReportButton, ReviewsSection, SaveButton, SectionCard, ShareButton, useRequireAuth } from '@/components/shared';
import { Badge, Button, DemoBadge, EmptyState, ImagePlaceholder, KeyValue, LinkButton, Notice, PageHeader, Rating, SkeletonList, StatusPill, VerificationBadge } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { Checkbox, Select, TextArea, TextField } from '@/components/ui/form';
import { formatDateTime, formatINR } from '@/utils/format';
import { demoRef, nowIso, uid } from '@/utils/ids';
import NotFound from '@/app/NotFound';

export function WeddingsPage() {
  useDocumentTitle('Weddings');
  const loading = useLoading();
  const vendors = useDB((s) => s.businesses.filter((b) => b.wedding && b.verification !== 'suspended'));
  const [cat, setCat] = useState('');
  const [verified, setVerified] = useState(false);
  const [sort, setSort] = useState('rating');
  const list = vendors.filter((v) => (!cat || v.wedding === cat) && (!verified || v.verification === 'verified')).sort((a, b) => (sort === 'price' ? a.priceRange - b.priceRange : b.rating - a.rating));
  return (
    <div className="grid gap-5">
      <PageHeader title="Weddings & events" subtitle="Venues, photographers, makeup, mehendi, caterers, decorators and more." actions={<><LinkButton variant="secondary" to="/events">Events</LinkButton><LinkButton variant="secondary" to="/matrimonial">Matrimonial</LinkButton></>} />
      <div className="scroll-x">{['', ...WEDDING_CATEGORIES].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c || 'All vendors'}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="chip" aria-pressed={verified} onClick={() => setVerified(!verified)}>Verified only</button>
        <select aria-label="Sort" className="input min-h-9 w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value)}><option value="rating">Top rated</option><option value="price">Budget first</option></select>
        <span className="ml-auto text-sm text-muted">{list.length} vendors</span>
      </div>
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState title="No vendors in this category yet" action={<Button variant="secondary" onClick={() => { setCat(''); setVerified(false); }}>Show all</Button>} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((b) => <BusinessCard key={b.id} b={b} />)}</div>}
      <Link to="/services/wedding-services" className="card p-4 font-semibold hover:border-navy/30">Wedding helpers & event staff (per-day services) →</Link>
    </div>
  );
}

export function VendorPage() {
  const { id = '' } = useParams();
  const b = useDB((s) => s.businesses.find((x) => x.id === id));
  useDocumentTitle(b?.name ?? 'Vendor');
  if (!b) return <NotFound />;
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <nav className="text-sm text-muted"><Link to="/weddings" className="hover:underline">Weddings</Link> / {b.wedding ?? b.category}</nav>
      <header className="card grid gap-3 p-5">
        <div className="flex flex-wrap gap-1.5"><Badge tone="violet">{b.wedding ?? b.category}</Badge><VerificationBadge status={b.verification} />{b.demo && <DemoBadge label="Demo vendor" />}</div>
        <h1 className="text-2xl font-extrabold text-navy">{b.name}</h1>
        <Rating value={b.rating} count={b.reviewCount} size="md" />
        <p>{b.description}</p>
        <KeyValue items={[['Service area', `${localityName(b.localityId)} & Bhilwara district`], ['Indicative price', `${'₹'.repeat(b.priceRange)} (ask for a written quote)`], ['Services', b.products.join(', ')]]} />
        <div className="flex flex-wrap gap-2">
          <EnquiryButton targetType="vendor" targetId={b.id} targetName={b.name} ownerId={b.ownerId} label="Check availability" purpose="So the vendor can confirm your date and share a quote." />
          <CallButton phone={b.phone} name={b.name} /><SaveButton type="vendor" id={b.id} /><ShareButton title={b.name} /><ReportButton targetType="vendor" targetId={b.id} title={b.name} />
        </div>
      </header>
      <SectionCard title="Portfolio">
        <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, i) => <ImagePlaceholder key={i} seed={b.id + i} className="aspect-square rounded-lg" icon={<Camera className="size-6" aria-hidden />} label={`Portfolio image ${i + 1} placeholder`} />)}</div>
        <p className="mt-2 text-xs text-muted">Placeholders — vendors upload their own portfolio photos once profiles go live.</p>
      </SectionCard>
      <ReviewsSection targetType="vendor" targetId={b.id} targetName={b.name} />
    </div>
  );
}

export function EventsPage() {
  useDocumentTitle('Events');
  const loading = useLoading();
  const events = useDB((s) => s.events.filter((e) => e.status === 'published'));
  const [cat, setCat] = useState('');
  const [when, setWhen] = useState('');
  const [free, setFree] = useState(false);
  const list = events.filter((e) => {
    if (cat && e.category !== cat) return false;
    const days = (Date.parse(e.startsAt) - Date.now()) / 86400_000;
    if (days < -1) return false;
    if (when === 'week' && days > 7) return false;
    if (when === 'month' && days > 30) return false;
    if (free && Math.min(...e.ticketTypes.map((t) => t.price)) > 0) return false;
    return true;
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <div className="grid gap-5">
      <PageHeader title="Events in Bhilwara" subtitle="Festivals, culture, workshops, sports and business events." actions={<LinkButton variant="secondary" to="/weddings">Wedding vendors</LinkButton>} />
      <div className="scroll-x">{['', ...EVENT_CATEGORIES].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c || 'All'}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="When" className="input min-h-9 w-auto text-sm" value={when} onChange={(e) => setWhen(e.target.value)}><option value="">Any date</option><option value="week">Next 7 days</option><option value="month">Next 30 days</option></select>
        <button type="button" className="chip" aria-pressed={free} onClick={() => setFree(!free)}>Free entry</button>
        <span className="ml-auto text-sm text-muted">{list.length} events</span>
      </div>
      {loading ? <SkeletonList /> : list.length === 0 ? <EmptyState icon={<CalendarDays className="size-6" aria-hidden />} title="No events match" action={<Button variant="secondary" onClick={() => { setCat(''); setWhen(''); setFree(false); }}>Show all</Button>} /> : <div className="grid gap-3 md:grid-cols-2">{list.map((e) => <EventCard key={e.id} e={e} />)}</div>}
    </div>
  );
}

export function EventPage() {
  const { id = '' } = useParams();
  const e = useDB((s) => s.events.find((x) => x.id === id));
  useDocumentTitle(e?.title ?? 'Event');
  if (!e || e.status === 'pending_review') return <NotFound />;
  const past = Date.parse(e.endsAt) < Date.now();
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <nav className="text-sm text-muted"><Link to="/events" className="hover:underline">Events</Link> / {e.category}</nav>
      <ImagePlaceholder seed={e.id} className="h-48 rounded-2xl" icon={<Ticket className="size-12" aria-hidden />} label="Event image placeholder" />
      <header className="card grid gap-3 p-5">
        <div className="flex flex-wrap gap-1.5"><Badge tone="violet">{e.category}</Badge>{e.demo && <DemoBadge label="Sample event" />}{e.status === 'cancelled' && <Badge tone="red">Cancelled</Badge>}</div>
        <h1 className="text-2xl font-extrabold text-navy">{e.title}</h1>
        <p className="flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-muted" aria-hidden />{formatDateTime(e.startsAt)} – {formatDateTime(e.endsAt)}</p>
        <p className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-muted" aria-hidden />{e.venue}, {localityName(e.localityId)}</p>
        <p className="text-sm text-muted">Organised by {e.organizer}</p>
        <div className="flex flex-wrap gap-2">
          {!past && e.status === 'published' && <LinkButton to={`/events/${e.id}/book`} icon={<Ticket className="size-4" aria-hidden />}>Book tickets</LinkButton>}
          {e.registrationUrl && <a className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-semibold" href={e.registrationUrl} target="_blank" rel="noopener noreferrer">Organiser registration</a>}
          <SaveButton type="event" id={e.id} /><ShareButton title={e.title} /><ReportButton targetType="event" targetId={e.id} title={e.title} />
        </div>
      </header>
      <SectionCard title="About"><p>{e.description}</p></SectionCard>
      <SectionCard title="Tickets">
        <ul className="grid gap-2">{e.ticketTypes.map((t) => <li key={t.id} className="flex justify-between text-sm"><span>{t.name}</span><span className="font-semibold">{t.price ? formatINR(t.price) : 'Free'} <span className="font-normal text-muted">· {Math.max(0, t.capacity - t.sold)} left (demo)</span></span></li>)}</ul>
      </SectionCard>
      <CommentsThread targetType="event" targetId={e.id} title={e.title} />
    </div>
  );
}

export function EventBookingPage() {
  const { id = '' } = useParams();
  const e = useDB((s) => s.events.find((x) => x.id === id));
  const feePct = useDB((s) => s.settings.fees.eventBookingFeePercent);
  const user = useCurrentUser();
  const { userId } = useSession();
  const nav = useNavigate();
  const { toast } = useUI();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [names, setNames] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Booking | null>(null);
  const [err, setErr] = useState('');
  useDocumentTitle(e ? `Book: ${e.title}` : 'Book');
  const lines = useMemo(() => (e?.ticketTypes ?? []).filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ label: t.name, qty: qty[t.id], price: t.price })), [e, qty]);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const fee = Math.round((subtotal * feePct) / 100);
  if (!e) return <NotFound />;
  if (done) {
    return (
      <div className="mx-auto grid max-w-xl gap-4">
        <div className="card grid justify-items-center gap-2 p-6 text-center">
          <CheckCircle2 className="size-12 text-teal" aria-hidden />
          <h1 className="text-xl font-extrabold text-navy">Demo booking confirmed</h1>
          <p className="text-sm text-muted">No real ticket has been issued and no money was charged.</p>
          <p className="rounded-lg bg-amber-50 px-4 py-2 font-mono text-lg font-bold text-amber-700">{done.reference}</p>
          <p className="text-sm">{e.title} · {formatDateTime(e.startsAt)}</p>
          <ul className="text-sm">{done.lines.map((l) => <li key={l.label}>{l.qty} × {l.label}</li>)}</ul>
          <p className="font-semibold">Total {formatINR(done.total)}</p>
        </div>
        <Notice tone="info" title="Cancellation">Demo bookings can be cancelled from your profile. Real events follow the organiser’s refund policy (see Refund & Cancellation Policy).</Notice>
        <div className="flex gap-2"><LinkButton to="/profile?tab=bookings">My bookings</LinkButton><LinkButton variant="secondary" to="/events">More events</LinkButton></div>
      </div>
    );
  }
  const submit = async () => {
    if (!count) return setErr('Choose at least one ticket.');
    const filled = Array.from({ length: count }, (_, i) => sanitize(names[i] ?? (i === 0 ? user?.name ?? '' : ''), 60));
    if (filled.some((n) => n.length < 2)) return setErr('Enter a name for each attendee.');
    if (!agree) return setErr('Please accept the booking terms.');
    setErr(''); setBusy(true);
    let payNote = '';
    if (subtotal > 0) {
      const p = await demoCheckout({ description: `Tickets: ${e.title}`, amount: subtotal + fee, kind: 'booking' });
      if (p.status !== 'demo_success') { setBusy(false); setErr('Demo payment failed. Try again.'); return; }
      payNote = p.invoiceNo;
    }
    const b: Booking = { id: uid('bk'), kind: 'event', refId: e.id, title: e.title, userId: userId!, reference: demoRef(), lines, total: subtotal + fee, attendees: filled, status: 'demo_confirmed', date: e.startsAt, meta: payNote ? { invoice: payNote } : undefined, createdAt: nowIso(), demo: true };
    repo.insert('bookings', b);
    repo.at('events').mutate(e.id, (c) => ({ ticketTypes: c.ticketTypes.map((t) => ({ ...t, sold: t.sold + (qty[t.id] ?? 0) })) }));
    notify(userId!, 'booking', 'Demo booking confirmed', `${e.title} · ${b.reference}`, '/profile?tab=bookings');
    setBusy(false); setDone(b); toast('Demo booking confirmed');
  };
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <PageHeader title="Book tickets" subtitle={`${e.title} · ${formatDateTime(e.startsAt)}`} badge={<DemoBadge label="Demo checkout" />} />
      <SectionCard title="1. Tickets">
        <ul className="grid gap-3">
          {e.ticketTypes.map((t) => {
            const left = Math.max(0, t.capacity - t.sold);
            const n = qty[t.id] ?? 0;
            return (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span><span className="block font-semibold">{t.name}</span><span className="text-sm text-muted">{t.price ? formatINR(t.price) : 'Free'} · {left} left</span></span>
                <span className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" aria-label={`Fewer ${t.name}`} disabled={n === 0} onClick={() => setQty({ ...qty, [t.id]: n - 1 })}><Minus className="size-4" aria-hidden /></Button>
                  <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{n}</span>
                  <Button size="sm" variant="secondary" aria-label={`More ${t.name}`} disabled={n >= Math.min(10, left)} onClick={() => setQty({ ...qty, [t.id]: n + 1 })}><Plus className="size-4" aria-hidden /></Button>
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>
      {count > 0 && (
        <SectionCard title="2. Attendee details">
          <div className="grid gap-3">{Array.from({ length: count }, (_, i) => <TextField key={i} label={`Attendee ${i + 1} name`} value={names[i] ?? (i === 0 ? user?.name ?? '' : '')} onChange={(ev) => { const c = [...names]; c[i] = ev.target.value; setNames(c); }} />)}</div>
        </SectionCard>
      )}
      <SectionCard title="3. Price summary">
        <dl className="grid gap-1 text-sm">
          {lines.map((l) => <div key={l.label} className="flex justify-between"><dt>{l.qty} × {l.label}</dt><dd>{formatINR(l.qty * l.price)}</dd></div>)}
          <div className="flex justify-between"><dt>Booking fee ({feePct}%)</dt><dd>{formatINR(fee)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{formatINR(subtotal + fee)}</dd></div>
        </dl>
        <div className="mt-3"><Checkbox checked={agree} onChange={setAgree} label="I understand this is a demo booking: no ticket is issued and no money is charged." /></div>
      </SectionCard>
      {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button loading={busy} onClick={submit}>{subtotal > 0 ? `Pay ${formatINR(subtotal + fee)} (demo)` : 'Confirm (free)'}</Button></div>
    </div>
  );
}

/* --------------------------- Matrimonial (privacy-first) --------------------------- */

export function MatrimonialPage() {
  useDocumentTitle('Matrimonial');
  const { userId } = useSession();
  const user = useCurrentUser();
  const profiles = useDB((s) => s.matrimonial);
  const mine = profiles.find((p) => p.userId === userId);
  const guard = useRequireAuth();
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [view, setView] = useState<MatrimonialProfile | null>(null);
  const blocked = user?.blocked ?? [];
  const list = profiles.filter((p) => p.userId !== userId && p.status === 'active' && !blocked.includes(p.userId));
  return (
    <div className="grid gap-5">
      <PageHeader title="Matrimonial" subtitle="A privacy-first introductions directory." badge={<DemoBadge label="Demo profiles" />} />
      <Notice tone="info" title="Your privacy">Phone numbers, exact addresses, ID documents and photos are hidden by default. Contact details are shared only if both people accept an interest and you allow it. We never use this information for ads.</Notice>
      <Tabs label="Matrimonial" value={tab} onChange={setTab} tabs={[{ id: 'browse', label: 'Browse' }, { id: 'mine', label: mine ? 'My profile' : 'Create profile' }]} />
      {tab === 'browse' ? (
        list.length === 0 ? <EmptyState title="No profiles to show" /> : (
          <ul className="grid gap-3 md:grid-cols-3">
            {list.map((p) => {
              const sent = mine?.interestsSent.includes(p.id);
              return (
                <li key={p.id} className="card grid gap-2 p-4">
                  <div className="grid h-28 place-items-center rounded-xl bg-page text-muted"><EyeOff className="size-6" aria-hidden /><span className="text-xs">{p.photoVisibility === 'hidden' ? 'Photo private' : 'Photo shown after acceptance'}</span></div>
                  <p className="font-bold">{p.displayName}, {p.age}</p>
                  <p className="text-sm text-muted">{p.education} · {p.profession} · {p.generalLocation}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setView(p)}>View</Button>
                    <Button size="sm" disabled={sent} icon={<Heart className="size-4" aria-hidden />} onClick={() => guard(() => {
                      if (!mine) { toast('Create your profile first.', 'info'); setTab('mine'); return; }
                      repo.at('matrimonial').mutate(mine.id, (c) => ({ interestsSent: [...c.interestsSent, p.id] }));
                      repo.at('matrimonial').mutate(p.id, (c) => ({ interestsReceived: [...c.interestsReceived, mine.id] }));
                      toast('Interest sent (demo). Contact stays hidden unless accepted.');
                    })}>{sent ? 'Interest sent' : 'Send interest'}</Button>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<UserX className="size-4" aria-hidden />} onClick={async () => { if (user && await confirm({ title: 'Block this profile?', message: 'You won’t see each other in the directory.', danger: true, confirmLabel: 'Block' })) { repo.patch('users', user.id, { blocked: [...user.blocked, p.userId] }); toast('Profile blocked'); } }}>Block</Button>
                    <ReportButton targetType="matrimonial" targetId={p.id} title={p.displayName} compact />
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : <MyMatrimonial mine={mine} />}
      <Dialog open={!!view} onClose={() => setView(null)} title={view ? `${view.displayName}, ${view.age}` : ''}>
        {view && <div className="grid gap-2 text-sm"><p><b>Education:</b> {view.education}</p><p><b>Profession:</b> {view.profession}</p><p><b>Location:</b> {view.generalLocation}</p><p><b>About:</b> {view.about}</p><p><b>Looking for:</b> {view.preferences}</p><p className="mt-2 flex items-center gap-1 text-muted"><Lock className="size-4" aria-hidden />Contact details hidden</p></div>}
      </Dialog>
    </div>
  );
}

function MyMatrimonial({ mine }: { mine?: MatrimonialProfile }) {
  const { userId } = useSession();
  const user = useCurrentUser();
  const profiles = useDB((s) => s.matrimonial);
  const { toast } = useUI();
  const guard = useRequireAuth();
  const [f, setF] = useState({ displayName: mine?.displayName ?? (user ? `${user.name.split(' ')[0]}` : ''), age: String(mine?.age ?? ''), education: mine?.education ?? '', profession: mine?.profession ?? '', generalLocation: mine?.generalLocation ?? 'Bhilwara', about: mine?.about ?? '', preferences: mine?.preferences ?? '', photoVisibility: mine?.photoVisibility ?? 'hidden' as MatrimonialProfile['photoVisibility'], contactVisibility: mine?.contactVisibility ?? 'hidden' as MatrimonialProfile['contactVisibility'] });
  const [consent, setConsent] = useState(!!mine);
  const received = profiles.filter((p) => mine?.interestsReceived.includes(p.id));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form className="card grid gap-3 p-4" onSubmit={(e) => { e.preventDefault(); guard(() => {
        if (!consent) { toast('Please confirm consent.', 'error'); return; }
        if (!(Number(f.age) >= 18)) { toast('You must be 18 or older (21+ for men under Indian law).', 'error'); return; }
        const data = { displayName: sanitize(f.displayName, 40), age: Number(f.age), education: sanitize(f.education, 60), profession: sanitize(f.profession, 60), generalLocation: sanitize(f.generalLocation, 60), about: sanitize(f.about, 600), preferences: sanitize(f.preferences, 400), photoVisibility: f.photoVisibility, contactVisibility: f.contactVisibility };
        if (mine) repo.patch('matrimonial', mine.id, data);
        else repo.insert('matrimonial', { id: uid('mt'), userId: userId!, ...data, interestsReceived: [], interestsSent: [], status: 'active', createdAt: nowIso(), demo: true });
        toast(mine ? 'Profile updated' : 'Profile created');
      }); }}>
        <h2 className="font-bold text-navy">{mine ? 'Edit profile' : 'Create profile'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Display name (first name or initials)" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
          <TextField label="Age" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
          <TextField label="Education" value={f.education} onChange={(e) => setF({ ...f, education: e.target.value })} />
          <TextField label="Profession" value={f.profession} onChange={(e) => setF({ ...f, profession: e.target.value })} />
        </div>
        <TextField label="General location (city/district only)" value={f.generalLocation} onChange={(e) => setF({ ...f, generalLocation: e.target.value })} />
        <TextArea label="About you" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} />
        <TextArea label="Partner preferences" value={f.preferences} onChange={(e) => setF({ ...f, preferences: e.target.value })} />
        <Select label="Photo visibility" value={f.photoVisibility} onChange={(e) => setF({ ...f, photoVisibility: e.target.value as MatrimonialProfile['photoVisibility'] })} options={[{ value: 'hidden', label: 'Hidden' }, { value: 'on_accept', label: 'Show after I accept an interest' }]} />
        <Select label="Contact visibility" value={f.contactVisibility} onChange={(e) => setF({ ...f, contactVisibility: e.target.value as MatrimonialProfile['contactVisibility'] })} options={[{ value: 'hidden', label: 'Never shown — talk via One Bhilwara' }, { value: 'on_accept', label: 'Share after mutual acceptance' }]} />
        <Checkbox checked={consent} onChange={setConsent} label="I am creating this profile for myself (or with the person’s consent) and agree to the community guidelines." />
        <Button type="submit" icon={<ShieldCheck className="size-4" aria-hidden />}>{mine ? 'Save' : 'Create profile'}</Button>
        {mine && <Button variant="ghost" onClick={() => { repo.patch('matrimonial', mine.id, { status: mine.status === 'hidden' ? 'active' : 'hidden' }); toast(mine.status === 'hidden' ? 'Profile visible' : 'Profile hidden'); }}>{mine.status === 'hidden' ? 'Unhide profile' : 'Hide my profile'}</Button>}
      </form>
      <SectionCard title="Interests received">
        {received.length === 0 ? <p className="text-sm text-muted">No interests yet.</p> : received.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2 text-sm"><span>{p.displayName}, {p.age} · {p.profession}</span>
            <span className="flex gap-1"><Button size="sm" onClick={() => toast('Accepted (demo). Contact sharing follows both people’s settings.')}>Accept</Button><Button size="sm" variant="ghost" onClick={() => { repo.at('matrimonial').mutate(mine!.id, (c) => ({ interestsReceived: c.interestsReceived.filter((x) => x !== p.id) })); toast('Declined'); }}>Decline</Button></span></div>
        ))}
        {mine && <p className="mt-2 text-xs text-muted">Status: <StatusPill status={mine.status} /></p>}
      </SectionCard>
    </div>
  );
}
