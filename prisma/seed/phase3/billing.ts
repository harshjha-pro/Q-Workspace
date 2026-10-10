/**
 * Phase 3 billing seed (P3-03, P3-30, P3-34, P3-35).
 * Reference: the default invoice series for the current financial year (QI/yy-yy/, numbers allocated on issue).
 * Demo: about three quarters of the chargeable engagements invoiced over the last six months (fixed,
 * time-based and monthly retainer invoices; widened in Phase 5 so analytics has a realistic billing base), receipts (full, partial, with client TDS, one advance), two write-offs, overdue invoices with
 * one reminder logged, disbursements (some recovered through invoices), IRNs on a few invoices and three
 * retainer drafts awaiting Partner approval. Uses the billing services so numbering, GST and audit apply.
 */
import type { PrismaClient } from "../../../generated/prisma/client";
import { db } from "../../../server/lib/db";
import { addDays, diffDays, fyKey, fyStartYear, isoFromParts, parseIso, todayIst } from "../../../server/lib/dates";
import type { StaffActor } from "../../../server/permissions/actor";
import { seriesPrefix } from "../../../server/services/billing/gst";
import { createDraft, issueInvoice, setEInvoiceDetails, suggestFeeLines, type LineInput } from "../../../server/services/billing/invoices";
import { recordReceipt, requestWriteOff } from "../../../server/services/billing/receipts";
import { createDisbursement } from "../../../server/services/billing/disbursements";
import { markReminderSent, paymentReminders } from "../../../server/services/billing/reports";
import { firmProfileGaps, getFirmProfile } from "../../../server/services/billing/firm";
import { getSetting } from "../../../server/services/settings/service";

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

export async function seedBillingReference(prisma: PrismaClient) {
  const fyStart = fyStartYear(todayIst());
  const fy = fyKey(fyStart);
  if (await prisma.invoiceSeries.findFirst({ where: { fy } })) return;
  const row = await prisma.setting.findUnique({ where: { key: "billing.invoicePrefix" } });
  const code = row ? (JSON.parse(row.valueJson) as string) : "QI";
  await prisma.invoiceSeries.create({ data: { fy, prefix: seriesPrefix(code, fyStart), nextNumber: 1, createdById: "system" } });
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(737373);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[int(0, 15)]).join("");

const DISB: [string, string, number, number][] = [
  ["ROC_FEE", "MCA filing fee — AOC-4", 300, 1200],
  ["ROC_FEE", "MCA filing fee — MGT-7A", 300, 600],
  ["GOVT_FEE", "Trade licence renewal fee", 1500, 5000],
  ["CHALLAN", "Late fee challan paid on the portal", 200, 2000],
  ["STAMP_DUTY", "Stamp paper for agreement", 100, 500],
  ["GOVT_FEE", "Udyam / registration charges", 500, 1500],
  ["TRAVEL", "Travel to client site (recoverable)", 400, 2500],
];

type Plan = { date: string; engagementId: string; clientId: string; feeBasis: string; retainerPeriod?: string };

export async function seedBillingDemo() {
  const today = todayIst();
  const firm = await getFirmProfile();
  if (firmProfileGaps(firm).length) return { skipped: "firm profile incomplete" };
  if (await db().invoice.count()) return { skipped: "invoices already exist" };
  const users = new Map((await db().user.findMany({ where: { isSystem: false }, select: { id: true, username: true, role: true, isSenior: true, displayName: true } })).map((u) => [u.username, u]));
  const actor = (username: string): StaffActor => {
    const u = users.get(username)!;
    return { kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName };
  };
  const partner = actor("arvind.mehta");
  const pa = actor("suresh.pillai");
  const divisor = await getSetting<number>("billing.retainerMonthlyDivisor", 12);

  const engs = await db().engagement.findMany({
    where: { chargeable: true, status: { in: ["ACTIVE", "COMPLETED"] }, client: { isFirm: false, status: "ACTIVE" }, OR: [{ feePaise: { gt: 0 } }, { feeBasis: "TIME", ratePaisePerHour: { gt: 0 } }] },
    select: { id: true, clientId: true, feeBasis: true, recurrence: true, name: true },
    orderBy: { code: "asc" },
  });
  const byBasis = (b: string) => engs.filter((e) => e.feeBasis === b);
  const shuffle = <T,>(a: T[]) => a.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
  // The first three retainers get Partner-approval drafts (step 7); the rest bill monthly. A quarter of the
  // engagements stay unbilled so the unbilled-work alert has something to show.
  const allRetainers = byBasis("RETAINER").filter((e) => e.recurrence === "RECURRING");
  const retainers = shuffle(allRetainers).slice(0, Math.max(9, Math.round(allRetainers.length * 0.75)));
  const fixed = shuffle(byBasis("FIXED")).slice(0, Math.max(12, Math.round(byBasis("FIXED").length * 0.7)));
  const timed = shuffle(byBasis("TIME"));

  // 1. Disbursements first (so some can be recovered through the invoices below).
  const disbClients = shuffle([...new Set([...fixed, ...retainers].map((e) => e.clientId))]).slice(0, 10);
  for (const clientId of disbClients) {
    const [kind, description, lo, hi] = pick(DISB);
    await createDisbursement(pa, { clientId, date: addDays(today, -int(20, 170)), amountPaise: int(lo, hi) * 100, kind: kind as "OTHER", description });
  }
  for (let i = 0; i < 3; i += 1) {
    const [kind, description, lo, hi] = pick(DISB);
    await createDisbursement(partner, { clientId: pick(disbClients), date: addDays(today, -int(3, 25)), amountPaise: int(lo, hi) * 100, kind: kind as "OTHER", description });
  }

  // 2. Plan invoices over the last six months, then issue in date order (numbers run in date order).
  const plans: Plan[] = [];
  const { y, m } = parseIso(today);
  for (const e of retainers.slice(3)) {
    for (let back = 5; back >= 1; back -= 1) {
      if (rand() < 0.25) continue;
      const first = isoFromParts(y, m - back, 1);
      plans.push({ date: addDays(first, int(0, 4)), engagementId: e.id, clientId: e.clientId, feeBasis: "RETAINER", retainerPeriod: first.slice(0, 7) });
    }
  }
  for (const e of fixed) plans.push({ date: addDays(today, -int(8, 175)), engagementId: e.id, clientId: e.clientId, feeBasis: "FIXED" });
  for (const e of timed) plans.push({ date: addDays(today, -int(8, 120)), engagementId: e.id, clientId: e.clientId, feeBasis: "TIME" });
  plans.sort((a, b) => a.date.localeCompare(b.date));

  const issued: { id: string; date: string; clientId: string; totalPaise: number; taxablePaise: number }[] = [];
  for (const p of plans) {
    if (p.date > today) continue;
    let lines: LineInput[] = await suggestFeeLines(pa, p.engagementId, p.feeBasis === "TIME" ? { to: p.date } : p.retainerPeriod ? { from: `${p.retainerPeriod}-01` } : {});
    if (!lines.length) lines = [{ kind: "FEE", description: "Professional fees", quantityMilli: 12_000, ratePaise: 2500_00, engagementId: p.engagementId }];
    if (p.feeBasis === "FIXED" && rand() < 0.4) lines = lines.map((l) => ({ ...l, ratePaise: Math.round(l.ratePaise / 2), description: `${l.description} — first instalment (50%)` }));
    const disb = await db().disbursement.findFirst({ where: { clientId: p.clientId, status: "UNRECOVERED", date: { lte: p.date } } });
    if (disb && rand() < 0.75) lines.push({ kind: "REIMBURSEMENT", description: `${disb.description} (paid on your behalf)`, ratePaise: disb.amountPaise, disbursementId: disb.id });
    const who = p.retainerPeriod ? partner : pa;
    const draft = await createDraft(who, { clientId: p.clientId, engagementId: p.engagementId, date: p.date, lines, ...(p.retainerPeriod ? { periodFrom: `${p.retainerPeriod}-01` } : {}) }, p.retainerPeriod ? { retainerPeriod: p.retainerPeriod } : {});
    try {
      const inv = await issueInvoice(who, draft.id, { date: p.date });
      issued.push({ id: inv.id, date: inv.date, clientId: inv.clientId, totalPaise: inv.totalPaise, taxablePaise: inv.taxablePaise });
    } catch {
      // e.g. a later-dated invoice already in the series: leave as a draft.
    }
  }

  // 3. IRNs on a few of the larger invoices (typed in manually from the IRP).
  for (const inv of [...issued].sort((a, b) => b.totalPaise - a.totalPaise).slice(0, 3)) {
    await setEInvoiceDetails(pa, inv.id, { irn: hex(64), ackNo: `1124${String(int(10_000_000, 99_999_999))}${int(100, 999)}`, ackDate: inv.date });
  }

  // 4. Receipts: most older invoices paid (some with client TDS), some part-paid, the rest open / overdue.
  let tdsCount = 0;
  const partly: string[] = [];
  for (const inv of issued) {
    const age = diffDays(inv.date, today);
    if (age < 12) continue;
    const roll = rand();
    const date = addDays(inv.date, Math.min(int(6, 45), age - 1));
    const mode = pick(["NEFT", "UPI", "RTGS", "IMPS", "CHEQUE"] as const);
    const reference = mode === "CHEQUE" ? String(int(100000, 999999)) : mode === "UPI" ? `UPI${int(10_000_000, 99_999_999)}` : `UTR${hex(12).toUpperCase()}`;
    if (roll < 0.55) {
      // Illustrative TDS amount for the demo only (a tenth of the fee) — not a rate rule.
      const tds = rand() < 0.45 ? Math.round(inv.taxablePaise / 10) : 0;
      if (tds) tdsCount += 1;
      await recordReceipt(pa, { clientId: inv.clientId, date, amountPaise: inv.totalPaise - tds, tdsPaise: tds, mode, reference, allocations: [{ invoiceId: inv.id, amountPaise: inv.totalPaise }] });
    } else if (roll < 0.75) {
      const part = Math.round(inv.totalPaise * pick([0.3, 0.5, 0.6]));
      await recordReceipt(pa, { clientId: inv.clientId, date, amountPaise: part, mode, reference, allocations: [{ invoiceId: inv.id, amountPaise: part }] });
      partly.push(inv.id);
    }
  }
  // One advance received with no invoice to allocate to yet.
  const advClient = issued[0]?.clientId;
  if (advClient) await recordReceipt(pa, { clientId: advClient, date: addDays(today, -4), amountPaise: 15_000_00, mode: "NEFT", reference: `UTR${hex(12).toUpperCase()}`, notes: "Advance for next quarter" });

  // 5. Two write-offs of part-paid balances (Partner, approved at once).
  for (const id of partly.slice(0, 2)) await requestWriteOff(partner, id, { reason: "Balance waived after fee discussion with the client" });

  // 6. One payment reminder already marked as sent.
  const due = await paymentReminders(partner, today);
  if (due[0]) await markReminderSent(pa, due[0].invoiceId, { channel: "WHATSAPP", ruleCode: due[0].ruleCode, messageText: due[0].text });

  // 7. Three retainer drafts for this month awaiting Partner approval.
  const period = today.slice(0, 7);
  let drafts = 0;
  for (const e of retainers.slice(0, 3)) {
    const fee = (await db().engagement.findUniqueOrThrow({ where: { id: e.id }, select: { feePaise: true } })).feePaise;
    await createDraft({ kind: "SYSTEM", role: "SYSTEM", userId: "system", displayName: "System" }, {
      clientId: e.clientId, engagementId: e.id, date: today, periodFrom: `${period}-01`,
      lines: [{ kind: "FEE", description: `${e.name} — retainer fee for ${period}`, quantityMilli: 1000, ratePaise: Math.round(fee / (divisor || 12)), engagementId: e.id }],
    }, { retainerPeriod: period });
    drafts += 1;
  }

  return { invoices: issued.length, tdsReceipts: tdsCount, writeOffs: Math.min(2, partly.length), retainerDrafts: drafts, reminders: due.length };
}
