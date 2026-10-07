import { db, transaction } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { decryptJson, decryptOpt } from "../../lib/crypto";
import { formatDate, monthLabel, toIstDate } from "../../lib/dates";
import { buildPdf, rs, type PdfBlock } from "../../documents/pdf";
import { amountInWords } from "../../documents/words";
import { buildSheet, type Column } from "../../excel/workbook";
import { assertPayrollRole, fyCode, fyMonths, isSalaryAdmin, rupees } from "./common";
import { getPayslip, type PayslipLines } from "./runs";

export const RUN_FILES = ["bank", "pf-ecr", "esi", "pt", "register"] as const;
export type RunFile = (typeof RUN_FILES)[number];
type Out = { body: Buffer; fileName: string; contentType: string };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const half = (h: number) => (h % 2 ? `${Math.floor(h / 2)}.5` : String(h / 2));

/** Payslip PDF (employee once published, or HR/Partner). Generated on request — nothing extra stored. */
export async function payslipPdf(actor: Actor, payslipId: string): Promise<Out> {
  const p = await getPayslip(actor, payslipId);
  const l = p.lines;
  const r = l.result;
  const firm = await db().firmProfile.findFirst();
  const profile = await db().employeeProfile.findUnique({ where: { userId: p.userId } });
  const account = decryptOpt(profile?.bankAccountEnc, "PII");
  const isStipend = l.kind === "STIPEND";
  const rows = Math.max(r.earnings.length, r.deductions.length);
  const table: string[][] = Array.from({ length: rows }, (_, i) => [r.earnings[i]?.label ?? "", r.earnings[i] ? rs(r.earnings[i]!.amount, false) : "", r.deductions[i]?.label ?? "", r.deductions[i] ? rs(r.deductions[i]!.amount, false) : ""]);
  const totalDed = r.deductions.reduce((a, x) => a + x.amount, 0);
  const blocks: PdfBlock[] = [
    {
      type: "kv", columns: 2, rows: [
        ["Name", l.employee.name], ["Employee code", l.employee.code], ["Designation", l.employee.designation], ["Pay period", monthLabel(l.month)],
        ["Paid days", `${half(r.paidHalfDays)} of ${r.basisDays}`], ["Loss of pay days", half(l.attendance.usedLopHalfDays)],
        ["Bank account", account ? `XXXX${account.slice(-4)}` : ""], ["UAN", l.employee.uan ?? ""],
        ...(isStipend ? [] : ([["Tax regime", l.regime === "OLD" ? "Old" : "New"], ["ESI number", l.employee.esiNumber ?? ""]] as [string, string][])),
      ],
    },
    { type: "table", columns: [{ header: "Earnings", width: 3 }, { header: "Rs.", width: 1.4, align: "right" }, { header: "Deductions", width: 3 }, { header: "Rs.", width: 1.4, align: "right" }], rows: table, totals: ["Gross earnings", rs(r.gross, false), "Total deductions", rs(totalDed, false)] },
    ...(r.reimbursements.length ? [{ type: "table" as const, columns: [{ header: "Reimbursements (not part of wages)", width: 6 }, { header: "Rs.", width: 1.4, align: "right" as const }], rows: r.reimbursements.map((x) => [x.label, rs(x.amount, false)]) }] : []),
    { type: "text", text: `Net pay: ${rs(r.net)}`, bold: true, size: 11 },
    { type: "text", text: amountInWords(r.net), size: 8.5 },
  ];
  if (r.tds) {
    blocks.push({ type: "heading", text: "Income-tax projection for the year" }, {
      type: "kv", columns: 2, rows: [
        ["Projected gross", rs(r.tds.projectedGross)], ["Standard deduction", rs(r.tds.standardDeduction)],
        ["Taxable income", rs(r.tds.tax.taxable)], ["Tax for the year", rs(r.tds.tax.total)],
        ["TDS already deducted", rs(r.tds.priorTds)], ["Months left (incl. this)", String(r.tds.remainingMonths)],
      ],
    });
  }
  if (r.pf.employee || r.esi.employer) {
    blocks.push({ type: "text", size: 8, text: `Employer contributions (not deducted from pay): PF ${rs(r.pf.employerEpf + r.pf.employerEps)}${r.esi.employer ? `, ESI ${rs(r.esi.employer)}` : ""}.` });
  }
  blocks.push({ type: "text", size: 7.5, text: "This is a computer-generated payslip and needs no signature." });
  const body = await buildPdf({
    title: `${isStipend ? "Stipend slip" : "Payslip"} — ${monthLabel(l.month)}`,
    header: firm ? [firm.name, firm.address].filter(Boolean) : undefined,
    blocks, footer: `${l.employee.code} · ${l.month}`,
    watermark: p.run.status === "DRAFT" || p.run.status === "REVIEWED" ? "DRAFT" : undefined,
  });
  return { body, fileName: `payslip-${l.employee.code}-${l.month}.pdf`, contentType: "application/pdf" };
}

async function runFor(actor: Actor, runId: string) {
  assertPayrollRole(actor);
  if (!isSalaryAdmin(actor)) throw forbidden();
  const run = await db().payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
  if (!run) throw notFound("Payroll run");
  const slips = run.payslips.map((s) => ({ userId: s.userId, lines: decryptJson<PayslipLines>(s.linesEnc, "PII") })).sort((a, b) => a.lines.employee.name.localeCompare(b.lines.employee.name));
  return { run, slips };
}

async function logged(actor: Actor, entityId: string, file: string) {
  await logSensitiveView(actor, "SALARY", "PayrollRun", entityId, `download ${file}`);
  await transaction((tx) => writeAudit(tx, actor, { entityType: "PayrollRun", entityId, action: "DOWNLOAD", after: { file } }));
}

/** Run outputs (spec 11.5): bank transfer file (generic Excel, Q-09(f)), PF ECR, ESI and PT data, salary register. */
export async function runFile(actor: Actor, runId: string, file: RunFile): Promise<Out> {
  const { run, slips } = await runFor(actor, runId);
  const tag = `${run.kind.toLowerCase()}-${run.month}`;
  let columns: Column[];
  let rows: Record<string, unknown>[];
  switch (file) {
    case "bank": {
      if (!["APPROVED", "PAID", "LOCKED"].includes(run.status)) throw ruleViolation("The bank file is available once a Partner approves the run.");
      const profiles = await db().employeeProfile.findMany({ where: { userId: { in: slips.map((s) => s.userId) } } });
      const byUser = new Map(profiles.map((p) => [p.userId, p]));
      columns = [{ key: "code", header: "Employee code" }, { key: "name", header: "Beneficiary name", width: 28 }, { key: "account", header: "Account number", width: 20 }, { key: "ifsc", header: "IFSC", width: 14 }, { key: "bank", header: "Bank", width: 20 }, { key: "amount", header: "Amount (Rs.)" }, { key: "narration", header: "Narration", width: 28 }];
      rows = slips.filter((s) => s.lines.result.net > 0).map((s) => {
        const p = byUser.get(s.userId);
        return { code: s.lines.employee.code, name: s.lines.employee.name, account: decryptOpt(p?.bankAccountEnc, "PII") ?? "MISSING", ifsc: decryptOpt(p?.bankIfscEnc, "PII") ?? "MISSING", bank: decryptOpt(p?.bankNameEnc, "PII") ?? "", amount: rupees(s.lines.result.net), narration: `${run.kind === "STIPEND" ? "Stipend" : "Salary"} ${monthLabel(run.month)}` };
      });
      break;
    }
    case "pf-ecr":
      // Usual ECR text-file columns, in rupees; NCP days = loss-of-pay days.
      columns = [{ key: "uan", header: "UAN", width: 14 }, { key: "name", header: "Member name", width: 28 }, { key: "gross", header: "Gross wages" }, { key: "epfWages", header: "EPF wages" }, { key: "epsWages", header: "EPS wages" }, { key: "edliWages", header: "EDLI wages" }, { key: "epfEe", header: "EPF contribution remitted (EE)" }, { key: "eps", header: "EPS contribution remitted" }, { key: "epfEr", header: "EPF-EPS difference remitted (ER)" }, { key: "ncp", header: "NCP days" }, { key: "refund", header: "Refund of advances" }];
      rows = slips.filter((s) => s.lines.result.pf.employee > 0).map((s) => {
        const r = s.lines.result;
        return { uan: s.lines.employee.uan ?? "", name: s.lines.employee.name, gross: Math.round(rupees(r.gross)), epfWages: Math.round(rupees(r.pf.pfWages)), epsWages: Math.round(rupees(r.pf.epsWages)), edliWages: Math.round(rupees(r.pf.edliWages)), epfEe: Math.round(rupees(r.pf.employee)), eps: Math.round(rupees(r.pf.employerEps)), epfEr: Math.round(rupees(r.pf.employerEpf)), ncp: Math.ceil(s.lines.attendance.usedLopHalfDays / 2), refund: 0 };
      });
      break;
    case "esi":
      columns = [{ key: "ip", header: "IP number", width: 14 }, { key: "name", header: "IP name", width: 28 }, { key: "days", header: "No. of days for which wages paid" }, { key: "wages", header: "Total monthly wages" }, { key: "ee", header: "Employee contribution" }, { key: "er", header: "Employer contribution" }, { key: "reason", header: "Reason code for zero working days" }];
      rows = slips.filter((s) => s.lines.result.esi.eligible).map((s) => {
        const r = s.lines.result;
        return { ip: s.lines.employee.esiNumber ?? "MISSING", name: s.lines.employee.name, days: Math.floor(r.paidHalfDays / 2), wages: rupees(r.esi.wages), ee: rupees(r.esi.employee), er: rupees(r.esi.employer), reason: r.paidHalfDays === 0 ? "1" : "" };
      });
      break;
    case "pt":
      columns = [{ key: "code", header: "Employee code" }, { key: "name", header: "Name", width: 28 }, { key: "state", header: "Work state" }, { key: "gross", header: "Gross salary" }, { key: "pt", header: "Professional Tax" }];
      rows = slips.filter((s) => s.lines.kind === "SALARY").map((s) => ({ code: s.lines.employee.code, name: s.lines.employee.name, state: s.lines.employee.workStateCode ?? "", gross: rupees(s.lines.result.gross), pt: rupees(s.lines.result.pt) }));
      break;
    case "register":
      columns = [{ key: "code", header: "Employee code" }, { key: "name", header: "Name", width: 28 }, { key: "paid", header: "Paid days" }, { key: "lop", header: "LOP days" }, { key: "gross", header: "Gross" }, { key: "pf", header: "PF" }, { key: "esi", header: "ESI" }, { key: "pt", header: "PT" }, { key: "tds", header: "TDS" }, { key: "other", header: "Other deductions" }, { key: "reimb", header: "Reimbursements" }, { key: "net", header: "Net" }];
      rows = slips.map((s) => {
        const r = s.lines.result;
        const other = s.lines.adjustments.deductions.reduce((a, x) => a + x.amount, 0);
        return { code: s.lines.employee.code, name: s.lines.employee.name, paid: r.paidHalfDays / 2, lop: s.lines.attendance.usedLopHalfDays / 2, gross: rupees(r.gross), pf: rupees(r.pf.employee), esi: rupees(r.esi.employee), pt: rupees(r.pt), tds: rupees(r.tdsAmount), other: rupees(other), reimb: rupees(r.reimbursements.reduce((a, x) => a + x.amount, 0)), net: rupees(r.net) };
      });
      break;
    default:
      throw new DomainError("NOT_FOUND", "Unknown file.");
  }
  const body = await buildSheet(file.toUpperCase(), columns, rows);
  await logged(actor, runId, file);
  return { body, fileName: `${file}-${tag}.xlsx`, contentType: XLSX };
}

/** TDS on salary (24Q) quarterly data: one row per employee per month paid in the quarter (spec 11.5). */
export async function tds24qFile(actor: Actor, fyStart: number, quarter: 1 | 2 | 3 | 4): Promise<Out> {
  assertPayrollRole(actor);
  if (!isSalaryAdmin(actor)) throw forbidden();
  const months = fyMonths(fyStart).slice((quarter - 1) * 3, quarter * 3);
  const runs = await db().payrollRun.findMany({ where: { kind: "SALARY", month: { in: months }, status: { in: ["APPROVED", "PAID", "LOCKED"] } }, include: { payslips: true }, orderBy: { month: "asc" } });
  const profiles = await db().employeeProfile.findMany({ where: { userId: { in: runs.flatMap((r) => r.payslips.map((s) => s.userId)) } } });
  const pan = new Map(profiles.map((p) => [p.userId, decryptOpt(p.panEnc, "PII")]));
  const rows: Record<string, unknown>[] = [];
  for (const run of runs) {
    for (const s of run.payslips) {
      const l = decryptJson<PayslipLines>(s.linesEnc, "PII");
      rows.push({ quarter: `Q${quarter}`, month: monthLabel(run.month), code: l.employee.code, pan: pan.get(s.userId) ?? "PANNOTAVBL", name: l.employee.name, section: "192", paidOn: run.paidAt ? formatDate(toIstDate(run.paidAt)) : "", amount: rupees(l.result.gross), tds: rupees(l.result.tdsAmount), regime: l.regime ?? "" });
    }
  }
  const columns: Column[] = [{ key: "quarter", header: "Quarter" }, { key: "month", header: "Month" }, { key: "code", header: "Employee code" }, { key: "pan", header: "PAN", width: 12 }, { key: "name", header: "Name", width: 28 }, { key: "section", header: "Section" }, { key: "paidOn", header: "Date of payment" }, { key: "amount", header: "Amount paid / credited" }, { key: "tds", header: "Tax deducted" }, { key: "regime", header: "Regime" }];
  const body = await buildSheet("24Q", columns, rows);
  await logged(actor, `${fyCode(fyStart)}-Q${quarter}`, "24q");
  return { body, fileName: `24Q-${fyCode(fyStart)}-Q${quarter}.xlsx`, contentType: XLSX };
}
