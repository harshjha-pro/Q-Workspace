import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, conflict, forbidden, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { authorize, can } from "../../permissions/guards";
import { writeAudit, logSensitiveView } from "../../audit";
import { encrypt, encryptJson, decrypt, decryptJson } from "../../lib/crypto";
import { todayIst, monthLabel } from "../../lib/dates";
import {
  checkStipend, computePayslip, pickEffective, monthlyGross,
  type Line, type PayslipResult, type Regime, type SalaryComponents, type StipendCheck, type AttendanceSummary,
} from "../../payroll-engine";
import { deriveMonth, storeAttendance } from "../attendance/service";
import { summarise } from "../../payroll-engine";
import { notifyUsers } from "../notifications/service";
import { assertPayrollRole, fyMonths, idOf, isSalaryAdmin, monthInfo, payrollSettings } from "./common";
import { loadRateBook, missingTaxSetup, type RateBook } from "./rates";
import { effectiveStructure, type StructureRow } from "./structures";
import { declarationFor } from "./declarations";

export const RUN_FLOW = ["DRAFT", "REVIEWED", "APPROVED", "PAID", "LOCKED"] as const;
export type RunKind = "SALARY" | "STIPEND";

export type Adjustments = { lopOverrideHalfDays: number | null; earnings: Line[]; deductions: Line[]; note: string };
const NO_ADJ: Adjustments = { lopOverrideHalfDays: null, earnings: [], deductions: [], note: "" };

/** What a payslip stores (encrypted): inputs, attendance, adjustments and the engine result. */
export type PayslipLines = {
  v: 1;
  kind: RunKind;
  month: string;
  structureId: string;
  components: SalaryComponents;
  regime: Regime | null;
  attendance: AttendanceSummary & { derivedLopHalfDays: number; usedLopHalfDays: number };
  adjustments: Adjustments;
  expenseClaimIds: string[];
  result: PayslipResult;
  stipend: (StipendCheck & { institute: string; locationClass: string; year: number }) | null;
  employee: { name: string; code: string; designation: string; uan: string | null; esiNumber: string | null; workStateCode: string | null };
};

export type RunTotals = {
  count: number; gross: number; net: number; reimbursements: number;
  pfEmployee: number; pfEmployerEpf: number; pfEmployerEps: number; edli: number; pfAdmin: number;
  esiEmployee: number; esiEmployer: number; pt: number; tds: number; belowMinimum: number;
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

type Ctx = { month: string; kind: RunKind; book: RateBook; settings: Awaited<ReturnType<typeof payrollSettings>>; today: string };

/** People in a run: an approved structure of the run's kind in force at month end, employed during the month. */
async function eligiblePeople(month: string, kind: RunKind) {
  const { start, end } = monthInfo(month);
  const users = await db().user.findMany({
    where: { isSystem: false, employeeProfile: { isNot: null } },
    select: { id: true, active: true, displayName: true, designation: { select: { name: true } }, employeeProfile: true },
  });
  const out: { user: (typeof users)[number]; structure: StructureRow }[] = [];
  for (const u of users) {
    const p = u.employeeProfile!;
    if (p.joiningDate && p.joiningDate > end) continue;
    if (p.exitDate && p.exitDate < start) continue;
    if (!u.active && !p.exitDate) continue;
    const s = await effectiveStructure(u.id, end);
    if (!s || s.kind !== kind) continue;
    out.push({ user: u, structure: s });
  }
  return out;
}

/** Earlier months of the FY already paid through the app (any run status), for the TDS projection. */
async function priorFyTotals(userId: string, month: string) {
  const { fyStart } = monthInfo(month);
  const earlier = fyMonths(fyStart).filter((m) => m < month);
  const slips = await db().payslip.findMany({ where: { userId, run: { kind: "SALARY", month: { in: earlier } } } });
  const t = { gross: 0, tds: 0, basic: 0, hra: 0, pt: 0, employeePf: 0 };
  for (const s of slips) {
    const l = decryptJson<PayslipLines>(s.linesEnc, "PII");
    t.gross += l.result.gross;
    t.tds += l.result.tdsAmount;
    t.basic += l.result.earned.basic;
    t.hra += l.result.earned.hra;
    t.pt += l.result.pt;
    t.employeePf += l.result.pf.employee;
  }
  return t;
}

function monthsSince(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

async function stipendCheck(userId: string, joiningDate: string | null, monthStart: string, stipend: number, locationClass: string) {
  const rec = await db().articleshipRecord.findUnique({ where: { userId } });
  const institute = rec?.institute ?? "ICAI";
  const startedOn = rec?.startDate ?? joiningDate;
  const year = rec?.stipendYear ?? (startedOn ? Math.min(3, Math.floor(Math.max(0, monthsSince(startedOn, monthStart)) / 12) + 1) : 1);
  const rows = await db().stipendMinimum.findMany({ where: { institute, locationClass, yearOfTraining: year } });
  const min = pickEffective(rows, monthStart);
  const label = `${institute} year ${year} (${locationClass})`;
  return { ...checkStipend(stipend, min?.amountPaise ?? null, label), institute, locationClass, year };
}

/** Approved claims to be paid with this salary (spec 11.10 "paid with payroll"). */
async function payrollClaims(userId: string, monthEnd: string, runId: string | null) {
  return db().expenseClaim.findMany({
    where: { userId, status: "APPROVED", paidVia: "PAYROLL", date: { lte: monthEnd }, OR: [{ payrollRunId: null }, ...(runId ? [{ payrollRunId: runId }] : [])] },
    select: { id: true, amountPaise: true, kind: true, date: true },
  });
}

async function computeOne(ctx: Ctx, person: Awaited<ReturnType<typeof eligiblePeople>>[number], adjustments: Adjustments, runId: string | null) {
  const { user, structure } = person;
  const p = user.employeeProfile!;
  const mi = monthInfo(ctx.month);
  const { days } = await deriveMonth(user.id, ctx.month, ctx.today);
  const summary = summarise(days);
  const usedLop = adjustments.lopOverrideHalfDays ?? summary.lopHalfDays;
  const claims = ctx.kind === "SALARY" ? await payrollClaims(user.id, mi.end, runId) : [];

  let tax: Parameters<typeof computePayslip>[0]["tax"] = null;
  let regime: Regime | null = null;
  if (ctx.kind === "SALARY") {
    const decl = await declarationFor(user.id, mi.fyStart);
    regime = decl && decl.status !== "DRAFT" ? decl.regime : (structure.regime === "OLD" ? "OLD" : "NEW");
    const missing = missingTaxSetup(ctx.book, regime, mi.fyStart);
    if (missing) throw ruleViolation(missing);
    const future = fyMonths(mi.fyStart).filter((m) => m > ctx.month && (!p.exitDate || p.exitDate >= `${m}-01`)).map((m) => ({ month: Number(m.slice(5)), date: `${m}-01` }));
    tax = {
      regime, params: ctx.book.params[regime], slabs: ctx.book.slabs[regime],
      declaration: decl && decl.status !== "DRAFT" ? { regime, items: decl.items, metro: decl.metro } : null,
      prior: await priorFyTotals(user.id, ctx.month), future,
    };
  }
  const result = computePayslip({
    kind: ctx.kind, monthStart: mi.start, monthNumber: mi.month, components: structure.components,
    daysBasis: ctx.settings.daysBasis, calendarDays: mi.days, lopHalfDays: usedLop, notEmployedDays: summary.notEmployed,
    adjustments: { earnings: adjustments.earnings, deductions: adjustments.deductions },
    reimbursements: claims.map((c) => ({ code: "REIMB", label: `Expense claim ${c.date} (${c.kind.toLowerCase()})`, amount: c.amountPaise })),
    pf: { applicable: Boolean(p.uan), rate: pickEffective(ctx.book.pf, mi.start), basis: ctx.settings.pfWageBasis },
    esi: { rate: pickEffective(ctx.book.esi, mi.start), roundUp: ctx.settings.esiRoundUp },
    pt: { slabs: ctx.book.pt, stateCode: p.workStateCode, gender: p.gender },
    tax,
  });
  const stipend = ctx.kind === "STIPEND" ? await stipendCheck(user.id, p.joiningDate, mi.start, monthlyGross(structure.components), ctx.settings.stipendLocationClass) : null;
  const lines: PayslipLines = {
    v: 1, kind: ctx.kind, month: ctx.month, structureId: structure.id, components: structure.components, regime,
    attendance: { ...summary, derivedLopHalfDays: summary.lopHalfDays, usedLopHalfDays: usedLop },
    adjustments, expenseClaimIds: claims.map((c) => c.id), result, stipend,
    employee: { name: user.displayName, code: p.employeeCode, designation: user.designation?.name ?? "", uan: p.uan, esiNumber: p.esiNumber, workStateCode: p.workStateCode },
  };
  return { userId: user.id, days, lines, basisDays: result.basisDays };
}

type Computed = Awaited<ReturnType<typeof computeOne>>;

function payslipData(c: Computed) {
  const r = c.lines.result;
  return {
    daysInMonth: c.basisDays, lopHalfDays: c.lines.attendance.usedLopHalfDays,
    linesEnc: encryptJson(c.lines, "PII"), grossPaiseEnc: encrypt(String(r.gross), "PII"), netPaiseEnc: encrypt(String(r.net), "PII"),
    pfPaise: r.pf.employee, esiPaise: r.esi.employee, ptPaise: r.pt, tdsPaise: r.tdsAmount,
  };
}

function totalsOf(lines: PayslipLines[]): RunTotals {
  const t: RunTotals = { count: 0, gross: 0, net: 0, reimbursements: 0, pfEmployee: 0, pfEmployerEpf: 0, pfEmployerEps: 0, edli: 0, pfAdmin: 0, esiEmployee: 0, esiEmployer: 0, pt: 0, tds: 0, belowMinimum: 0 };
  for (const l of lines) {
    const r = l.result;
    t.count += 1; t.gross += r.gross; t.net += r.net; t.reimbursements += r.reimbursements.reduce((a, x) => a + x.amount, 0);
    t.pfEmployee += r.pf.employee; t.pfEmployerEpf += r.pf.employerEpf; t.pfEmployerEps += r.pf.employerEps; t.edli += r.pf.edli; t.pfAdmin += r.pf.admin;
    t.esiEmployee += r.esi.employee; t.esiEmployer += r.esi.employer; t.pt += r.pt; t.tds += r.tdsAmount;
    if (l.stipend?.belowMinimum) t.belowMinimum += 1;
  }
  return t;
}

async function context(month: string, kind: RunKind): Promise<Ctx> {
  return { month, kind, book: await loadRateBook(monthInfo(month).fyStart), settings: await payrollSettings(), today: todayIst() };
}

// ---------------------------------------------------------------------------
// Run lifecycle: Draft → Reviewed (HR) → Approved (Partner) → Paid → Locked (spec 11.5)
// ---------------------------------------------------------------------------
const runInput = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-04"), kind: z.enum(["SALARY", "STIPEND"]).default("SALARY"), notes: z.string().default("") });

export async function createRun(actor: Actor, input: z.input<typeof runInput>) {
  authorize(actor, "payroll.prepare");
  const d = parse(runInput, input);
  if (d.month > todayIst().slice(0, 7)) throw new DomainError("VALIDATION", "A run can be created for the current month or earlier.", { month: "Not a future month" });
  if (await db().payrollRun.findUnique({ where: { month_kind: { month: d.month, kind: d.kind } } })) throw conflict(`A ${d.kind.toLowerCase()} run for ${monthLabel(d.month)} already exists.`);
  const ctx = await context(d.month, d.kind);
  const people = await eligiblePeople(d.month, d.kind);
  if (people.length === 0) throw ruleViolation(`Nobody has an approved ${d.kind === "STIPEND" ? "stipend" : "salary"} structure for ${monthLabel(d.month)}.`);
  const computed: Computed[] = [];
  for (const p of people) computed.push(await computeOne(ctx, p, NO_ADJ, null));
  const run = await transaction(async (tx) => {
    const r = await tx.payrollRun.create({ data: { month: d.month, kind: d.kind, notes: d.notes, totalsEnc: encryptJson(totalsOf(computed.map((c) => c.lines)), "PII"), createdById: idOf(actor) } });
    for (const c of computed) {
      await tx.payslip.create({ data: { runId: r.id, userId: c.userId, ...payslipData(c), createdById: idOf(actor) } });
      await storeAttendance(tx, actor, c.userId, c.days);
      if (c.lines.expenseClaimIds.length) await tx.expenseClaim.updateMany({ where: { id: { in: c.lines.expenseClaimIds } }, data: { payrollRunId: r.id } });
    }
    await writeAudit(tx, actor, { entityType: "PayrollRun", entityId: r.id, action: "CREATE", after: { month: r.month, kind: r.kind, payslips: computed.length } });
    return r;
  });
  return run;
}

async function draftRun(runId: string) {
  const run = await db().payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound("Payroll run");
  if (run.status !== "DRAFT") throw ruleViolation("Only a Draft run can be changed. Send it back to Draft first.");
  return run;
}

/** Re-derive attendance and recompute every payslip of a Draft run, keeping HR's adjustments. */
export async function recalculateRun(actor: Actor, runId: string) {
  authorize(actor, "payroll.prepare");
  const run = await draftRun(runId);
  const kind = run.kind as RunKind;
  const ctx = await context(run.month, kind);
  const existing = await db().payslip.findMany({ where: { runId } });
  const adjBy = new Map(existing.map((s) => [s.userId, decryptJson<PayslipLines>(s.linesEnc, "PII").adjustments]));
  const people = await eligiblePeople(run.month, kind);
  const computed: Computed[] = [];
  for (const p of people) computed.push(await computeOne(ctx, p, adjBy.get(p.user.id) ?? NO_ADJ, runId));
  await transaction(async (tx) => {
    const keep = new Set(computed.map((c) => c.userId));
    await tx.payslip.deleteMany({ where: { runId, userId: { notIn: [...keep] } } });
    await tx.expenseClaim.updateMany({ where: { payrollRunId: runId, status: "APPROVED" }, data: { payrollRunId: null } });
    for (const c of computed) {
      await tx.payslip.upsert({ where: { runId_userId: { runId, userId: c.userId } }, create: { runId, userId: c.userId, ...payslipData(c), createdById: idOf(actor) }, update: { ...payslipData(c), updatedById: idOf(actor) } });
      await storeAttendance(tx, actor, c.userId, c.days);
      if (c.lines.expenseClaimIds.length) await tx.expenseClaim.updateMany({ where: { id: { in: c.lines.expenseClaimIds } }, data: { payrollRunId: runId } });
    }
    await tx.payrollRun.update({ where: { id: runId }, data: { totalsEnc: encryptJson(totalsOf(computed.map((c) => c.lines)), "PII"), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "PayrollRun", entityId: runId, action: "RECALCULATE", after: { payslips: computed.length } });
  });
}

const lineInput = z.object({ label: z.string().trim().min(2).max(60), amount: z.coerce.number().int().positive() });
const adjInput = z.object({
  lopOverrideHalfDays: z.coerce.number().int().min(0).max(62).nullable().default(null),
  earnings: z.array(lineInput).max(10).default([]),
  deductions: z.array(lineInput).max(10).default([]),
  note: z.string().trim().max(300).default(""),
});

/** HR adjusts one payslip in a Draft run (LOP override, one-off earnings/deductions); recomputed at once. */
export async function adjustPayslip(actor: Actor, payslipId: string, input: z.input<typeof adjInput>) {
  authorize(actor, "payroll.prepare");
  const slip = await db().payslip.findUnique({ where: { id: payslipId } });
  if (!slip) throw notFound("Payslip");
  const run = await draftRun(slip.runId);
  const d = parse(adjInput, input);
  const adjustments: Adjustments = {
    lopOverrideHalfDays: d.lopOverrideHalfDays,
    earnings: d.earnings.map((l, i) => ({ code: `ADJ_E${i + 1}`, label: l.label, amount: l.amount })),
    deductions: d.deductions.map((l, i) => ({ code: `ADJ_D${i + 1}`, label: l.label, amount: l.amount })),
    note: d.note,
  };
  const kind = run.kind as RunKind;
  const ctx = await context(run.month, kind);
  const person = (await eligiblePeople(run.month, kind)).find((p) => p.user.id === slip.userId);
  if (!person) throw ruleViolation("This person is no longer in the run; recalculate the run.");
  const c = await computeOne(ctx, person, adjustments, run.id);
  await transaction(async (tx) => {
    await tx.payslip.update({ where: { id: payslipId }, data: { ...payslipData(c), updatedById: idOf(actor) } });
    const all = await tx.payslip.findMany({ where: { runId: run.id } });
    await tx.payrollRun.update({ where: { id: run.id }, data: { totalsEnc: encryptJson(totalsOf(all.map((s) => decryptJson<PayslipLines>(s.linesEnc, "PII"))), "PII") } });
    await writeAudit(tx, actor, { entityType: "Payslip", entityId: payslipId, action: "ADJUST", after: { lopOverrideHalfDays: d.lopOverrideHalfDays, earnings: d.earnings.length, deductions: d.deductions.length }, reason: d.note });
  });
}

async function transition(actor: Actor, runId: string, from: string[], to: string, extra: Record<string, unknown>, reason = "") {
  const run = await db().payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound("Payroll run");
  if (!from.includes(run.status)) throw ruleViolation(`The run is ${run.status.toLowerCase()}; it cannot move to ${to.toLowerCase()}.`);
  await transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id: runId }, data: { status: to, ...extra, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "PayrollRun", entityId: runId, action: to === "DRAFT" ? "SEND_BACK" : to, before: { status: run.status }, after: { status: to }, reason });
  });
  return run;
}

/** HR Admin marks the Draft reviewed; Partners are told the run is ready (spec 12 notifications). */
export async function reviewRun(actor: Actor, runId: string) {
  authorize(actor, "payroll.prepare");
  const run = await transition(actor, runId, ["DRAFT"], "REVIEWED", { reviewedById: idOf(actor), reviewedAt: new Date() });
  const partners = await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } });
  await notifyUsers(partners.map((p) => p.id), { kind: "PAYROLL_READY", title: `Payroll run ready to approve: ${run.kind === "STIPEND" ? "stipend" : "salary"} ${monthLabel(run.month)}`, link: `/hr/payroll/${runId}`, entityType: "PayrollRun", entityId: runId, dedupeKey: `PAYROLL_READY|${runId}` });
}

/** Back to Draft for corrections (HR or the approving Partner), with a reason. */
export async function sendBackRun(actor: Actor, runId: string, reason: string) {
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve")) throw forbidden();
  if (!reason.trim()) throw new DomainError("VALIDATION", "Say what needs correcting.", { reason: "Required" });
  await transition(actor, runId, ["REVIEWED"], "DRAFT", { reviewedById: null, reviewedAt: null }, reason);
}

/** A Partner approves (maker ≠ checker: never the person who prepared or reviewed it). Stipend runs below the minimum are blocked. */
export async function approveRun(actor: Actor, runId: string) {
  authorize(actor, "payroll.approve");
  const run = await db().payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
  if (!run) throw notFound("Payroll run");
  if (run.createdById === idOf(actor) || run.reviewedById === idOf(actor)) throw forbidden("The person who prepared or reviewed the run cannot approve it.");
  if (actor.kind === "USER" && run.payslips.some((s) => s.userId === actor.userId)) throw forbidden("Your own pay is in this run; another Partner must approve it.");
  if (run.kind === "STIPEND") {
    const below = run.payslips.map((s) => decryptJson<PayslipLines>(s.linesEnc, "PII")).filter((l) => l.stipend?.belowMinimum);
    if (below.length) {
      throw ruleViolation(`Stipend is below the ICAI/ICSI minimum for ${below.map((l) => `${l.employee.name} (${l.stipend!.institute} year ${l.stipend!.year}: minimum Rs. ${(l.stipend!.minimum ?? 0) / 100})`).join(", ")}. Revise the stipend before approving.`);
    }
  }
  await transition(actor, runId, ["REVIEWED"], "APPROVED", { approvedById: idOf(actor), approvedAt: new Date() });
  const hr = await db().user.findMany({ where: { role: "HR_ADMIN", active: true }, select: { id: true } });
  await notifyUsers(hr.map((u) => u.id), { kind: "PAYROLL_APPROVED", title: `Payroll approved: ${monthLabel(run.month)} — download the bank file`, link: `/hr/payroll/${runId}`, entityType: "PayrollRun", entityId: runId });
}

/** HR records payment; payslips are published to employees (self-service). Claims paid with salary close. */
export async function markRunPaid(actor: Actor, runId: string) {
  authorize(actor, "payroll.prepare");
  const run = await transition(actor, runId, ["APPROVED"], "PAID", { paidAt: new Date() });
  const now = new Date();
  await transaction(async (tx) => {
    await tx.payslip.updateMany({ where: { runId }, data: { publishedAt: now } });
    await tx.expenseClaim.updateMany({ where: { payrollRunId: runId, status: "APPROVED" }, data: { status: "PAID", paidAt: now } });
  });
  const slips = await db().payslip.findMany({ where: { runId }, select: { userId: true } });
  await notifyUsers(slips.map((s) => s.userId), { kind: "PAYSLIP", title: `Your ${run.kind === "STIPEND" ? "stipend" : "payslip"} for ${monthLabel(run.month)} is ready`, link: "/me/payslips", entityType: "PayrollRun", entityId: runId, dedupeKey: `PAYSLIP|${runId}` });
}

export async function lockRun(actor: Actor, runId: string) {
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve")) throw forbidden();
  await transition(actor, runId, ["PAID"], "LOCKED", { lockedAt: new Date() });
}

/** Only a Draft run can be deleted (e.g. created for the wrong month). */
export async function deleteDraftRun(actor: Actor, runId: string) {
  authorize(actor, "payroll.prepare");
  await draftRun(runId);
  await transaction(async (tx) => {
    await tx.expenseClaim.updateMany({ where: { payrollRunId: runId, status: "APPROVED" }, data: { payrollRunId: null } });
    await tx.payslip.deleteMany({ where: { runId } });
    await tx.payrollRun.delete({ where: { id: runId } });
    await writeAudit(tx, actor, { entityType: "PayrollRun", entityId: runId, action: "DELETE" });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listRuns(actor: Actor) {
  assertPayrollRole(actor);
  const runs = await db().payrollRun.findMany({ orderBy: [{ month: "desc" }, { kind: "asc" }], take: 60 });
  await logSensitiveView(actor, "SALARY", "PayrollRun", "*", "run list totals");
  return runs.map((r) => ({ ...r, totals: r.totalsEnc ? decryptJson<RunTotals>(r.totalsEnc, "PII") : null }));
}

/** A run with every payslip (HR / Partner only; logged as a salary view). */
export async function getRun(actor: Actor, runId: string) {
  assertPayrollRole(actor);
  if (!isSalaryAdmin(actor)) throw forbidden();
  const run = await db().payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
  if (!run) throw notFound("Payroll run");
  await logSensitiveView(actor, "SALARY", "PayrollRun", runId, `run ${run.month} ${run.kind}`);
  const payslips = run.payslips
    .map((s) => ({ id: s.id, userId: s.userId, publishedAt: s.publishedAt, lines: decryptJson<PayslipLines>(s.linesEnc, "PII"), gross: Number(decrypt(s.grossPaiseEnc, "PII")), net: Number(decrypt(s.netPaiseEnc, "PII")) }))
    .sort((a, b) => a.lines.employee.name.localeCompare(b.lines.employee.name));
  const { payslips: _raw, totalsEnc, ...rest } = run;
  void _raw;
  return { ...rest, totals: totalsEnc ? decryptJson<RunTotals>(totalsEnc, "PII") : null, payslips };
}

/** Employee self-service: my published payslips (spec 11.5). */
export async function myPayslips(actor: Actor) {
  if (actor.kind !== "USER") throw forbidden();
  authorize(actor, "salary.view");
  const slips = await db().payslip.findMany({ where: { userId: actor.userId, publishedAt: { not: null } }, include: { run: { select: { month: true, kind: true, status: true } } } });
  return slips
    .map((s) => ({ id: s.id, month: s.run.month, kind: s.run.kind, gross: Number(decrypt(s.grossPaiseEnc, "PII")), net: Number(decrypt(s.netPaiseEnc, "PII")), tds: s.tdsPaise }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** One payslip: the employee (once published) or HR/Partner (logged). */
export async function getPayslip(actor: Actor, payslipId: string) {
  const s = await db().payslip.findUnique({ where: { id: payslipId }, include: { run: true } });
  if (!s) throw notFound("Payslip");
  const own = actor.kind === "USER" && actor.userId === s.userId;
  if (own) {
    if (!s.publishedAt) throw notFound("Payslip");
  } else {
    if (!isSalaryAdmin(actor)) throw forbidden();
    await logSensitiveView(actor, "SALARY", "Payslip", payslipId, `payslip ${s.run.month}`);
  }
  return { id: s.id, userId: s.userId, run: { id: s.run.id, month: s.run.month, kind: s.run.kind, status: s.run.status, paidAt: s.run.paidAt }, lines: decryptJson<PayslipLines>(s.linesEnc, "PII") };
}

/** Runs needing attention (HR dashboard). */
export async function payrollQueue(actor: Actor) {
  assertPayrollRole(actor);
  const runs = await db().payrollRun.findMany({ where: { status: { in: ["DRAFT", "REVIEWED", "APPROVED", "PAID"] } }, orderBy: { month: "desc" }, select: { id: true, month: true, kind: true, status: true } });
  const pendingStructures = await db().salaryStructure.count({ where: { status: "DRAFT" } });
  return { runs, pendingStructures };
}
