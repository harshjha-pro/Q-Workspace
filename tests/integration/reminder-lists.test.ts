import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { todayIst } from "@/server/lib/dates";
import type { PortalActor } from "@/server/permissions/actor";
import {
  saveSchedule, runReminderDueLists, listDue, markReminderSent, skipReminder, dueCounts, portalReminders, docsReminderText, paymentReminderText, fillTemplate,
} from "@/server/services/reminders/due-lists";
import { createDraft, issueInvoice, recordReceipt, updateFirmProfile } from "@/server/services/billing/service";
import { gstinCheckChar } from "@/server/domain/gstin";
import { updateChecklistItem } from "@/server/services/pending/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
let portal: PortalActor;
let other: PortalActor;
let taskId: string;
let itemId: string;
let scheduleId: string;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  portal = w.portal;
  const pu = await db().portalUser.create({ data: { name: "C2 Owner", email: "rem@c2.example.com", clients: { create: { clientId: w.c2.id } } } });
  other = { kind: "PORTAL", portalUserId: pu.id, role: "PORTAL", clientIds: [w.c2.id], displayName: "C2 Owner" };
  // The seeded placeholder schedules would also fire; these tests use their own.
  await db().clientReminderSchedule.updateMany({ data: { active: false } });
  await db().contact.create({ data: { clientId: w.c1.id, name: "Ravi Sharma", isPrimary: true } });
  await db().client.update({ where: { id: w.c1.id }, data: { preferredChannel: "WHATSAPP" } });
  const t = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, complianceTypeCode: null, title: "GSTR-3B", periodLabel: "Oct 2026", effectiveDueDate: "2026-11-20", status: "PENDING_FROM_CLIENT" } });
  taskId = t.id;
  await db().taskAssignment.create({ data: { taskId, userId: w.s1.id, role: "ASSIGNEE", fromDate: "2026-04-01" } });
  itemId = (await db().checklistItem.create({ data: { clientId: w.c1.id, taskId, label: "Sales register", status: "REQUESTED", requestedAt: "2026-10-01", note: "INTERNAL: ask for the corrected one" } })).id;
  await db().checklistItem.create({ data: { clientId: w.c1.id, taskId, label: "Asked this morning", status: "REQUESTED", requestedAt: "2026-11-03" } });
});

describe("message text", () => {
  it("documents text lists items without staff notes; numbered reminders say so", () => {
    const t = docsReminderText({ contact: "Ravi", client: "C1", task: "GSTR-3B", period: "Oct 2026", items: ["Sales register"], dueDate: "2026-11-20", sequenceNo: 2, today: "2026-11-05" });
    expect(t).toContain("Dear Ravi,");
    expect(t).toContain("Reminder 2: for GSTR-3B (Oct 2026) of C1");
    expect(t).toContain("1. Sales register");
    expect(t).toContain("20-Nov-2026");
    expect(paymentReminderText({ contact: "Ravi", client: "C1", number: "QI/26-27/0001", date: "2026-09-01", dueDate: "2026-09-16", balancePaise: 11_800_00, sequenceNo: 1, payTo: { bankName: "HDFC", bankAccount: "123", bankIfsc: "HDFC0001", upiId: "q@hdfc" } }))
      .toMatch(/QI\/26-27\/0001[\s\S]*outstanding[\s\S]*A\/c 123[\s\S]*UPI: q@hdfc/);
    expect(fillTemplate("Hi {{contact}}, {{items}} {{unknown}}", { contact: "Ravi", items: "1. X" })).toBe("Hi Ravi, 1. X {{unknown}}");
  });
});

describe("schedules", () => {
  it("only Partner / Practice Admin edit; day and months are validated", async () => {
    await expect(saveSchedule(actorOf(w.m1), { name: "Docs", dayOfMonth: 3 })).rejects.toThrow(/access/);
    await expect(saveSchedule(actorOf(w.pa), { name: "Docs", dayOfMonth: 31 })).rejects.toThrow();
    await expect(saveSchedule(actorOf(w.pa), { name: "Docs", dayOfMonth: 3, monthsCsv: "13" })).rejects.toThrow();
    await expect(saveSchedule(actorOf(w.pa), { name: "Docs", dayOfMonth: 3, complianceTypeCode: "NOPE" })).rejects.toThrow(/Unknown compliance type/);
    scheduleId = (await saveSchedule(actorOf(w.pa), { name: "Monthly documents", dayOfMonth: 3, escalateAfter: 2 })).id;
    await saveSchedule(actorOf(w.pa), { name: "Quarter months only", dayOfMonth: 3, monthsCsv: "1,4,7,10" });
  });
});

describe("client-document reminders (P4-03)", () => {
  it("generates one item per open task with documents requested before the day, with copy-ready text; idempotent", async () => {
    const r = await runReminderDueLists("2026-11-05");
    expect(r.docs).toBe(1); // the quarter-months schedule does not run in November
    await runReminderDueLists("2026-11-05");
    const [item] = await listDue(actorOf(w.s1), { kind: "CLIENT_DOCS" });
    expect(item).toMatchObject({ clientId: w.c1.id, taskId, dueOn: "2026-11-03", sequenceNo: 1, channel: "WHATSAPP", escalate: false, scheduleName: "Monthly documents" });
    expect(item!.messageText).toContain("Dear Ravi Sharma,");
    expect(item!.messageText).toContain("Sales register");
    expect(item!.messageText).not.toContain("Asked this morning");
    expect(item!.messageText).not.toContain("INTERNAL");
    expect(await db().clientReminderDue.count({ where: { taskId } })).toBe(1);
  });

  it("a missed day is caught up within 3 days only", async () => {
    expect((await runReminderDueLists("2026-12-07")).docs).toBe(0); // Dec 3 + 4 days
  });

  it("visibility: task.work scope; HR has none; other team sees nothing", async () => {
    expect(await listDue(actorOf(w.s2), { kind: "CLIENT_DOCS" })).toEqual([]);
    expect(await listDue(actorOf(w.m2), { kind: "CLIENT_DOCS" })).toEqual([]);
    await expect(listDue(actorOf(w.hr), { kind: "CLIENT_DOCS" })).rejects.toThrow(/access/);
    expect((await dueCounts(actorOf(w.m1))).docs).toBe(1);
  });

  it("mark as sent records the final text in the reminder log and shows it in the client's portal", async () => {
    const [item] = await listDue(actorOf(w.s1), { kind: "CLIENT_DOCS" });
    await expect(markReminderSent(actorOf(w.s2), item!.id, { channel: "WHATSAPP", messageText: item!.messageText })).rejects.toThrow(/not found/);
    await markReminderSent(actorOf(w.s1), item!.id, { channel: "WHATSAPP", messageText: `${item!.messageText}\n(edited)` });
    await expect(markReminderSent(actorOf(w.s1), item!.id, { channel: "WHATSAPP", messageText: item!.messageText })).rejects.toThrow(/already/);
    const log = await db().reminderLog.findFirstOrThrow({ where: { taskId, kind: "CLIENT_DOCS" } });
    expect(log).toMatchObject({ channel: "WHATSAPP", sentById: w.s1.id, ruleCode: `SCHEDULE:${scheduleId}` });
    expect(log.messageText).toContain("(edited)");
    const seen = await portalReminders(portal);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "CLIENT_DOCS", open: true });
    expect(await portalReminders(other)).toEqual([]);
  });

  it("counts earlier reminders; past the limit it is flagged and the Manager and Partner told once", async () => {
    // Two follow-ups logged by hand on the task page also count.
    await db().reminderLog.createMany({ data: [1, 2].map(() => ({ clientId: w.c1.id, taskId, kind: "CLIENT_DOCS", channel: "CALL", sentById: w.s1.id })) });
    await runReminderDueLists("2026-12-03");
    const [item] = await listDue(actorOf(w.s1), { kind: "CLIENT_DOCS" });
    expect(item).toMatchObject({ sequenceNo: 4, escalate: true });
    expect(item!.messageText).toContain("Reminder 4:");
    expect(await db().notification.count({ where: { kind: "CLIENT_DOCS_ESCALATION", userId: { in: [w.m1.id, w.partner.id] } } })).toBe(2);
  });

  it("a newer item replaces an unsent older one; skipping needs a reason", async () => {
    await runReminderDueLists("2027-01-03"); // both schedules fall on Jan 3: still one item for the task
    expect(await db().clientReminderDue.count({ where: { taskId, status: "DUE" } })).toBe(1);
    expect(await db().clientReminderDue.count({ where: { taskId, status: "SKIPPED" } })).toBe(1);
    const [item] = await listDue(actorOf(w.s1), { kind: "CLIENT_DOCS" });
    await expect(skipReminder(actorOf(w.s1), item!.id, "")).rejects.toThrow(/reason/);
  });

  it("drops off by itself once the documents are received", async () => {
    await db().checklistItem.updateMany({ where: { taskId, status: "REQUESTED" }, data: { status: "RECEIVED" } });
    expect(await listDue(actorOf(w.s1), { kind: "CLIENT_DOCS" })).toEqual([]);
    expect((await portalReminders(portal))[0]!.open).toBe(false);
    await updateChecklistItem(actorOf(w.s1), itemId, { status: "REQUESTED" }); // restore for later suites
  });
});

describe("overdue-invoice reminders (P4-08)", () => {
  let invoiceId: string;
  it("reaches the reminder points by invoice age; the last point is flagged to the Partner", async () => {
    const g = "08AAFFQ1234K1Z";
    await updateFirmProfile(actorOf(w.pa), { name: "QEPEX India", address: "C-Scheme, Jaipur", stateCode: "RJ", pan: "AAFFQ1234K", gstin: g + gstinCheckChar(g), bankName: "HDFC Bank", bankAccount: "50200012345678", bankIfsc: "HDFC0000123", upiId: "qepex@hdfcbank" });
    await db().client.update({ where: { id: w.c1.id }, data: { stateCode: "RJ" } });
    const fee = { kind: "FEE" as const, description: "Professional fees", quantityMilli: 1000, ratePaise: 10_000_00 };
    const inv = await createDraft(actorOf(w.pa), { clientId: w.c1.id, date: "2026-09-01", lines: [fee] });
    await issueInvoice(actorOf(w.pa), inv.id, { date: "2026-09-01" });
    invoiceId = inv.id;
    expect((await runReminderDueLists("2026-09-10")).payments).toBe(0); // not yet due
    expect((await runReminderDueLists("2026-09-20")).payments).toBe(1); // 19 days → first point (15)
    expect((await runReminderDueLists("2026-09-20")).payments).toBe(0); // idempotent
    await runReminderDueLists("2026-11-05"); // 65 days → third and last point, replaces the unsent first
    const rows = await listDue(actorOf(w.pa), { kind: "PAYMENT" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ invoiceId, sequenceNo: 3, escalate: true, balancePaise: 11_800_00 });
    expect(rows[0]!.messageText).toMatch(/Reminder 3: our invoice .* has ₹11,800 outstanding/);
    expect(await db().notification.count({ where: { kind: "PAYMENT_ESCALATION", userId: w.partner.id } })).toBe(1);
  });

  it("payments: billing.view to see; Managers read-only; Staff none", async () => {
    const [row] = await listDue(actorOf(w.m1), { kind: "PAYMENT" });
    await expect(markReminderSent(actorOf(w.m1), row!.id, { channel: "EMAIL", messageText: row!.messageText })).rejects.toThrow(/access/);
    await expect(listDue(actorOf(w.s1), { kind: "PAYMENT" })).rejects.toThrow(/access/);
    expect(await listDue(actorOf(w.m2), { kind: "PAYMENT" })).toEqual([]);
    expect((await dueCounts(actorOf(w.s1))).payments).toBe(0);
  });

  it("portal-only channel; a paid invoice's reminder drops off", async () => {
    const [row] = await listDue(actorOf(w.pa), { kind: "PAYMENT" });
    await markReminderSent(actorOf(w.pa), row!.id, { channel: "PORTAL", messageText: row!.messageText });
    expect((await db().reminderLog.findFirstOrThrow({ where: { invoiceId } })).channel).toBe("PORTAL");
    expect((await portalReminders(portal)).find((r) => r.kind === "PAYMENT")).toMatchObject({ open: true });
    await recordReceipt(actorOf(w.pa), { clientId: w.c1.id, date: todayIst(), amountPaise: 11_800_00, mode: "NEFT", reference: "UTR9", allocations: [{ invoiceId, amountPaise: 11_800_00 }] });
    expect((await portalReminders(portal)).find((r) => r.kind === "PAYMENT")).toMatchObject({ open: false });
  });
});
