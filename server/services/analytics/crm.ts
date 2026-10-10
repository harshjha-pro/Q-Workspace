import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { addDays, diffDays, todayIst, toIstDate } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { SERVICE_LINE_LABELS, type ServiceLine } from "../../domain/enums";
import { assertFirmAnalytics, lastMonths, monthName, pct, resolvePeriod } from "./common";

/**
 * CRM dashboard (P5-05), Partner only (analytics.firm). Lead funnel and conversion, sources, proposal pipeline
 * and acceptance, follow-ups due, renewals coming up, cross-sell opportunities, client feedback and client growth.
 * Proposal value = fee, or rate × budget hours for time-billed proposals (the firm dashboard's definition).
 */
const OPEN_LEAD = ["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "ON_HOLD"];
export const LEAD_STAGES = ["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "ON_HOLD", "WON", "LOST"] as const;
const proposalValue = (p: { feePaise: number; ratePaise: number; budgetMinutes: number }) => (p.feePaise > 0 ? p.feePaise : Math.round((p.ratePaise * p.budgetMinutes) / 60));
const dateOf = (d: Date | null) => (d ? toIstDate(d) : null);

export async function crmDashboard(actor: Actor, opts: { period?: string; today?: string } = {}) {
  assertFirmAnalytics(actor);
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const inPeriod = (d: string | null) => !!d && d >= period.from && d <= period.to;
  const months = lastMonths(12, today);
  const [lowScore, renewalLead] = await Promise.all([getSetting<number>("crm.feedbackLowScore", 2), getSetting<number>("crm.renewalLeadDays", 60)]);

  const [leads, proposals, renewals, opportunities, feedback, newClients] = await Promise.all([
    db().lead.findMany({ select: { id: true, name: true, stage: true, source: true, estFeePaise: true, nextFollowUp: true, createdAt: true, wonAt: true, updatedAt: true, lostReason: true, ownerId: true } }),
    db().proposal.findMany({ select: { id: true, title: true, status: true, serviceLine: true, feePaise: true, ratePaise: true, budgetMinutes: true, validUntil: true, sentAt: true, decidedAt: true, leadId: true, clientId: true } }),
    db().renewal.findMany({ where: { dueDate: { gte: today, lte: addDays(today, renewalLead) } }, select: { status: true, lastFeePaise: true, suggestedFeePaise: true, approvedFeePaise: true } }),
    db().opportunity.groupBy({ by: ["serviceLine"], where: { status: "OPEN" }, _count: { _all: true } }),
    db().feedback.findMany({ where: { requestedAt: { gte: new Date(`${period.from}T00:00:00+05:30`), lte: new Date(`${period.to}T23:59:59+05:30`) } }, select: { rating: true, receivedAt: true } }),
    db().client.findMany({ where: { isFirm: false, onboardingDate: { gte: `${months[0]}-01`, lte: today } }, select: { onboardingDate: true } }),
  ]);

  // Funnel: leads created in the period by where they stand now; conversion over leads decided in the period.
  const created = leads.filter((l) => inPeriod(dateOf(l.createdAt)));
  const funnel = LEAD_STAGES.map((s) => ({ stage: s, count: created.filter((l) => l.stage === s).length }));
  const won = leads.filter((l) => l.stage === "WON" && inPeriod(dateOf(l.wonAt)));
  // A lost lead's decision date is its last update (the stage change); no separate lost date is stored.
  const lost = leads.filter((l) => l.stage === "LOST" && inPeriod(dateOf(l.updatedAt)));
  const daysToWin = won.map((l) => diffDays(dateOf(l.createdAt)!, dateOf(l.wonAt)!));
  const sources = new Map<string, { leads: number; won: number }>();
  for (const l of created) {
    const r = sources.get(l.source) ?? { leads: 0, won: 0 };
    r.leads += 1;
    if (l.stage === "WON") r.won += 1;
    sources.set(l.source, r);
  }
  const lostReasons = new Map<string, number>();
  for (const l of lost) lostReasons.set(l.lostReason?.trim() || "Not given", (lostReasons.get(l.lostReason?.trim() || "Not given") ?? 0) + 1);
  const openLeads = leads.filter((l) => OPEN_LEAD.includes(l.stage));

  // Proposals: pipeline now, and decisions in the period.
  const sent = proposals.filter((p) => p.status === "SENT");
  const decided = proposals.filter((p) => ["ACCEPTED", "REJECTED", "EXPIRED"].includes(p.status) && inPeriod(dateOf(p.decidedAt)));
  const accepted = decided.filter((p) => p.status === "ACCEPTED");
  const byLine = new Map<string, { count: number; paise: number }>();
  for (const p of sent) {
    const r = byLine.get(p.serviceLine) ?? { count: 0, paise: 0 };
    r.count += 1;
    r.paise += proposalValue(p);
    byLine.set(p.serviceLine, r);
  }
  const lineLabel = (s: string) => SERVICE_LINE_LABELS[s as ServiceLine] ?? s;

  // Renewals in the lead window; uplift is the approved (or suggested) fee over last period's fee.
  const renewalStatus = new Map<string, number>();
  for (const r of renewals) renewalStatus.set(r.status, (renewalStatus.get(r.status) ?? 0) + 1);
  const approved = renewals.filter((r) => r.approvedFeePaise !== null);

  const received = feedback.filter((f) => f.receivedAt && f.rating !== null);
  return {
    period,
    headline: {
      leadsCreated: created.length,
      won: won.length,
      lost: lost.length,
      conversionPct: pct(won.length, won.length + lost.length),
      avgDaysToWin: daysToWin.length ? Math.round(daysToWin.reduce((a, d) => a + d, 0) / daysToWin.length) : null,
      wonFeePaise: won.reduce((a, l) => a + l.estFeePaise, 0),
      openLeads: openLeads.length,
      openLeadFeePaise: openLeads.reduce((a, l) => a + l.estFeePaise, 0),
      followUpsOverdue: openLeads.filter((l) => l.nextFollowUp && l.nextFollowUp < today).length,
      proposalsSent: sent.length,
      pipelinePaise: sent.reduce((a, p) => a + proposalValue(p), 0),
      acceptancePct: pct(accepted.length, decided.length),
      acceptedPaise: accepted.reduce((a, p) => a + proposalValue(p), 0),
      expiringSoon: sent.filter((p) => p.validUntil && p.validUntil >= today && p.validUntil <= addDays(today, 7)).length,
      avgRating: received.length ? Math.round((received.reduce((a, f) => a + f.rating!, 0) / received.length) * 10) / 10 : null,
      feedbackReceived: received.length,
      feedbackRequested: feedback.length,
      lowRatings: received.filter((f) => f.rating! <= lowScore).length,
    },
    funnel,
    sources: [...sources.entries()].map(([source, r]) => ({ source, ...r, wonPct: pct(r.won, r.leads) })).sort((a, b) => b.leads - a.leads),
    lostReasons: [...lostReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    pipelineByLine: [...byLine.entries()].map(([k, r]) => ({ key: k, label: lineLabel(k), ...r })).sort((a, b) => b.paise - a.paise),
    renewals: {
      windowDays: renewalLead,
      due: renewals.length,
      byStatus: [...renewalStatus.entries()].map(([status, count]) => ({ status, count })),
      lastFeePaise: approved.reduce((a, r) => a + r.lastFeePaise, 0),
      approvedFeePaise: approved.reduce((a, r) => a + r.approvedFeePaise!, 0),
    },
    opportunities: opportunities.map((o) => ({ key: o.serviceLine, label: lineLabel(o.serviceLine), count: o._count._all })).sort((a, b) => b.count - a.count),
    clientGrowth: months.map((ym) => ({ month: ym, label: monthName(ym), count: newClients.filter((c) => c.onboardingDate?.startsWith(ym)).length })),
  };
}
