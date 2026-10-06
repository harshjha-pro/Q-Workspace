import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import {
  createClient, setClientFlags, addGstin, updateGstin, addDirector, ceaseDirector, addPtRegistration, getClient, setClientStatus, updateClient,
} from "@/server/services/clients/service";
import { gstinCheckChar } from "@/server/domain/gstin";
import { onApplicabilityChanged } from "@/server/services/clients/events";

const gstinFor = (stateCode: string, pan: string, entity = "1") => {
  const base = `${stateCode}${pan}${entity}Z`;
  return base + gstinCheckChar(base);
};

let w: Awaited<ReturnType<typeof buildWorld>>;
const events: string[] = [];
beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  onApplicabilityChanged(async (_id, reason) => {
    events.push(reason);
  });
});

describe("client master", () => {
  it("creates a company with locked statutory audit, DPT-3 default on, code and flag history", async () => {
    const c = await createClient(actorOf(w.pa), { name: "Shree Ganesh Traders Pvt Ltd", constitution: "PRIVATE_COMPANY", pan: "aabcs1234k", flags: { tdsApplicable: true } });
    expect(c.code).toMatch(/^CL-\d{4}$/);
    expect(c.pan).toBe("AABCS1234K");
    expect(c.statutoryAuditApplicable).toBe(true);
    expect(c.dpt3Applicable).toBe(true);
    expect(await db().clientFlagHistory.count({ where: { clientId: c.id } })).toBe(3);
    expect(events).toContain("CLIENT_CREATED");
  });

  it("rejects duplicate PAN and bad identifiers", async () => {
    await expect(createClient(actorOf(w.pa), { name: "Dup Co", constitution: "LLP", pan: "AABCS1234K" })).rejects.toThrow(/PAN already used/);
    await expect(createClient(actorOf(w.pa), { name: "Bad", constitution: "INDIVIDUAL", pan: "12345" })).rejects.toThrow(/correct/);
  });

  it("DPT-3 never applies to LLPs or individuals (Q-03)", async () => {
    const llp = await createClient(actorOf(w.pa), { name: "Mehta & Co LLP", constitution: "LLP", flags: { dpt3Applicable: true } });
    expect(llp.dpt3Applicable).toBe(false);
    await expect(setClientFlags(actorOf(w.pa), llp.id, { flags: { dpt3Applicable: true }, effectiveDate: "2026-10-01", reason: "test" })).rejects.toThrow(/companies/);
  });

  it("statutory audit cannot be switched off for a company", async () => {
    const c = await createClient(actorOf(w.pa), { name: "Audit Locked Ltd", constitution: "PUBLIC_COMPANY" });
    await expect(setClientFlags(actorOf(w.pa), c.id, { flags: { statutoryAuditApplicable: false }, effectiveDate: "2026-10-01", reason: "test" })).rejects.toThrow(/mandatory/);
  });

  it("flag changes need an effective date and reason and are recorded", async () => {
    await setClientFlags(actorOf(w.m1), w.c1.id, { flags: { tdsApplicable: true, tdsNonSalary: true }, effectiveDate: "2026-10-01", reason: "Started paying contractors" });
    const h = await db().clientFlagHistory.findMany({ where: { clientId: w.c1.id, flag: { in: ["tdsApplicable", "tdsNonSalary"] } } });
    expect(h.map((x) => x.effectiveDate)).toEqual(["2026-10-01", "2026-10-01"]);
    expect(await db().auditLog.count({ where: { entityId: w.c1.id, action: "FLAGS" } })).toBe(1);
  });

  it("a Manager cannot edit another team's client; Staff and HR cannot edit at all", async () => {
    await expect(setClientFlags(actorOf(w.m2), w.c1.id, { flags: { pfApplicable: true }, effectiveDate: "2026-10-01", reason: "x x" })).rejects.toThrow(/access/);
    await expect(updateClient(actorOf(w.s1), w.c1.id, { name: "Hacked" })).rejects.toThrow(/access/);
    await expect(getClient(actorOf(w.hr), w.c1.id)).rejects.toThrow(/access/);
  });

  it("status change is recorded with an effective date", async () => {
    await setClientStatus(actorOf(w.pa), w.c2.id, { status: "DORMANT", effectiveDate: "2026-10-01", reason: "No business this year" });
    expect((await db().client.findUniqueOrThrow({ where: { id: w.c2.id } })).status).toBe("DORMANT");
  });
});

describe("GSTINs (P1-18)", () => {
  it("validates checksum, PAN match and derives the state", async () => {
    const c = await createClient(actorOf(w.pa), { name: "Multi State Pvt Ltd", constitution: "PRIVATE_COMPANY", pan: "AAMCM4321Q" });
    const mh = await addGstin(actorOf(w.pa), c.id, { gstin: gstinFor("27", "AAMCM4321Q"), frequency: "MONTHLY", annualReturnApplicable: true });
    const ka = await addGstin(actorOf(w.pa), c.id, { gstin: gstinFor("29", "AAMCM4321Q"), frequency: "QRMP", iffOpted: true });
    expect(mh.stateCode).toBe("MH");
    expect(ka.stateCode).toBe("KA");
    await expect(addGstin(actorOf(w.pa), c.id, { gstin: gstinFor("24", "AAAAA1111A"), frequency: "MONTHLY" })).rejects.toThrow(/PAN/);
    await expect(addGstin(actorOf(w.pa), c.id, { gstin: gstinFor("27", "AAMCM4321Q").slice(0, 14) + "0", frequency: "MONTHLY" })).rejects.toThrow(/not valid/);
    await expect(addGstin(actorOf(w.pa), c.id, { gstin: gstinFor("24", "AAMCM4321Q"), frequency: "MONTHLY", iffOpted: true })).rejects.toThrow(/IFF/);
  });

  it("frequency change requires an effective date and is logged per GSTIN", async () => {
    const c = await createClient(actorOf(w.pa), { name: "Freq Change Co", constitution: "PARTNERSHIP", pan: "AAFFF2222B" });
    const g = await addGstin(actorOf(w.pa), c.id, { gstin: gstinFor("27", "AAFFF2222B"), frequency: "MONTHLY" });
    await expect(updateGstin(actorOf(w.pa), g.id, { frequency: "QRMP", reason: "Opted QRMP" })).rejects.toThrow(/date/);
    await updateGstin(actorOf(w.pa), g.id, { frequency: "QRMP", frequencyEffectiveFrom: "2026-10-01", reason: "Opted QRMP" });
    const h = await db().clientFlagHistory.findFirstOrThrow({ where: { partyKey: g.id, flag: "gstin.frequency" } });
    expect([h.oldValue, h.newValue, h.effectiveDate]).toEqual(["MONTHLY", "QRMP", "2026-10-01"]);
  });
});

describe("directors (P1-19, Q-04)", () => {
  it("one director record per DIN, linked to several companies, with one primary company", async () => {
    const a = await createClient(actorOf(w.pa), { name: "Alpha Pvt Ltd", constitution: "PRIVATE_COMPANY" });
    const b = await createClient(actorOf(w.pa), { name: "Beta Pvt Ltd", constitution: "PRIVATE_COMPANY" });
    const r1 = await addDirector(actorOf(w.pa), a.id, { din: "01234567", name: "Anil Sharma", pan: "ABCPS1234D" });
    const r2 = await addDirector(actorOf(w.pa), b.id, { din: "01234567", name: "Anil Sharma" });
    expect(r1.director.id).toBe(r2.director.id);
    expect(r2.director.primaryClientId).toBe(a.id);
    expect(await db().director.count({ where: { din: "01234567" } })).toBe(1);
    expect((await db().director.findUniqueOrThrow({ where: { din: "01234567" } })).panEnc).toMatch(/^v1:/);
    await ceaseDirector(actorOf(w.pa), a.id, r1.director.id, "2026-09-30");
    expect((await db().director.findUniqueOrThrow({ where: { din: "01234567" } })).primaryClientId).toBe(b.id);
  });

  it("directors only for companies and LLPs", async () => {
    const ind = await createClient(actorOf(w.pa), { name: "Sunita Iyer", constitution: "INDIVIDUAL" });
    await expect(addDirector(actorOf(w.pa), ind.id, { din: "07654321", name: "X Y" })).rejects.toThrow(/companies and LLPs/);
  });
});

describe("Professional Tax registrations (Q-02)", () => {
  it("allowed only in the 19 PT states/UTs", async () => {
    const c = await createClient(actorOf(w.pa), { name: "PT Test Pvt Ltd", constitution: "PRIVATE_COMPANY" });
    await addPtRegistration(actorOf(w.pa), c.id, { stateCode: "MH", effectiveFrom: "2026-04-01" });
    await expect(addPtRegistration(actorOf(w.pa), c.id, { stateCode: "DL", effectiveFrom: "2026-04-01" })).rejects.toThrow(/does not levy/);
    expect(await db().state.count({ where: { ptLevied: true } })).toBe(19);
  });
});

describe("partial updates never reset untouched fields", () => {
  it("renaming a client keeps books-by, KYC and channel", async () => {
    const c = await createClient(actorOf(w.pa), { name: "Keep Fields Co", constitution: "PARTNERSHIP", booksBy: "FIRM", kycStatus: "COMPLETE", preferredChannel: "WHATSAPP", fyEnd: "12-31" });
    const after = await updateClient(actorOf(w.pa), c.id, { name: "Keep Fields & Co" });
    expect([after.booksBy, after.kycStatus, after.preferredChannel, after.fyEnd]).toEqual(["FIRM", "COMPLETE", "WHATSAPP", "12-31"]);
  });
});
