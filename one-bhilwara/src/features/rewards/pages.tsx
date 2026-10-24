import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Award, CalendarCheck, Flag, Gift, Landmark, MapPin, QrCode, Sparkles, Trophy } from 'lucide-react';
import type { ClaimedVoucher, Offer } from '@/types/models';
import { useDB, useDocumentTitle, useSession } from '@/hooks/useStore';
import { awardPoints, pointsTotal } from '@/services/domain/common';
import { store } from '@/services/store';
import { OfferCard } from '@/components/cards';
import { useRequireAuth } from '@/components/shared';
import { Badge, Button, cx, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, StatusPill } from '@/components/ui/primitives';
import { Dialog, Tabs, useUI } from '@/components/ui/overlay';
import { formatDate, formatDateTime } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';

const today = () => new Date().toISOString().slice(0, 10);

export function OffersPage() {
  useDocumentTitle('Offers & vouchers');
  const [params] = useSearchParams();
  const { userId } = useSession();
  const offers = useDB((s) => s.offers);
  const vouchers = useDB((s) => s.vouchers.filter((v) => v.userId === userId));
  const [tab, setTab] = useState<'offers' | 'mine'>('offers');
  const [cat, setCat] = useState('');
  const [detail, setDetail] = useState<Offer | null>(() => offers.find((o) => o.id === params.get('id')) ?? null);
  const guard = useRequireAuth();
  const { toast } = useUI();
  const cats = Array.from(new Set(offers.map((o) => o.category)));
  const list = offers.filter((o) => o.status !== 'paused' && (!cat || o.category === cat)).sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || Number(!!b.sponsored) - Number(!!a.sponsored));
  const claim = (o: Offer) => guard(() => {
    if (vouchers.some((v) => v.offerId === o.id)) { toast('You already claimed this voucher.', 'info'); return; }
    if (o.status !== 'active') { toast('This offer has expired.', 'error'); return; }
    const v: ClaimedVoucher = { id: uid('vc'), offerId: o.id, userId: userId!, code: `DEMO-${o.id.toUpperCase().replace('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, status: 'claimed', claimedAt: nowIso(), demo: true };
    store.update((s) => ({ vouchers: [v, ...s.vouchers] }));
    toast('Sample voucher claimed — it is not redeemable at real businesses.');
  });
  return (
    <div className="grid gap-5">
      <PageHeader title="Offers & vouchers" subtitle="Deals from local shops, restaurants, services and events." />
      <Notice tone="demo">All vouchers here are samples for demonstration. They are not guaranteed or redeemable until participating businesses join.</Notice>
      <Tabs label="Offers" value={tab} onChange={setTab} tabs={[{ id: 'offers', label: 'All offers' }, { id: 'mine', label: 'My vouchers', count: vouchers.length }]} />
      {tab === 'offers' ? (
        <>
          <div className="scroll-x">{['', ...cats].map((c) => <button key={c || 'all'} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c || 'All'}</button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((o) => (
              <div key={o.id} className="grid gap-2">
                <OfferCard o={o} claimed={vouchers.some((v) => v.offerId === o.id)} onClaim={() => claim(o)} />
                <Button variant="ghost" size="sm" onClick={() => setDetail(o)}>Terms & details</Button>
              </div>
            ))}
          </div>
        </>
      ) : vouchers.length === 0 ? <EmptyState icon={<Gift className="size-6" aria-hidden />} title="No vouchers yet" action={<Button variant="secondary" onClick={() => setTab('offers')}>Browse offers</Button>} /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {vouchers.map((v) => {
            const o = offers.find((x) => x.id === v.offerId);
            return (
              <li key={v.id} className="card grid gap-2 p-4">
                <div className="flex justify-between gap-2"><p className="font-bold">{o?.title}</p><StatusPill status={v.status} /></div>
                <p className="text-sm text-muted">{o?.businessName} · valid until {o && formatDate(o.validTo)}</p>
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-line p-3"><QrCode className="size-12 text-navy" aria-label="QR code placeholder" /><span><span className="block font-mono font-bold">{v.code}</span><span className="text-xs text-muted">Sample code — QR placeholder</span></span></div>
                <p className="text-sm">{o?.redemption}</p>
                {v.status === 'claimed' && <Button size="sm" variant="secondary" onClick={() => { store.update((s) => ({ vouchers: s.vouchers.map((x) => (x.id === v.id ? { ...x, status: 'redeemed' } : x)) })); toast('Marked as redeemed (demo)'); }}>Mark as redeemed (demo)</Button>}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ''} description={detail?.businessName}
        footer={detail && <><LinkButton variant="secondary" to={`/businesses/${detail.businessId}`}>View business</LinkButton><Button onClick={() => { claim(detail); setDetail(null); }} disabled={detail.status !== 'active'}>Claim</Button></>}>
        {detail && <div className="grid gap-2 text-sm"><p>{detail.description}</p><p><b>Benefit:</b> {detail.benefit}</p><p><b>Valid:</b> {formatDate(detail.validFrom)} – {formatDate(detail.validTo)}</p><p className="font-semibold">Terms</p><ul className="list-disc pl-5">{detail.terms.map((t) => <li key={t}>{t}</li>)}</ul><p><b>How to redeem:</b> {detail.redemption}</p></div>}
      </Dialog>
    </div>
  );
}

const PLACES = [
  { id: 'harni', name: 'Harni Mahadev (demo check-in)' }, { id: 'pur', name: 'Pur — Adhar Shila (demo check-in)' }, { id: 'mandalgarh', name: 'Mandalgarh Fort (demo check-in)' }, { id: 'gandhi-sagar', name: 'Gandhi Sagar lake (demo check-in)' }
];
const WHEEL = ['5 bonus points', 'Better luck next time', '10 bonus points', 'Sample café voucher*', 'Better luck next time', '2 bonus points'];

export function RewardsPage() {
  useDocumentTitle('Rewards');
  const { userId } = useSession();
  const db = useDB((s) => s);
  const flags = db.settings.featureFlags;
  const total = pointsTotal(userId);
  const checkins = db.checkins.filter((c) => c.userId === userId);
  const spunToday = db.spins.some((s) => s.userId === userId && s.at.slice(0, 10) === today());
  const myVotes = db.votes.filter((v) => v.userId === userId).length;
  const myPosts = db.posts.filter((p) => p.userId === userId).length + db.comments.filter((c) => c.userId === userId).length;
  const myReviews = db.reviews.filter((r) => r.userId === userId).length;
  const guard = useRequireAuth();
  const { toast } = useUI();
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState('');
  const checkedToday = (ref: string) => checkins.some((c) => c.ref === ref && c.at.slice(0, 10) === today());
  const checkIn = (kind: 'daily' | 'place', ref: string, label: string) => guard(() => {
    if (checkedToday(ref)) { toast('Already checked in today.', 'info'); return; }
    store.update((s) => ({ checkins: [{ userId: userId!, kind, ref, at: nowIso() }, ...s.checkins] }));
    const pts = awardPoints(kind === 'daily' ? 'daily_checkin' : 'place_checkin', label);
    toast(`Checked in · +${pts} points`);
  });
  const badges = [
    { name: 'Poll participant', desc: 'Vote in 1 poll', earned: myVotes >= 1, I: Award },
    { name: 'Civic voice', desc: 'Vote in 5 polls', earned: myVotes >= 5, I: Trophy },
    { name: 'Community contributor', desc: 'Post or comment 3 times', earned: myPosts >= 3, I: Sparkles },
    { name: 'Heritage explorer', desc: 'Check in at 3 heritage places', earned: new Set(checkins.filter((c) => c.kind === 'place').map((c) => c.ref)).size >= 3, I: Landmark },
    { name: 'Honest reviewer', desc: 'Write a first-hand review (no points given for reviews)', earned: myReviews >= 1, I: Flag }
  ];
  const challenges = [
    { name: 'Explore 3 categories this week', progress: Math.min(3, db.searches.length), goal: 3 },
    { name: 'Check in at 2 heritage places', progress: Math.min(2, new Set(checkins.filter((c) => c.kind === 'place').map((c) => c.ref)).size), goal: 2 }
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Rewards & engagement" subtitle="Earn points for taking part in your city." badge={<DemoBadge label="Demo rewards" />} actions={<LinkButton variant="secondary" to="/offers">Offers</LinkButton>} />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card bg-navy p-5 text-white"><p className="text-sm text-white/70">Your points</p><p className="text-4xl font-extrabold">{total}</p><p className="mt-1 text-xs text-white/70">Engagement credits only — not money and not exchangeable for cash.</p></div>
        <div className="card p-5"><p className="flex items-center gap-2 font-bold"><CalendarCheck className="size-5 text-teal" aria-hidden />Daily check-in</p><p className="text-sm text-muted">Once per day.</p><Button className="mt-3" disabled={checkedToday('daily')} onClick={() => checkIn('daily', 'daily', 'Daily check-in')}>{checkedToday('daily') ? 'Checked in today' : 'Check in'}</Button></div>
        <div className="card p-5"><p className="flex items-center gap-2 font-bold"><Gift className="size-5 text-amber" aria-hidden />Diwali campaign (sample)</p><p className="text-sm text-muted">Participate in festival activities to earn bonus points. Campaign rules apply.</p><Badge tone="amber" className="mt-2">Ends {formatDate(new Date(Date.now() + 20 * 86400_000))}</Badge></div>
      </div>

      {flags.spinWheel && (
        <section className="card grid gap-3 p-5 md:grid-cols-[200px_1fr]">
          <div className={cx('mx-auto grid size-44 place-items-center rounded-full border-8 border-amber bg-[conic-gradient(var(--color-navy)_0_60deg,var(--color-teal)_60deg_120deg,var(--color-amber)_120deg_180deg,var(--color-navy)_180deg_240deg,var(--color-teal)_240deg_300deg,var(--color-amber)_300deg_360deg)] transition-transform duration-1000', spinning && 'rotate-[1080deg]')} aria-hidden>
            <span className="grid size-14 place-items-center rounded-full bg-white font-bold text-navy">SPIN</span>
          </div>
          <div>
            <h2 className="font-bold text-navy">Spin the wheel (demo)</h2>
            <p className="text-sm text-muted">One spin per account per day. Prizes are simulated; “sample vouchers” are not redeemable.</p>
            <Button className="mt-3" disabled={spunToday || spinning} onClick={() => guard(() => {
              setSpinning(true); setSpinResult('');
              setTimeout(() => {
                const r = WHEEL[Math.floor(Math.random() * WHEEL.length)];
                store.update((s) => ({ spins: [{ userId: userId!, at: nowIso(), result: r }, ...s.spins] }));
                const m = r.match(/^(\d+) bonus/);
                if (m) store.update((s) => ({ points: [{ id: uid('pt'), userId: userId!, action: 'campaign', points: Number(m[1]), at: nowIso(), note: 'Spin the wheel (demo)' }, ...s.points] }));
                setSpinResult(r); setSpinning(false);
              }, 1100);
            })}>{spunToday ? 'Come back tomorrow' : 'Spin'}</Button>
            {spinResult && <p className="mt-2 font-semibold" role="status">Result: {spinResult}</p>}
            <p className="mt-2 text-xs text-muted">*Anti-abuse: limits per account and device; production requires server-side checks.</p>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-bold text-navy">Temple & heritage check-ins</h2>
        <ul className="grid gap-2 sm:grid-cols-2">{PLACES.map((p) => (
          <li key={p.id} className="card flex items-center justify-between gap-2 p-3"><span className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-teal" aria-hidden />{p.name}</span>
            <Button size="sm" variant="secondary" disabled={checkedToday(p.id)} onClick={() => checkIn('place', p.id, `Checked in: ${p.name}`)}>{checkedToday(p.id) ? 'Done today' : 'Check in'}</Button></li>
        ))}</ul>
        <p className="mt-1 text-xs text-muted">Demo check-ins don’t verify your location. Production would require on-site verification with your consent.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4"><h2 className="mb-2 font-bold text-navy">Badges</h2><ul className="grid gap-2">{badges.map(({ name, desc, earned, I }) => (
          <li key={name} className={cx('flex items-center gap-3 rounded-lg p-2', earned ? 'bg-teal-50' : 'opacity-60')}><I className={cx('size-6', earned ? 'text-teal' : 'text-muted')} aria-hidden /><span><span className="block text-sm font-semibold">{name}{earned ? ' ✓' : ''}</span><span className="text-xs text-muted">{desc}</span></span></li>
        ))}</ul></div>
        <div className="card p-4"><h2 className="mb-2 font-bold text-navy">Local discovery challenges</h2><ul className="grid gap-3">{challenges.map((c) => (
          <li key={c.name}><div className="flex justify-between text-sm"><span>{c.name}</span><span>{c.progress}/{c.goal}</span></div><div className="mt-1 h-2 rounded-full bg-page"><div className="h-full rounded-full bg-teal" style={{ width: `${(c.progress / c.goal) * 100}%` }} /></div></li>
        ))}</ul></div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-bold text-navy">Points history</h2>
        {db.points.filter((p) => p.userId === userId).length === 0 ? <p className="text-sm text-muted">No points yet.</p> : (
          <ul className="divide-y divide-line text-sm">{db.points.filter((p) => p.userId === userId).slice(0, 15).map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.note}</span><span className="text-muted">+{p.points} · {formatDateTime(p.at)}</span></li>)}</ul>
        )}
      </section>
      <Notice tone="info" title="Campaign terms (draft)">Points have no cash value and can’t be transferred. We never award points for reviews or ratings, and we remove points earned through fake accounts or automated activity. Rules may change; legal review pending.</Notice>
      <Link to="/polls" className="text-sm font-semibold text-teal underline">Vote in polls to earn points →</Link>
    </div>
  );
}
