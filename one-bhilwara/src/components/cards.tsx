import { Link } from 'react-router-dom';
import { CalendarDays, CircleCheck, GraduationCap, HeartPulse, MapPin, ShoppingBag, Star, Store, Tag, Ticket } from 'lucide-react';
import type { Article, Business, CityEvent, Classified, Institution, HealthProvider, Job, Offer, Professional, Property, Provider } from '@/types/models';
import { localityName, newsCategoryName, serviceName } from '@/config/catalog';
import { useNow } from '@/hooks/useStore';
import { isActiveWithin } from '@/services/domain/serviceMatching';
import { formatDate, formatDateTime, formatINR, formatINRShort, timeAgo } from '@/utils/format';
import { CityScene, RoomScene, WorkerPortrait } from './illustrations';
import { Badge, cx, DemoBadge, ImagePlaceholder, Rating, SponsoredTag, VerificationBadge } from './ui/primitives';
import { HeartButton, SaveButton } from './shared';

export function ArticleCard({ a, variant = 'list' }: { a: Article; variant?: 'list' | 'hero' | 'compact' }) {
  // Feed cards lead with the Hindi headline when one exists (as most local readers expect).
  const title = a.titleHi ?? a.title;
  if (variant === 'compact') {
    return (
      <Link to={`/news/${a.id}`} className="block py-3 hover:bg-page/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{newsCategoryName(a.category)}</p>
        <p className="font-semibold leading-snug text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{a.source} · {timeAgo(a.publishedAt)}</p>
      </Link>
    );
  }
  if (variant === 'hero') {
    return (
      <article className="card overflow-hidden">
        <Link to={`/news/${a.id}`} className="block"><CityScene seed={a.id} className="h-44 w-full" label="Illustration (no photo supplied)" /></Link>
        <div className="p-4">
          <div className="mb-1 flex flex-wrap items-center gap-1.5"><Badge tone="blue">{newsCategoryName(a.category)}</Badge>{a.localityId && <Badge><MapPin className="size-3" aria-hidden />{localityName(a.localityId)}</Badge>}{a.demo && <DemoBadge label="Demo story" />}</div>
          <Link to={`/news/${a.id}`}><h3 className="text-lg font-bold leading-snug text-ink hover:text-brand">{title}</h3></Link>
          <p className="mt-1 text-sm text-muted">{a.summary}</p>
          <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-muted">{a.source} · {timeAgo(a.publishedAt)}</p><SaveButton type="article" id={a.id} compact /></div>
        </div>
      </article>
    );
  }
  return (
    <article className="card relative flex gap-3 p-3">
      <CityScene seed={a.id} className="h-[76px] w-[104px] shrink-0 rounded-xl" label="Illustration (no photo supplied)" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/news/${a.id}`} className="after:absolute after:inset-0"><h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{title}</h3></Link>
        <p className="mt-auto pt-1 text-xs text-muted">{a.source.replace(' (Demo)', '')} · {timeAgo(a.publishedAt)}{a.demo && <span className="font-semibold text-amber-700"> · Demo</span>}</p>
      </div>
    </article>
  );
}

const TOOL: Record<string, string> = { plumber: '🔧', electrician: '⚡', ac: '❄️', cleaning: '🧽', carpenter: '🪚', painter: '🖌️', mechanic: '🛠️', salon: '✂️', beautician: '💄', tutor: '📘', gardener: '🌿', pest: '🪲', movers: '📦', 'device-repair': '📱', appliance: '🔌' };

export function ProviderCard({ p }: { p: Provider }) {
  const now = useNow(60_000);
  const availability = { available: ['Available today', 'text-teal'], busy: ['Busy right now', 'text-amber-700'], offline: ['Not available', 'text-muted'] } as const;
  const [label, tone] = availability[p.availability];
  return (
    <article className="card relative flex gap-3 p-3">
      <WorkerPortrait seed={p.id} tool={TOOL[p.category] ?? '🧰'} className="size-[88px] shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link to={`/service-providers/${p.id}`} className="font-bold leading-snug text-ink hover:text-brand">{p.name}</Link>
        <p className="flex items-center gap-1 text-xs text-muted"><Star className="size-3.5 fill-amber text-amber" aria-hidden /><span className="font-semibold text-amber-700">{p.rating.toFixed(1)}</span> ({p.reviewCount} reviews) · {serviceName(p.category)}</p>
        {p.verification === 'verified' && <p className="flex items-center gap-1 text-xs font-semibold text-teal"><CircleCheck className="size-3.5 fill-teal text-white" aria-hidden />Verified</p>}
        <p className={cx('text-xs font-medium', tone)}>{label}{isActiveWithin(p, 24, now) && p.availability !== 'available' ? ' · active recently' : ''}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <p className="text-sm font-bold text-ink">{p.priceFrom ? `${formatINR(p.priceFrom)} onwards` : 'Quote on visit'}</p>
          <Link to={`/service-requests/new?category=${p.category}&provider=${p.id}`} className="relative z-10 inline-flex min-h-9 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-600">Book Now</Link>
        </div>
      </div>
    </article>
  );
}

const JOB_TYPE: Record<Job['type'], string> = { full_time: 'Full-time', part_time: 'Part-time', internship: 'Internship', wfh: 'Work from home', temporary: 'Temporary' };
export const jobTypeLabel = (t: Job['type']) => JOB_TYPE[t];

const LOGO_TINTS = ['bg-blue-50 text-blue-700', 'bg-orange-50 text-orange-600', 'bg-emerald-50 text-emerald-700', 'bg-violet-50 text-violet-700', 'bg-rose-50 text-rose-600', 'bg-amber-50 text-amber-700'];

export function JobCard({ j }: { j: Job }) {
  const initials = j.employerName.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const tint = LOGO_TINTS[[...j.employerName].reduce((a, c) => a + c.charCodeAt(0), 0) % LOGO_TINTS.length];
  const fresher = /fresher|none|students/i.test(j.experience);
  return (
    <article className={cx('card relative p-4', j.featured && 'ring-1 ring-amber/40')}>
      <div className="flex items-start gap-3">
        <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold', tint)} aria-hidden>{initials}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/jobs/${j.id}`} className="font-bold leading-snug text-ink after:absolute after:inset-0 hover:text-brand">{j.title}</Link>
            <span className="shrink-0 text-xs text-muted">{timeAgo(j.createdAt)}</span>
          </div>
          <p className="text-sm text-ink/80">{j.employerName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5" aria-hidden />{j.localityId === 'all' ? 'Work from home' : `${localityName(j.localityId)}, Bhilwara`}</p>
          <p className="mt-1 font-bold text-teal">{formatINR(j.salaryMin)} - {formatINR(j.salaryMax).replace('₹', '')}/{j.salaryPeriod === 'month' ? 'month' : j.salaryPeriod}</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="blue">{JOB_TYPE[j.type]}</Badge>
              {fresher && <Badge tone="green">Freshers Welcome</Badge>}
              {j.urgent && <Badge tone="amber">Immediate Joining</Badge>}
              {j.featured && <SponsoredTag label="Featured" />}
              {j.verifiedEmployer && <Badge tone="teal">Verified employer</Badge>}
            </div>
            <Link to={`/jobs/${j.id}?apply=1`} className="relative z-10 inline-flex min-h-9 shrink-0 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-600">Apply</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PropertyCard({ p }: { p: Property }) {
  const kind = p.student || p.bedrooms ? 'bed' : ['Shop', 'Commercial', 'Office', 'Industrial'].includes(p.category) ? 'shop' : 'living';
  const furnish = { furnished: 'Furnished', semi: 'Semi Furnished', unfurnished: 'Unfurnished' }[p.furnishing];
  return (
    <article className="card relative flex gap-3 p-3">
      <RoomScene seed={p.id} kind={kind} className="h-[92px] w-[116px] shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/property/${p.id}`} className="font-bold leading-snug text-ink after:absolute after:inset-0 hover:text-brand">{p.title}</Link>
          <span className="relative z-10"><HeartButton type="property" id={p.id} /></span>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{localityName(p.localityId)}, Bhilwara</span></p>
        <p className="mt-1 text-[17px] font-bold text-brand">{p.listingType === 'sale' ? formatINRShort(p.price) : `${formatINR(p.price)}/month`}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {p.bedrooms !== undefined && <Badge tone="blue">{p.bedrooms} BHK</Badge>}
          {p.student && <Badge tone="blue">{p.category}</Badge>}
          {p.student?.meals && <Badge tone="green">Food Included</Badge>}
          <Badge tone="green">{furnish}</Badge>
          {p.verification === 'verified' && <Badge tone="teal">Verified</Badge>}
          {!p.available && <Badge tone="red">Not available</Badge>}
          {p.demo && <DemoBadge label="Demo" />}
        </div>
      </div>
    </article>
  );
}

const COND: Record<Classified['condition'], string> = { new: 'New', like_new: 'Like new', good: 'Good', fair: 'Fair' };
export const conditionLabel = (c: Classified['condition']) => COND[c];

export function ClassifiedCard({ c }: { c: Classified }) {
  return (
    <article className="card overflow-hidden">
      <div className="relative">
        <ImagePlaceholder seed={c.id} className="aspect-[4/3]" icon={<ShoppingBag className="size-8" aria-hidden />} label={`${c.title} photo placeholder`} />
        {c.status === 'sold' && <span className="absolute inset-0 grid place-items-center bg-navy/60 text-lg font-bold text-white">SOLD</span>}
        <div className="absolute right-2 top-2"><SaveButton type="classified" id={c.id} compact /></div>
      </div>
      <div className="p-3">
        <p className="font-bold text-navy">{formatINR(c.price)} {c.negotiable && <span className="text-xs font-normal text-muted">negotiable</span>}</p>
        <Link to={`/marketplace/${c.id}`} className="line-clamp-2 text-sm font-semibold text-ink hover:text-brand">{c.title}</Link>
        <p className="mt-1 text-xs text-muted">{COND[c.condition]} · {localityName(c.localityId)} · {timeAgo(c.createdAt)}</p>
      </div>
    </article>
  );
}

export function EventCard({ e }: { e: CityEvent }) {
  const d = new Date(e.startsAt);
  const minPrice = Math.min(...e.ticketTypes.map((t) => t.price));
  return (
    <article className="card flex gap-3 p-3">
      <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-brand text-white">
        <div className="text-center leading-tight"><p className="text-xs uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</p><p className="text-2xl font-extrabold">{d.getDate()}</p></div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5"><Badge tone="violet">{e.category}</Badge>{e.demo && <DemoBadge label="Sample event" />}</div>
        <Link to={`/events/${e.id}`} className="mt-0.5 block font-bold text-ink hover:text-brand">{e.title}</Link>
        <p className="text-sm text-muted"><CalendarDays className="mr-1 inline size-3.5" aria-hidden />{formatDateTime(e.startsAt)}</p>
        <p className="text-sm text-muted"><MapPin className="mr-1 inline size-3.5" aria-hidden />{e.venue}</p>
        <p className="mt-1 text-sm font-semibold text-teal"><Ticket className="mr-1 inline size-3.5" aria-hidden />{minPrice === 0 ? 'Free' : `From ${formatINR(minPrice)}`}</p>
      </div>
    </article>
  );
}

export function BusinessCard({ b, sponsored }: { b: Business; sponsored?: boolean }) {
  return (
    <article className={cx('card p-4', (sponsored || b.sponsored) && 'border-violet-200')}>
      <div className="flex gap-3">
        <ImagePlaceholder seed={b.id} className="size-14 shrink-0 rounded-xl" icon={<Store className="size-6" aria-hidden />} label={`${b.name} logo placeholder`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">{(sponsored || b.sponsored) && <SponsoredTag />}<VerificationBadge status={b.verification} compact />{b.demo && <DemoBadge label="Demo record" />}</div>
          <Link to={b.wedding ? `/weddings/${b.id}` : `/businesses/${b.id}`} className="mt-0.5 block font-bold text-ink hover:text-brand">{b.name}</Link>
          <p className="text-sm text-muted">{b.wedding ?? b.category} · {localityName(b.localityId)}</p>
          <div className="mt-1 flex items-center gap-2"><Rating value={b.rating} count={b.reviewCount} /><span className="text-sm text-muted">{'₹'.repeat(b.priceRange)}</span></div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-ink/80">{b.description}</p>
    </article>
  );
}

export function OfferCard({ o, onClaim, claimed }: { o: Offer; onClaim?: () => void; claimed?: boolean }) {
  return (
    <article className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-dashed border-line bg-amber-50 p-4">
        <Tag className="size-6 text-amber-700" aria-hidden />
        <div className="min-w-0"><p className="font-extrabold text-navy">{o.benefit}</p><p className="truncate text-sm text-muted">{o.businessName}</p></div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-1.5">{o.sponsored && <SponsoredTag />}<DemoBadge label="Sample voucher" />{o.status !== 'active' && <Badge tone="red">Expired</Badge>}</div>
        <p className="mt-1 font-semibold">{o.title}</p>
        <p className="text-xs text-muted">Valid {formatDate(o.validFrom)} – {formatDate(o.validTo)}</p>
        {onClaim && <button type="button" disabled={claimed || o.status !== 'active'} onClick={onClaim} className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-teal px-3 text-sm font-semibold text-white disabled:bg-line disabled:text-muted">{claimed ? 'Claimed' : o.status === 'active' ? 'Claim voucher' : 'Expired'}</button>}
      </div>
    </article>
  );
}

export function InstitutionCard({ i }: { i: Institution }) {
  return (
    <article className="card flex gap-3 p-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><GraduationCap className="size-6" aria-hidden /></div>
      <div className="min-w-0 flex-1">
        <Link to={`/education/${i.id}`} className="font-bold text-ink hover:text-brand">{i.name}</Link>
        <p className="text-sm text-muted">{i.category} · {localityName(i.localityId)}</p>
        <p className="mt-1 line-clamp-1 text-sm">{i.courses.join(' · ')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5"><Rating value={i.rating} count={i.reviewCount} /><VerificationBadge status={i.verification} compact /></div>
      </div>
      <SaveButton type="institution" id={i.id} compact />
    </article>
  );
}

export function HealthCard({ h }: { h: HealthProvider }) {
  return (
    <article className="card flex gap-3 p-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700"><HeartPulse className="size-6" aria-hidden /></div>
      <div className="min-w-0 flex-1">
        <Link to={`/healthcare/${h.id}`} className="font-bold text-ink hover:text-brand">{h.name}</Link>
        <p className="text-sm text-muted">{h.type} · {h.specialty} · {localityName(h.localityId)}</p>
        <div className="mt-1 flex flex-wrap gap-1.5"><VerificationBadge status={h.verification} compact />{h.emergency24x7 && <Badge tone="red">Emergency dept. (as listed)</Badge>}<Badge>{h.hoursVerified ? 'Hours verified' : 'Hours not verified'}</Badge></div>
      </div>
    </article>
  );
}

export function ProfessionalCard({ p }: { p: Professional }) {
  return (
    <article className="card p-4">
      <Link to={`/professionals/${p.id}`} className="font-bold text-ink hover:text-brand">{p.name}</Link>
      <p className="text-sm text-muted">{p.profession} · {localityName(p.localityId)}</p>
      <p className="mt-1 text-sm">{p.services.join(' · ')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5"><Rating value={p.rating} count={p.reviewCount} /><VerificationBadge status={p.verification} compact /><Badge>{p.qualificationsVerified ? 'Credentials verified' : 'Credentials as supplied'}</Badge></div>
    </article>
  );
}
