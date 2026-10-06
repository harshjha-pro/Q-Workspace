import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst } from "@/server/lib/dates";
import { runReminders } from "@/server/services/reminders/service";
import { createNotice } from "@/server/services/registers/notices";
import { createDsc } from "@/server/services/registers/dsc";
import { runJob } from "@/server/scheduler";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const mk = async (title: string, due: string, extra: Record<string, unknown> = {}) => {
    const t = await db().task.create({ data: { clientId: w.c1.id, engagementId: w.e1.id, title, periodKey: title, effectiveDueDate: due, originalDueDate: due, status: "IN_PROGRESS", ...extra } });
    await db().taskAssignment.create({ data: { taskId: t.id, userId: w.s1.id, role: "ASSIGNEE", fromDate: today } });
    return t;
  };
  await mk("Due in three", addDays(today, 3));
  await mk("Four days late", addDays(today, -4));
  await createNotice(actorOf(w.m1), { clientId: w.c1.id, authority: "GST", receivedDate: addDays(today, -8), responseDueDate: addDays(today, 7), assigneeId: w.s1.id, createTask: false });
  await createDsc(actorOf(w.pa), { holderName: "Director A", expiryDate: addDays(today, 7), clientIds: [w.c1.id] });
  await db().uDINRecord.create({ data: { clientId: w.c1.id, documentType: "Audit report", signingDate: addDays(today, -9), partnerId: w.partner.id } });
});

describe("reminders job (P2-34, P2-37, P2-40)", () => {
  it("raises due, overdue escalation, notice, DSC and UDIN alerts", async () => {
    const c = await runReminders(today);
    expect(c.DUE_SOON).toBe(1);
    expect(c.OVERDUE).toBe(1);
    const m1 = await db().notification.findMany({ where: { userId: w.m1.id } });
    expect(m1.some((n) => n.kind === "ESCALATE_MANAGER")).toBe(true);
    expect(m1.some((n) => n.kind === "DSC_EXPIRY")).toBe(true);
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "ESCALATE_PARTNER" } })).toBe(1);
    expect(await db().notification.count({ where: { userId: w.partner.id, kind: "UDIN_DUE" } })).toBe(1);
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "NOTICE_DUE" } })).toBe(1);
    expect(await db().notification.count({ where: { userId: w.pa.id, kind: "DSC_EXPIRY" } })).toBe(1);
  });

  it("is idempotent: a second run sends nothing new", async () => {
    const before = await db().notification.count();
    const c = await runReminders(today);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(0);
    expect(await db().notification.count()).toBe(before);
  });

  it("runs from the scheduler with a run record", async () => {
    await runJob("REMINDERS", "MANUAL");
    expect(await db().jobRun.count({ where: { jobCode: "REMINDERS", status: "SUCCESS" } })).toBe(1);
  });
});
