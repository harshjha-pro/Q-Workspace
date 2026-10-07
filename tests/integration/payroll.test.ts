import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { buildWorld, actorOf } from "../helpers/factory";
import { db } from "@/server/lib/db";
import { seedGoldenRates, fillMonth } from "../payroll-golden/helpers";
import { proposeStructure, decideStructure, listStructures, structureOverview, effectiveStructure } from "@/server/services/payroll/structures";
import { createRun, getRun, listRuns, reviewRun, approveRun, markRunPaid, lockRun, adjustPayslip, myPayslips, getPayslip, sendBackRun, deleteDraftRun } from "@/server/services/payroll/runs";
import { payslipPdf, runFile, tds24qFile } from "@/server/services/payroll/outputs";
import { saveDeclaration, listDeclarations, verifyDeclaration, generateForm16, issueForm16, myForm16, taxProjection, form16PartA } from "@/server/services/payroll/declarations";
import { listCostRates, setCostRate } from "@/server/services/payroll/cost-rates";
import { addRateRow, verifyRateRow, listRateTables } from "@/server/services/payroll/rates";
import { costRatesFor } from "@/server/services/costs";
import { documentForDownload } from "@/server/services/documents/service";

let w: Awaited<ReturnType<typeof buildWorld>>;
const MONTH = "2026-06";
let runId: string;

beforeAll(async () => {
  await resetDb();
  await seedGoldenRates();
  w = await buildWorld();
  let i = 0;
  for (const u of [w.s1, w.senior, w.s2, w.m1]) {
    i += 1;
    await db().employeeProfile.create({ data: { userId: u.id, employeeCode: `EMP-T${i}`, gender: "M", joiningDate: "2024-04-01", uan: `10000000${i}`, workStateCode: "MH", panEnc: null } });
  }
  for (const u of [w.s1, w.senior, w.s2]) {
    const s = await proposeStructure(actorOf(w.hr), { userId: u.id, effectiveFrom: "2026-04-01", basic: 30_000_00, hra: 12_000_00, special: 8_000_00 });
    await decideStructure(actorOf(w.partner), s.id, true);
    await fillMonth(u.id, MONTH);
  }
});

describe("salary structures (spec 11.5)", () => {
  it("HR proposes, a Partner approves; nobody approves their own proposal or salary", async () => {
    await expect(proposeStructure(actorOf(w.s1), { userId: w.s1.id, effectiveFrom: "2026-08-01", basic: 1 })).rejects.toThrow(/access/);
    const p = await proposeStructure(actorOf(w.partner), { userId: w.m1.id, effectiveFrom: "2026-04-01", basic: 80_000_00 });
    await expect(decideStructure(actorOf(w.partner), p.id, true)).rejects.toThrow(/another Partner/);
    await expect(decideStructure(actorOf(w.hr), p.id, true)).rejects.toThrow();
    const draft = await proposeStructure(actorOf(w.hr), { userId: w.s1.id, effectiveFrom: "2026-09-01", basic: 35_000_00 });
    expect((await effectiveStructure(w.s1.id, "2026-09-30"))!.components.basic).toBe(30_000_00); // drafts are not used
    await decideStructure(actorOf(w.partner), draft.id, false);
    expect(await db().salaryStructure.count({ where: { id: draft.id } })).toBe(0);
  });

  it("salary is visible only to HR, Partner and the employee; views of others are logged", async () => {
    expect(await listStructures(actorOf(w.s1), w.s1.id)).toHaveLength(1);
    await expect(listStructures(actorOf(w.s2), w.s1.id)).rejects.toThrow();
    await expect(listStructures(actorOf(w.m1), w.s1.id)).rejects.toThrow(); // Manager: team HR records, but not salary
    await expect(listStructures(actorOf(w.pa), w.s1.id)).rejects.toThrow();
    const before = await db().sensitiveViewLog.count({ where: { kind: "SALARY" } });
    const rows = await listStructures(actorOf(w.hr), w.s1.id);
    expect(rows[0]!.monthlyGross).toBe(50_000_00);
    expect(await db().sensitiveViewLog.count({ where: { kind: "SALARY" } })).toBe(before + 1);
    await expect(structureOverview(actorOf(w.m1), "2026-06-30")).rejects.toThrow();
    expect((await structureOverview(actorOf(w.partner), "2026-06-30")).length).toBeGreaterThan(3);
  });
});

describe("payroll run state machine and permissions", () => {
  it("only HR prepares; a Partner cannot create a run", async () => {
    await expect(createRun(actorOf(w.partner), { month: MONTH })).rejects.toThrow();
    await expect(createRun(actorOf(w.m1), { month: MONTH })).rejects.toThrow();
    await expect(createRun(actorOf(w.hr), { month: "2099-01" })).rejects.toThrow(/current month/);
    const run = await createRun(actorOf(w.hr), { month: MONTH });
    runId = run.id;
    await expect(createRun(actorOf(w.hr), { month: MONTH })).rejects.toThrow(/already exists/);
    const r = await getRun(actorOf(w.hr), runId);
    expect(r.payslips.map((p) => p.userId).sort()).toEqual([w.s1.id, w.senior.id, w.s2.id].sort());
    expect(r.totals!.count).toBe(3);
    // attendance was locked into rows
    expect(await db().attendance.count({ where: { userId: w.s1.id, date: { startsWith: MONTH } } })).toBe(30);
  });

  it("staff and managers cannot open runs; HR and Partner can (logged)", async () => {
    await expect(getRun(actorOf(w.s1), runId)).rejects.toThrow();
    await expect(getRun(actorOf(w.m1), runId)).rejects.toThrow();
    await expect(getRun(actorOf(w.pa), runId)).rejects.toThrow();
    await expect(listRuns(actorOf(w.s1))).rejects.toThrow();
    expect((await getRun(actorOf(w.partner), runId)).payslips).toHaveLength(3);
    expect(await db().sensitiveViewLog.count({ where: { entityId: runId, kind: "SALARY" } })).toBeGreaterThan(0);
  });

  it("adjustments only in Draft; HR cannot approve; Partner approves; paid publishes payslips", async () => {
    const r = await getRun(actorOf(w.hr), runId);
    const slip = r.payslips.find((p) => p.userId === w.s1.id)!;
    await adjustPayslip(actorOf(w.hr), slip.id, { earnings: [{ label: "Festival bonus", amount: 5_000_00 }], deductions: [{ label: "Salary advance", amount: 2_000_00 }], note: "Diwali" });
    const after = (await getRun(actorOf(w.hr), runId)).payslips.find((p) => p.userId === w.s1.id)!;
    expect(after.lines.result.gross).toBe(slip.lines.result.gross + 5_000_00);
    expect(after.lines.adjustments.note).toBe("Diwali");
    await expect(adjustPayslip(actorOf(w.partner), slip.id, {})).rejects.toThrow();

    await expect(approveRun(actorOf(w.partner), runId)).rejects.toThrow(/draft/i);
    await reviewRun(actorOf(w.hr), runId);
    await expect(adjustPayslip(actorOf(w.hr), slip.id, {})).rejects.toThrow(/Draft/);
    await expect(approveRun(actorOf(w.hr), runId)).rejects.toThrow();
    await expect(runFile(actorOf(w.hr), runId, "bank")).rejects.toThrow(/approves/);
    await sendBackRun(actorOf(w.partner), runId, "Check the bonus");
    expect((await db().payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("DRAFT");
    await reviewRun(actorOf(w.hr), runId);
    await approveRun(actorOf(w.partner), runId);
    await expect(lockRun(actorOf(w.hr), runId)).rejects.toThrow(/approved/);

    expect(await myPayslips(actorOf(w.s1))).toHaveLength(0); // not yet published
    await expect(getPayslip(actorOf(w.s1), slip.id)).rejects.toThrow();
    await markRunPaid(actorOf(w.hr), runId);
    const mine = await myPayslips(actorOf(w.s1));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.net).toBe(after.lines.result.net);
    await expect(getPayslip(actorOf(w.s2), slip.id)).rejects.toThrow(); // staff cannot see others' payslips
    await expect(getPayslip(actorOf(w.m1), slip.id)).rejects.toThrow();
    expect((await getPayslip(actorOf(w.s1), slip.id)).lines.employee.code).toBe("EMP-T1");
    await lockRun(actorOf(w.partner), runId);
    expect((await db().payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("LOCKED");
    await expect(deleteDraftRun(actorOf(w.hr), runId)).rejects.toThrow(/Draft/);
  });

  it("produces the payslip PDF and the run files", async () => {
    const slip = (await getRun(actorOf(w.hr), runId)).payslips[0]!;
    const pdf = await payslipPdf(actorOf(w.hr), slip.id);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    for (const f of ["bank", "pf-ecr", "esi", "pt", "register"] as const) {
      const out = await runFile(actorOf(w.partner), runId, f);
      expect(out.body.subarray(0, 2).toString()).toBe("PK");
    }
    await expect(runFile(actorOf(w.s1), runId, "bank")).rejects.toThrow();
    const q = await tds24qFile(actorOf(w.hr), 2026, 1);
    expect(q.fileName).toBe("24Q-FY2026-27-Q1.xlsx");
    await expect(tds24qFile(actorOf(w.m1), 2026, 1)).rejects.toThrow();
  });
});

describe("investment declarations, projection and Form 16", () => {
  it("employee declares; HR verifies (not their own); projection shows both regimes", async () => {
    await saveDeclaration(actorOf(w.senior), { fyStart: 2026, regime: "OLD", items: { "80C": 1_50_000_00 }, submit: true });
    const list = await listDeclarations(actorOf(w.hr), 2026);
    expect(list.map((d) => d.userId)).toEqual([w.senior.id]);
    await expect(listDeclarations(actorOf(w.s1), 2026)).rejects.toThrow();
    await verifyDeclaration(actorOf(w.hr), list[0]!.id, { "80C": 1_20_000_00 }, "LIC receipt short");
    await expect(saveDeclaration(actorOf(w.senior), { fyStart: 2026, regime: "NEW", items: {} })).rejects.toThrow(/verified/);
    const proj = await taxProjection(actorOf(w.senior));
    expect(proj!.current).toBe("OLD");
    expect(proj!.byRegime.NEW).toBeTruthy();
    expect(proj!.byRegime.OLD!.chapterVIA.find((l) => l.code === "80C")!.claimed).toBeGreaterThanOrEqual(1_20_000_00);
    await expect(taxProjection(actorOf(w.s2), w.senior.id)).rejects.toThrow();
  });

  it("HR generates and issues Form 16 from paid runs; the employee downloads it", async () => {
    await expect(generateForm16(actorOf(w.s1), w.s1.id, 2026, { employerTan: "JPRQ12345A", certificateNo: "X" })).rejects.toThrow();
    const f = await generateForm16(actorOf(w.hr), w.s1.id, 2026, { employerTan: "JPRQ12345A", certificateNo: "ABCD123", quarters: [{ quarter: "Q1", receiptNo: "QRS12345", amountPaise: 0 }] });
    expect(await myForm16(actorOf(w.s1))).toHaveLength(0);
    await issueForm16(actorOf(w.hr), f.id);
    const mine = await myForm16(actorOf(w.s1));
    expect(mine).toHaveLength(1);
    const file = await documentForDownload(actorOf(w.s1), mine[0]!.pdfDocumentId!);
    expect(file.data.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await form16PartA(actorOf(w.hr), f.id))!.certificateNo).toBe("ABCD123");
    await expect(documentForDownload(actorOf(w.s2), mine[0]!.pdfDocumentId!)).rejects.toThrow();
  });
});

describe("cost rates (Q-22) and statutory tables", () => {
  it("Partner/HR set effective-dated rates; the previous one closes; Staff cannot see them", async () => {
    const des = await db().designation.create({ data: { name: `Test designation ${Date.now()}` } });
    await db().user.update({ where: { id: w.s1.id }, data: { designationId: des.id } });
    await setCostRate(actorOf(w.hr), { designationId: des.id, ratePaisePerHour: 600_00, effectiveFrom: "2026-04-01" });
    await setCostRate(actorOf(w.partner), { designationId: des.id, ratePaisePerHour: 700_00, effectiveFrom: "2026-07-01" });
    const rows = await db().costRate.findMany({ where: { designationId: des.id }, orderBy: { effectiveFrom: "asc" } });
    expect(rows.map((r) => r.effectiveTo)).toEqual(["2026-06-30", null]);
    expect((await costRatesFor([w.s1.id], "2026-05-10")).get(w.s1.id)).toBe(600_00);
    expect((await costRatesFor([w.s1.id], "2026-08-10")).get(w.s1.id)).toBe(700_00);
    await expect(setCostRate(actorOf(w.m1), { designationId: des.id, ratePaisePerHour: 1, effectiveFrom: "2026-09-01" })).rejects.toThrow();
    await expect(listCostRates(actorOf(w.s1))).rejects.toThrow();
    await expect(listCostRates(actorOf(w.m1))).rejects.toThrow();
  });

  it("HR adds a statutory row (Unverified); only a Partner verifies", async () => {
    const row = await addRateRow(actorOf(w.hr), "PT", { stateCode: "KA", fromPaise: 0, toPaise: null, amountPaise: 200_00, effectiveFrom: "2026-04-01", source: "test notification" });
    await expect(verifyRateRow(actorOf(w.hr), "PT", row.id)).rejects.toThrow();
    await verifyRateRow(actorOf(w.partner), "PT", row.id);
    expect((await db().professionalTaxSlab.findUniqueOrThrow({ where: { id: row.id } })).verifiedById).toBe(w.partner.id);
    await expect(addRateRow(actorOf(w.s1), "PT", {})).rejects.toThrow();
    await expect(listRateTables(actorOf(w.m1))).rejects.toThrow();
  });
});
