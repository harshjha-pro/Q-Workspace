import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, makeClient, makeEngagement } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays } from "@/server/lib/dates";
import { reconcileAnalytics } from "@/server/services/analytics/reconcile";

/**
 * 5.8: every dashboard number against a direct SQL query, on a generated dataset (fixed seed, so a failure
 * reproduces): ~14 months of tasks in every status, work entries across people with effective-dated cost rates,
 * invoices in every status with fee and reimbursement lines, receipts (some reversed), proposals and leads.
 */
let seed = 20261010;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
const TODAY = "2026-10-10";

beforeAll(async () => {
  await resetDb();
  const w = await buildWorld();
  const firm = await makeClient({ name: "The Firm (own compliance)" });
  await db().client.update({ where: { id: firm.id }, data: { isFirm: true } });
  const extra = [await makeClient({ teamId: w.t1.id, managerId: w.m1.id }), await makeClient({ teamId: w.t2.id, managerId: w.m2.id })];
  const clients = [w.c1, w.c2, ...extra];
  const engs = [w.e1, w.e2, ...(await Promise.all(extra.map((c) => makeEngagement(c.id))))];
  await db().engagement.update({ where: { id: engs[0]!.id }, data: { budgetMinutes: 3000 } });
  await db().engagement.update({ where: { id: engs[1]!.id }, data: { budgetMinutes: 600 } });
  await db().engagement.update({ where: { id: engs[2]!.id }, data: { budgetMinutes: 2400, status: "ON_HOLD" } });
  const people = [w.partner, w.m1, w.m2, w.s1, w.s2, w.senior, w.a1];
  const d1 = (await db().designation.create({ data: { name: "R Associate", level: 2 } })).id;
  const d2 = (await db().designation.create({ data: { name: "R Manager", level: 5 } })).id;
  await db().costRate.createMany({ data: [
    { designationId: d1, ratePaisePerHour: 40_000, effectiveFrom: "2025-04-01", effectiveTo: "2026-03-31" },
    { designationId: d1, ratePaisePerHour: 47_500, effectiveFrom: "2026-04-01" },
    { designationId: d2, ratePaisePerHour: 133_333, effectiveFrom: "2025-04-01" },
  ] });
  for (const u of [w.s1, w.s2, w.senior]) await db().user.update({ where: { id: u.id }, data: { designationId: d1 } });
  for (const u of [w.m1, w.m2]) await db().user.update({ where: { id: u.id }, data: { designationId: d2 } });

  const statuses = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW", "FILED", "FILED", "FILED", "FILED_LATE", "NOT_APPLICABLE"] as const;
  const types = ["GST-R1-M", "GST-3B-M", "TDS-PAY-M", null] as const;
  for (let i = 0; i < 260; i++) {
    const due = addDays("2025-08-01", int(0, 470));
    const status = pick(statuses);
    const filed = status === "FILED" || status === "FILED_LATE" ? addDays(due, status === "FILED_LATE" ? int(1, 20) : int(-6, 2)) : null;
    const c = i % 25 === 0 ? firm : pick(clients);
    await db().task.create({ data: {
      clientId: c.id, engagementId: c === firm ? null : engs[clients.indexOf(c)]!.id, title: `R${i}`, periodKey: `R${i}`, complianceTypeCode: pick(types),
      effectiveDueDate: due, status, filedDate: filed, pendingFromClient: status === "PENDING_FROM_CLIENT", pendingSince: status === "PENDING_FROM_CLIENT" ? addDays(due, -int(1, 30)) : null,
      supersededByTaskId: null,
    } });
  }
  const entries = [];
  for (let i = 0; i < 700; i++) {
    const k = int(0, clients.length);
    entries.push({ userId: pick(people).id, date: addDays("2025-07-01", int(0, 466)), minutes: int(1, 32) * 15, chargeable: rnd() < 0.7,
      clientId: k === clients.length ? (rnd() < 0.5 ? firm.id : null) : clients[k]!.id, engagementId: k === clients.length ? null : engs[k]!.id, deletedAt: rnd() < 0.03 ? new Date() : null });
  }
  await db().workEntry.createMany({ data: entries });
  const invStatuses = ["DRAFT", "RAISED", "PARTLY_RECEIVED", "FULLY_RECEIVED", "WRITTEN_OFF", "CANCELLED"] as const;
  for (let i = 0; i < 60; i++) {
    const c = i % 15 === 0 ? firm : pick(clients);
    const fee = int(5, 300) * 1000;
    const reimb = rnd() < 0.3 ? int(1, 20) * 500 : 0;
    const total = Math.round(fee * 1.18) + reimb;
    const status = pick(invStatuses);
    const received = status === "FULLY_RECEIVED" ? total : status === "PARTLY_RECEIVED" ? Math.round(total * rnd()) : 0;
    const date = addDays("2025-08-01", int(0, 435));
    const inv = await db().invoice.create({ data: {
      clientId: c.id, engagementId: c === firm ? null : engs[clients.indexOf(c)]!.id, date, status, taxablePaise: fee, totalPaise: total, reimbursementPaise: reimb, receivedPaise: received, writtenOffPaise: status === "WRITTEN_OFF" ? total - received : 0,
      lines: { create: [{ description: "Fees", ratePaise: fee, amountPaise: fee, engagementId: rnd() < 0.8 && c !== firm ? engs[clients.indexOf(c)]!.id : null }, ...(reimb ? [{ kind: "REIMBURSEMENT", description: "Govt fee", ratePaise: reimb, amountPaise: reimb }] : [])] },
    } });
    if (received) await db().receipt.create({ data: { clientId: c.id, date: addDays(date, int(0, 60)), amountPaise: received, mode: "NEFT", reversedAt: rnd() < 0.1 ? TODAY : null, allocations: { create: { invoiceId: inv.id, amountPaise: received } } } });
  }
  for (let i = 0; i < 12; i++) {
    await db().proposal.create({ data: { clientId: pick(clients).id, title: `P${i}`, serviceLine: pick(["GST", "AUDIT", "DIRECT_TAX"]), status: pick(["DRAFT", "SENT", "SENT", "ACCEPTED", "REJECTED"]), feeBasis: i % 3 ? "FIXED" : "TIME", feePaise: i % 3 ? int(10, 90) * 10_000 : 0, ratePaise: 150_000, budgetMinutes: int(4, 40) * 15 } });
    await db().lead.create({ data: { name: `Lead ${i}`, stage: pick(["NEW", "CONTACTED", "MEETING", "PROPOSAL_SENT", "ON_HOLD", "WON", "LOST"]), estFeePaise: int(1, 50) * 10_000 } });
  }
});

describe("analytics reconciliation (5.8)", () => {
  for (const period of ["this-month", "last-month", "last-90", "fytd", "last-fy", "custom:2025-11-15:2026-02-10"]) {
    it(`every dashboard number matches a direct query: ${period}`, async () => {
      const checks = await reconcileAnalytics({ period, today: TODAY });
      expect(checks.filter((c) => !c.ok)).toEqual([]);
      expect(checks.length).toBeGreaterThan(45);
    });
  }

  it("the data is rich enough for the checks to mean something", async () => {
    const checks = await reconcileAnalytics({ period: "fytd", today: TODAY });
    const nonZero = checks.filter((c) => typeof c.expected === "number" && c.expected > 0).map((c) => c.name);
    for (const n of ["Due in period", "Filed on time", "Filed late", "Overdue now", "Hours logged", "Invoiced", "Collected", "Receivable", "Fees billed", "Cost of hours", "Hours without a cost rate", "Over budget", "Proposal pipeline"]) expect(nonZero).toContain(n);
  });
});
