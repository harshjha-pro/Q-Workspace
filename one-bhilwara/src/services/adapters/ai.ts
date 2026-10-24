import type { AIMessage, DBState } from '@/types/models';
import { localityName, SERVICE_CATEGORIES, serviceName } from '@/config/catalog';
import { mandi } from '@/data/seed/content';
import { rankProviders } from '@/services/domain/serviceMatching';
import { buildIndex, search } from '@/services/domain/search';
import { formatINR, salaryLabel } from '@/utils/format';
import { nowIso, uid } from '@/utils/ids';

type Reply = Omit<AIMessage, 'id' | 'role' | 'at'>;

const endpoint = import.meta.env.VITE_AI_ENDPOINT as string | undefined;
export const aiMode = endpoint ? 'live' : 'demo';

/**
 * AI service adapter. With VITE_AI_ENDPOINT set, messages go to YOUR server endpoint, which
 * holds the provider key (never the browser). Otherwise a deterministic demo assistant answers
 * from the app's own sample data and says so.
 */
export async function askAssistant(history: AIMessage[], text: string, db: DBState, localityId: string): Promise<AIMessage> {
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...history.slice(-10).map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: text }], locality: localityName(localityId) })
      });
      if (!res.ok) throw new Error(`Assistant service returned ${res.status}`);
      const data = (await res.json()) as Reply;
      return { id: uid('ai'), role: 'assistant', at: nowIso(), ...data, demo: false };
    } catch (e) {
      const r = demoAnswer(text, db, localityId);
      return { id: uid('ai'), role: 'assistant', at: nowIso(), ...r, text: `The live assistant is unavailable (${(e as Error).message}). Showing a demo answer instead.\n\n${r.text}`, demo: true };
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  return { id: uid('ai'), role: 'assistant', at: nowIso(), ...demoAnswer(text, db, localityId), demo: true };
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));
const word = (q: string, w: string) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?([^a-z]|$)`).test(q);

export function demoAnswer(input: string, db: DBState, localityId: string): Reply {
  const q = input.toLowerCase();
  const loc = localityName(localityId);

  if (has(q, 'emergency', 'accident', 'heart attack', 'fire', 'ambulance', 'बचाओ', 'आपात')) {
    return { text: 'If this is an emergency, call 112 now (police, fire, ambulance) or 108 for an ambulance. Please don’t wait for an app.', actions: [{ label: 'Call 112', link: 'tel:112' }, { label: 'Hospitals', link: '/healthcare' }] };
  }

  const svc = SERVICE_CATEGORIES.find((c) => [c.id.replace('-', ' '), c.name.toLowerCase(), c.name.toLowerCase().replace(/s$/, ''), c.name.toLowerCase().split(/[ &]/)[0].replace(/s$/, '')].some((w) => w.length > 1 && word(q, w)));
  if (svc && !has(q, 'job', 'hire me', 'naukri')) {
    const ranked = rankProviders({ category: svc.id, localityId, urgency: has(q, 'urgent', 'today', 'now') ? 'same_day' : 'normal' }, db.providers).slice(0, 3);
    return {
      text: ranked.length
        ? `Here are ${ranked.length} ${svc.name.toLowerCase()} from the One Bhilwara sample directory, ranked by availability, verification, rating and locality (${loc}). These are demo listings — confirm price and timing with the provider.`
        : `I couldn’t find ${svc.name.toLowerCase()} in the sample data. You can post a request and providers can respond.`,
      cards: ranked.map(({ provider: p, reasons }) => ({ type: 'provider', id: p.id, title: p.name, subtitle: `${reasons.slice(0, 3).join(' · ')}`, link: `/service-providers/${p.id}` })),
      actions: [{ label: `Browse ${svc.name}`, link: `/services/${svc.id}` }, { label: 'Post a service request', link: `/service-requests/new?category=${svc.id}` }]
    };
  }

  if (has(q, 'job description', 'write a job', 'jd ')) {
    return { text: 'Draft job description (edit before posting):\n\nRole: Sales Associate\nLocation: Bhilwara\nType: Full-time\nResponsibilities: greet customers, explain products, manage billing, keep the store organised.\nRequirements: 12th pass, good communication in Hindi, basic smartphone use.\nSalary: ₹__ – ₹__ per month (state clearly).\nHow to apply: through One Bhilwara Jobs.\n\nTip: never ask candidates for a registration fee.', actions: [{ label: 'Post a job', link: '/employers?tab=post' }] };
  }

  if (has(q, 'advertisement', 'ad for', 'promote my', 'promotion', 'विज्ञापन')) {
    const b = db.businesses[0];
    return { text: `Draft ad (edit as needed):\n\n“${b.name.replace(' (Demo)', '')} — fresh stock, fair prices, delivery near you. Visit us in ${localityName(b.localityId)} or send an enquiry on One Bhilwara.”\n\nKeep claims accurate and avoid words like “best” or “cheapest” unless you can prove them. Paid placements are labelled “Sponsored”.`, actions: [{ label: 'Create campaign', link: '/business-dashboard?tab=ads' }] };
  }

  if (has(q, 'job', 'naukri', 'part-time', 'part time', 'vacancy', 'internship', 'नौकरी')) {
    const pt = has(q, 'part');
    const jobs = db.jobs.filter((j) => j.status === 'open' && (!pt || j.type === 'part_time')).slice(0, 4);
    return { text: `${jobs.length} ${pt ? 'part-time ' : ''}openings from the sample job board. Salaries are as stated by the employer. Never pay a fee to apply for a job.`, cards: jobs.map((j) => ({ type: 'job', id: j.id, title: j.title, subtitle: `${j.employerName} · ${salaryLabel(j.salaryMin, j.salaryMax, j.salaryPeriod)}`, link: `/jobs/${j.id}` })), actions: [{ label: 'All jobs', link: pt ? '/jobs?type=part_time' : '/jobs' }] };
  }

  if (has(q, 'pg', 'hostel', 'room', 'rent', 'flat', 'accommodation', 'kiraya', 'किराया')) {
    const student = has(q, 'pg', 'hostel', 'student', 'college');
    const list = db.properties.filter((p) => p.status === 'active' && p.listingType === 'rent' && (!student || p.student)).slice(0, 4);
    return { text: `${list.length} ${student ? 'student accommodation' : 'rental'} listings from the sample data. Distances to colleges are not calculated because exact coordinates are not stored — check the address with the owner and visit before paying any deposit.`, cards: list.map((p) => ({ type: 'property', id: p.id, title: p.title, subtitle: `${formatINR(p.price)}/mo · ${localityName(p.localityId)}`, link: `/property/${p.id}` })), actions: [{ label: student ? 'Student accommodation' : 'Property', link: student ? '/property/students' : '/property?type=rent' }] };
  }

  if (has(q, 'scheme', 'yojana', 'eligib', 'kisan', 'scholarship', 'pension', 'योजना')) {
    const hits = search(buildIndex(db), { q: q.replace(/scheme|yojana|explain|what is|eligibility|eligible|am i/g, ' ').trim() || 'scheme', types: ['scheme'] }).slice(0, 3);
    const list = hits.length ? hits : search(buildIndex(db), { q: '', types: ['scheme'] }).slice(0, 3);
    const top = db.schemes.find((s) => s.id === list[0]?.id);
    return {
      text: top ? `${top.name}: ${top.description}\n\nWho it’s for: ${top.beneficiaries}.\n\nThis is a general summary, not official advice. Eligibility, benefits and fees are decided by the government — always confirm on the official portal. One Bhilwara is not a government authority.` : 'Here are some schemes from the directory.',
      cards: list.map((r) => ({ type: 'scheme', id: r.id, title: r.title, subtitle: r.subtitle, link: r.link })),
      sources: top ? [{ label: `Official: ${new URL(top.officialUrl).hostname}`, link: top.officialUrl }] : undefined,
      actions: [{ label: 'Check eligibility', link: '/government/eligibility' }]
    };
  }

  if (has(q, 'photographer', 'wedding', 'mehendi', 'caterer', 'decorator', 'venue', 'shaadi', 'शादी')) {
    const vendors = db.businesses.filter((b) => b.wedding).filter((b) => !has(q, 'photographer') || b.wedding === 'Photographers').slice(0, 4);
    return { text: 'Wedding vendors from the sample directory. Ask for a written quote and check availability for your dates.', cards: vendors.map((b) => ({ type: 'vendor', id: b.id, title: b.name, subtitle: `${b.wedding} · ★ ${b.rating}`, link: `/weddings/${b.id}` })), actions: [{ label: 'Weddings & events', link: '/weddings' }] };
  }

  const crop = mandi().find((m) => q.includes(m.commodity.toLowerCase()) || q.includes(m.commodityHi));
  if (crop || has(q, 'mandi', 'crop price', 'भाव')) {
    const m = crop ?? mandi()[0];
    return { text: `${m.commodity} at ${m.market}: modal ${formatINR(m.modal)} (range ${formatINR(m.min)}–${formatINR(m.max)}) ${m.unit}.\n\nImportant: this is SAMPLE data, not today’s price. “Modal” is the most common traded price; min/max show the spread. Check the official mandi board or Agmarknet before selling.`, actions: [{ label: 'Mandi dashboard', link: '/agriculture' }] };
  }

  if (has(q, 'garden', 'plant', 'tulsi', 'watering', 'पौधा')) {
    return { text: 'Simple summer garden routine for Bhilwara’s hot, dry weather (general guidance):\n• Water early morning or evening; check soil 2 cm deep first.\n• Mulch pots and beds to cut evaporation.\n• Give leafy plants afternoon shade.\n• Feed with compost every 3–4 weeks; avoid over-fertilising in peak heat.\n\nFor plant diseases, use the Crop Doctor and consult a local agriculture expert.', actions: [{ label: 'Garden & plant care', link: '/agriculture?tab=garden' }, { label: 'Crop doctor', link: '/agriculture?tab=doctor' }] };
  }

  if (has(q, 'pest', 'disease', 'leaves', 'insect', 'fungus', 'crop doctor')) {
    return { text: 'I can’t diagnose crop problems reliably from text. Use the Crop Doctor to describe symptoms and add a photo — in demo mode it gives a labelled, non-verified response. Please confirm with a Krishi Vigyan Kendra or agriculture officer before using any pesticide.', actions: [{ label: 'Crop doctor', link: '/agriculture?tab=doctor' }] };
  }

  if (has(q, 'summar', 'news', 'खबर')) {
    const a = db.articles.filter((x) => x.status === 'published').slice(0, 3);
    return { text: `Latest from the demo newsroom:\n${a.map((x) => `• ${x.title} — ${x.summary}`).join('\n')}\n\nThese are demo stories, not real reports.`, cards: a.map((x) => ({ type: 'news', id: x.id, title: x.title, subtitle: x.source, link: `/news/${x.id}` })), actions: [{ label: 'Open News', link: '/news' }] };
  }

  if (has(q, 'event', 'garba', 'concert', 'workshop', 'weekend')) {
    const ev = db.events.filter((e) => e.status === 'published').sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4);
    return { text: 'Upcoming events (sample data):', cards: ev.map((e) => ({ type: 'event', id: e.id, title: e.title, subtitle: `${new Date(e.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${e.venue}`, link: `/events/${e.id}` })), actions: [{ label: 'All events', link: '/events' }] };
  }

  if (has(q, 'ca ', 'chartered', 'lawyer', 'advocate', 'tax', 'gst', 'accountant', 'consultant')) {
    const pros = db.professionals.slice(0, 4);
    return { text: 'Professionals from the sample directory. Qualifications are shown as supplied unless marked verified. For legal or tax decisions, rely on a qualified professional’s advice.', cards: pros.map((p) => ({ type: 'professional', id: p.id, title: p.name, subtitle: p.profession, link: `/professionals/${p.id}` })), actions: [{ label: 'Professionals', link: '/professionals' }] };
  }

  if (has(q, 'loan', 'insurance', 'credit card', 'invest', 'emi')) {
    return { text: 'I can show finance providers and help you send an enquiry, but I can’t approve loans or recommend a specific product. Rates, fees and approval are decided by the lender. One Bhilwara may receive a referral fee from listed providers — so treat listings as options, not independent advice.', actions: [{ label: 'Finance', link: '/finance' }] };
  }

  if (has(q, 'hospital', 'doctor', 'clinic', 'pharmacy', 'medical', 'डॉक्टर')) {
    const h = db.healthcare.slice(0, 4);
    return { text: 'Healthcare providers from the sample directory. Timings and availability are not live — call the provider to confirm. I can’t give medical advice; for emergencies call 108 or 112.', cards: h.map((x) => ({ type: 'healthcare', id: x.id, title: x.name, subtitle: `${x.type} · ${x.specialty}`, link: `/healthcare/${x.id}` })), actions: [{ label: 'Healthcare', link: '/healthcare' }, { label: 'Get help finding care', link: '/healthcare/assist' }] };
  }

  if (has(q, 'compare')) {
    return { text: 'To compare providers, open a service category and sort by rating or filter by verified/available. Ratings come from user reviews; verified means One Bhilwara completed a verification check (demo records are labelled).', actions: [{ label: 'Services', link: '/services' }] };
  }

  if (has(q, 'help', 'where', 'how do i', 'section', 'kaise')) {
    return { text: 'You can ask me to find services, jobs, PGs, schemes, vendors, events or prices. Or jump to a section:', actions: [{ label: 'Discover all categories', link: '/discover' }, { label: 'Search', link: '/search' }, { label: 'Help centre', link: '/help' }] };
  }

  const hits = search(buildIndex(db), { q: input }).slice(0, 4);
  if (hits.length) return { text: `I searched the One Bhilwara sample data for “${input}”:`, cards: hits.map((r) => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, link: r.link })), actions: [{ label: 'See all results', link: `/search?q=${encodeURIComponent(input)}` }] };
  return { text: `I don’t have an answer for that in demo mode. Try asking about services (e.g. “${serviceName('electrician').toLowerCase()} in ${loc}”), jobs, PGs, schemes, events or mandi prices.`, actions: [{ label: 'Search the app', link: `/search?q=${encodeURIComponent(input)}` }] };
}

export const SUGGESTED_PROMPTS = [
  'Find a plumber in my locality', 'Show part-time jobs', 'Find a PG near college', 'Explain PM-KISAN', 'Find wedding photographers',
  'Explain the mustard mandi price', 'Suggest a summer garden routine', 'Help me write a job description', 'Draft an ad for my shop', 'Summarise today’s news', 'Events this weekend', 'Find a CA for GST'
];
