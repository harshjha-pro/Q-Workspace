/**
 * Phase 5 demo (P5-07, P5-08). Gives analytics a history to stand on:
 *  - last financial year's completed engagements for about 60% of this year's recurring ones, with hours by stage
 *    (effort about 80–125% of budget) and their invoices (issued in last year's series, most paid), so budget
 *    estimates, "last FY" dashboards and concentration have data;
 *  - last year's cost rates (about 8% below this year's, effective-dated) so last year's hours are costed;
 *  - last month's Partner MIS, built as System and announced to the Partners;
 *  - this Monday's weekly-summary notices.
 * Demo only: the reference seed adds nothing here.
 */
import { db } from "../../../server/lib/db";
import { addDays, fyStartYear, isoFromParts, todayIst } from "../../../server/lib/dates";
import type { StaffActor } from "../../../server/permissions/actor";
import { systemActor } from "../../../server/permissions/actor";
import { createDraft, issueInvoice } from "../../../server/services/billing/invoices";
import { setCostRate } from "../../../server/services/payroll/cost-rates";
import { recordReceipt } from "../../../server/services/billing/receipts";
import { buildMis, previousMonth } from "../../../server/services/analytics/mis";
import { runWeeklySummaries } from "../../../server/services/analytics/weekly";

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
const rand = rng(515151);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

const TYPES = ["GST_RETURN", "INCOME_TAX_RETURN", "TDS_RETURN", "ROC_ANNUAL", "AUDIT", "PAYROLL_STATUTORY", "BOOKKEEPING"];
/** "FY 2026-27" → "FY 2025-26", "AY 2026-27" → "AY 2025-26". */
const yearBack = (name: string) => name.replace(/(FY|AY) (\d{4})-(\d{2})/, (_, k: string, a: string, b: string) => `${k} ${Number(a) - 1}-${String(Number(b) - 1).padStart(2, "0")}`);

export async function seedAnalyticsDemo() {
  const today = todayIst();
  if (await db().engagement.count({ where: { code: { startsWith: "EN-P" } } })) return { skipped: "already seeded" };
  const pa = await db().user.findFirst({ where: { username: "suresh.pillai" } });
  if (!pa) return { skipped: "no demo users" };
  const paActor: StaffActor = { kind: "USER", userId: pa.id, role: "PRACTICE_ADMIN", isSenior: false, displayName: pa.displayName };
  const fy = fyStartYear(today);
  const lastFrom = isoFromParts(fy - 1, 4, 1);
  const lastTo = isoFromParts(fy, 3, 31);

  // Last year's cost rate per designation, ending the day before this year's starts (setCostRate chains them).
  const partner = await db().user.findFirst({ where: { username: "arvind.mehta" } });
  if (partner) {
    const pActor: StaffActor = { kind: "USER", userId: partner.id, role: "PARTNER", isSenior: false, displayName: partner.displayName };
    for (const r of await db().costRate.findMany({ where: { effectiveFrom: { gt: lastFrom } }, orderBy: { effectiveFrom: "asc" }, distinct: ["designationId"] })) {
      await setCostRate(pActor, { designationId: r.designationId, ratePaisePerHour: Math.round((r.ratePaisePerHour * 0.92) / 500) * 500, effectiveFrom: lastFrom });
    }
  }

  const current = await db().engagement.findMany({
    where: { recurrence: "RECURRING", status: "ACTIVE", engagementType: { in: TYPES }, client: { isFirm: false, status: "ACTIVE" }, NOT: { name: { endsWith: "(recurring)" } } },
    select: { id: true, clientId: true, name: true, serviceLine: true, engagementType: true, feeBasis: true, feePaise: true, budgetMinutes: true, partnerId: true, managerId: true, stageTemplateVersionId: true, assignments: { where: { toDate: null }, select: { userId: true } } },
    orderBy: { code: "asc" },
  });
  const stages = new Map<string, string[]>();
  for (const v of await db().stageTemplateVersion.findMany({ select: { id: true, stages: { orderBy: { index: "asc" }, select: { name: true } } } })) stages.set(v.id, v.stages.map((s) => s.name));

  const invoices: { date: string; clientId: string; engagementId: string; feePaise: number; name: string }[] = [];
  let n = 0, minutes = 0;
  for (const e of current) {
    if (rand() > 0.6 || !e.assignments.length) continue;
    n += 1;
    // Last year's budget: this year's plan less a little; effort 80–125% of it.
    const budget = Math.max(240, Math.round((e.budgetMinutes * (0.6 + rand() * 0.3)) / 15) * 15);
    const effort = Math.round((budget * (0.8 + rand() * 0.45)) / 15) * 15;
    const start = addDays(lastFrom, int(0, 60));
    const end = addDays(start, Math.min(int(120, 300), diffTo(start, lastTo)));
    const p = await db().engagement.create({
      data: {
        code: `EN-P${String(n).padStart(4, "0")}`, clientId: e.clientId, name: yearBack(e.name), serviceLine: e.serviceLine, engagementType: e.engagementType, recurrence: "RECURRING",
        feeBasis: e.feeBasis, feePaise: e.feePaise, budgetMinutes: budget, status: "COMPLETED", startDate: start, endDate: end, closedAt: new Date(`${end}T18:00:00+05:30`),
        partnerId: e.partnerId, managerId: e.managerId, stageTemplateVersionId: e.stageTemplateVersionId, chargeable: true,
      },
    });
    const names = (e.stageTemplateVersionId && stages.get(e.stageTemplateVersionId)) || ["Preparation", "Review"];
    const people = e.assignments.map((a) => a.userId);
    const parts = int(4, 12);
    const rows = [];
    let left = effort;
    for (let i = 0; i < parts && left > 0; i += 1) {
      const m = i === parts - 1 ? left : Math.min(left, Math.max(15, Math.round((effort / parts) * (0.5 + rand()) / 15) * 15));
      left -= m;
      // Earlier stages early, later stages late: the share by stage follows the work's order.
      const at = Math.min(names.length - 1, Math.floor((i / parts) * names.length));
      rows.push({ userId: pick(people), date: addDays(start, Math.round(((i + rand()) / parts) * Math.max(1, diffTo(start, end)))), minutes: m, chargeable: true, clientId: e.clientId, engagementId: p.id, stageIndex: at, stageName: names[at]! });
    }
    await db().workEntry.createMany({ data: rows });
    minutes += effort;
    const billOn = addDays(end, int(3, 20));
    if (e.feePaise > 0) invoices.push({ date: billOn > lastTo ? lastTo : billOn, clientId: e.clientId, engagementId: p.id, feePaise: e.feePaise, name: p.name });
  }

  // Invoices in last year's series, issued in date order; most paid within 15–60 days.
  invoices.sort((a, b) => a.date.localeCompare(b.date));
  let issued = 0;
  for (const inv of invoices) {
    try {
      const draft = await createDraft(paActor, { clientId: inv.clientId, engagementId: inv.engagementId, date: inv.date, lines: [{ kind: "FEE", description: `Professional fees: ${inv.name}`, quantityMilli: 1000, ratePaise: inv.feePaise, engagementId: inv.engagementId }] });
      const done = await issueInvoice(paActor, draft.id, { date: inv.date });
      issued += 1;
      if (rand() < 0.92) await recordReceipt(paActor, { clientId: inv.clientId, date: addDays(inv.date, int(15, 60)), amountPaise: done.totalPaise, mode: pick(["NEFT", "UPI", "RTGS"] as const), reference: `UTR${int(10_000_000, 99_999_999)}`, allocations: [{ invoiceId: done.id, amountPaise: done.totalPaise }] });
    } catch {
      /* a date the series cannot take is skipped */
    }
  }

  const mis = await buildMis(systemActor(), previousMonth(today), today);
  const weekly = await runWeeklySummaries(today);
  return { engagements: n, hours: Math.round(minutes / 60), invoices: issued, mis: mis.month, weekly: weekly.sent };
}

function diffTo(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
