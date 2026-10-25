import { localityName, serviceName } from '@/config/catalog';
import { MEDIA_CHANNELS } from '@/config/media';
import { rankProviders } from '@/services/domain/serviceMatching';
import type { DBState as DB, Preferences } from '@/types/models';
import { formatINR } from '@/utils/format';

export type RecKind = 'job' | 'service' | 'event' | 'property' | 'scheme' | 'news' | 'media' | 'module';
export interface Recommendation { id: string; kind: RecKind; title: string; detail?: string; why: string; link: string; external?: boolean }

/**
 * Recommendations use only what the user chose — interests, localities, followed channels —
 * and what they did in the app (saved items, requests). No sensitive attributes are inferred.
 */
export function recommend(db: DB, prefs: Preferences, userId: string | null, limit = 8): Recommendation[] {
  const out: Recommendation[] = [];
  const loc = prefs.localityId;
  const near = `Near ${localityName(loc)}`;
  const has = (i: string) => prefs.interests.includes(i);
  const savedIds = new Set(db.saved.filter((s) => s.userId === userId).map((s) => s.id));
  const appliedJobs = new Set(db.applications.filter((a) => a.userId === userId).map((a) => a.jobId));

  if (has('Jobs')) {
    db.jobs
      .filter((j) => j.status === 'open' && !appliedJobs.has(j.id) && (prefs.jobCategories.length === 0 || prefs.jobCategories.includes(j.category)))
      .sort((a, b) => Number(b.localityId === loc) - Number(a.localityId === loc))
      .slice(0, 2)
      .forEach((j) => out.push({ id: `job-${j.id}`, kind: 'job', title: j.title, detail: j.employerName, why: j.localityId === loc ? `Job ${near.toLowerCase()}` : 'Because you follow Jobs', link: `/jobs/${j.id}` }));
  }

  // Services: follow up on the user's own requests first, then the best match nearby.
  const lastReq = db.serviceRequests.filter((r) => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const svcCategory = lastReq?.category ?? (has('Services') ? 'electrician' : undefined);
  if (svcCategory) {
    rankProviders({ category: svcCategory, localityId: loc, urgency: 'normal' }, db.providers).slice(0, 1).forEach((r) =>
      out.push({ id: `svc-${r.provider.id}`, kind: 'service', title: r.provider.name, detail: `${serviceName(r.provider.category)} · ★ ${r.provider.rating.toFixed(1)}`, why: lastReq ? `For your ${serviceName(lastReq.category).toLowerCase()} request` : near, link: `/service-providers/${r.provider.id}` }));
  }

  if (has('Events')) {
    const now = Date.now();
    db.events.filter((e) => e.status === 'published' && Date.parse(e.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 1)
      .forEach((e) => out.push({ id: `ev-${e.id}`, kind: 'event', title: e.title, why: 'Upcoming — you follow Events', link: `/events/${e.id}` }));
  }

  const homes = db.properties.filter((p) => p.status === 'active' && p.available && prefs.localities.includes(p.localityId) && !savedIds.has(p.id));
  homes.slice(0, 1).forEach((p) => out.push({ id: `pr-${p.id}`, kind: 'property', title: p.title, detail: `${formatINR(p.price)}${p.listingType === 'rent' ? '/mo' : ''}`, why: `In ${localityName(p.localityId)}, a locality you follow`, link: `/property/${p.id}` }));

  const story = db.articles.filter((a) => a.status === 'published' && (a.localityId === loc || prefs.newsCategories.includes(a.category))).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (story && has('News')) out.push({ id: `news-${story.id}`, kind: 'news', title: story.titleHi ?? story.title, why: story.localityId === loc ? `News from ${localityName(loc)}` : 'From a topic you follow', link: `/news/${story.id}` });

  const followed = new Set(prefs.followedMedia ?? []);
  const channel = MEDIA_CHANNELS.find((c) => !followed.has(c.id) && c.scope === 'local') ?? MEDIA_CHANNELS.find((c) => !followed.has(c.id) && c.scope === 'state');
  if (channel) out.push({ id: `media-${channel.id}`, kind: 'media', title: channel.name, detail: channel.languages.join(' · '), why: 'A news channel you don’t follow yet', link: `/news${channel.scope === 'local' ? '' : `?scope=${channel.scope}`}` });

  const scheme = db.schemes.find((s) => !savedIds.has(s.id));
  if (scheme) out.push({ id: `sch-${scheme.id}`, kind: 'scheme', title: scheme.name, detail: scheme.level === 'central' ? 'Central scheme' : 'Rajasthan scheme', why: 'Check if you’re eligible', link: `/government/schemes/${scheme.id}` });

  if (has('Agriculture')) out.push({ id: 'mod-agri', kind: 'module', title: 'Mandi price dashboard', why: 'Because you follow Agriculture', link: '/agriculture' });
  if (has('Education')) out.push({ id: 'mod-edu', kind: 'module', title: 'Coaching & libraries', why: 'Because you follow Education', link: '/education' });

  return out.slice(0, limit);
}
