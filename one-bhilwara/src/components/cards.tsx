import { Link } from 'react-router-dom';
import { BedDouble, Briefcase, CalendarDays, CircleDot, Clock, GraduationCap, HeartPulse, House, IndianRupee, MapPin, Newspaper, Ruler, ShoppingBag, Store, Tag, Ticket, Wrench, Zap } from 'lucide-react';
import type { Article, Business, CityEvent, Classified, Institution, HealthProvider, Job, Offer, Professional, Property, Provider } from '@/types/models';
import { localityName, newsCategoryName, serviceName } from '@/config/catalog';
import { useLang, useNow } from '@/hooks/useStore';
import { isActiveWithin } from '@/services/domain/serviceMatching';
import { formatDate, formatDateTime, formatINR, formatINRShort, salaryLabel, timeAgo } from '@/utils/format';
import { Badge, cx, DemoBadge, ImagePlaceholder, Rating, SponsoredTag, VerificationBadge } from './ui/primitives';
import { SaveButton } from './shared';

export function ArticleCard({ a, variant = 'list' }: { a: Article; variant?: 'list' | 'hero' | 'compact' }) {
  const lang = useLang();
  const title = lang === 'hi' && a.titleHi ? a.titleHi : a.title;
  if (variant === 'compact') {
    return (
      <Link to={`/news/${a.id}`} className="block py-3 hover:bg-page/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal">{newsCategoryName(a.category)}</p>
        <p className="font-semibold leading-snug text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{a.source} · {timeAgo(a.publishedAt)}</p>
      </Link>
    );
  }
  return (
    <article className={cx('card overflow-hidden', variant === 'hero' ? 'grid' : 'flex gap-3 p-3')}>
      <ImagePlaceholder seed={a.id} label={`Illustration for ${a.title}`} className={variant === 'hero' ? 'h-44' : 'size-24 shrink-0 rounded-lg'} icon={<Newspaper className={variant === 'hero' ? 'size-10' : 'size-7'} aria-hidden />} />
      <div className={cx('min-w-0', variant === 'hero' && 'p-4')}>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="navy">{newsCategoryName(a.category)}</Badge>
          {a.localityId && <Badge><MapPin className="size-3" aria-hidden />{localityName(a.localityId)}</Badge>}
          {a.demo && <DemoBadge label="Demo story" />}
        </div>
        <Link to={`/news/${a.id}`}><h3 className={cx('font-bold leading-snug text-ink hover:text-navy', variant === 'hero' ? 'text-xl' : 'text-[15px]')}>{title}</h3></Link>
        <p className={cx('mt-1 text-sm text-muted', variant === 'list' && 'line-clamp-2')}>{a.summary}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">{a.source} · {timeAgo(a.publishedAt)}</p>
          <SaveButton type="article" id={a.id} compact />
        </div>
      </div>
    </article>
  );
}

export function ProviderCard({ p }: { p: Provider }) {
  const now = useNow(60_000);
  const avail = { available: ['Available now', 'teal'], busy: ['Busy', 'amber'], offline: ['Offline', 'gray'] } as const;
  const [label, tone] = avail[p.availability];
  return (
    <article className="card p-4">
      <div className="flex gap-3">
        <ImagePlaceholder seed={p.id} className="size-14 shrink-0 rounded-xl" icon={<Wrench className="size-6" aria-hidden />} label={`${p.name} logo placeholder`} />
        <div className="min-w-0 flex-1">
          <Link to={`/service-providers/${p.id}`} className="font-bold text-ink hover:text-navy">{p.name}</Link>
          <p className="text-sm text-muted">{serviceName(p.category)} · {localityName(p.localityId)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Rating value={p.rating} count={p.reviewCount} />
            <Badge tone={tone}><CircleDot className="size-3" aria-hidden />{label}</Badge>
            <VerificationBadge status={p.verification} compact />
            {p.emergency && <Badge tone="red"><Zap className="size-3" aria-hidden />Urgent jobs</Badge>}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-ink/80">{p.description}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-navy">{p.priceFrom ? `From ${formatINR(p.priceFrom)}/${p.priceUnit}` : 'Quote required'}<span className="ml-1 text-xs font-normal text-muted">(indicative)</span></span>
        {isActiveWithin(p, 24, now) && <span className="text-xs text-muted">Active in last 24h{p.demo ? ' (simulated)' : ''}</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <Link to={`/service-requests/new?category=${p.category}&provider=${p.id}`} className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg bg-navy px-3 text-sm font-semibold text-white">Request service</Link>
        <Link to={`/service-providers/${p.id}`} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line px-3 text-sm font-semibold">Profile</Link>
      </div>
    </article>
  );
}

const JOB_TYPE: Record<Job['type'], string> = { full_time: 'Full-time', part_time: 'Part-time', internship: 'Internship', wfh: 'Work from home', temporary: 'Temporary' };
export const jobTypeLabel = (t: Job['type']) => JOB_TYPE[t];

export function JobCard({ j }: { j: Job }) {
  return (
    <article className={cx('card p-4', j.featured && 'border-amber/50')}>
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy"><Briefcase className="size-5" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {j.featured && <SponsoredTag label="Featured" />}
            {j.urgent && <Badge tone="red">Urgent hiring</Badge>}
            {j.verifiedEmployer && <Badge tone="teal">Verified employer</Badge>}
          </div>
          <Link to={`/jobs/${j.id}`} className="mt-0.5 block font-bold text-ink hover:text-navy">{j.title}</Link>
          <p className="text-sm text-muted">{j.employerName}</p>
        </div>
        <SaveButton type="job" id={j.id} compact />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/80">
        <span className="inline-flex items-center gap-1"><IndianRupee className="size-4 text-muted" aria-hidden />{salaryLabel(j.salaryMin, j.salaryMax, j.salaryPeriod)}</span>
        <span className="inline-flex items-center gap-1"><Clock className="size-4 text-muted" aria-hidden />{JOB_TYPE[j.type]}</span>
        <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-muted" aria-hidden />{j.localityId === 'all' ? 'Remote' : localityName(j.localityId)}</span>
      </div>
      <p className="mt-2 text-xs text-muted">Posted {timeAgo(j.createdAt)} · Apply by {formatDate(j.deadline)}</p>
    </article>
  );
}

export function PropertyCard({ p }: { p: Property }) {
  return (
    <article className="card overflow-hidden">
      <div className="relative">
        <ImagePlaceholder seed={p.id} className="h-36" icon={<House className="size-9" aria-hidden />} label={`${p.title} photo placeholder`} />
        <div className="absolute left-2 top-2 flex gap-1.5">
          <Badge tone="navy" className="bg-white/95">{p.listingType === 'sale' ? 'For sale' : 'For rent'}</Badge>
          {!p.available && <Badge tone="red" className="bg-white/95">Not available</Badge>}
        </div>
        <div className="absolute right-2 top-2"><SaveButton type="property" id={p.id} compact /></div>
      </div>
      <div className="p-4">
        <p className="text-lg font-bold text-navy">{p.listingType === 'sale' ? formatINRShort(p.price) : `${formatINR(p.price)}/mo`}</p>
        <Link to={`/property/${p.id}`} className="font-semibold text-ink hover:text-navy">{p.title}</Link>
        <p className="text-sm text-muted">{p.category} · {localityName(p.localityId)}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-ink/80">
          {p.bedrooms !== undefined && <span className="inline-flex items-center gap-1"><BedDouble className="size-4 text-muted" aria-hidden />{p.bedrooms} BHK</span>}
          {p.areaSqft && <span className="inline-flex items-center gap-1"><Ruler className="size-4 text-muted" aria-hidden />{p.areaSqft.toLocaleString('en-IN')} sq ft</span>}
          {p.student?.meals && <span>Meals included</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5"><VerificationBadge status={p.verification} compact />{p.demo && <DemoBadge label="Demo listing" />}<Badge>{p.ownerType === 'agent' ? 'Agent' : 'Owner'}</Badge></div>
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
        {c.status === 'sold' && <span className="absolute inset-0 grid place-items-center bg-navy-deep/60 text-lg font-bold text-white">SOLD</span>}
        <div className="absolute right-2 top-2"><SaveButton type="classified" id={c.id} compact /></div>
      </div>
      <div className="p-3">
        <p className="font-bold text-navy">{formatINR(c.price)} {c.negotiable && <span className="text-xs font-normal text-muted">negotiable</span>}</p>
        <Link to={`/marketplace/${c.id}`} className="line-clamp-2 text-sm font-semibold text-ink hover:text-navy">{c.title}</Link>
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
      <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-navy text-white">
        <div className="text-center leading-tight"><p className="text-xs uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</p><p className="text-2xl font-extrabold">{d.getDate()}</p></div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5"><Badge tone="violet">{e.category}</Badge>{e.demo && <DemoBadge label="Sample event" />}</div>
        <Link to={`/events/${e.id}`} className="mt-0.5 block font-bold text-ink hover:text-navy">{e.title}</Link>
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
          <Link to={b.wedding ? `/weddings/${b.id}` : `/businesses/${b.id}`} className="mt-0.5 block font-bold text-ink hover:text-navy">{b.name}</Link>
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
        <Link to={`/education/${i.id}`} className="font-bold text-ink hover:text-navy">{i.name}</Link>
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
        <Link to={`/healthcare/${h.id}`} className="font-bold text-ink hover:text-navy">{h.name}</Link>
        <p className="text-sm text-muted">{h.type} · {h.specialty} · {localityName(h.localityId)}</p>
        <div className="mt-1 flex flex-wrap gap-1.5"><VerificationBadge status={h.verification} compact />{h.emergency24x7 && <Badge tone="red">Emergency dept. (as listed)</Badge>}<Badge>{h.hoursVerified ? 'Hours verified' : 'Hours not verified'}</Badge></div>
      </div>
    </article>
  );
}

export function ProfessionalCard({ p }: { p: Professional }) {
  return (
    <article className="card p-4">
      <Link to={`/professionals/${p.id}`} className="font-bold text-ink hover:text-navy">{p.name}</Link>
      <p className="text-sm text-muted">{p.profession} · {localityName(p.localityId)}</p>
      <p className="mt-1 text-sm">{p.services.join(' · ')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5"><Rating value={p.rating} count={p.reviewCount} /><VerificationBadge status={p.verification} compact /><Badge>{p.qualificationsVerified ? 'Credentials verified' : 'Credentials as supplied'}</Badge></div>
    </article>
  );
}
