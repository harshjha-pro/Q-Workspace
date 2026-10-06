/**
 * Starter Due-Date Master — Rules Spec §10 (+ MSME Form 1 and Professional Tax, open-questions Q-02).
 * EVERY value here is an ILLUSTRATIVE DEFAULT. Rows are seeded with verifiedBy = null and shown as
 * "Unverified" until a Partner checks each one against the law in force. Shared by the seed and the
 * engine tests so both use exactly the same master.
 */
import type { ComplianceTypeDef, DueRuleParams } from "../../server/compliance-engine/types";

export type MasterRow = ComplianceTypeDef & { serviceLine: string; ackType: string; appliesWhen: string; rule: DueRuleParams; sortOrder: number };

const QTR_TDS = { Q1: "07-31", Q2: "10-31", Q3: "01-31", Q4: "05-31" };

const R = (
  code: string, name: string, shortName: string, frequency: MasterRow["frequency"], periodBasis: MasterRow["periodBasis"],
  partyBasis: MasterRow["partyBasis"], familyCode: string, serviceLine: string, ackType: string, appliesWhen: string, rule: DueRuleParams, extra: Partial<MasterRow> = {},
): Omit<MasterRow, "sortOrder"> => ({ code, name, shortName, frequency, periodBasis, partyBasis, familyCode, serviceLine, ackType, appliesWhen, rule, weekendHolidayPolicy: "NONE", ...extra });

export const COMPLIANCE_MASTER: MasterRow[] = [
  R("GST-R1-M", "GSTR-1 (monthly)", "GSTR-1", "MONTHLY", "MONTH", "GSTIN", "F1", "GST", "ARN", "GSTIN files monthly", { kind: "DAY_AFTER_PERIOD", day: 11 }),
  R("GST-3B-M", "GSTR-3B (monthly)", "GSTR-3B", "MONTHLY", "MONTH", "GSTIN", "F1", "GST", "ARN", "GSTIN files monthly", { kind: "DAY_AFTER_PERIOD", day: 20 }),
  R("GST-IFF", "IFF (QRMP, months 1 and 2)", "IFF", "MONTHLY", "MONTH", "GSTIN", "F1", "GST", "ARN", "QRMP GSTIN that opted for IFF", { kind: "DAY_AFTER_PERIOD", day: 13 }),
  R("GST-R1-Q", "GSTR-1 (QRMP)", "GSTR-1", "QUARTERLY", "FY_QUARTER", "GSTIN", "F1", "GST", "ARN", "GSTIN under QRMP", { kind: "DAY_AFTER_PERIOD", day: 13 }),
  R("GST-3B-Q", "GSTR-3B (QRMP)", "GSTR-3B", "QUARTERLY", "FY_QUARTER", "GSTIN", "F1", "GST", "ARN", "GSTIN under QRMP — 22nd or 24th by state group", { kind: "STATE_GROUP_DAY_AFTER_PERIOD", days: { A: 22, B: 24 } }),
  R("GST-CMP08", "CMP-08 (composition)", "CMP-08", "QUARTERLY", "FY_QUARTER", "GSTIN", "F1", "GST", "ARN", "GSTIN under composition", { kind: "DAY_AFTER_PERIOD", day: 18 }),
  R("GST-R4", "GSTR-4 (composition annual)", "GSTR-4", "ANNUAL", "FY", "GSTIN", "F1", "GST", "ARN", "GSTIN under composition", { kind: "MMDD_AFTER_END", mmdd: "04-30" }),
  R("GST-R9", "GSTR-9 (annual return)", "GSTR-9", "ANNUAL", "FY", "GSTIN", "F1", "GST", "ARN", "GSTIN with GSTR-9 applicable", { kind: "MMDD_AFTER_END", mmdd: "12-31" }),
  R("GST-R9C", "GSTR-9C (reconciliation)", "GSTR-9C", "ANNUAL", "FY", "GSTIN", "F1", "GST", "ARN", "GSTIN with GSTR-9C applicable", { kind: "MMDD_AFTER_END", mmdd: "12-31" }),
  R("ADV-TAX", "Advance tax (4 instalments)", "Advance tax", "QUARTERLY", "FY_QUARTER", "CLIENT", "F2", "DIRECT_TAX", "CIN", "Advance tax applies (15/45/75/100% cumulative)", { kind: "MMDD_ON_OR_AFTER_START", byIndex: { Q1: "06-15", Q2: "09-15", Q3: "12-15", Q4: "03-15" } }),
  R("ITR-NA", "ITR — non-audit case", "ITR", "ANNUAL", "AY", "CLIENT", "F2", "DIRECT_TAX", "ITR_ACK", "ITR without tax audit", { kind: "MMDD_AFTER_END", mmdd: "07-31" }),
  R("ITR-A", "ITR — audit case", "ITR", "ANNUAL", "AY", "CLIENT", "F2", "DIRECT_TAX", "ITR_ACK", "ITR with tax audit, or any company (30 Nov where 3CEB applies)", { kind: "MMDD_AFTER_END", mmdd: "10-31", ifFlag: { transferPricingApplicable: "11-30" } }),
  R("TAR", "Tax audit report (3CA/3CB-3CD)", "Tax audit report", "ANNUAL", "AY", "CLIENT", "F4", "AUDIT", "ACK", "Tax audit applies", { kind: "MMDD_AFTER_END", mmdd: "09-30" }),
  R("TP-3CEB", "Transfer pricing report (3CEB)", "Form 3CEB", "ANNUAL", "AY", "CLIENT", "F4", "DIRECT_TAX", "ACK", "Transfer pricing applies", { kind: "MMDD_AFTER_END", mmdd: "10-31" }),
  R("TDS-PAY", "TDS/TCS payment", "TDS/TCS payment", "MONTHLY", "MONTH", "CLIENT", "F3", "DIRECT_TAX", "CIN", "TDS or TCS applies (March: 30 April)", { kind: "DAY_AFTER_PERIOD", day: 7, byEndMonth: { "03": 30 } }),
  R("TDS-24Q", "TDS return 24Q (salary)", "TDS 24Q", "QUARTERLY", "FY_QUARTER", "CLIENT", "F3", "DIRECT_TAX", "TOKEN", "TDS on salary", { kind: "MMDD_ON_OR_AFTER_START", byIndex: QTR_TDS }),
  R("TDS-26Q", "TDS return 26Q (non-salary)", "TDS 26Q", "QUARTERLY", "FY_QUARTER", "CLIENT", "F3", "DIRECT_TAX", "TOKEN", "TDS on contractors, rent, fees…", { kind: "MMDD_ON_OR_AFTER_START", byIndex: QTR_TDS }),
  R("TDS-27Q", "TDS return 27Q (non-resident)", "TDS 27Q", "QUARTERLY", "FY_QUARTER", "CLIENT", "F3", "DIRECT_TAX", "TOKEN", "Payments to non-residents", { kind: "MMDD_ON_OR_AFTER_START", byIndex: QTR_TDS }),
  R("TCS-27EQ", "TCS return 27EQ", "TCS 27EQ", "QUARTERLY", "FY_QUARTER", "CLIENT", "F3", "DIRECT_TAX", "TOKEN", "TCS applies", { kind: "MMDD_ON_OR_AFTER_START", byIndex: { Q1: "07-15", Q2: "10-15", Q3: "01-15", Q4: "05-15" } }),
  R("STAT-AUDIT", "Statutory audit (report)", "Statutory audit", "ANNUAL", "FY", "CLIENT", "F4", "AUDIT", "UDIN", "Statutory audit applies (all companies)", { kind: "MMDD_AFTER_END", mmdd: "09-30" }),
  R("AOC-4", "Form AOC-4 (financial statements)", "AOC-4", "ANNUAL", "FY", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Every company — AGM date + 30 days", { kind: "EVENT_OFFSET", eventType: "AGM", days: 30, provisional: true }),
  R("MGT-7", "Form MGT-7 / MGT-7A (annual return)", "MGT-7", "ANNUAL", "FY", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Every company — AGM date + 60 days", { kind: "EVENT_OFFSET", eventType: "AGM", days: 60, provisional: true }),
  R("ADT-1", "Form ADT-1 (auditor appointment)", "ADT-1", "EVENT", "FY", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Company appoints an auditor — appointment date + 15 days", { kind: "EVENT_OFFSET", eventType: "AUDITOR_APPOINTMENT", days: 15, provisional: false }),
  R("DIR3-KYC", "DIR-3 KYC", "DIR-3 KYC", "ANNUAL", "FY", "DIRECTOR", "F5", "COMPANY_LAW", "SRN", "Each director / designated partner with a DIN", { kind: "MMDD_AFTER_END", mmdd: "09-30" }),
  R("DPT-3", "Form DPT-3", "DPT-3", "ANNUAL", "FY", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Company with outstanding loans / money received", { kind: "MMDD_AFTER_END", mmdd: "06-30" }),
  R("LLP-F11", "LLP Form 11 (annual return)", "LLP Form 11", "ANNUAL", "FY", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Every LLP", { kind: "MMDD_AFTER_END", mmdd: "05-30" }),
  R("LLP-F8", "LLP Form 8 (statement of accounts)", "LLP Form 8", "ANNUAL", "FY", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Every LLP", { kind: "MMDD_AFTER_END", mmdd: "10-30" }),
  R("MSME-1", "MSME Form 1 (half-yearly)", "MSME Form 1", "HALF_YEARLY", "FY_HALF", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Company owes MSME suppliers beyond 45 days", { kind: "MMDD_AFTER_END", byIndex: { H1: "10-31", H2: "04-30" } }),
  R("PF-ECR", "PF monthly return & payment", "PF ECR", "MONTHLY", "MONTH", "CLIENT", "F6", "ACCOUNTING", "TOKEN", "Registered under EPF", { kind: "DAY_AFTER_PERIOD", day: 15 }),
  R("ESI-RET", "ESI monthly return & payment", "ESI", "MONTHLY", "MONTH", "CLIENT", "F6", "ACCOUNTING", "CHALLAN", "Registered under ESIC", { kind: "DAY_AFTER_PERIOD", day: 15 }),
  R("PT-RET", "Professional Tax return & payment", "PT", "MONTHLY", "MONTH", "PT_STATE", "F6", "ACCOUNTING", "CHALLAN", "PT employer registration in a PT state — due date entered manually (Q-02b)", { kind: "MANUAL" }),
  R("GST-R10", "GSTR-10 (final return)", "GSTR-10", "ONE_TIME", "EVENT", "GSTIN", "F1", "GST", "ARN", "GST registration cancelled", { kind: "MANUAL" }, { isClosure: true }),
  R("ROC-STK2", "Strike-off application (STK-2)", "STK-2", "ONE_TIME", "EVENT", "CLIENT", "F5", "COMPANY_LAW", "SRN", "Company discontinued", { kind: "MANUAL" }, { isClosure: true }),
  R("LLP-F24", "LLP closure (Form 24)", "LLP Form 24", "ONE_TIME", "EVENT", "CLIENT", "F5", "COMPANY_LAW", "SRN", "LLP discontinued", { kind: "MANUAL" }, { isClosure: true }),
].map((r, i) => ({ ...r, sortOrder: i }));

/** Illustrative late fee / interest rates (P2-14). Unverified until checked — see open-questions Q-29. */
export const LATE_FEE_MASTER: { code: string; perDayPaise: number; maxPaise: number | null; interestBpPerMonth: number; note: string }[] = [
  { code: "GST-3B-M", perDayPaise: 50_00, maxPaise: 10_000_00, interestBpPerMonth: 150, note: "₹50/day (₹20 nil); interest 18% p.a. on tax — verify caps by turnover" },
  { code: "GST-3B-Q", perDayPaise: 50_00, maxPaise: 10_000_00, interestBpPerMonth: 150, note: "As GSTR-3B monthly — verify" },
  { code: "GST-R1-M", perDayPaise: 50_00, maxPaise: 10_000_00, interestBpPerMonth: 0, note: "₹50/day (₹20 nil) — verify caps" },
  { code: "GST-R1-Q", perDayPaise: 50_00, maxPaise: 10_000_00, interestBpPerMonth: 0, note: "As GSTR-1 — verify" },
  { code: "TDS-PAY", perDayPaise: 0, maxPaise: null, interestBpPerMonth: 150, note: "Interest 1.5% per month on late payment — verify" },
  { code: "TDS-24Q", perDayPaise: 200_00, maxPaise: null, interestBpPerMonth: 0, note: "₹200/day, capped at TDS amount — verify" },
  { code: "TDS-26Q", perDayPaise: 200_00, maxPaise: null, interestBpPerMonth: 0, note: "₹200/day, capped at TDS amount — verify" },
  { code: "TDS-27Q", perDayPaise: 200_00, maxPaise: null, interestBpPerMonth: 0, note: "₹200/day, capped at TDS amount — verify" },
  { code: "TCS-27EQ", perDayPaise: 200_00, maxPaise: null, interestBpPerMonth: 0, note: "₹200/day, capped at TCS amount — verify" },
  { code: "ADV-TAX", perDayPaise: 0, maxPaise: null, interestBpPerMonth: 100, note: "Interest 1% per month on shortfall — verify" },
  { code: "AOC-4", perDayPaise: 100_00, maxPaise: null, interestBpPerMonth: 0, note: "Additional fee ₹100/day — verify" },
  { code: "MGT-7", perDayPaise: 100_00, maxPaise: null, interestBpPerMonth: 0, note: "Additional fee ₹100/day — verify" },
  { code: "LLP-F11", perDayPaise: 100_00, maxPaise: null, interestBpPerMonth: 0, note: "Additional fee ₹100/day — verify" },
  { code: "LLP-F8", perDayPaise: 100_00, maxPaise: null, interestBpPerMonth: 0, note: "Additional fee ₹100/day — verify" },
];

/**
 * QRMP GSTR-3B state groups. Group A = 22nd, group B = 24th (illustrative, verify — Rules Spec C7).
 */
export const GST_STATE_GROUPS: Record<string, "A" | "B"> = {
  CG: "A", MP: "A", GJ: "A", MH: "A", KA: "A", GA: "A", KL: "A", TN: "A", TS: "A", AP: "A", DN: "A", PY: "A", AN: "A", LD: "A",
  HP: "B", PB: "B", UK: "B", HR: "B", DL: "B", RJ: "B", UP: "B", BR: "B", SK: "B", AR: "B", NL: "B", MN: "B", MZ: "B", TR: "B",
  ML: "B", AS: "B", WB: "B", JH: "B", OD: "B", JK: "B", LA: "B", CH: "B",
};

/** Default document checklists per family (Rules Spec 2.1). */
export const CHECKLISTS: Record<string, string[]> = {
  F1: ["GSTR-2B download", "Sales register / invoices", "Purchase register", "E-way bill data (if applicable)", "ITC reversal workings"],
  F2: ["Form 16", "AIS / TIS", "Bank statements", "Capital gains statements", "Investment proofs", "Advance tax / self-assessment challans"],
  F3: ["Deduction register", "PAN of deductees", "Challan details", "Previous quarter return (for corrections)"],
  F4: ["Trial balance", "Ledgers", "Confirmations", "Prior-year signed report", "Related-party schedule"],
  F5: ["Financial statements", "Board / AGM resolutions and minutes", "Shareholder list", "Auditor consent letter", "DIN holder PAN / Aadhaar / OTP", "Loan / deposit register"],
  F6: ["Payroll register", "New joiners and exits", "Wage / contribution details"],
};

/** National holidays common to all states (firm adds state and firm holidays in the app). */
export const NATIONAL_HOLIDAYS: [string, string][] = [
  ["2026-01-26", "Republic Day"], ["2026-08-15", "Independence Day"], ["2026-10-02", "Gandhi Jayanti"],
  ["2027-01-26", "Republic Day"], ["2027-08-15", "Independence Day"], ["2027-10-02", "Gandhi Jayanti"],
];
