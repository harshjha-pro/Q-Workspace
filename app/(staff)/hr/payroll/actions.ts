"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import { parseInrToPaise } from "@/server/lib/money";
import * as runs from "@/server/services/payroll/runs";
import * as structures from "@/server/services/payroll/structures";
import * as rates from "@/server/services/payroll/rates";
import * as decl from "@/server/services/payroll/declarations";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Rupee text ("12,500.50") → paise; blank → 0. */
const rupees = (f: FormData, k: string) => (s(f, k) ? parseInrToPaise(s(f, k)) ?? NaN : 0);

async function run<T>(fn: () => Promise<T>, message: string, paths: string[] = ["/hr/payroll"]): Promise<ActionResult> {
  try {
    await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

// ---- runs
export async function createRunAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id = "";
  const r = await run(async () => { id = (await runs.createRun(actor, { month: s(f, "month"), kind: s(f, "kind") as "SALARY" | "STIPEND", notes: s(f, "notes") })).id; }, "Run created.");
  if (r.ok && id) redirect(`/hr/payroll/${id}`);
  return r;
}
export async function recalcRunAction(id: string) { const a = await requireStaff(); return run(() => runs.recalculateRun(a, id), "Recalculated.", [`/hr/payroll/${id}`]); }
export async function reviewRunAction(id: string) { const a = await requireStaff(); return run(() => runs.reviewRun(a, id), "Marked reviewed; Partners notified.", [`/hr/payroll/${id}`, "/hr/payroll"]); }
export async function approveRunAction(id: string) { const a = await requireStaff(); return run(() => runs.approveRun(a, id), "Approved.", [`/hr/payroll/${id}`, "/hr/payroll"]); }
export async function paidRunAction(id: string) { const a = await requireStaff(); return run(() => runs.markRunPaid(a, id), "Marked paid; payslips published.", [`/hr/payroll/${id}`, "/hr/payroll"]); }
export async function lockRunAction(id: string) { const a = await requireStaff(); return run(() => runs.lockRun(a, id), "Locked.", [`/hr/payroll/${id}`, "/hr/payroll"]); }
export async function sendBackRunAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const a = await requireStaff();
  return run(() => runs.sendBackRun(a, id, s(f, "reason")), "Sent back to Draft.", [`/hr/payroll/${id}`, "/hr/payroll"]);
}
export async function deleteRunAction(id: string): Promise<ActionResult> {
  const a = await requireStaff();
  const r = await run(() => runs.deleteDraftRun(a, id), "Deleted.");
  if (r.ok) redirect("/hr/payroll");
  return r;
}

export async function adjustPayslipAction(payslipId: string, runId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const a = await requireStaff();
  const lines = (prefix: string) => [1, 2, 3].map((i) => ({ label: s(f, `${prefix}Label${i}`), amount: rupees(f, `${prefix}Amount${i}`) })).filter((l) => l.label || l.amount);
  const lop = s(f, "lopDays");
  return run(() => runs.adjustPayslip(a, payslipId, {
    lopOverrideHalfDays: lop === "" ? null : Math.round(Number(lop) * 2),
    earnings: lines("e"), deductions: lines("d"), note: s(f, "note"),
  }), "Payslip recalculated.", [`/hr/payroll/${runId}`]);
}

// ---- structures
export async function proposeStructureAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const a = await requireStaff();
  return run(() => structures.proposeStructure(a, {
    userId: s(f, "userId"), effectiveFrom: s(f, "effectiveFrom"), kind: (s(f, "kind") || "SALARY") as "SALARY" | "STIPEND", regime: (s(f, "regime") || "NEW") as "NEW" | "OLD",
    basic: rupees(f, "basic"), hra: rupees(f, "hra"), special: rupees(f, "special"), other: rupees(f, "other"), variable: rupees(f, "variable"),
  }), "Revision saved as Draft; Partners notified.", ["/hr/payroll/structures"]);
}
export async function decideStructureAction(id: string, approve: boolean) { const a = await requireStaff(); return run(() => structures.decideStructure(a, id, approve), approve ? "Approved." : "Rejected.", ["/hr/payroll/structures"]); }

// ---- statutory tables
const num = (f: FormData, k: string) => (s(f, k) === "" ? null : Number(s(f, k)));
const pct = (f: FormData, k: string) => Math.round(Number(s(f, k) || "0") * 100); // "12" % → 1200 bp
export async function addRateAction(table: rates.RateTable, _: ActionResult, f: FormData): Promise<ActionResult> {
  const a = await requireStaff();
  const input: Record<string, unknown> = { source: s(f, "source"), effectiveFrom: s(f, "effectiveFrom") };
  if (table === "PF") Object.assign(input, { employeeBp: pct(f, "employee"), employerEpfBp: pct(f, "employerEpf"), employerEpsBp: pct(f, "employerEps"), pfWageCeilingPaise: rupees(f, "pfCeiling"), epsWageCeilingPaise: rupees(f, "epsCeiling"), adminBp: pct(f, "admin"), edliBp: pct(f, "edli") });
  if (table === "ESI") Object.assign(input, { employeeBp: pct(f, "employee"), employerBp: pct(f, "employer"), wageCeilingPaise: rupees(f, "ceiling") });
  if (table === "PT") Object.assign(input, { stateCode: s(f, "stateCode"), gender: s(f, "gender") || "ANY", fromPaise: rupees(f, "from"), toPaise: s(f, "to") ? rupees(f, "to") : null, amountPaise: rupees(f, "amount"), overrideMonth: num(f, "overrideMonth"), overrideAmountPaise: s(f, "overrideAmount") ? rupees(f, "overrideAmount") : null });
  if (table === "SLAB") Object.assign(input, { fy: s(f, "fy"), regime: s(f, "regime"), fromPaise: rupees(f, "from"), toPaise: s(f, "to") ? rupees(f, "to") : null, rateBp: pct(f, "rate") });
  if (table === "PARAM") {
    const unit = s(f, "unit") || "PAISE";
    Object.assign(input, { fy: s(f, "fy"), regime: s(f, "regime") || "ANY", key: s(f, "key"), unit, valueInt: unit === "PAISE" ? rupees(f, "value") : unit === "BP" ? pct(f, "value") : Number(s(f, "value")) });
  }
  if (table === "STIPEND") Object.assign(input, { institute: s(f, "institute"), locationClass: s(f, "locationClass"), yearOfTraining: s(f, "year"), amountPaise: rupees(f, "amount") });
  return run(() => rates.addRateRow(a, table, input), "Row added (Unverified until a Partner verifies it).", ["/hr/payroll/rates"]);
}
export async function verifyRateAction(table: rates.RateTable, id: string) { const a = await requireStaff(); return run(() => rates.verifyRateRow(a, table, id), "Verified.", ["/hr/payroll/rates"]); }

// ---- declarations & Form 16
export async function verifyDeclarationAction(id: string, codes: string[], _: ActionResult, f: FormData): Promise<ActionResult> {
  const a = await requireStaff();
  const items = Object.fromEntries(codes.map((c) => [c, rupees(f, `v_${c}`)]));
  return run(() => decl.verifyDeclaration(a, id, items, s(f, "note")), "Verified.", ["/hr/payroll/declarations"]);
}
export async function generateForm16Action(userId: string, fyStart: number, _: ActionResult, f: FormData): Promise<ActionResult> {
  const a = await requireStaff();
  const quarters = (["Q1", "Q2", "Q3", "Q4"] as const).map((q) => ({ quarter: q, receiptNo: s(f, `r_${q}`), amountPaise: rupees(f, `a_${q}`) })).filter((q) => q.receiptNo || q.amountPaise);
  return run(() => decl.generateForm16(a, userId, fyStart, { employerTan: s(f, "tan"), certificateNo: s(f, "certificateNo"), citTds: s(f, "citTds"), quarters }), "Certificate generated. Issue it when checked.", ["/hr/payroll/declarations"]);
}
export async function issueForm16Action(id: string) { const a = await requireStaff(); return run(() => decl.issueForm16(a, id), "Issued to the employee.", ["/hr/payroll/declarations"]); }
