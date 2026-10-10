import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { forbidden, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { diffDays, formatDate, todayIst, toIstDate } from "../../lib/dates";
import { costOfEntries } from "../costs";
import { approvedTemplateBody } from "../../documents/library";
import { renderMerge } from "../../documents/merge";
import { rs } from "../../documents/pdf";
import {
  assertInvoiceAccess, authorizeBilling, billingClientIds, billingSettings, canSeeCosts, idOf, inClients, ISSUED_STATUSES, OPEN_STATUSES, outstandingOf,
} from "./common";
import { BUCKETS, bucketIndex } from "./ageing";
import { getFirmProfile } from "./firm";

type AgeRow = { id: string; name: string; buckets: number[]; totalPaise: number; count: number };

/** Receivables ageing 0–30 / 31–60 / 61–90 / 90+ (days since invoice date) by client and by Partner. */
export async function receivablesAgeing(actor: Actor, today = todayIst()) {
  const ids = await billingClientIds(actor);
  const invs = await db().invoice.findMany({ where: { ...inClients(ids), status: { in: OPEN_STATUSES } }, select: { id: true, clientId: true, date: true, totalPaise: true, receivedPaise: true, writtenOffPaise: true } });
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(invs.map((i) => i.clientId))] } }, select: { id: true, name: true, partnerId: true } })).map((c) => [c.id, c]));
  const partners = new Map((await db().user.findMany({ where: { id: { in: [...clients.values()].map((c) => c.partnerId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const byClient = new Map<string, AgeRow>();
  const byPartner = new Map<string, AgeRow>();
  const totals = BUCKETS.map(() => 0);
  const add = (map: Map<string, AgeRow>, id: string, name: string, b: number, amt: number) => {
    const row = map.get(id) ?? { id, name, buckets: BUCKETS.map(() => 0), totalPaise: 0, count: 0 };
    row.buckets[b]! += amt;
    row.totalPaise += amt;
    row.count += 1;
    map.set(id, row);
  };
  for (const i of invs) {
    const amt = outstandingOf(i);
    if (!amt) continue;
    const b = bucketIndex(diffDays(i.date, today));
    const c = clients.get(i.clientId);
    totals[b]! += amt;
    add(byClient, i.clientId, c?.name ?? "", b, amt);
    add(byPartner, c?.partnerId ?? "-", c?.partnerId ? (partners.get(c.partnerId) ?? "") : "No partner", b, amt);
  }
  const sort = (m: Map<string, AgeRow>) => [...m.values()].sort((a, b) => b.totalPaise - a.totalPaise);
  return { buckets: BUCKETS.map((b, i) => ({ key: b.key, label: b.label, amountPaise: totals[i]! })), totalPaise: totals.reduce((a, b) => a + b, 0), byClient: sort(byClient), byPartner: sort(byPartner) };
}

/** Last issued invoice date per engagement (invoice-level or line-level link). */
export async function lastInvoiceDates(engagementIds: string[]) {
  const invs = await db().invoice.findMany({
    where: { status: { in: ISSUED_STATUSES }, OR: [{ engagementId: { in: engagementIds } }, { lines: { some: { engagementId: { in: engagementIds } } } }] },
    select: { date: true, engagementId: true, lines: { select: { engagementId: true } } },
  });
  const out = new Map<string, string>();
  for (const i of invs) {
    for (const e of new Set([i.engagementId, ...i.lines.map((l) => l.engagementId)])) {
      if (e && (!out.has(e) || out.get(e)! < i.date)) out.set(e, i.date);
    }
  }
  return out;
}

/**
 * Unbilled-work alert: chargeable engagements with chargeable hours logged (or a fixed fee) not invoiced
 * for more than billing.unbilledAlertDays: the oldest chargeable entry after the last invoice is older than that
 * (a never-billed fixed / retainer fee ages from the engagement start).
 */
export async function unbilledAlerts(actor: Actor, today = todayIst()) {
  const ids = await billingClientIds(actor);
  const s = await billingSettings();
  const engs = await db().engagement.findMany({
    where: { ...inClients(ids), chargeable: true, status: { in: ["ACTIVE", "COMPLETED", "ON_HOLD"] } },
    select: { id: true, code: true, name: true, clientId: true, feeBasis: true, feePaise: true, ratePaisePerHour: true, startDate: true, createdAt: true, partnerId: true },
  });
  const last = await lastInvoiceDates(engs.map((e) => e.id));
  const entries = await db().workEntry.findMany({ where: { engagementId: { in: engs.map((e) => e.id) }, deletedAt: null, chargeable: true }, select: { engagementId: true, date: true, minutes: true } });
  const minutesAfter = new Map<string, number>();
  const oldestUnbilled = new Map<string, string>();
  for (const w of entries) {
    const id = w.engagementId!;
    const l = last.get(id);
    if (l && w.date <= l) continue;
    minutesAfter.set(id, (minutesAfter.get(id) ?? 0) + w.minutes);
    if (!oldestUnbilled.has(id) || oldestUnbilled.get(id)! > w.date) oldestUnbilled.set(id, w.date);
  }
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(engs.map((e) => e.clientId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const out = [];
  for (const e of engs) {
    const lastDate = last.get(e.id) ?? null;
    const minutes = minutesAfter.get(e.id) ?? 0;
    const neverBilledFee = !lastDate && e.feePaise > 0 && e.feeBasis !== "TIME";
    if (!minutes && !neverBilledFee) continue;
    // Age of the oldest unbilled chargeable work; a never-billed fixed fee ages from the engagement start.
    const anchor = oldestUnbilled.get(e.id) ?? e.startDate ?? toIstDate(e.createdAt);
    const days = diffDays(anchor, today);
    if (days <= s.unbilledAlertDays) continue;
    const estimate = e.feeBasis === "TIME" ? Math.round((minutes * e.ratePaisePerHour) / 60) : e.feeBasis === "RETAINER" ? Math.round(e.feePaise / s.retainerDivisor) : lastDate ? 0 : e.feePaise;
    out.push({ engagementId: e.id, code: e.code, name: e.name, clientId: e.clientId, clientName: clients.get(e.clientId) ?? "", feeBasis: e.feeBasis, lastInvoiceDate: lastDate, daysSince: days, unbilledMinutes: minutes, estimatePaise: estimate });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince);
}

/**
 * Realization (spec 7.1): fees billed (taxable fee lines of issued invoices) ÷ internal cost of hours
 * (costOfEntries, Q-22), per engagement and per client. Partners and Practice Admin only.
 */
export async function realization(actor: Actor) {
  authorizeBilling(actor, "billing.view");
  if (!canSeeCosts(actor)) throw forbidden();
  const lines = await db().invoiceLine.findMany({ where: { kind: "FEE", engagementId: { not: null }, invoice: { status: { in: ISSUED_STATUSES } } }, select: { engagementId: true, amountPaise: true } });
  const billed = new Map<string, number>();
  for (const l of lines) billed.set(l.engagementId!, (billed.get(l.engagementId!) ?? 0) + l.amountPaise);
  const entries = await db().workEntry.findMany({ where: { engagementId: { not: null }, deletedAt: null }, select: { engagementId: true, userId: true, date: true, minutes: true } });
  // Aggregate per engagement × person × month (cost rates are looked up per month by costOfEntries).
  const agg = new Map<string, Map<string, { userId: string; date: string; minutes: number }>>();
  for (const w of entries) {
    const m = agg.get(w.engagementId!) ?? new Map();
    const k = `${w.userId}|${w.date.slice(0, 7)}`;
    const cur = m.get(k);
    if (cur) {
      cur.minutes += w.minutes;
      if (w.date < cur.date) cur.date = w.date;
    } else m.set(k, { userId: w.userId, date: w.date, minutes: w.minutes });
    agg.set(w.engagementId!, m);
  }
  const engIds = [...new Set([...billed.keys(), ...agg.keys()])];
  const engs = await db().engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, code: true, name: true, clientId: true } });
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(engs.map((e) => e.clientId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const perEngagement = [];
  for (const e of engs) {
    const parts = [...(agg.get(e.id)?.values() ?? [])];
    const cost = parts.length ? await costOfEntries(parts) : 0;
    const minutes = parts.reduce((t, p) => t + p.minutes, 0);
    const b = billed.get(e.id) ?? 0;
    perEngagement.push({ engagementId: e.id, code: e.code, name: e.name, clientId: e.clientId, clientName: clients.get(e.clientId) ?? "", billedPaise: b, costPaise: cost, minutes, ratio: cost > 0 ? b / cost : null });
  }
  const byClient = new Map<string, { clientId: string; clientName: string; billedPaise: number; costPaise: number; minutes: number; ratio: number | null }>();
  for (const r of perEngagement) {
    const c = byClient.get(r.clientId) ?? { clientId: r.clientId, clientName: r.clientName, billedPaise: 0, costPaise: 0, minutes: 0, ratio: null };
    c.billedPaise += r.billedPaise;
    c.costPaise += r.costPaise;
    c.minutes += r.minutes;
    c.ratio = c.costPaise > 0 ? c.billedPaise / c.costPaise : null;
    byClient.set(r.clientId, c);
  }
  await logSensitiveView(actor, "BILLING", "Realization", "firm");
  return { perEngagement: perEngagement.sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99)), perClient: [...byClient.values()].sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99)) };
}

// ---------------------------------------------------------------------------
// Payment reminders (replaces automated reminders, P4-08): copy-ready text + "Mark as sent".
// ---------------------------------------------------------------------------

export const PAYMENT_REMINDER_TEMPLATE = "PAYMENT_REMINDER";
const DEFAULT_REMINDER = `Dear {{extra.contact}},

This is a gentle reminder that our invoice {{extra.invoiceNo}} dated {{extra.invoiceDate}} for {{extra.total}} is outstanding. The balance due is {{extra.balance}} (due on {{extra.dueDate}}).

You may pay by bank transfer to {{extra.bank}}{{extra.upi}}. Please quote the invoice number. If you have already paid, kindly share the payment details and ignore this reminder.

Regards,
{{firm.name}}
{{firm.phone}}`;

/** Overdue invoices that reached a reminder point (billing.reminderDays, days since invoice date) not yet marked sent. */
export async function paymentReminders(actor: Actor, today = todayIst()) {
  const ids = await billingClientIds(actor);
  const s = await billingSettings();
  const invs = await db().invoice.findMany({ where: { ...inClients(ids), status: { in: OPEN_STATUSES }, dueDate: { lt: today } }, orderBy: { date: "asc" } });
  if (!invs.length) return [];
  const logs = await db().reminderLog.findMany({ where: { invoiceId: { in: invs.map((i) => i.id) }, kind: "PAYMENT" }, select: { invoiceId: true, ruleCode: true, sentAt: true } });
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...new Set(invs.map((i) => i.clientId))] } }, include: { contacts: { orderBy: [{ isBilling: "desc" }, { isPrimary: "desc" }], take: 1 } } })).map((c) => [c.id, c]));
  const firm = await getFirmProfile();
  const { body } = await approvedTemplateBody(PAYMENT_REMINDER_TEMPLATE, DEFAULT_REMINDER);
  const out = [];
  for (const i of invs) {
    const age = diffDays(i.date, today);
    const point = [...s.reminderDays].reverse().find((p) => age >= p);
    if (!point) continue;
    const ruleCode = `AGE_${point}`;
    if (logs.some((l) => l.invoiceId === i.id && l.ruleCode === ruleCode)) continue;
    const c = clients.get(i.clientId);
    const contact = c?.contacts[0];
    const text = renderMerge(body, {
      firm: { name: firm.name, phone: firm.phone, email: firm.email, gstin: firm.gstin },
      client: { name: c?.name ?? "" },
      extra: {
        contact: contact?.name || c?.name || "Sir / Madam", invoiceNo: i.number ?? "", invoiceDate: formatDate(i.date), dueDate: formatDate(i.dueDate),
        total: rs(i.totalPaise), balance: rs(outstandingOf(i)), bank: firm.bankAccount ? `${firm.bankName} A/c ${firm.bankAccount} (IFSC ${firm.bankIfsc})` : "our bank account",
        upi: firm.upiId ? ` or UPI ${firm.upiId}` : "",
      },
    }).text;
    const last = logs.filter((l) => l.invoiceId === i.id).sort((a, b) => +b.sentAt - +a.sentAt)[0];
    out.push({
      invoiceId: i.id, number: i.number ?? "", clientId: i.clientId, clientName: c?.name ?? "", date: i.date, dueDate: i.dueDate, ageDays: age, point, ruleCode,
      outstandingPaise: outstandingOf(i), contactName: contact?.name ?? "", contactEmail: contact?.email ?? "", contactPhone: contact?.whatsapp || contact?.phone || "",
      lastSentAt: last?.sentAt ?? null, text,
    });
  }
  return out;
}

const sentInput = z.object({ channel: z.enum(["EMAIL", "WHATSAPP", "CALL", "IN_APP", "MEETING"]), ruleCode: z.string().regex(/^(AGE_\d+|MANUAL)$/), messageText: z.string().max(4000).default("") });

export async function markReminderSent(actor: Actor, invoiceId: string, input: z.input<typeof sentInput>) {
  authorizeBilling(actor, "billing.raise");
  const inv = await assertInvoiceAccess(actor, "billing.raise", invoiceId);
  if (!OPEN_STATUSES.includes(inv.status)) throw ruleViolation("Only an open invoice needs a payment reminder.");
  const d = parse(sentInput, input);
  return transaction(async (tx) => {
    const row = await tx.reminderLog.create({ data: { clientId: inv.clientId, invoiceId, kind: "PAYMENT", channel: d.channel, messageText: d.messageText, ruleCode: d.ruleCode, sentById: idOf(actor), createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ReminderLog", entityId: row.id, action: "PAYMENT_REMINDER_SENT", after: { invoiceId, channel: d.channel, ruleCode: d.ruleCode } });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function billingDashboard(actor: Actor) {
  const today = todayIst();
  const ids = await billingClientIds(actor);
  const [ageing, unbilled, drafts, reminders, real] = await Promise.all([
    receivablesAgeing(actor, today),
    unbilledAlerts(actor, today),
    db().invoice.findMany({ where: { ...inClients(ids), status: "DRAFT", isRetainerDraft: true }, orderBy: { date: "desc" } }),
    paymentReminders(actor, today),
    canSeeCosts(actor) ? realization(actor) : Promise.resolve(null),
  ]);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [billedMonth, receivedMonth] = await Promise.all([
    db().invoice.aggregate({ where: { ...inClients(ids), status: { in: ISSUED_STATUSES }, date: { gte: monthStart } }, _sum: { totalPaise: true } }),
    db().receiptAllocation.aggregate({ where: { invoice: inClients(ids), receipt: { date: { gte: monthStart } } }, _sum: { amountPaise: true } }),
  ]);
  const draftClients = new Map((await db().client.findMany({ where: { id: { in: drafts.map((d) => d.clientId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  await logSensitiveView(actor, "BILLING", "BillingDashboard", "-");
  return {
    ageing, unbilled, reminders, realization: real,
    retainerDrafts: drafts.map((d) => ({ ...d, clientName: draftClients.get(d.clientId) ?? "" })),
    billedThisMonthPaise: billedMonth._sum.totalPaise ?? 0,
    receivedThisMonthPaise: receivedMonth._sum.amountPaise ?? 0,
  };
}
