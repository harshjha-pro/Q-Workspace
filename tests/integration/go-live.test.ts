import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { makeUser, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { todayIst, addDays, weekStart } from "@/server/lib/dates";
import { createClient, addGstin } from "@/server/services/clients/service";
import { updateSetting } from "@/server/services/settings/service";
import { verifyRule } from "@/server/services/compliance/admin";
import { workingDays } from "@/server/services/leave/service";
import { gstinCheckChar } from "@/server/domain/gstin";

const g = (s: string, pan: string) => `${s}${pan}1Z` + gstinCheckChar(`${s}${pan}1Z`);
let w: Record<string, Awaited<ReturnType<typeof makeUser>>>;
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = { partner: await makeUser("PARTNER"), pa: await makeUser("PRACTICE_ADMIN"), manager: await makeUser("MANAGER") };
});

describe("go-live with real data (Q-32)", () => {
  it("with a cut-off, tasks already due before go-live are not created; current-year returns still are", async () => {
    await updateSetting(actorOf(w.partner!), "compliance.trackingFrom", "2025-04-01");
    await updateSetting(actorOf(w.partner!), "compliance.createDueFrom", today);
    const c = await createClient(actorOf(w.pa!), { name: "Go Live Pvt Ltd", constitution: "PRIVATE_COMPANY", pan: "AABCG1234L", stateCode: "RJ", partnerId: w.partner!.id, flags: { tdsApplicable: true, tdsNonSalary: true } });
    await addGstin(actorOf(w.pa!), c.id, { gstin: g("08", "AABCG1234L"), frequency: "MONTHLY", frequencyEffectiveFrom: "2025-04-01" });
    const tasks = await db().task.findMany({ where: { clientId: c.id } });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.filter((t) => t.effectiveDueDate && t.effectiveDueDate < today)).toHaveLength(0);
    // Annual work for the year that has just closed (period ended before the cut-off) is still tracked.
    expect(tasks.some((t) => t.periodEnd && t.periodEnd < today && t.effectiveDueDate && t.effectiveDueDate >= today)).toBe(true);
  });
});

describe("statutory values verified by the Practice Admin (Q-29)", () => {
  it("Practice Admin and Partner may verify; a Manager may not", async () => {
    const [r1, r2] = await db().dueDateRule.findMany({ where: { verifiedAt: null }, take: 2 });
    await expect(verifyRule(actorOf(w.manager!), r1!.id)).rejects.toThrow();
    await verifyRule(actorOf(w.pa!), r1!.id);
    await verifyRule(actorOf(w.partner!), r2!.id);
    expect(await db().dueDateRule.count({ where: { id: { in: [r1!.id, r2!.id] }, verifiedAt: { not: null } } })).toBe(2);
  });
});

describe("office state holidays (Q-31)", () => {
  it("Rajasthan holidays close the office for leave and missing days; other states' do not", async () => {
    const day = addDays(weekStart(addDays(today, 14)), 1); // a Tuesday two weeks out
    const other = addDays(day, 1);
    await db().firmProfile.create({ data: { name: "QEPEX India", stateCode: "RJ" } });
    await db().holiday.create({ data: { date: day, name: "Rajasthan holiday (test)", kind: "STATE", stateCode: "RJ" } });
    await db().holiday.create({ data: { date: other, name: "Maharashtra holiday (test)", kind: "STATE", stateCode: "MH" } });
    const days = await workingDays(day, other);
    expect(days).toEqual([other]);
  });
});
