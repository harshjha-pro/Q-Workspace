/**
 * Reference data needed by every install (demo or real). Idempotent: safe to run on every setup.
 * Statutory due dates / rates are NOT here — they are seeded with the compliance engine (Phase 2)
 * and payroll (Phase 3), each marked "Unverified" until a Partner checks it.
 */
import type { PrismaClient } from "../../generated/prisma/client";
import { SYSTEM_USER_ID } from "../../server/permissions/actor";
import { COMPLIANCE_MASTER, LATE_FEE_MASTER, GST_STATE_GROUPS, CHECKLISTS, NATIONAL_HOLIDAYS } from "./compliance-master";

const ROLES = [
  ["PARTNER", "Partner", "Full firm-wide visibility; final sign-off; approvals"],
  ["MANAGER", "Manager", "Engagements, team, review, approvals for own team and clients"],
  ["STAFF", "Staff / Senior", "Maker; Seniors may review junior work"],
  ["ARTICLE", "Article Assistant / Trainee", "Always maker, never final checker"],
  ["PRACTICE_ADMIN", "Practice Admin", "Client master, users, registers, invoices"],
  ["HR_ADMIN", "HR / Payroll Admin", "People, attendance, payroll; no client data"],
  ["PORTAL", "Client Portal User", "External user for their own clients only"],
] as const;

/** [code, gstCode, name, isUT]. GST state codes as used in GSTINs. */
const STATES: [string, string, string, boolean][] = [
  ["JK", "01", "Jammu and Kashmir", true], ["HP", "02", "Himachal Pradesh", false], ["PB", "03", "Punjab", false],
  ["CH", "04", "Chandigarh", true], ["UK", "05", "Uttarakhand", false], ["HR", "06", "Haryana", false],
  ["DL", "07", "Delhi", true], ["RJ", "08", "Rajasthan", false], ["UP", "09", "Uttar Pradesh", false],
  ["BR", "10", "Bihar", false], ["SK", "11", "Sikkim", false], ["AR", "12", "Arunachal Pradesh", false],
  ["NL", "13", "Nagaland", false], ["MN", "14", "Manipur", false], ["MZ", "15", "Mizoram", false],
  ["TR", "16", "Tripura", false], ["ML", "17", "Meghalaya", false], ["AS", "18", "Assam", false],
  ["WB", "19", "West Bengal", false], ["JH", "20", "Jharkhand", false], ["OD", "21", "Odisha", false],
  ["CG", "22", "Chhattisgarh", false], ["MP", "23", "Madhya Pradesh", false], ["GJ", "24", "Gujarat", false],
  ["DN", "26", "Dadra and Nagar Haveli and Daman and Diu", true], ["MH", "27", "Maharashtra", false],
  ["KA", "29", "Karnataka", false], ["GA", "30", "Goa", false], ["LD", "31", "Lakshadweep", true],
  ["KL", "32", "Kerala", false], ["TN", "33", "Tamil Nadu", false], ["PY", "34", "Puducherry", true],
  ["AN", "35", "Andaman and Nicobar Islands", true], ["TS", "36", "Telangana", false], ["AP", "37", "Andhra Pradesh", false],
  ["LA", "38", "Ladakh", true],
];

/** Professional Tax levied — confirmed by QEPEX (open-questions Q-02, 6 Oct 2026). */
export const PT_STATES = ["AP", "AS", "BR", "GJ", "JH", "KA", "KL", "MP", "MH", "MN", "ML", "MZ", "NL", "PY", "SK", "TN", "TS", "TR", "WB"];

type StageSpec = [name: string, reviewLevel?: "SENIOR" | "MANAGER" | "PARTNER", flags?: { client?: boolean; filing?: boolean; udin?: boolean; dsc?: boolean }];

/** Product Spec 4.4 stage templates; review levels per open-questions Q-14 (proposal). */
const STAGE_TEMPLATES: { code: string; name: string; engagementType: string; stages: StageSpec[] }[] = [
  {
    code: "GST_RETURN", name: "GST return", engagementType: "GST_RETURN",
    stages: [["Data Requested"], ["Data Received"], ["2B/Books Reconciliation"], ["Preparation", "SENIOR"], ["Client Approval", undefined, { client: true }], ["Filed (ARN)", undefined, { filing: true }]],
  },
  {
    code: "INCOME_TAX_RETURN", name: "Income tax return", engagementType: "INCOME_TAX_RETURN",
    stages: [["Documents Requested"], ["Data Received"], ["Computation"], ["Review", "MANAGER"], ["Client Approval", undefined, { client: true }], ["Filed", undefined, { filing: true }], ["E-verified"]],
  },
  {
    code: "TDS_RETURN", name: "TDS return", engagementType: "TDS_RETURN",
    stages: [["Data Received"], ["Challan Matching"], ["Preparation"], ["Review", "SENIOR"], ["Filed", undefined, { filing: true }], ["Certificates Issued"]],
  },
  {
    code: "AUDIT", name: "Statutory / tax audit", engagementType: "AUDIT",
    stages: [["Planning"], ["Risk Assessment"], ["Fieldwork / Vouching"], ["Queries to Client"], ["Manager Review", "MANAGER"], ["Partner Review", "PARTNER"], ["Report Signed (UDIN)", undefined, { filing: true, udin: true }]],
  },
  {
    code: "BOOKKEEPING", name: "Bookkeeping", engagementType: "BOOKKEEPING",
    stages: [["Data Received"], ["Entry"], ["Bank Reconciliation"], ["Review", "SENIOR"], ["MIS / Finalisation"]],
  },
  {
    code: "ROC_ANNUAL", name: "ROC annual filing", engagementType: "ROC_ANNUAL",
    stages: [["Financials Received"], ["Board / AGM Documents"], ["Form Preparation", "MANAGER"], ["DSC Signing", "PARTNER", { dsc: true }], ["Filed (SRN)", undefined, { filing: true }], ["Approved"]],
  },
  {
    code: "NOTICE", name: "Notice / assessment", engagementType: "NOTICE",
    stages: [["Notice Received"], ["Analysis"], ["Data Gathering"], ["Draft Response"], ["Review", "MANAGER"], ["Submitted", undefined, { filing: true }], ["Hearing"], ["Closed"]],
  },
  {
    code: "PAYROLL_STATUTORY", name: "Statutory payroll (PF / ESI / PT)", engagementType: "PAYROLL_STATUTORY",
    stages: [["Data Received"], ["Computation", "SENIOR"], ["Payment & Challan"], ["Filed", undefined, { filing: true }]],
  },
  {
    code: "OTHER", name: "Other", engagementType: "OTHER",
    stages: [["Planning"], ["Work in Progress"], ["Review", "MANAGER"], ["Completed"]],
  },
];

/** Rules Spec 2.1 stage template families. */
const FAMILIES = [
  { code: "F1", name: "GST Return", stageTemplateCode: "GST_RETURN", reviewLevel: "SENIOR", requiresSignoff: false, requiresUdin: false },
  { code: "F2", name: "Income Tax", stageTemplateCode: "INCOME_TAX_RETURN", reviewLevel: "MANAGER", requiresSignoff: false, requiresUdin: false },
  { code: "F3", name: "TDS/TCS", stageTemplateCode: "TDS_RETURN", reviewLevel: "SENIOR", requiresSignoff: false, requiresUdin: false },
  { code: "F4", name: "Audit & Transfer Pricing", stageTemplateCode: "AUDIT", reviewLevel: "PARTNER", requiresSignoff: true, requiresUdin: true },
  { code: "F5", name: "ROC / LLP", stageTemplateCode: "ROC_ANNUAL", reviewLevel: "PARTNER", requiresSignoff: false, requiresUdin: false },
  { code: "F6", name: "Statutory Payroll", stageTemplateCode: "PAYROLL_STATUTORY", reviewLevel: "SENIOR", requiresSignoff: false, requiresUdin: false },
];

const DESIGNATIONS = [
  ["Partner", 10, "PARTNER"], ["Senior Manager", 8, "MANAGER"], ["Manager", 7, "MANAGER"], ["Senior Associate", 5, "STAFF"],
  ["Associate", 4, "STAFF"], ["Article Assistant", 1, "ARTICLE"], ["Practice Administrator", 5, "PRACTICE_ADMIN"], ["HR Executive", 5, "HR_ADMIN"],
] as const;

/** Spec 5.3 internal categories. */
const INTERNAL_CATEGORIES = [
  { code: "INTERNAL_MEETING", name: "Internal Meeting" },
  { code: "TRAINING_CPE", name: "Training & CPE", feedsCpe: true },
  { code: "ARTICLESHIP_CLASSES", name: "Articleship Classes / Exam Leave" },
  { code: "PRACTICE_ADMIN", name: "Practice Administration" },
  { code: "BUSINESS_DEVELOPMENT", name: "Business Development", linksLead: true },
  { code: "KNOWLEDGE_UPDATES", name: "Knowledge Updates", linksKnowledge: true },
  { code: "LEAVE", name: "Leave" },
  { code: "OTHER", name: "Other" },
];

const CHIPS = ["Data entry", "Reconciliation", "Vouching", "Computation", "Client call", "Portal filing", "Query resolution", "Drafting reply"];

const BADGES = [
  ["DEADLINE_HERO", "Deadline Hero"], ["CLEAN_REVIEW", "Clean Review"], ["CLIENT_CHAMPION", "Client Champion"],
  ["FAST_LEARNER", "Fast Learner"], ["TEAM_PLAYER", "Team Player"], ["PROBLEM_SOLVER", "Problem Solver"],
] as const;

/** Rules Spec 4.2 event types (dates live in EventDate per client). */
const EVENT_TYPES = [
  ["AGM", "Annual general meeting"], ["AUDITOR_APPOINTMENT", "Auditor appointment"], ["INCORPORATION", "Incorporation"],
  ["NOTICE_RECEIVED", "Notice received"], ["DIRECTOR_APPOINTMENT", "Director appointment"], ["DIRECTOR_RESIGNATION", "Director resignation"],
  ["GST_CANCELLATION", "GST registration cancelled"],
] as const;

export async function seedReference(db: PrismaClient) {
  for (const [code, name] of EVENT_TYPES) {
    await db.eventType.upsert({ where: { code }, create: { code, name }, update: { name } });
  }
  for (const [i, [code, name, description]] of ROLES.entries()) {
    await db.role.upsert({ where: { code }, create: { code, name, description, sortOrder: i }, update: { name, description, sortOrder: i } });
  }
  await db.user.upsert({
    where: { id: SYSTEM_USER_ID },
    create: { id: SYSTEM_USER_ID, username: "system", displayName: "System", passwordHash: "!", role: "PRACTICE_ADMIN", isSystem: true, active: false },
    update: {},
  });
  for (const [code, gstCode, name, isUT] of STATES) {
    const ptLevied = PT_STATES.includes(code);
    await db.state.upsert({ where: { code }, create: { code, gstCode, name, isUT, ptLevied }, update: { gstCode, name, isUT, ptLevied } });
  }
  for (const t of STAGE_TEMPLATES) {
    const template = await db.stageTemplate.upsert({
      where: { code: t.code },
      create: { code: t.code, name: t.name, engagementType: t.engagementType },
      update: { name: t.name },
    });
    const existing = await db.stageTemplateVersion.findFirst({ where: { templateId: template.id, version: 1 } });
    if (!existing) {
      await db.stageTemplateVersion.create({
        data: {
          templateId: template.id, version: 1, status: "ACTIVE", effectiveFrom: "2026-04-01", note: "Seeded from Product Spec 4.4",
          stages: {
            create: t.stages.map(([name, reviewLevel, f], index) => ({
              index, name, reviewLevel: reviewLevel ?? "NONE",
              isClientApproval: f?.client ?? false, isFiling: f?.filing ?? false, requiresUdin: f?.udin ?? false, requiresDsc: f?.dsc ?? false,
            })),
          },
        },
      });
    }
  }
  for (const f of FAMILIES) {
    await db.stageTemplateFamily.upsert({ where: { code: f.code }, create: f, update: f });
  }
  for (const [name, level, roleHint] of DESIGNATIONS) {
    await db.designation.upsert({ where: { name }, create: { name, level, roleHint }, update: { level, roleHint } });
  }
  for (const [i, c] of INTERNAL_CATEGORIES.entries()) {
    await db.internalCategory.upsert({ where: { code: c.code }, create: { ...c, sortOrder: i }, update: { name: c.name, sortOrder: i } });
  }
  for (const [i, label] of CHIPS.entries()) {
    await db.descriptionChip.upsert({ where: { label }, create: { label, sortOrder: i }, update: { sortOrder: i } });
  }
  for (const [code, name] of BADGES) {
    await db.badge.upsert({ where: { code }, create: { code, name }, update: { name } });
  }

  await seedComplianceMaster(db);
}

/**
 * Due-Date Master (Phase 2). Types are upserted; rule v1, late fees, groups and checklists are only
 * created when missing, so edits made in the app are never overwritten by a later setup run.
 */
export async function seedComplianceMaster(db: PrismaClient) {
  for (const r of COMPLIANCE_MASTER) {
    const data = {
      name: r.name, shortName: r.shortName, frequency: r.frequency, periodBasis: r.periodBasis, partyBasis: r.partyBasis, familyCode: r.familyCode,
      serviceLine: r.serviceLine, ackType: r.ackType, appliesWhen: r.appliesWhen, isClosure: r.isClosure ?? false, sortOrder: r.sortOrder,
      eventTypeCode: r.rule.kind === "EVENT_OFFSET" ? r.rule.eventType : null,
    };
    await db.complianceType.upsert({ where: { code: r.code }, create: { code: r.code, weekendHolidayPolicy: r.weekendHolidayPolicy, ...data }, update: data });
    if (!(await db.dueDateRule.findFirst({ where: { complianceTypeCode: r.code } }))) {
      await db.dueDateRule.create({
        data: { complianceTypeCode: r.code, version: 1, kind: r.rule.kind, paramsJson: JSON.stringify(r.rule), effectiveFrom: "2017-04-01", source: "Rules Spec V1 §10 — illustrative, verify before go-live" },
      });
    }
  }
  for (const f of LATE_FEE_MASTER) {
    if (!(await db.lateFeeRate.findFirst({ where: { complianceTypeCode: f.code } }))) {
      await db.lateFeeRate.create({ data: { complianceTypeCode: f.code, perDayPaise: f.perDayPaise, maxPaise: f.maxPaise, interestBpPerMonth: f.interestBpPerMonth, note: f.note, effectiveFrom: "2017-07-01", source: "Illustrative — verify (open-questions Q-29)" } });
    }
  }
  for (const [stateCode, groupCode] of Object.entries(GST_STATE_GROUPS)) {
    if (!(await db.gstStateGroup.findFirst({ where: { stateCode } }))) {
      await db.gstStateGroup.create({ data: { stateCode, groupCode, effectiveFrom: "2020-01-01", source: "Illustrative — verify (Rules Spec C7)" } });
    }
  }
  for (const [family, items] of Object.entries(CHECKLISTS)) {
    const code = `FAMILY_${family}`;
    if (!(await db.checklistTemplate.findUnique({ where: { code } }))) {
      await db.checklistTemplate.create({ data: { code, name: `Default checklist ${family}`, items: { create: items.map((label, i) => ({ label, sortOrder: i, keywords: label.toLowerCase() })) } } });
    }
    await db.stageTemplateFamily.updateMany({ where: { code: family, checklistTemplateCode: null }, data: { checklistTemplateCode: code } });
  }
  for (const [date, name] of NATIONAL_HOLIDAYS) {
    await db.holiday.upsert({ where: { date_stateCode: { date, stateCode: "-" } }, create: { date, name, kind: "NATIONAL" }, update: {} });
  }

  // Phase 3 reference data (idempotent; statutory rows Unverified). Order matters: firm-only compliance
  // types (collab) build on the compliance master seeded above.
  const p3 = {
    billing: await import("./phase3/billing"), crm: await import("./phase3/crm"), payroll: await import("./phase3/payroll"),
    hr: await import("./phase3/hr"), dms: await import("./phase3/dms"), collab: await import("./phase3/collab"),
  };
  await p3.billing.seedBillingReference(db);
  await p3.crm.seedCrmReference(db);
  await p3.payroll.seedPayrollReference(db);
  await p3.hr.seedHrReference(db);
  await p3.dms.seedDmsReference(db);
  await p3.collab.seedCollabReference(db);

  // Phase 4: reminder schedules (firm placeholders).
  const p4 = { portal: await import("./phase4/portal") };
  await p4.portal.seedPortalReference(db);
}
