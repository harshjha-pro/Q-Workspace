import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { addDays, todayIst } from "@/server/lib/dates";
import { createNotice, getNotice, listNotices, updateNotice, addHearing } from "@/server/services/registers/notices";
import { createDsc, listDscs, recordMovement, updateDsc } from "@/server/services/registers/dsc";
import { recordUdin, listUdins, revokeUdin } from "@/server/services/registers/udin";
import { addCredential, listCredentials, revealCredential, grantAccess, revokeGrant, changePassword } from "@/server/services/registers/vault";
import { recordInwardOutward, listInwardOutward, markReturned } from "@/server/services/registers/inward";

let w: Awaited<ReturnType<typeof buildWorld>>;
const today = todayIst();

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});

describe("notices and hearings (spec 6.2, Q-13)", () => {
  it("defaults response due to received + 15 days and creates an assigned response task", async () => {
    const n = await createNotice(actorOf(w.m1), { clientId: w.c1.id, authority: "INCOME_TAX", section: "143(2)", ayOrPeriod: "AY 2025-26", receivedDate: today, assigneeId: w.s1.id, reviewerId: w.senior.id });
    expect(n.responseDueDate).toBe(addDays(today, 15));
    const t = await db().task.findUniqueOrThrow({ where: { id: (await db().notice.findUniqueOrThrow({ where: { id: n.id } })).taskId! }, include: { assignments: true } });
    expect(t.effectiveDueDate).toBe(addDays(today, 15));
    expect(t.assignments.map((a) => a.role).sort()).toEqual(["ASSIGNEE", "CHECKER", "MAKER"]);
    expect(await db().notification.count({ where: { userId: w.s1.id, kind: "NOTICE" } })).toBe(1);
  });

  it("is scoped: other team cannot see; opening it is logged", async () => {
    await expect(createNotice(actorOf(w.m2), { clientId: w.c1.id, authority: "GST", receivedDate: today })).rejects.toThrow();
    expect(await listNotices(actorOf(w.s2))).toHaveLength(0);
    const [n] = await listNotices(actorOf(w.s1));
    await getNotice(actorOf(w.s1), n!.id);
    await expect(getNotice(actorOf(w.s2), n!.id)).rejects.toThrow();
    expect(await db().sensitiveViewLog.count({ where: { entityId: n!.id, kind: "NOTICE" } })).toBe(1);
  });

  it("hearings move status; closing needs an outcome; due change follows to the task", async () => {
    const [n] = await listNotices(actorOf(w.m1));
    await addHearing(actorOf(w.s1), n!.id, { date: addDays(today, 20) });
    expect((await db().notice.findUniqueOrThrow({ where: { id: n!.id } })).status).toBe("HEARING");
    await updateNotice(actorOf(w.m1), n!.id, { responseDueDate: addDays(today, 25) });
    expect((await db().task.findUniqueOrThrow({ where: { id: n!.taskId! } })).effectiveDueDate).toBe(addDays(today, 25));
    await expect(updateNotice(actorOf(w.m1), n!.id, { status: "CLOSED" })).rejects.toThrow(/outcome/);
    await updateNotice(actorOf(w.m1), n!.id, { status: "CLOSED", outcome: "Accepted as filed" });
    expect(await listNotices(actorOf(w.m1))).toHaveLength(0);
  });
});

describe("DSC register (spec 6.3, P2-15, P2-31)", () => {
  it("refuses PINs, tracks expiry and movements", async () => {
    await expect(createDsc(actorOf(w.pa), { holderName: "Ravi Kumar", expiryDate: addDays(today, 20), clientIds: [w.c1.id], notes: "PIN: 123456" })).rejects.toThrow();
    await expect(createDsc(actorOf(w.s1), { holderName: "Ravi Kumar", expiryDate: addDays(today, 20), clientIds: [w.c1.id] })).rejects.toThrow();
    const d = await createDsc(actorOf(w.pa), { holderName: "Ravi Kumar", expiryDate: addDays(today, 20), clientIds: [w.c1.id] });
    await createDsc(actorOf(w.pa), { holderName: "Other", expiryDate: addDays(today, 400), clientIds: [w.c2.id] });
    const mine = await listDscs(actorOf(w.s1));
    expect(mine.map((x) => x.id)).toEqual([d.id]);
    expect(mine[0]!.state).toBe("SOON");
    expect(await listDscs(actorOf(w.partner), { expiring: true })).toHaveLength(1);
    await recordMovement(actorOf(w.s1), d.id, { toCustody: "STAFF", userId: w.s1.id, location: "Bag" });
    await expect(recordMovement(actorOf(w.s2), d.id, { toCustody: "OFFICE" })).rejects.toThrow();
    expect((await db().dSC.findUniqueOrThrow({ where: { id: d.id } })).custodianUserId).toBe(w.s1.id);
    await updateDsc(actorOf(w.pa), d.id, { expiryDate: addDays(today, 3) });
    expect((await listDscs(actorOf(w.s1)))[0]!.state).toBe("CRITICAL");
  });
});

describe("UDIN register (P2-30)", () => {
  it("records a UDIN once, unique, Partner/PA only", async () => {
    const r = await db().uDINRecord.create({ data: { clientId: w.c1.id, documentType: "Tax audit report", signingDate: addDays(today, -10), partnerId: w.partner.id } });
    expect((await listUdins(actorOf(w.partner)))[0]!.overdue).toBe(true);
    await expect(recordUdin(actorOf(w.m1), r.id, { udin: "26123456ABCDEFGHIJ", generatedOn: today })).rejects.toThrow();
    await expect(recordUdin(actorOf(w.partner), r.id, { udin: "short", generatedOn: today })).rejects.toThrow();
    await recordUdin(actorOf(w.partner), r.id, { udin: "26123456abcdefghij", generatedOn: today });
    const r2 = await db().uDINRecord.create({ data: { clientId: w.c1.id, documentType: "CARO", signingDate: today, partnerId: w.partner.id } });
    await expect(recordUdin(actorOf(w.partner), r2.id, { udin: "26123456ABCDEFGHIJ", generatedOn: today })).rejects.toThrow(/already recorded/);
    await revokeUdin(actorOf(w.pa), r2.id, "Document withdrawn");
    expect((await db().uDINRecord.findUniqueOrThrow({ where: { id: r.id } })).udin).toBe("26123456ABCDEFGHIJ");
  });
});

describe("credentials vault (spec 6.4, Q-06, P2-39)", () => {
  let credId = "";
  it("stores encrypted; staff see nothing without a grant", async () => {
    credId = (await addCredential(actorOf(w.m1), { clientId: w.c1.id, portal: "GST", username: "gstuser", password: "S3cret!pass" })).id;
    const raw = await db().credential.findUniqueOrThrow({ where: { id: credId } });
    expect(raw.passwordEnc).not.toContain("S3cret");
    expect(JSON.stringify(await db().auditLog.findMany({ where: { entityId: credId } }))).not.toContain("S3cret");
    expect(await listCredentials(actorOf(w.s1), w.c1.id)).toHaveLength(0);
    await expect(revealCredential(actorOf(w.s1), credId, "PASSWORD")).rejects.toThrow(/grant/);
    await expect(addCredential(actorOf(w.s1), { clientId: w.c1.id, portal: "GST", username: "x", password: "y" })).rejects.toThrow();
  });

  it("grants go only to assigned people; every reveal is logged; revoke closes it", async () => {
    await expect(grantAccess(actorOf(w.m1), w.c1.id, w.s2.id)).rejects.toThrow(/not assigned/);
    await expect(grantAccess(actorOf(w.m1), w.c1.id, w.m1.id)).rejects.toThrow(/yourself/);
    const g = await grantAccess(actorOf(w.m1), w.c1.id, w.s1.id);
    expect(await listCredentials(actorOf(w.s1), w.c1.id)).toHaveLength(1);
    expect(await revealCredential(actorOf(w.s1), credId, "PASSWORD")).toBe("S3cret!pass");
    expect(await db().credentialViewLog.count({ where: { credentialId: credId, userId: w.s1.id } })).toBe(1);
    expect(await db().sensitiveViewLog.count({ where: { entityId: credId, kind: "CREDENTIAL" } })).toBe(1);
    await revokeGrant(actorOf(w.m1), g.id);
    await expect(revealCredential(actorOf(w.s1), credId, "PASSWORD")).rejects.toThrow();
    expect(await revealCredential(actorOf(w.m1), credId, "USERNAME")).toBe("gstuser");
    await expect(revealCredential(actorOf(w.m2), credId, "PASSWORD")).rejects.toThrow();
    await changePassword(actorOf(w.partner), credId, "N3w!");
    expect(await revealCredential(actorOf(w.pa), credId, "PASSWORD")).toBe("N3w!");
  });
});

describe("inward / outward register (P2-33)", () => {
  it("records, scopes and closes", async () => {
    const r = await recordInwardOutward(actorOf(w.s1), { clientId: w.c1.id, direction: "IN", documentDesc: "Original bank statements", date: today, currentLocation: "Cabinet 2", custodianUserId: w.s1.id });
    await expect(recordInwardOutward(actorOf(w.s2), { clientId: w.c1.id, direction: "IN", documentDesc: "x docs", date: today })).rejects.toThrow();
    expect(await listInwardOutward(actorOf(w.s2))).toHaveLength(0);
    expect(await listInwardOutward(actorOf(w.pa), { open: true })).toHaveLength(1);
    await markReturned(actorOf(w.s1), r.id);
    await expect(markReturned(actorOf(w.s1), r.id)).rejects.toThrow(/Already/);
  });
});
