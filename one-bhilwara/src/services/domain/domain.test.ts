import { describe, expect, it } from 'vitest';
import type { Poll, ServiceRequest, Vote } from '@/types/models';
import { buildSeed } from '@/data/seed';
import { canVote, pollPhase, pollResults } from './polls';
import { confirmProvider, rankProviders } from './serviceMatching';
import { assess } from './eligibility';
import { buildIndex, search, suggestions } from './search';
import { demoAnswer } from '@/services/adapters/ai';
import { formatINR, formatMobile, isValidMobile } from '@/utils/format';
import { dictionaries } from '@/i18n/dictionary';

const H = 3600_000;
const now = Date.now();
const poll = (over: Partial<Poll> = {}): Poll => ({
  id: 'p', question: 'Q?', category: 'Civic', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  opensAt: new Date(now - H).toISOString(), closesAt: new Date(now + H).toISOString(), revealAt: new Date(now + 2 * H).toISOString(),
  visibility: 'anonymous', origin: 'admin', createdBy: 'admin', status: 'approved', createdAt: new Date(now).toISOString(), ...over
});

describe('polls', () => {
  it('hides results before the reveal time', () => {
    expect(pollResults(poll(), [], now)).toBeNull();
  });
  it('shows results after the reveal time, including seeded counts', () => {
    const votes: Vote[] = [{ id: 'v1', pollId: 'p', optionId: 'a', userId: 'u1', createdAt: '' }];
    const r = pollResults(poll({ revealAt: new Date(now - 1).toISOString(), seedCounts: [1, 2] }), votes, now)!;
    expect(r.counts).toEqual([2, 2]);
    expect(r.percentages).toEqual([50, 50]);
  });
  it('allows only one vote per account and only while open', () => {
    const p = poll();
    expect(canVote(p, 'u1', [], now).ok).toBe(true);
    expect(canVote(p, 'u1', [{ id: 'v', pollId: 'p', optionId: 'a', userId: 'u1', createdAt: '' }], now).ok).toBe(false);
    expect(canVote(p, null, [], now).ok).toBe(false);
    expect(canVote(poll({ opensAt: new Date(now + H).toISOString() }), 'u1', [], now).reason).toMatch(/not opened/);
    expect(pollPhase(poll({ status: 'pending' }), now)).toBe('pending');
  });
});

describe('service matching', () => {
  const db = buildSeed();
  it('ranks only providers in the requested category, verified & available first', () => {
    const ranked = rankProviders({ category: 'plumber', localityId: 'shastri-nagar', urgency: 'same_day' }, db.providers);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((r) => r.provider.category === 'plumber')).toBe(true);
    expect(ranked[0].provider.id).toBe('p-1');
    expect(ranked[0].reasons).toContain('Verified');
  });
  it('prevents confirming a second provider', () => {
    const req = db.serviceRequests.find((r) => r.id === 'sr-1') as ServiceRequest;
    const confirmed = confirmProvider(req, 'p-1', new Date().toISOString());
    expect(confirmed.status).toBe('confirmed');
    expect(() => confirmProvider(confirmed, 'p-2', new Date().toISOString())).toThrow(/already confirmed/);
  });
});

describe('eligibility', () => {
  const schemes = buildSeed().schemes;
  const kisan = schemes.find((s) => s.name === 'PM-KISAN')!;
  it('marks a landholding farmer as possibly eligible, never "approved"', () => {
    const r = assess(kisan, { occupation: 'farmer', landOwner: true });
    expect(r.status).toBe('possible');
    expect(r.notConfirmed.length).toBeGreaterThan(0);
  });
  it('marks a student as unlikely for PM-KISAN', () => {
    expect(assess(kisan, { occupation: 'student' }).status).toBe('unlikely');
  });
});

describe('search', () => {
  const index = buildIndex(buildSeed());
  it('finds plumbers and filters by type', () => {
    const r = search(index, { q: 'plumber', types: ['service'] });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.type === 'service')).toBe(true);
  });
  it('supports verified and available filters and price sort', () => {
    const r = search(index, { q: '', types: ['service'], verifiedOnly: true, availableNow: true, sort: 'price_asc' });
    expect(r.every((x) => x.verified && x.availableNow)).toBe(true);
    const prices = r.map((x) => x.price ?? Infinity);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
  it('returns empty for nonsense and suggestions for prefixes', () => {
    expect(search(index, { q: 'zzqqxx' })).toHaveLength(0);
    expect(suggestions(index, 'mewar').length).toBeGreaterThan(0);
  });
});

describe('demo AI assistant', () => {
  const db = buildSeed();
  it('routes emergencies to 112 first', () => {
    expect(demoAnswer('there is a fire emergency', db, 'shastri-nagar').text).toMatch(/112/);
  });
  it('does not match "ac" inside other words', () => {
    const r = demoAnswer('find accommodation pg near college', db, 'shastri-nagar');
    expect(r.cards?.every((c) => c.type === 'property')).toBe(true);
  });
  it('labels mandi prices as sample data', () => {
    expect(demoAnswer('mustard mandi price', db, 'pur').text).toMatch(/SAMPLE/);
  });
});

describe('formatting & i18n', () => {
  it('formats Indian currency and mobiles', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatMobile('919876543210')).toBe('+91 98765 43210');
    expect(isValidMobile('98765 43210')).toBe(true);
    expect(isValidMobile('12345')).toBe(false);
  });
  it('has every English key translated to Hindi', () => {
    const en = Object.keys(dictionaries.en).sort();
    expect(Object.keys(dictionaries.hi).sort()).toEqual(en);
    for (const k of en) expect((dictionaries.hi as Record<string, string>)[k].length).toBeGreaterThan(0);
  });
});
