import type { ID, Poll, Vote } from '@/types/models';

export type PollPhase = 'pending' | 'rejected' | 'scheduled' | 'open' | 'closed';

export function pollPhase(p: Poll, now = Date.now()): PollPhase {
  if (p.status === 'pending') return 'pending';
  if (p.status === 'rejected') return 'rejected';
  if (now < Date.parse(p.opensAt)) return 'scheduled';
  if (now < Date.parse(p.closesAt)) return 'open';
  return 'closed';
}

/** Results are visible only once revealAt has passed — enforced here, the single place the UI reads results from. */
export const isRevealed = (p: Poll, now = Date.now()) => p.status === 'approved' && now >= Date.parse(p.revealAt);

export interface PollResults { counts: number[]; total: number; percentages: number[] }

/** Returns null while results are hidden, so the UI cannot leak them early. */
export function pollResults(p: Poll, votes: Vote[], now = Date.now()): PollResults | null {
  if (!isRevealed(p, now)) return null;
  const counts = p.options.map((o, i) => (p.seedCounts?.[i] ?? 0) + votes.filter((v) => v.pollId === p.id && v.optionId === o.id).length);
  const total = counts.reduce((a, b) => a + b, 0);
  return { counts, total, percentages: counts.map((c) => (total ? Math.round((c / total) * 1000) / 10 : 0)) };
}

/** Participation count is shown even before reveal (it does not leak the split). */
export const participation = (p: Poll, votes: Vote[]) => (p.seedCounts ?? []).reduce((a, b) => a + b, 0) + votes.filter((v) => v.pollId === p.id).length;

export const userVote = (pollId: ID, userId: ID | null, votes: Vote[]) => (userId ? votes.find((v) => v.pollId === pollId && v.userId === userId) : undefined);

/** Client-side guard. Production must enforce one-vote-per-account on the server (unique pollId+userId). */
export function canVote(p: Poll, userId: ID | null, votes: Vote[], now = Date.now()): { ok: boolean; reason?: string } {
  if (!userId) return { ok: false, reason: 'Sign in to vote.' };
  const phase = pollPhase(p, now);
  if (phase !== 'open') return { ok: false, reason: phase === 'scheduled' ? 'Voting has not opened yet.' : phase === 'closed' ? 'Voting has closed.' : 'This poll is awaiting moderation.' };
  if (userVote(p.id, userId, votes)) return { ok: false, reason: 'You have already voted in this poll.' };
  return { ok: true };
}
