import type { DBState } from '@/types/models';
import { localityName, newsCategoryName, serviceName } from '@/config/catalog';
import { mandi } from '@/data/seed/content';
import { formatINR } from '@/utils/format';

export type SearchType = 'news' | 'business' | 'service' | 'job' | 'property' | 'rental' | 'classified' | 'event' | 'education' | 'healthcare' | 'scheme' | 'professional' | 'offer' | 'agriculture';

export const SEARCH_TYPES: { id: SearchType; label: string }[] = [
  { id: 'news', label: 'News' }, { id: 'business', label: 'Businesses' }, { id: 'service', label: 'Services' }, { id: 'job', label: 'Jobs' },
  { id: 'property', label: 'Property' }, { id: 'rental', label: 'Rentals & PG' }, { id: 'classified', label: 'Buy & sell' }, { id: 'event', label: 'Events' },
  { id: 'education', label: 'Education' }, { id: 'healthcare', label: 'Healthcare' }, { id: 'scheme', label: 'Gov. schemes' },
  { id: 'professional', label: 'Professionals' }, { id: 'offer', label: 'Offers' }, { id: 'agriculture', label: 'Agriculture' }
];

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  link: string;
  localityId?: string;
  date?: string;
  price?: number;
  verified?: boolean;
  availableNow?: boolean;
  text: string;
}

export function buildIndex(s: DBState): SearchResult[] {
  const out: SearchResult[] = [];
  s.articles.filter((a) => a.status === 'published').forEach((a) => out.push({ type: 'news', id: a.id, title: a.title, subtitle: `${newsCategoryName(a.category)} · ${a.source}`, link: `/news/${a.id}`, localityId: a.localityId, date: a.publishedAt, text: `${a.title} ${a.titleHi ?? ''} ${a.summary} ${a.tags.join(' ')} ${a.category}` }));
  s.businesses.filter((b) => b.verification !== 'suspended').forEach((b) => out.push({ type: 'business', id: b.id, title: b.name, subtitle: `${b.category} · ${localityName(b.localityId)}`, link: `/businesses/${b.id}`, localityId: b.localityId, date: b.createdAt, verified: b.verification === 'verified', text: `${b.name} ${b.category} ${b.description} ${b.products.join(' ')} ${b.wedding ?? ''}` }));
  s.providers.forEach((p) => out.push({ type: 'service', id: p.id, title: p.name, subtitle: `${serviceName(p.category)} · ${localityName(p.localityId)}`, link: `/service-providers/${p.id}`, localityId: p.localityId, date: p.createdAt, price: p.priceFrom, verified: p.verification === 'verified', availableNow: p.availability === 'available', text: `${p.name} ${serviceName(p.category)} ${p.category} ${p.description}` }));
  s.jobs.filter((j) => j.status === 'open').forEach((j) => out.push({ type: 'job', id: j.id, title: j.title, subtitle: `${j.employerName} · ${localityName(j.localityId)}`, link: `/jobs/${j.id}`, localityId: j.localityId, date: j.createdAt, price: j.salaryMax, verified: j.verifiedEmployer, text: `${j.title} ${j.category} ${j.skills.join(' ')} ${j.description} ${j.type.replace('_', ' ')} job` }));
  s.properties.filter((p) => p.status === 'active').forEach((p) => out.push({ type: p.student || p.listingType === 'rent' ? 'rental' : 'property', id: p.id, title: p.title, subtitle: `${p.category} · ${formatINR(p.price)}${p.listingType === 'rent' ? '/mo' : ''} · ${localityName(p.localityId)}`, link: `/property/${p.id}`, localityId: p.localityId, date: p.createdAt, price: p.price, verified: p.verification === 'verified', text: `${p.title} ${p.category} ${p.description} ${p.amenities.join(' ')} ${p.student ? 'pg hostel student room' : ''}` }));
  s.classifieds.filter((c) => c.status === 'active').forEach((c) => out.push({ type: 'classified', id: c.id, title: c.title, subtitle: `${c.category} · ${formatINR(c.price)} · ${localityName(c.localityId)}`, link: `/marketplace/${c.id}`, localityId: c.localityId, date: c.createdAt, price: c.price, text: `${c.title} ${c.category} ${c.description}` }));
  s.events.filter((e) => e.status === 'published').forEach((e) => out.push({ type: 'event', id: e.id, title: e.title, subtitle: `${e.category} · ${e.venue}`, link: `/events/${e.id}`, localityId: e.localityId, date: e.startsAt, price: Math.min(...e.ticketTypes.map((t) => t.price)), text: `${e.title} ${e.category} ${e.description}` }));
  s.institutions.forEach((i) => out.push({ type: 'education', id: i.id, title: i.name, subtitle: `${i.category} · ${localityName(i.localityId)}`, link: `/education/${i.id}`, localityId: i.localityId, date: i.createdAt, verified: i.verification === 'verified', text: `${i.name} ${i.category} ${i.courses.join(' ')} school coaching college` }));
  s.healthcare.forEach((h) => out.push({ type: 'healthcare', id: h.id, title: h.name, subtitle: `${h.type} · ${h.specialty}`, link: `/healthcare/${h.id}`, localityId: h.localityId, date: h.createdAt, verified: h.verification === 'verified', text: `${h.name} ${h.type} ${h.specialty} ${h.services.join(' ')} hospital clinic doctor` }));
  s.schemes.forEach((g) => out.push({ type: 'scheme', id: g.id, title: g.name, subtitle: `${g.level === 'central' ? 'Central' : 'Rajasthan'} · ${g.category}`, link: `/government/schemes/${g.id}`, date: g.createdAt, text: `${g.name} ${g.category} ${g.description} ${g.department} scheme yojana` }));
  s.professionals.forEach((p) => out.push({ type: 'professional', id: p.id, title: p.name, subtitle: `${p.profession} · ${localityName(p.localityId)}`, link: `/professionals/${p.id}`, localityId: p.localityId, date: p.createdAt, verified: p.verification === 'verified', text: `${p.name} ${p.profession} ${p.services.join(' ')}` }));
  s.offers.filter((o) => o.status === 'active').forEach((o) => out.push({ type: 'offer', id: o.id, title: o.title, subtitle: `${o.businessName} · ${o.benefit}`, link: `/offers?id=${o.id}`, date: o.createdAt, text: `${o.title} ${o.businessName} ${o.category} ${o.description} offer discount voucher` }));
  mandi().forEach((m) => out.push({ type: 'agriculture', id: m.id, title: `${m.commodity} — mandi price (sample)`, subtitle: `${m.market} · ${formatINR(m.modal)}/${m.unit.split('/')[1]}`, link: `/agriculture?crop=${encodeURIComponent(m.commodity)}`, date: m.date, price: m.modal, text: `${m.commodity} ${m.commodityHi} mandi price crop agriculture` }));
  return out;
}

export interface SearchQuery {
  q: string;
  types?: SearchType[];
  localityId?: string;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc';
  verifiedOnly?: boolean;
  availableNow?: boolean;
}

/** Simple token relevance: title hits weigh more than body hits. Replace with server search later. */
export function search(index: SearchResult[], query: SearchQuery) {
  const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  let rows = index
    .map((r) => {
      if (!terms.length) return { r, score: 0 };
      const title = r.title.toLowerCase();
      const text = r.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        else if (text.includes(t) || r.subtitle.toLowerCase().includes(t)) score += 1;
        else return { r, score: -1 };
      }
      return { r, score };
    })
    .filter((x) => x.score >= 0);
  if (query.types?.length) rows = rows.filter((x) => query.types!.includes(x.r.type));
  if (query.localityId && query.localityId !== 'all') rows = rows.filter((x) => !x.r.localityId || x.r.localityId === query.localityId || x.r.localityId === 'all');
  if (query.verifiedOnly) rows = rows.filter((x) => x.r.verified);
  if (query.availableNow) rows = rows.filter((x) => x.r.availableNow);
  const sort = query.sort ?? 'relevance';
  rows.sort((a, b) => {
    if (sort === 'newest') return Date.parse(b.r.date ?? '0') - Date.parse(a.r.date ?? '0');
    if (sort === 'price_asc') return (a.r.price ?? Infinity) - (b.r.price ?? Infinity);
    if (sort === 'price_desc') return (b.r.price ?? -1) - (a.r.price ?? -1);
    return b.score - a.score;
  });
  return rows.map((x) => x.r);
}

export function suggestions(index: SearchResult[], q: string, limit = 6) {
  const v = q.trim().toLowerCase();
  if (v.length < 2) return [];
  const seen = new Set<string>();
  return index.filter((r) => r.title.toLowerCase().includes(v) && !seen.has(r.title) && seen.add(r.title)).slice(0, limit);
}

export const POPULAR_SEARCHES = ['Plumber', 'PG near college', 'Part-time jobs', 'Wedding photographer', 'Mustard price', 'e-Mitra', 'Tutor', '2 BHK rent'];
