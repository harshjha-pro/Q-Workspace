import { db } from "../../lib/db";
import type { Actor } from "../../permissions/actor";
import { logSensitiveView } from "../../audit";
import { addDays, diffDays, todayIst } from "../../lib/dates";
import { SERVICE_LINE_LABELS, type ServiceLine } from "../../domain/enums";
import { ISSUED_STATUSES, OPEN_STATUSES, outstandingOf } from "../billing/common";
import { BUCKETS, bucketIndex } from "../billing/ageing";
import { lastInvoiceDates } from "../billing/reports";
import { assertFirmAnalytics, hrs, pct, resolvePeriod } from "./common";

/**
 * Profitability and cash (P5-03), Partner only (analytics.firm). Built on the Billing module's definitions:
 *   cost       = minutes × the person's cost rate for their designation on that day (Q-22, effective-dated);
 *   realization = taxable fees billed ÷ internal cost of hours on engagements (D-59), as a percentage;
 *   WIP        = chargeable work logged after the engagement's last issued invoice (unbilled), at cost and,
 *                for time-billed engagements, at the engagement rate; never-billed fixed fees at the fee;
 *   DSO        = receivable today ÷ fees invoiced in the last 90 days × 90 (count-back over one quarter);
 *   concentration = each client's share of fees billed over the last 12 months.
 * Cost rates are salary-level data, so every view is logged as sensitive.
 */
type RateRow = { designationId: string; ratePaisePerHour: number; effectiveFrom: string; effectiveTo: string | null };

/** Cost-rate lookup for (user, date); null when the person has no designation or no rate covers the day. */
async function costLookup() {
  const [users, rates] = await Promise.all([
    db().user.findMany({ select: { id: true, designationId: true } }),
    db().costRate.findMany({ orderBy: { effectiveFrom: "desc" } }),
  ]);
  const desig = new Map(users.map((u) => [u.id, u.designationId]));
  const byDesig = new Map<string, RateRow[]>();
  for (const r of rates) byDesig.set(r.designationId, [...(byDesig.get(r.designationId) ?? []), r]);
  return (userId: string, date: string): number | null => {
    const d = desig.get(userId);
    const r = d ? byDesig.get(d)?.find((x) => x.effectiveFrom <= date && (!x.effectiveTo || x.effectiveTo >= date)) : undefined;
    return r ? r.ratePaisePerHour : null;
  };
}
const costOf = (rate: number | null, minutes: number) => (rate === null ? 0 : Math.round((rate * minutes) / 60));
const lineOf = (s: string | null | undefined) => (s ? (SERVICE_LINE_LABELS[s as ServiceLine] ?? s) : "Not linked to an engagement");

export async function profitabilityDashboard(actor: Actor, opts: { period?: string; today?: string } = {}) {
  assertFirmAnalytics(actor);
  const today = opts.today ?? todayIst();
  const period = resolvePeriod(opts.period, today);
  const rateOf = await costLookup();
  const firmIds = (await db().client.findMany({ where: { isFirm: true }, select: { id: true } })).map((c) => c.id);
  const notFirm = { clientId: { notIn: firmIds } };
  const year = addDays(today, -364);

  const [designations, people, entries, feeLines, engagements, openInvoices, quarterInvoiced, paidOff, yearLines] = await Promise.all([
    db().designation.findMany({ select: { id: true, name: true, level: true, costRates: { orderBy: { effectiveFrom: "desc" } } }, orderBy: [{ level: "desc" }, { name: "asc" }] }),
    db().user.groupBy({ by: ["designationId"], where: { active: true, isSystem: false }, _count: { _all: true } }),
    db().workEntry.findMany({ where: { deletedAt: null, date: { gte: period.from, lte: period.to } }, select: { userId: true, date: true, minutes: true, engagementId: true, clientId: true, user: { select: { designationId: true } } } }),
    db().invoiceLine.findMany({
      where: { kind: "FEE", invoice: { ...notFirm, status: { in: ISSUED_STATUSES }, date: { gte: period.from, lte: period.to } } },
      select: { amountPaise: true, engagementId: true, invoice: { select: { engagementId: true } } },
    }),
    db().engagement.findMany({ where: { client: { isFirm: false } }, select: { id: true, code: true, name: true, serviceLine: true, status: true, chargeable: true, feeBasis: true, feePaise: true, ratePaisePerHour: true, startDate: true, clientId: true, client: { select: { name: true } } } }),
    db().invoice.findMany({ where: { ...notFirm, status: { in: OPEN_STATUSES } }, select: { date: true, totalPaise: true, receivedPaise: true, writtenOffPaise: true } }),
    db().invoice.aggregate({ where: { ...notFirm, status: { in: ISSUED_STATUSES }, date: { gt: addDays(today, -90), lte: today } }, _sum: { totalPaise: true } }),
    db().invoice.findMany({
      where: { ...notFirm, status: "FULLY_RECEIVED", allocations: { some: { receipt: { reversedAt: null, date: { gte: period.from, lte: period.to } } } } },
      select: { date: true, allocations: { where: { receipt: { reversedAt: null } }, select: { receipt: { select: { date: true } } } } },
    }),
    db().invoiceLine.findMany({
      where: { kind: "FEE", invoice: { ...notFirm, status: { in: ISSUED_STATUSES }, date: { gt: year, lte: today } } },
      select: { amountPaise: true, invoice: { select: { clientId: true } } },
    }),
  ]);
  const eng = new Map(engagements.map((e) => [e.id, e]));

  // --- Cost of effort in the period, and by designation -------------------------------------------------
  let costTotal = 0, costEngagements = 0, minutesNoRate = 0;
  const byDesig = new Map<string, { minutes: number; costPaise: number }>();
  const costByLine = new Map<string, number>();
  const costByEngagement = new Map<string, number>();
  for (const e of entries) {
    const rate = rateOf(e.userId, e.date);
    const c = costOf(rate, e.minutes);
    if (rate === null) minutesNoRate += e.minutes;
    costTotal += c;
    const k = e.user.designationId ?? "-";
    const d = byDesig.get(k) ?? { minutes: 0, costPaise: 0 };
    d.minutes += e.minutes;
    d.costPaise += c;
    byDesig.set(k, d);
    if (e.engagementId && eng.has(e.engagementId)) {
      costEngagements += c;
      const line = eng.get(e.engagementId)!.serviceLine;
      costByLine.set(line, (costByLine.get(line) ?? 0) + c);
      costByEngagement.set(e.engagementId, (costByEngagement.get(e.engagementId) ?? 0) + c);
    }
  }
  const counts = new Map(people.map((p) => [p.designationId ?? "-", p._count._all]));
  const costRates = designations.map((d) => {
    const current = d.costRates.find((r) => r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today));
    const used = byDesig.get(d.id);
    return { id: d.id, name: d.name, people: counts.get(d.id) ?? 0, ratePaisePerHour: current?.ratePaisePerHour ?? null, effectiveFrom: current?.effectiveFrom ?? null, hours: hrs(used?.minutes ?? 0), costPaise: used?.costPaise ?? 0 };
  });

  // --- Realization in the period: fees billed ÷ cost of hours on engagements, overall and by service line ---
  const billedByLine = new Map<string, number>();
  let billed = 0;
  for (const l of feeLines) {
    billed += l.amountPaise;
    const e = eng.get(l.engagementId ?? l.invoice.engagementId ?? "");
    const k = e?.serviceLine ?? "";
    billedByLine.set(k, (billedByLine.get(k) ?? 0) + l.amountPaise);
  }
  const lines = [...new Set([...billedByLine.keys(), ...costByLine.keys()])].map((k) => {
    const b = billedByLine.get(k) ?? 0;
    const c = costByLine.get(k) ?? 0;
    return { key: k || "NONE", label: lineOf(k), billedPaise: b, costPaise: c, realizationPct: c > 0 ? pct(b, c) : null };
  }).sort((a, b) => b.billedPaise - a.billedPaise);

  // --- WIP: chargeable work after the last issued invoice, aged by the work date --------------------------
  const chargeable = engagements.filter((e) => e.chargeable && ["ACTIVE", "ON_HOLD", "COMPLETED"].includes(e.status));
  const last = await lastInvoiceDates(chargeable.map((e) => e.id));
  const wipEntries = await db().workEntry.findMany({ where: { engagementId: { in: chargeable.map((e) => e.id) }, deletedAt: null, chargeable: true, date: { lte: today } }, select: { engagementId: true, userId: true, date: true, minutes: true } });
  const wipBuckets = BUCKETS.map((b) => ({ key: b.key, label: b.label, minutes: 0, costPaise: 0 }));
  const wipByEng = new Map<string, { minutes: number; costPaise: number; valuePaise: number; oldest: string }>();
  for (const w of wipEntries) {
    const l = last.get(w.engagementId!);
    if (l && w.date <= l) continue;
    const e = eng.get(w.engagementId!)!;
    const c = costOf(rateOf(w.userId, w.date), w.minutes);
    const b = wipBuckets[bucketIndex(diffDays(w.date, today))]!;
    b.minutes += w.minutes;
    b.costPaise += c;
    const r = wipByEng.get(e.id) ?? { minutes: 0, costPaise: 0, valuePaise: 0, oldest: w.date };
    r.minutes += w.minutes;
    r.costPaise += c;
    if (e.feeBasis === "TIME") r.valuePaise += Math.round((e.ratePaisePerHour * w.minutes) / 60);
    if (w.date < r.oldest) r.oldest = w.date;
    wipByEng.set(e.id, r);
  }
  // A fixed fee never billed at all is unbilled at its full fee, whatever the hours.
  for (const e of chargeable) {
    if (e.feeBasis === "FIXED" && e.feePaise > 0 && !last.has(e.id) && wipByEng.has(e.id)) wipByEng.get(e.id)!.valuePaise = e.feePaise;
  }
  const wipRows = [...wipByEng.entries()].map(([id, r]) => {
    const e = eng.get(id)!;
    return { id, code: e.code, name: e.name, client: e.client.name, feeBasis: e.feeBasis, hours: hrs(r.minutes), costPaise: r.costPaise, valuePaise: r.valuePaise, ageDays: diffDays(r.oldest, today), lastInvoice: last.get(id) ?? null };
  }).sort((a, b) => b.costPaise - a.costPaise);

  // --- Lowest realization to date (engagements still running, with cost logged) ---------------------------
  const running = engagements.filter((e) => ["ACTIVE", "ON_HOLD"].includes(e.status)).map((e) => e.id);
  const [allLines, allEntries] = await Promise.all([
    db().invoiceLine.findMany({ where: { kind: "FEE", invoice: { status: { in: ISSUED_STATUSES } }, OR: [{ engagementId: { in: running } }, { engagementId: null, invoice: { engagementId: { in: running } } }] }, select: { amountPaise: true, engagementId: true, invoice: { select: { engagementId: true } } } }),
    db().workEntry.findMany({ where: { engagementId: { in: running }, deletedAt: null }, select: { engagementId: true, userId: true, date: true, minutes: true } }),
  ]);
  const lifeBilled = new Map<string, number>();
  for (const l of allLines) { const id = l.engagementId ?? l.invoice.engagementId!; lifeBilled.set(id, (lifeBilled.get(id) ?? 0) + l.amountPaise); }
  const lifeCost = new Map<string, number>();
  for (const w of allEntries) lifeCost.set(w.engagementId!, (lifeCost.get(w.engagementId!) ?? 0) + costOf(rateOf(w.userId, w.date), w.minutes));
  const lowest = [...lifeCost.entries()].filter(([, c]) => c > 0).map(([id, c]) => {
    const e = eng.get(id)!;
    const b = lifeBilled.get(id) ?? 0;
    return { id, code: e.code, name: e.name, client: e.client.name, feeBasis: e.feeBasis, billedPaise: b, costPaise: c, realizationPct: pct(b, c)! };
  }).sort((a, b) => a.realizationPct - b.realizationPct).slice(0, 10);

  // --- Cash: receivable, ageing, DSO, days to collect ------------------------------------------------------
  const ageing = BUCKETS.map((b) => ({ key: b.key, label: b.label, amountPaise: 0 }));
  for (const i of openInvoices) ageing[bucketIndex(diffDays(i.date, today))]!.amountPaise += outstandingOf(i);
  const receivable = ageing.reduce((a, b) => a + b.amountPaise, 0);
  const q = quarterInvoiced._sum.totalPaise ?? 0;
  const collectDays = paidOff.map((i) => diffDays(i.date, i.allocations.reduce((m, a) => (a.receipt.date > m ? a.receipt.date : m), i.date)));

  // --- Concentration: clients' share of fees billed in the last 12 months ---------------------------------
  const names = new Map((await db().client.findMany({ where: { id: { in: [...new Set(yearLines.map((l) => l.invoice.clientId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const byClient = new Map<string, { name: string; paise: number }>();
  for (const l of yearLines) {
    const r = byClient.get(l.invoice.clientId) ?? { name: names.get(l.invoice.clientId) ?? "Client", paise: 0 };
    r.paise += l.amountPaise;
    byClient.set(l.invoice.clientId, r);
  }
  const ranked = [...byClient.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.paise - a.paise);
  const yearTotal = ranked.reduce((a, r) => a + r.paise, 0);
  const share = (n: number) => pct(ranked.slice(0, n).reduce((a, r) => a + r.paise, 0), yearTotal);
  let cumulative = 0;

  await logSensitiveView(actor, "BILLING", "Profitability", "firm", period.key);
  await logSensitiveView(actor, "SALARY", "CostRates", "firm", "profitability dashboard");

  return {
    period,
    headline: {
      billedPaise: billed,
      costPaise: costTotal,
      engagementCostPaise: costEngagements,
      realizationPct: costEngagements > 0 ? pct(billed, costEngagements) : null,
      wipCostPaise: wipRows.reduce((a, r) => a + r.costPaise, 0),
      wipValuePaise: wipRows.reduce((a, r) => a + r.valuePaise, 0),
      receivablePaise: receivable,
      dsoDays: q > 0 ? Math.round((receivable / q) * 90) : null,
      daysToCollect: collectDays.length ? Math.round(collectDays.reduce((a, d) => a + d, 0) / collectDays.length) : null,
      invoicesCollected: collectDays.length,
      hoursWithoutRate: hrs(minutesNoRate),
    },
    costRates,
    realizationByLine: lines,
    lowestRealization: lowest,
    wip: { buckets: wipBuckets.map((b) => ({ ...b, hours: hrs(b.minutes) })), top: wipRows.slice(0, 12), engagements: wipRows.length },
    cash: { ageing, quarterInvoicedPaise: q },
    concentration: {
      yearBilledPaise: yearTotal,
      clients: ranked.length,
      top1Pct: share(1),
      top5Pct: share(5),
      top10Pct: share(10),
      top: ranked.slice(0, 10).map((r) => ({ id: r.id, name: r.name, paise: r.paise, sharePct: pct(r.paise, yearTotal), cumulativePct: pct((cumulative += r.paise), yearTotal) })),
    },
  };
}
