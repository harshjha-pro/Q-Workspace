import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf, makeEngagement } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, fyStartYear, todayIst } from "@/server/lib/dates";
import { gstinCheckChar } from "@/server/domain/gstin";
import {
  updateFirmProfile, createDraft, updateDraft, issueInvoice, cancelInvoice, setEInvoiceDetails, listInvoices, getInvoice, suggestFeeLines,
  recordReceipt, allocateReceipt, reverseReceipt, listReceipts, requestWriteOff, decideWriteOff,
  createDisbursement, listDisbursements, unrecoveredAgeing, receivablesAgeing, unbilledAlerts, realization, paymentReminders, markReminderSent,
  billingDashboard, runRetainerDrafts, billingStatusFor, invoicePdf, runBillingExport, computeTotals, bucketOf, formatInvoiceNumber, seriesPrefix,
} from "@/server/services/billing/service";

const gstin = (stateCode: string, pan: string) => {
  const first = `${stateCode}${pan}1Z`;
  return first + gstinCheckChar(first);
};

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();
const fee = (amountRupees: number, extra: Record<string, unknown> = {}) => ({ kind: "FEE" as const, description: "Professional fees", quantityMilli: 1000, ratePaise: amountRupees * 100, ...extra });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db().client.update({ where: { id: w.c1.id }, data: { stateCode: "RJ", address: "MI Road, Jaipur" } });
  await db().client.update({ where: { id: w.c2.id }, data: { stateCode: "MH", pan: "AABCM1234C" } });
  await db().gSTIN.create({ data: { clientId: w.c2.id, gstin: gstin("27", "AABCM1234C"), stateCode: "MH" } });
});

describe("pure helpers", () => {
  it("splits GST intra-state into CGST+SGST halves and inter-state into IGST; reimbursements carry no GST", () => {
    const lines = [{ kind: "FEE" as const, amountPaise: 10_000_00, gstRateBp: 1800 }, { kind: "REIMBURSEMENT" as const, amountPaise: 500_00, gstRateBp: 0 }];
    expect(computeTotals(lines, true)).toEqual({ taxablePaise: 10_000_00, cgstPaise: 900_00, sgstPaise: 900_00, igstPaise: 0, reimbursementPaise: 500_00, totalPaise: 12_300_00 });
    expect(computeTotals(lines, false)).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 1_800_00, totalPaise: 12_300_00 });
  });
  it("formats numbers per FY within 16 characters and buckets ages", () => {
    expect(seriesPrefix("QI", 2026)).toBe("QI/26-27/");
    expect(formatInvoiceNumber("QI/26-27/", 7)).toBe("QI/26-27/0007");
    expect(formatInvoiceNumber("QI/26-27/", 7).length).toBeLessThanOrEqual(16);
    expect([0, 30, 31, 60, 61, 90, 91, 400].map(bucketOf)).toEqual(["0-30", "0-30", "31-60", "31-60", "61-90", "61-90", "90+", "90+"]);
  });
});

describe("firm profile (/admin/firm)", () => {
  it("validates GSTIN against the state and PAN; only settings.manage may edit", async () => {
    const base = { name: "QEPEX India", address: "C-Scheme, Jaipur 302001", stateCode: "RJ", pan: "AAFFQ1234K", bankName: "HDFC Bank", bankAccount: "50200012345678", bankIfsc: "HDFC0000123", upiId: "qepex@hdfcbank" };
    await expect(updateFirmProfile(actorOf(w.partner), { ...base, gstin: gstin("27", "AAFFQ1234K") })).rejects.toThrow(/state/i);
    await expect(updateFirmProfile(actorOf(w.partner), { ...base, gstin: "08AAFFQ1234K1ZX" })).rejects.toThrow();
    await expect(updateFirmProfile(actorOf(w.m1), { ...base, gstin: gstin("08", "AAFFQ1234K") })).rejects.toThrow();
    await expect(updateFirmProfile(actorOf(w.hr), { ...base, gstin: gstin("08", "AAFFQ1234K") })).rejects.toThrow();
    const f = await updateFirmProfile(actorOf(w.pa), { ...base, gstin: gstin("08", "AAFFQ1234K") });
    expect(f.stateCode).toBe("RJ");
    expect(await db().auditLog.count({ where: { entityType: "FirmProfile" } })).toBe(1);
  });
});

describe("invoices: drafts, GST, numbering", () => {
  it("computes intra-state GST for a Rajasthan client and IGST for a Maharashtra GSTIN", async () => {
    const intra = await createDraft(actorOf(w.pa), { clientId: w.c1.id, engagementId: w.e1.id, date: addDays(today, -100), lines: [fee(10_000)] });
    expect(intra).toMatchObject({ placeOfSupply: "RJ", taxablePaise: 10_000_00, cgstPaise: 900_00, sgstPaise: 900_00, igstPaise: 0, totalPaise: 11_800_00, number: null, status: "DRAFT" });
    const inter = await createDraft(actorOf(w.partner), { clientId: w.c2.id, date: addDays(today, -100), lines: [fee(5_000)] });
    expect(inter).toMatchObject({ placeOfSupply: "MH", cgstPaise: 0, igstPaise: 900_00, totalPaise: 5_900_00 });
    const lines = await db().invoiceLine.findMany({ where: { invoiceId: intra.id } });
    expect(lines[0]!.sac).toBe("998231"); // GST service line default (Unverified setting)
    expect(lines[0]!.gstRateBp).toBe(1800);
  });

  it("allocates gapless numbers per FY only on issue; drafts and discarded drafts use none", async () => {
    const drafts = await db().invoice.findMany({ where: { status: "DRAFT" }, orderBy: { createdAt: "asc" } });
    const discard = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, -100), lines: [fee(100)] });
    await cancelInvoice(actorOf(w.pa), discard.id, "Duplicate");
    const a = await issueInvoice(actorOf(w.pa), drafts[0]!.id);
    const b = await issueInvoice(actorOf(w.pa), drafts[1]!.id);
    const prefix = seriesPrefix("QI", fyStartYear(addDays(today, -100)));
    expect(a.number).toBe(`${prefix}0001`);
    expect(b.number).toBe(`${prefix}0002`);
    expect(a.number!.length).toBeLessThanOrEqual(16);
    expect(a.dueDate).toBe(addDays(addDays(today, -100), 15));
    // Previous FY → its own series starting at 0001.
    const prevFy = `${fyStartYear(today) - 1}-12-15`;
    const old = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: prevFy, lines: [fee(1000)] });
    const issuedOld = await issueInvoice(actorOf(w.pa), old.id);
    expect(issuedOld.number).toBe(`${seriesPrefix("QI", fyStartYear(prevFy))}0001`);
    // Date order within a series, immutability after issue, future dates refused.
    const late = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, -200), lines: [fee(100)] });
    if (fyStartYear(addDays(today, -200)) === fyStartYear(addDays(today, -100))) await expect(issueInvoice(actorOf(w.pa), late.id)).rejects.toThrow(/date order/);
    await cancelInvoice(actorOf(w.pa), late.id, "test");
    await expect(updateDraft(actorOf(w.pa), a.id, { notes: "x" })).rejects.toThrow(/draft/);
    const fut = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, 3), lines: [fee(100)] });
    await expect(issueInvoice(actorOf(w.pa), fut.id)).rejects.toThrow(/future/);
    await cancelInvoice(actorOf(w.pa), fut.id, "test");
  });

  it("cancels an issued invoice only with a reason and only by a Partner; the number stays used", async () => {
    const d = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, -100), lines: [fee(200)] });
    const inv = await issueInvoice(actorOf(w.pa), d.id);
    await expect(cancelInvoice(actorOf(w.pa), inv.id, "Wrong client")).rejects.toThrow();
    await expect(cancelInvoice(actorOf(w.partner), inv.id, "")).rejects.toThrow(/reason/);
    const c = await cancelInvoice(actorOf(w.partner), inv.id, "Wrong client");
    expect(c.status).toBe("CANCELLED");
    expect(c.number).toBe(inv.number);
  });

  it("records IRN / ack details manually on issued invoices", async () => {
    const [inv] = await listInvoices(actorOf(w.partner), { status: "RAISED", clientId: w.c1.id });
    await expect(setEInvoiceDetails(actorOf(w.pa), inv!.id, { irn: "abc", ackNo: "1", ackDate: "" })).rejects.toThrow();
    await setEInvoiceDetails(actorOf(w.pa), inv!.id, { irn: "a".repeat(64), ackNo: "112410000012345", ackDate: inv!.date });
    const full = await getInvoice(actorOf(w.partner), inv!.id);
    expect(full.irn).toBe("a".repeat(64));
    expect(full.meta.ackNo).toBe("112410000012345");
  });

  it("suggests time-based lines from chargeable hours × rate", async () => {
    const e = await db().engagement.create({ data: { code: "EN-TB1", clientId: w.c1.id, name: "Notice reply", serviceLine: "DIRECT_TAX", engagementType: "NOTICE", feeBasis: "TIME", ratePaisePerHour: 2500_00 } });
    await db().workEntry.createMany({ data: [
      { userId: w.s1.id, date: addDays(today, -40), engagementId: e.id, clientId: w.c1.id, minutes: 90, chargeable: true },
      { userId: w.a1.id, date: addDays(today, -39), engagementId: e.id, clientId: w.c1.id, minutes: 60, chargeable: true },
      { userId: w.a1.id, date: addDays(today, -39), engagementId: e.id, clientId: w.c1.id, minutes: 60, chargeable: false },
    ] });
    const [line] = await suggestFeeLines(actorOf(w.pa), e.id);
    expect(line).toMatchObject({ quantityMilli: 2500, ratePaise: 2500_00, sac: "998231" });
    await expect(suggestFeeLines(actorOf(w.m1), e.id)).rejects.toThrow();
  });
});

describe("receipts, TDS, part-payments, write-offs, disbursements", () => {
  let invId = "";
  let disbId = "";
  it("adds a pure-agent disbursement as a no-GST reimbursement line", async () => {
    const d = await createDisbursement(actorOf(w.pa), { clientId: w.c1.id, date: addDays(today, -50), amountPaise: 600_00, kind: "ROC_FEE", description: "MCA filing fee AOC-4" });
    disbId = d.id;
    await expect(createDisbursement(actorOf(w.m1), { clientId: w.c1.id, date: today, amountPaise: 100, kind: "OTHER", description: "x y z" })).rejects.toThrow();
    const draft = await createDraft(actorOf(w.pa), { clientId: w.c1.id, engagementId: w.e1.id, date: addDays(today, -45), lines: [fee(10_000), { kind: "REIMBURSEMENT", description: "ROC fee paid on your behalf", ratePaise: 600_00, disbursementId: d.id }] });
    expect(draft).toMatchObject({ taxablePaise: 10_000_00, reimbursementPaise: 600_00, totalPaise: 12_400_00 });
    expect((await db().disbursement.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("ADDED_TO_INVOICE");
    // The same disbursement cannot go on a second invoice.
    await expect(createDraft(actorOf(w.pa), { clientId: w.c1.id, date: today, lines: [{ kind: "REIMBURSEMENT", description: "again", ratePaise: 600_00, disbursementId: d.id }] })).rejects.toThrow(/another invoice/);
    invId = (await issueInvoice(actorOf(w.pa), draft.id)).id;
  });

  it("part-payment with TDS → Partly received; balance → Fully received and disbursement Recovered", async () => {
    await expect(recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: today, amountPaise: 5_000_00, mode: "NEFT", allocations: [{ invoiceId: invId, amountPaise: 5_000_00 }] })).rejects.toThrow(/reference/);
    // Client pays 5,000 and deducts 1,000 TDS → 6,000 settled.
    await recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: today, amountPaise: 5_000_00, tdsPaise: 1_000_00, mode: "NEFT", reference: "UTR123", allocations: [{ invoiceId: invId, amountPaise: 6_000_00 }] });
    let inv = await db().invoice.findUniqueOrThrow({ where: { id: invId } });
    expect(inv).toMatchObject({ status: "PARTLY_RECEIVED", receivedPaise: 6_000_00 });
    expect((await db().disbursement.findUniqueOrThrow({ where: { id: disbId } })).status).toBe("ADDED_TO_INVOICE");
    await expect(recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: today, amountPaise: 9_000_00, mode: "UPI", reference: "U1", allocations: [{ invoiceId: invId, amountPaise: 9_000_00 }] })).rejects.toThrow(/balance/);
    // Over-payment: 7,000 received, 6,400 allocated → 600 advance.
    const r = await recordReceipt(actorOf(w.partner), { clientId: w.c1.id, date: today, amountPaise: 7_000_00, mode: "UPI", reference: "UPI-99", allocations: [{ invoiceId: invId, amountPaise: 6_400_00 }] });
    inv = await db().invoice.findUniqueOrThrow({ where: { id: invId } });
    expect(inv.status).toBe("FULLY_RECEIVED");
    expect((await db().disbursement.findUniqueOrThrow({ where: { id: disbId } })).status).toBe("RECOVERED");
    const rows = await listReceipts(actorOf(w.partner), { clientId: w.c1.id });
    expect(rows.find((x) => x.id === r.id)!.unallocatedPaise).toBe(600_00);
    expect(rows.find((x) => x.tdsPaise === 1_000_00)).toBeTruthy();
    // Reversal (bounced) re-opens the invoice and the disbursement.
    await reverseReceipt(actorOf(w.pa), r.id, "Payment recalled");
    expect((await db().invoice.findUniqueOrThrow({ where: { id: invId } })).status).toBe("PARTLY_RECEIVED");
    expect((await db().disbursement.findUniqueOrThrow({ where: { id: disbId } })).status).toBe("ADDED_TO_INVOICE");
  });

  it("allocates an advance later", async () => {
    const adv = await recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: today, amountPaise: 10_000_00, mode: "CASH" });
    await expect(allocateReceipt(actorOf(w.pa), adv.id, [{ invoiceId: invId, amountPaise: 10_000_00 }])).rejects.toThrow(/balance/);
    await allocateReceipt(actorOf(w.pa), adv.id, [{ invoiceId: invId, amountPaise: 6_400_00 }]);
    expect((await db().invoice.findUniqueOrThrow({ where: { id: invId } })).status).toBe("FULLY_RECEIVED");
  });

  it("write-off: Practice Admin requests, Partner approves → Written off", async () => {
    const d = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: today, lines: [fee(1_000)] });
    const inv = await issueInvoice(actorOf(w.pa), d.id);
    await recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: today, amountPaise: 1_000_00, mode: "UPI", reference: "U2", allocations: [{ invoiceId: inv.id, amountPaise: 1_000_00 }] });
    const wo = await requestWriteOff(actorOf(w.pa), inv.id, { reason: "Client disputes GST portion" });
    expect(wo).toMatchObject({ status: "PENDING", amountPaise: 180_00 });
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "BILLING" } })).toBeGreaterThan(0);
    await expect(decideWriteOff(actorOf(w.pa), wo.id, true)).rejects.toThrow();
    await decideWriteOff(actorOf(w.partner), wo.id, true);
    expect((await db().invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("WRITTEN_OFF");
  });

  it("disbursement register: ageing of unrecovered and expense-claim rows", async () => {
    await db().disbursement.create({ data: { clientId: w.c2.id, date: addDays(today, -70), amountPaise: 250_00, kind: "CHALLAN", description: "Late fee challan", expenseClaimId: "claim-1" } });
    const age = await unrecoveredAgeing(actorOf(w.partner));
    expect(age.buckets.find((b) => b.key === "61-90")!.amountPaise).toBe(250_00);
    const m1rows = await listDisbursements(actorOf(w.m1));
    expect(m1rows.every((r) => r.clientId === w.c1.id)).toBe(true);
    const all = await listDisbursements(actorOf(w.partner));
    expect(all.find((r) => r.expenseClaimId === "claim-1")!.fromExpenseClaim).toBe(true);
  });
});

describe("reports", () => {
  it("ages receivables by client and by Partner", async () => {
    const a = await receivablesAgeing(actorOf(w.partner));
    // 90+: c1's first invoice (100 days, 11,800), the previous-FY one (1,180) and c2's (5,900).
    expect(a.buckets.find((b) => b.key === "90+")!.amountPaise).toBe(11_800_00 + 1_180_00 + 5_900_00);
    expect(a.buckets.find((b) => b.key === "31-60")!.amountPaise).toBe(0);
    expect(a.byPartner[0]!.id).toBe(w.partner.id);
    expect(a.byClient.map((r) => r.id).sort()).toEqual([w.c1.id, w.c2.id].sort());
    const mine = await receivablesAgeing(actorOf(w.m1));
    expect(mine.byClient.map((r) => r.id)).toEqual([w.c1.id]);
  });

  it("flags unbilled chargeable work after the alert days", async () => {
    const alerts = await unbilledAlerts(actorOf(w.partner));
    expect(alerts.find((x) => x.code === "EN-TB1")).toMatchObject({ unbilledMinutes: 150, estimatePaise: 6_250_00 });
  });

  it("realization is for Partners / Practice Admin only", async () => {
    const r = await realization(actorOf(w.partner));
    expect(r.perEngagement.find((x) => x.engagementId === w.e1.id)!.billedPaise).toBeGreaterThan(0);
    await expect(realization(actorOf(w.m1))).rejects.toThrow();
  });

  it("lists payment reminders at ageing points and hides them once marked sent", async () => {
    const list = await paymentReminders(actorOf(w.partner));
    const row = list.find((x) => x.clientId === w.c2.id)!;
    expect(row.point).toBe(60);
    expect(row.text).toContain(row.number);
    await expect(markReminderSent(actorOf(w.m2), row.invoiceId, { channel: "EMAIL", ruleCode: row.ruleCode })).rejects.toThrow();
    await markReminderSent(actorOf(w.pa), row.invoiceId, { channel: "WHATSAPP", ruleCode: row.ruleCode, messageText: row.text });
    expect((await paymentReminders(actorOf(w.partner))).find((x) => x.invoiceId === row.invoiceId)).toBeUndefined();
    expect(await db().reminderLog.count({ where: { invoiceId: row.invoiceId, kind: "PAYMENT" } })).toBe(1);
  });

  it("dashboard, engagement billing status, PDF and export", async () => {
    const dash = await billingDashboard(actorOf(w.partner));
    expect(dash.ageing.totalPaise).toBeGreaterThan(0);
    expect(dash.realization).not.toBeNull();
    expect((await billingDashboard(actorOf(w.m1))).realization).toBeNull();
    expect((await billingStatusFor(w.e1.id)).status).toBe("PARTLY_RECEIVED");
    expect((await billingStatusFor(w.e2.id)).status).toBe("NOT_YET_BILLED");
    const [inv] = await listInvoices(actorOf(w.partner), { clientId: w.c1.id, status: "RAISED" });
    const pdf = await invoicePdf(actorOf(w.partner), inv!.id);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    const csv = await runBillingExport(actorOf(w.pa), "invoices", "csv");
    expect(csv.body.toString()).toContain("Invoice No");
    expect(csv.body.toString()).toContain(inv!.number!);
    const lines = await runBillingExport(actorOf(w.pa), "lines", "xlsx");
    expect(lines.rows).toBeGreaterThan(0);
    const rec = await runBillingExport(actorOf(w.pa), "receipts", "csv");
    expect(rec.body.toString()).toContain("TDS Deducted by Client");
    expect(await db().sensitiveViewLog.count({ where: { kind: "BILLING" } })).toBeGreaterThan(5);
  });
});

describe("retainer drafts (P3-35)", () => {
  it("creates one draft per engagement per month, idempotently; only a Partner issues it", async () => {
    const e = await makeEngagement(w.c1.id);
    await db().engagement.update({ where: { id: e.id }, data: { recurrence: "RECURRING", feeBasis: "RETAINER", feePaise: 1_20_000_00, startDate: addDays(today, -200) } });
    const first = await runRetainerDrafts(today);
    expect(first.created).toBe(1);
    expect((await runRetainerDrafts(today)).created).toBe(0);
    const draft = await db().invoice.findFirstOrThrow({ where: { engagementId: e.id, isRetainerDraft: true } });
    expect(draft).toMatchObject({ status: "DRAFT", taxablePaise: 10_000_00 });
    await expect(issueInvoice(actorOf(w.pa), draft.id)).rejects.toThrow();
    const issued = await issueInvoice(actorOf(w.partner), draft.id);
    expect(issued.approvedById).toBe(w.partner.id);
    expect((await runRetainerDrafts(today)).created).toBe(0);
    expect(await db().notification.count({ where: { userId: w.partner.id, title: { contains: "retainer" } } })).toBe(1);
  });
});

describe("permissions", () => {
  it("Staff, Articles, HR Admin and portal users are refused everywhere", async () => {
    const [inv] = await listInvoices(actorOf(w.partner), { clientId: w.c1.id });
    for (const u of [w.s1, w.senior, w.a1, w.hr]) {
      const a = actorOf(u);
      await expect(listInvoices(a)).rejects.toThrow();
      await expect(getInvoice(a, inv!.id)).rejects.toThrow();
      await expect(createDraft(a, { clientId: w.c1.id, date: today, lines: [fee(1)] })).rejects.toThrow();
      await expect(recordReceipt(a, { clientId: w.c1.id, date: today, amountPaise: 1, mode: "CASH" })).rejects.toThrow();
      await expect(listReceipts(a)).rejects.toThrow();
      await expect(listDisbursements(a)).rejects.toThrow();
      await expect(billingDashboard(a)).rejects.toThrow();
      await expect(invoicePdf(a, inv!.id)).rejects.toThrow();
      await expect(runBillingExport(a, "invoices", "csv")).rejects.toThrow();
    }
    await expect(listInvoices(w.portal)).rejects.toThrow();
  });

  it("Managers read their team's clients only and cannot change anything", async () => {
    const m1 = actorOf(w.m1);
    const rows = await listInvoices(m1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.clientId === w.c1.id)).toBe(true);
    const c2inv = (await listInvoices(actorOf(w.partner), { clientId: w.c2.id }))[0]!;
    await expect(getInvoice(m1, c2inv.id)).rejects.toThrow();
    await expect(getInvoice(actorOf(w.m2), rows[0]!.id)).rejects.toThrow();
    await expect(createDraft(m1, { clientId: w.c1.id, date: today, lines: [fee(1)] })).rejects.toThrow();
    await expect(recordReceipt(m1, { clientId: w.c1.id, date: today, amountPaise: 1, mode: "CASH" })).rejects.toThrow();
    await expect(requestWriteOff(m1, rows[0]!.id, { reason: "nope" })).rejects.toThrow();
    const csv = await runBillingExport(m1, "invoices", "csv");
    expect(csv.body.toString()).not.toContain(c2inv.number!);
  });
});
