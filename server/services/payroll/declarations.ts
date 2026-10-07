import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { can, requireStaff } from "../../permissions/guards";
import { writeAudit, logSensitiveView } from "../../audit";
import { encryptJson, decryptJson, decryptOpt } from "../../lib/crypto";
import { fyStartYear, todayIst, formatDate } from "../../lib/dates";
import { addEmployeeDocument } from "../employees/service";
import { notifyUsers } from "../notifications/service";
import { buildPdf, rs, type PdfBlock } from "../../documents/pdf";
import { amountInWords } from "../../documents/words";
import {
  annualTax, computePayslip, oldRegimeDeductions, pickEffective, DECLARATION_SECTIONS, TAX_KEYS,
  type Declaration, type DeclarationItems, type Regime, type TdsResult,
} from "../../payroll-engine";
import { assertSalaryAccess, fyCode, fyMonths, idOf, isSalaryAdmin, monthInfo, payrollSettings } from "./common";
import { loadRateBook, missingTaxSetup } from "./rates";
import { effectiveStructure } from "./structures";
import { storeEmployeeFile, readDocumentText } from "./files";
import type { PayslipLines } from "./runs";

type Stored = { items: DeclarationItems; metro: boolean; declared?: DeclarationItems; verifiedNote?: string };

export type DeclarationView = {
  id: string; userId: string; fy: string; status: string; regime: Regime; items: DeclarationItems; metro: boolean;
  declared: DeclarationItems | null; verifiedById: string | null; proofsSubmittedAt: Date | null;
  proofs: { id: string; section: string; amountPaise: number; documentId: string }[];
};

/** A person's declaration for a FY, decrypted (no permission check — internal). */
export async function declarationFor(userId: string, fyStart: number): Promise<DeclarationView | null> {
  const d = await db().investmentDeclaration.findUnique({ where: { userId_fy: { userId, fy: fyCode(fyStart) } }, include: { proofs: true } });
  if (!d) return null;
  const s = decryptJson<Stored>(d.itemsEnc, "PII");
  return {
    id: d.id, userId: d.userId, fy: d.fy, status: d.status, regime: d.regime === "OLD" ? "OLD" : "NEW", items: s.items ?? {}, metro: Boolean(s.metro),
    declared: s.declared ?? null, verifiedById: d.verifiedById, proofsSubmittedAt: d.proofsSubmittedAt,
    proofs: d.proofs.map((p) => ({ id: p.id, section: p.section, amountPaise: p.amountPaise, documentId: p.documentId })),
  };
}

const SECTION_CODES = DECLARATION_SECTIONS.map((s) => s.code) as [string, ...string[]];
const declInput = z.object({
  fyStart: z.coerce.number().int().min(2020).max(2100),
  regime: z.enum(["NEW", "OLD"]),
  metro: z.boolean().default(false),
  items: z.partialRecord(z.enum(SECTION_CODES), z.coerce.number().int().min(0)).default({}),
  submit: z.boolean().default(false),
});

/** Employee saves (and optionally submits) their declaration and regime choice for the FY (spec 11.5). */
export async function saveDeclaration(actor: Actor, input: z.input<typeof declInput>) {
  requireStaff(actor);
  const d = parse(declInput, input);
  const fy = fyCode(d.fyStart);
  const existing = await db().investmentDeclaration.findUnique({ where: { userId_fy: { userId: actor.userId, fy } } });
  if (existing?.status === "VERIFIED") throw ruleViolation("HR has verified this declaration; ask HR to change it.");
  const items = Object.fromEntries(Object.entries(d.items).filter(([, v]) => (v ?? 0) > 0)) as DeclarationItems;
  const status = d.submit ? (existing?.status === "PROOFS_SUBMITTED" ? "PROOFS_SUBMITTED" : "SUBMITTED") : (existing?.status ?? "DRAFT");
  return transaction(async (tx) => {
    const data = { regime: d.regime, itemsEnc: encryptJson({ items, metro: d.metro } satisfies Stored, "PII"), status, updatedById: actor.userId };
    const row = existing
      ? await tx.investmentDeclaration.update({ where: { id: existing.id }, data })
      : await tx.investmentDeclaration.create({ data: { ...data, userId: actor.userId, fy, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "InvestmentDeclaration", entityId: row.id, action: existing ? "UPDATE" : "CREATE", before: existing ? { status: existing.status, regime: existing.regime } : null, after: { status, regime: d.regime, sections: Object.keys(items) } });
    return row;
  });
}

/** Proof upload (stored in the employee's private documents). */
export async function addProof(actor: Actor, input: { fyStart: number; section: string; amountPaise: number; file: { name: string; data: Buffer } }) {
  requireStaff(actor);
  if (!SECTION_CODES.includes(input.section)) throw new DomainError("VALIDATION", "Choose a section.", { section: "Required" });
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new DomainError("VALIDATION", "Enter the amount.", { amount: "Required" });
  const decl = await db().investmentDeclaration.findUnique({ where: { userId_fy: { userId: actor.userId, fy: fyCode(input.fyStart) } } });
  if (!decl) throw ruleViolation("Save your declaration first.");
  if (decl.status === "VERIFIED") throw ruleViolation("HR has verified this declaration.");
  const doc = await addEmployeeDocument(actor, actor.userId, input.file, "TAX_PROOF");
  return transaction(async (tx) => {
    const p = await tx.investmentProof.create({ data: { declarationId: decl.id, section: input.section, amountPaise: input.amountPaise, documentId: doc.id, createdById: actor.userId } });
    await tx.investmentDeclaration.update({ where: { id: decl.id }, data: { status: "PROOFS_SUBMITTED", proofsSubmittedAt: new Date(), updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "InvestmentProof", entityId: p.id, action: "CREATE", after: { section: p.section, amountPaise: p.amountPaise } });
    return p;
  });
}

function assertHrPayroll(actor: Actor) {
  if (!can(actor, "payroll.prepare") && !can(actor, "hr.records.manage")) throw forbidden();
}

/** HR's list for a FY (who declared what, proof status). Logged as a salary view. */
export async function listDeclarations(actor: Actor, fyStart: number) {
  if (!isSalaryAdmin(actor) || actor.kind === "PORTAL") throw forbidden();
  const rows = await db().investmentDeclaration.findMany({ where: { fy: fyCode(fyStart) }, include: { proofs: true } });
  const users = await db().user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } });
  await logSensitiveView(actor, "SALARY", "InvestmentDeclaration", "*", `declarations ${fyCode(fyStart)}`);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const out = [];
  for (const r of rows) {
    const v = (await declarationFor(r.userId, fyStart))!;
    out.push({ ...v, name: names.get(r.userId) ?? "—" });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** HR verifies against proofs; the verified amounts replace the declared ones for TDS (declared kept for the record). */
export async function verifyDeclaration(actor: Actor, declarationId: string, verifiedItems: Record<string, number>, note = "") {
  assertHrPayroll(actor);
  const d = await db().investmentDeclaration.findUnique({ where: { id: declarationId } });
  if (!d) throw notFound("Declaration");
  if (actor.kind === "USER" && d.userId === actor.userId) throw forbidden("You cannot verify your own declaration.");
  if (d.status === "DRAFT") throw ruleViolation("The employee has not submitted this declaration yet.");
  const s = decryptJson<Stored>(d.itemsEnc, "PII");
  const items: DeclarationItems = {};
  for (const [k, v] of Object.entries(verifiedItems)) {
    if (!SECTION_CODES.includes(k)) continue;
    if (!Number.isInteger(v) || v < 0) throw new DomainError("VALIDATION", `Amount for ${k} must be a whole number of paise.`);
    if (v > 0) items[k] = v;
  }
  await transaction(async (tx) => {
    await tx.investmentDeclaration.update({ where: { id: declarationId }, data: { status: "VERIFIED", verifiedById: idOf(actor), itemsEnc: encryptJson({ items, metro: s.metro, declared: s.declared ?? s.items, verifiedNote: note } satisfies Stored, "PII"), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "InvestmentDeclaration", entityId: declarationId, action: "VERIFY", reason: note });
  });
  await notifyUsers([d.userId], { kind: "DECLARATION_VERIFIED", title: `Your ${d.fy} investment declaration was verified`, body: note, link: "/me/payslips", entityType: "InvestmentDeclaration", entityId: declarationId });
}

// ---------------------------------------------------------------------------
// Tax projection (employee self-service): this FY under both regimes
// ---------------------------------------------------------------------------
export async function taxProjection(actor: Actor, userId?: string): Promise<{ fy: string; current: Regime; byRegime: Partial<Record<Regime, TdsResult>>; note: string | null } | null> {
  requireStaff(actor);
  const target = userId ?? actor.userId;
  assertSalaryAccess(actor, target);
  if (target !== actor.userId) await logSensitiveView(actor, "SALARY", "TaxProjection", target);
  const today = todayIst();
  const month = today.slice(0, 7);
  const mi = monthInfo(month);
  const structure = await effectiveStructure(target, today);
  if (!structure || structure.kind !== "SALARY") return null;
  const [book, settings, decl, profile] = await Promise.all([loadRateBook(mi.fyStart), payrollSettings(), declarationFor(target, mi.fyStart), db().employeeProfile.findUnique({ where: { userId: target } })]);
  const earlier = fyMonths(mi.fyStart).filter((m) => m < month);
  const slips = await db().payslip.findMany({ where: { userId: target, run: { kind: "SALARY", month: { in: earlier } } } });
  const prior = { gross: 0, tds: 0, basic: 0, hra: 0, pt: 0, employeePf: 0 };
  for (const s of slips) {
    const l = decryptJson<PayslipLines>(s.linesEnc, "PII");
    prior.gross += l.result.gross; prior.tds += l.result.tdsAmount; prior.basic += l.result.earned.basic; prior.hra += l.result.earned.hra; prior.pt += l.result.pt; prior.employeePf += l.result.pf.employee;
  }
  const future = fyMonths(mi.fyStart).filter((m) => m > month).map((m) => ({ month: Number(m.slice(5)), date: `${m}-01` }));
  const byRegime: Partial<Record<Regime, TdsResult>> = {};
  let note: string | null = null;
  for (const regime of ["NEW", "OLD"] as Regime[]) {
    const missing = missingTaxSetup(book, regime, mi.fyStart);
    if (missing) { note = missing; continue; }
    const r = computePayslip({
      kind: "SALARY", monthStart: mi.start, monthNumber: mi.month, components: structure.components, daysBasis: settings.daysBasis, calendarDays: mi.days,
      lopHalfDays: 0, notEmployedDays: 0, adjustments: { earnings: [], deductions: [] },
      pf: { applicable: Boolean(profile?.uan), rate: pickEffective(book.pf, mi.start), basis: settings.pfWageBasis },
      esi: { rate: pickEffective(book.esi, mi.start), roundUp: settings.esiRoundUp },
      pt: { slabs: book.pt, stateCode: profile?.workStateCode ?? null, gender: profile?.gender ?? null },
      tax: { regime, params: book.params[regime], slabs: book.slabs[regime], declaration: decl ? { regime, items: decl.items, metro: decl.metro } : null, prior, future },
    });
    if (r.tds) byRegime[regime] = r.tds;
  }
  const current: Regime = decl && decl.status !== "DRAFT" ? decl.regime : structure.regime === "OLD" ? "OLD" : "NEW";
  return { fy: fyCode(mi.fyStart), current, byRegime, note };
}

// ---------------------------------------------------------------------------
// Form 16 (annual; Part B computed here, Part A typed by HR from TRACES). Label is a setting because the
// Income-tax Act, 2025 renumbers the forms from 1 April 2026.
// ---------------------------------------------------------------------------
const partAInput = z.object({
  employerTan: z.string().trim().toUpperCase().regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, "TAN looks like ABCD12345E"),
  certificateNo: z.string().trim().min(1, "Certificate number from TRACES"),
  quarters: z.array(z.object({ quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]), receiptNo: z.string().trim().default(""), amountPaise: z.coerce.number().int().min(0).default(0) })).max(4).default([]),
  citTds: z.string().trim().default(""),
});
export type PartA = z.output<typeof partAInput>;

export async function form16Summary(userId: string, fyStart: number) {
  const months = fyMonths(fyStart);
  const slips = await db().payslip.findMany({ where: { userId, run: { kind: "SALARY", month: { in: months }, status: { in: ["PAID", "LOCKED"] } } }, include: { run: { select: { month: true } } } });
  const lines = slips.map((s) => decryptJson<PayslipLines>(s.linesEnc, "PII"));
  const sum = (f: (l: PayslipLines) => number) => lines.reduce((a, l) => a + f(l), 0);
  const decl = await declarationFor(userId, fyStart);
  const regime: Regime = decl && decl.status !== "DRAFT" ? decl.regime : (lines.at(-1)?.regime ?? "NEW");
  const book = await loadRateBook(fyStart);
  const missing = missingTaxSetup(book, regime, fyStart);
  if (missing) throw ruleViolation(missing);
  const p = book.params[regime];
  const priorIncome = decl?.items.PRIOR_INCOME ?? 0;
  const gross = sum((l) => l.result.gross) + priorIncome;
  const basic = sum((l) => l.result.earned.basic);
  const hra = sum((l) => l.result.earned.hra);
  const pt = sum((l) => l.result.pt);
  const employeePf = sum((l) => l.result.pf.employee);
  const tdsDeducted = sum((l) => l.result.tdsAmount) + (decl?.items.PRIOR_TDS ?? 0);
  const standardDeduction = Math.min(gross, p[TAX_KEYS.STANDARD_DEDUCTION] ?? 0);
  const old = regime === "OLD" ? oldRegimeDeductions(decl ? { regime, items: decl.items, metro: decl.metro } : null, p, { basic, hra, employeePf, pt }) : null;
  const taxable = gross - standardDeduction - (old ? old.hraExempt + old.ptDeduction + old.total : 0);
  const tax = annualTax(taxable, regime, book.slabs[regime], p);
  return { fy: fyCode(fyStart), regime, months: slips.map((s) => s.run.month).sort(), gross, priorIncome, basic, hra, pt, employeePf, standardDeduction, hraExempt: old?.hraExempt ?? 0, ptDeduction: old?.ptDeduction ?? 0, chapterVIA: old?.lines ?? [], tax, tdsDeducted };
}

/** HR generates the annual certificate PDF for one employee and FY (spec 11.5). */
export async function generateForm16(actor: Actor, userId: string, fyStart: number, partAInputRaw: z.input<typeof partAInput>) {
  assertHrPayroll(actor);
  if (actor.kind === "USER" && actor.userId === userId) throw forbidden("Another HR/Partner user must prepare your own certificate.");
  const partA = parse(partAInput, partAInputRaw);
  const user = await db().user.findUnique({ where: { id: userId }, include: { employeeProfile: true, designation: true } });
  if (!user?.employeeProfile) throw notFound("Employee profile");
  const s = await form16Summary(userId, fyStart);
  if (s.months.length === 0) throw ruleViolation(`No paid salary runs in ${s.fy} for ${user.displayName}.`);
  const firm = await db().firmProfile.findFirst();
  const { form16Label } = await payrollSettings();
  const pan = decryptOpt(user.employeeProfile.panEnc, "PII") ?? "PANNOTAVBL";
  const blocks: PdfBlock[] = [
    { type: "heading", text: "Part A — Certificate of tax deducted at source (as per TRACES)" },
    { type: "kv", columns: 2, rows: [["Employer", firm?.name ?? ""], ["Employer TAN", partA.employerTan], ["Employer PAN", firm?.pan ?? ""], ["Certificate no.", partA.certificateNo], ["Employee", user.displayName], ["Employee PAN", pan], ["Designation", user.designation?.name ?? ""], ["Financial year", s.fy], ["CIT (TDS)", partA.citTds]] },
    { type: "table", columns: [{ header: "Quarter", width: 1 }, { header: "Receipt number", width: 3 }, { header: "Tax deducted", width: 2, align: "right" }], rows: partA.quarters.map((q) => [q.quarter, q.receiptNo, rs(q.amountPaise)]) },
    { type: "heading", text: `Part B — Details of salary paid and tax deducted (${s.regime === "NEW" ? "new" : "old"} regime)` },
    {
      type: "table", columns: [{ header: "Particulars", width: 5 }, { header: "Amount", width: 2, align: "right" }],
      rows: [
        ["Gross salary paid by this employer", rs(s.gross - s.priorIncome)],
        ...(s.priorIncome ? [["Salary from previous employer / before go-live (declared)", rs(s.priorIncome)]] : []),
        ["Total gross salary", rs(s.gross)],
        ...(s.hraExempt ? [["Less: HRA exemption", rs(s.hraExempt)]] : []),
        ["Less: standard deduction", rs(s.standardDeduction)],
        ...(s.ptDeduction ? [["Less: professional tax", rs(s.ptDeduction)]] : []),
        ...s.chapterVIA.map((l) => [`Less: ${l.label}`, rs(l.allowed)]),
        ["Total taxable income (rounded)", rs(s.tax.taxable)],
        ["Tax on total income", rs(s.tax.slabTax)],
        ...(s.tax.rebate ? [["Less: rebate", rs(s.tax.rebate)]] : []),
        ...(s.tax.surcharge ? [["Surcharge", rs(s.tax.surcharge)]] : []),
        ["Health and education cess", rs(s.tax.cess)],
        ["Tax payable", rs(s.tax.total)],
        ["Tax deducted at source", rs(s.tdsDeducted)],
        [s.tdsDeducted >= s.tax.total ? "Excess deducted" : "Balance payable", rs(Math.abs(s.tax.total - s.tdsDeducted))],
      ],
    },
    { type: "text", text: `Tax deducted in words: ${amountInWords(s.tdsDeducted)}`, size: 8.5 },
    { type: "text", text: `Months included: ${s.months.join(", ")}. Values computed from the firm's payroll; statutory rates must be verified for the Income-tax Act, 2025.`, size: 8 },
    { type: "signature", lines: ["For " + (firm?.name ?? "the employer"), "", "Authorised signatory", `Date: ${formatDate(todayIst())}`] },
  ];
  const pdf = await buildPdf({ title: `${form16Label} — ${s.fy}`, header: firm ? [firm.name, firm.address, firm.pan ? `PAN ${firm.pan}` : ""].filter(Boolean) : undefined, subtitle: `${user.displayName} · ${user.employeeProfile.employeeCode}`, blocks, footer: `${form16Label} · ${s.fy}` });
  const fy = fyCode(fyStart);
  return transaction(async (tx) => {
    const partADoc = await storeEmployeeFile(tx, actor, userId, `form16-parta-${fy}.txt`, Buffer.from(encryptJson(partA, "PII")), "FORM16_PART_A");
    const pdfDoc = await storeEmployeeFile(tx, actor, userId, `${form16Label.replace(/\s+/g, "-")}-${fy}-${user.employeeProfile!.employeeCode}.pdf`, pdf, "FORM16");
    const row = await tx.form16.upsert({
      where: { userId_fy: { userId, fy } },
      create: { userId, fy, partADocId: partADoc.id, pdfDocumentId: pdfDoc.id, generatedAt: new Date(), createdById: idOf(actor) },
      update: { partADocId: partADoc.id, pdfDocumentId: pdfDoc.id, generatedAt: new Date(), issuedAt: null, updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "Form16", entityId: row.id, action: "GENERATE", after: { fy, months: s.months.length } });
    return row;
  });
}

/** The Part A fields last typed for a certificate (to prefill a regeneration). */
export async function form16PartA(actor: Actor, form16Id: string): Promise<PartA | null> {
  assertHrPayroll(actor);
  const f = await db().form16.findUnique({ where: { id: form16Id } });
  if (!f?.partADocId) return null;
  const text = await readDocumentText(f.partADocId);
  return text ? decryptJson<PartA>(text, "PII") : null;
}

export async function issueForm16(actor: Actor, form16Id: string) {
  assertHrPayroll(actor);
  const f = await db().form16.findUnique({ where: { id: form16Id } });
  if (!f?.pdfDocumentId) throw notFound("Certificate");
  await transaction(async (tx) => {
    await tx.form16.update({ where: { id: form16Id }, data: { issuedAt: new Date(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Form16", entityId: form16Id, action: "ISSUE" });
  });
  const { form16Label } = await payrollSettings();
  await notifyUsers([f.userId], { kind: "FORM16", title: `Your ${form16Label} for ${f.fy} is ready`, link: "/me/payslips", entityType: "Form16", entityId: form16Id });
}

export async function listForm16(actor: Actor, fyStart: number) {
  if (!isSalaryAdmin(actor)) throw forbidden();
  return db().form16.findMany({ where: { fy: fyCode(fyStart) } });
}

/** Issued certificates of the signed-in employee. */
export async function myForm16(actor: Actor) {
  requireStaff(actor);
  return db().form16.findMany({ where: { userId: actor.userId, issuedAt: { not: null } }, orderBy: { fy: "desc" } });
}

export const currentFyStart = () => fyStartYear(todayIst());
export type { Declaration };

/** People with paid salary in the FY and their certificate status (HR / Partner page). */
export async function form16Candidates(actor: Actor, fyStart: number) {
  if (!isSalaryAdmin(actor) || actor.kind === "PORTAL") throw forbidden();
  const slips = await db().payslip.findMany({ where: { run: { kind: "SALARY", month: { in: fyMonths(fyStart) }, status: { in: ["PAID", "LOCKED"] } } }, select: { userId: true, run: { select: { month: true } } } });
  const byUser = new Map<string, number>();
  for (const s of slips) byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + 1);
  const [users, forms] = await Promise.all([
    db().user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, displayName: true } }),
    db().form16.findMany({ where: { fy: fyCode(fyStart) } }),
  ]);
  return users.map((u) => ({ userId: u.id, name: u.displayName, months: byUser.get(u.id) ?? 0, form16: forms.find((f) => f.userId === u.id) ?? null })).sort((a, b) => a.name.localeCompare(b.name));
}
