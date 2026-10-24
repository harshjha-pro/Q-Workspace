import type { Provider, ServiceRequest } from '@/types/models';

export interface RankedProvider { provider: Provider; score: number; reasons: string[] }

const VERIFIED_WEIGHT = 2;

/**
 * Transparent ranking used to suggest up to three providers. Criteria shown to the user:
 * same category (required), availability, verified status, rating, same locality, emergency
 * capability for urgent requests. Distance is not used because exact coordinates are not stored.
 */
export function rankProviders(req: Pick<ServiceRequest, 'category' | 'localityId' | 'urgency'>, providers: Provider[], exclude: string[] = []): RankedProvider[] {
  return providers
    .filter((p) => p.category === req.category && !exclude.includes(p.id) && p.verification !== 'suspended')
    .map((p) => {
      const reasons: string[] = [];
      let score = 0;
      if (p.availability === 'available') { score += 3; reasons.push('Available now'); } else if (p.availability === 'busy') { score += 1; reasons.push('Busy — may respond later'); }
      if (p.verification === 'verified') { score += VERIFIED_WEIGHT; reasons.push('Verified'); }
      score += p.rating; reasons.push(`Rated ${p.rating.toFixed(1)}`);
      if (p.localityId === req.localityId) { score += 1.5; reasons.push('Same locality'); }
      if (req.urgency !== 'normal' && p.emergency) { score += 1.5; reasons.push('Takes urgent jobs'); }
      return { provider: p, score: Math.round(score * 10) / 10, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export const isActiveWithin = (p: Provider, hours: number, now = Date.now()) =>
  p.activityConsent && !!p.lastActiveAt && now - Date.parse(p.lastActiveAt) <= hours * 3600_000;

/** Only one provider can be confirmed; returns the request with that response accepted and others declined. */
export function confirmProvider(req: ServiceRequest, providerId: string, at: string): ServiceRequest {
  if (req.confirmedProviderId && req.confirmedProviderId !== providerId) throw new Error('Another provider is already confirmed for this request.');
  if (req.status === 'cancelled' || req.status === 'completed') throw new Error('This request is closed.');
  return {
    ...req,
    status: 'confirmed',
    confirmedProviderId: providerId,
    responses: req.responses.map((r) => ({ ...r, status: r.providerId === providerId ? 'accepted' : r.status === 'pending' ? 'declined' : r.status })),
    history: [...req.history, { status: 'confirmed', at }]
  };
}
