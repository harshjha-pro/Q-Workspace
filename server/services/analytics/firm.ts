import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { diffDays, todayIst } from "../../lib/dates";
import { ISSUED_STATUSES, OPEN_STATUSES, outstandingOf } from "../billing/common";
import { complianceDashboard } from "./compliance";
import { assertFirmAnalytics, hrs, lastMonths, monthName, pct, resolvePeriod } from "./common";

/**
 * Firm dashboard (P5-01), Partner only (analytics.firm). One page of headline numbers for the period plus a
 * 12-month trend. Billing figures follow the Billing module's own definitions (issued = raised, part/fully
 * received or written off; collected = receipts not reversed), so the two never disagree.
 */
export async function firmDashboard(actor: Actor, opts: { period?: string; today?: string } = {}) {
  assertFirmAnalytics(actor);
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const months = lastMonths(12, today);
  const trendFrom = `${months[0]}-01`;
  const firmIds = (await db().client.findMany({ where: { isFirm: true }, select: { id: true } })).map((c) => c.id);
  const notFirm = { clientId: { notIn: firmIds } };

  const [compliance, entries, invoices, receipts, openInvoices, clientsActive, clientsNew, leadsOpen, proposalsSent, headcount, trendInvoices, trendReceipts] = await Promise.all([
    complianceDashboard(actor, { period: period.key, today }),
    db().workEntry.findMany({ where: { deletedAt: null, date: { gte: period.from, lte: period.to } }, select: { minutes: true, chargeable: true, clientId: true } }),
    db().invoice.aggregate({ where: { ...notFirm, status: { in: ISSUED_STATUSES }, date: { gte: period.from, lte: period.to } }, _sum: { totalPaise: true }, _count: { _all: true } }),
    db().receipt.aggregate({ where: { ...notFirm, reversedAt: null, date: { gte: period.from, lte: period.to } }, _sum: { amountPaise: true, tdsPaise: true } }),
    db().invoice.findMany({ where: { ...notFirm, status: { in: OPEN_STATUSES } }, select: { date: true, totalPaise: true, receivedPaise: true, writtenOffPaise: true } }),
    db().client.count({ where: { isFirm: false, status: "ACTIVE" } }),
    db().client.count({ where: { isFirm: false, onboardingDate: { gte: period.from, lte: period.to } } }),
    db().lead.count({ where: { stage: { notIn: ["WON", "LOST"] } } }),
    db().proposal.findMany({ where: { status: "SENT" }, select: { feePaise: true, ratePaise: true, budgetMinutes: true } }),
    db().user.count({ where: { active: true, isSystem: false } }),
    db().invoice.findMany({ where: { ...notFirm, status: { in: ISSUED_STATUSES }, date: { gte: trendFrom, lte: today } }, select: { date: true, totalPaise: true } }),
    db().receipt.findMany({ where: { ...notFirm, reversedAt: null, date: { gte: trendFrom, lte: today } }, select: { date: true, amountPaise: true } }),
  ]);

  const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
  const clientMinutes = entries.filter((e) => e.clientId && !firmIds.includes(e.clientId)).reduce((a, e) => a + e.minutes, 0);
  const chargeableMinutes = entries.filter((e) => e.chargeable).reduce((a, e) => a + e.minutes, 0);
  const receivable = openInvoices.reduce((a, i) => a + outstandingOf(i), 0);
  const over90 = openInvoices.filter((i) => diffDays(i.date, today) > 90).reduce((a, i) => a + outstandingOf(i), 0);
  const pipeline = proposalsSent.reduce((a, p) => a + (p.feePaise > 0 ? p.feePaise : Math.round((p.ratePaise * p.budgetMinutes) / 60)), 0);

  const trend = months.map((ym) => ({
    month: ym,
    label: monthName(ym),
    invoicedPaise: trendInvoices.filter((i) => i.date.startsWith(ym)).reduce((a, i) => a + i.totalPaise, 0),
    collectedPaise: trendReceipts.filter((r) => r.date.startsWith(ym)).reduce((a, r) => a + r.amountPaise, 0),
    onTimePct: compliance.trend.find((t) => t.month === ym)?.onTimePct ?? null,
  }));

  return {
    period,
    compliance: compliance.headline,
    effort: { hours: hrs(totalMinutes), clientHours: hrs(clientMinutes), chargeableHours: hrs(chargeableMinutes), chargeableShare: pct(chargeableMinutes, totalMinutes) },
    billing: {
      invoicedPaise: invoices._sum.totalPaise ?? 0,
      invoiceCount: invoices._count._all,
      collectedPaise: receipts._sum.amountPaise ?? 0,
      tdsPaise: receipts._sum.tdsPaise ?? 0,
      receivablePaise: receivable,
      over90Paise: over90,
    },
    clients: { active: clientsActive, newInPeriod: clientsNew },
    growth: { openLeads: leadsOpen, proposalsSent: proposalsSent.length, pipelinePaise: pipeline },
    people: { headcount },
    trend,
  };
}
