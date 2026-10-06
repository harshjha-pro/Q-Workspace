import { z } from "zod";

/** Enum-like string unions shared by Zod validation, services and UI (decisions D-03). */
export const ROLES = ["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN", "HR_ADMIN", "PORTAL"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES = ROLES.filter((r) => r !== "PORTAL") as Exclude<Role, "PORTAL">[];
export const ROLE_LABELS: Record<Role, string> = {
  PARTNER: "Partner",
  MANAGER: "Manager",
  STAFF: "Staff / Senior",
  ARTICLE: "Article Assistant / Trainee",
  PRACTICE_ADMIN: "Practice Admin",
  HR_ADMIN: "HR / Payroll Admin",
  PORTAL: "Client Portal User",
};
/** Spec 3.9: 2FA mandatory for these roles. */
export const MANDATORY_2FA_ROLES: readonly Role[] = ["PARTNER", "MANAGER", "PRACTICE_ADMIN", "HR_ADMIN"];

export const CONSTITUTIONS = [
  "INDIVIDUAL", "HUF", "PROPRIETORSHIP", "PARTNERSHIP", "LLP", "PRIVATE_COMPANY", "PUBLIC_COMPANY", "TRUST", "SOCIETY", "OTHER",
] as const;
export type Constitution = (typeof CONSTITUTIONS)[number];
export const CONSTITUTION_LABELS: Record<Constitution, string> = {
  INDIVIDUAL: "Individual", HUF: "HUF", PROPRIETORSHIP: "Proprietorship", PARTNERSHIP: "Partnership Firm", LLP: "LLP",
  PRIVATE_COMPANY: "Private Company", PUBLIC_COMPANY: "Public Company", TRUST: "Trust", SOCIETY: "Society", OTHER: "Other",
};
export const isCompany = (c: string) => c === "PRIVATE_COMPANY" || c === "PUBLIC_COMPANY";

export const CLIENT_STATUSES = ["ACTIVE", "DORMANT", "DISCONTINUED", "DISCONTINUED_CLOSED"] as const;
export const GST_FREQUENCIES = ["MONTHLY", "QRMP", "COMPOSITION"] as const;
export const LOCATIONS = ["OFFICE", "CLIENT_SITE", "WFH"] as const;
export const LOCATION_LABELS: Record<(typeof LOCATIONS)[number], string> = { OFFICE: "Office", CLIENT_SITE: "Client Site", WFH: "Work From Home" };

export const SERVICE_LINES = ["ACCOUNTING", "AUDIT", "DIRECT_TAX", "GST", "COMPANY_LAW", "ADVISORY"] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];
export const SERVICE_LINE_LABELS: Record<ServiceLine, string> = {
  ACCOUNTING: "Accounting", AUDIT: "Audit & Assurance", DIRECT_TAX: "Direct Tax", GST: "Indirect Tax (GST)",
  COMPANY_LAW: "Company Law & Secretarial", ADVISORY: "Advisory & Other",
};
export const FEE_BASES = ["FIXED", "RETAINER", "TIME"] as const;
export const FEE_BASIS_LABELS: Record<(typeof FEE_BASES)[number], string> = { FIXED: "Fixed", RETAINER: "Recurring retainer", TIME: "Time-based" };
export const ENGAGEMENT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const RECURRENCES = ["RECURRING", "ONE_TIME"] as const;

export const TASK_STATUSES = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW", "FILED", "FILED_LATE", "NOT_APPLICABLE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Client applicability flags held as columns on Client (GST flags live on GSTIN). */
export const CLIENT_FLAGS = [
  "tdsApplicable", "tdsSalary", "tdsNonSalary", "tdsNonResident", "tcsApplicable", "taxAuditApplicable",
  "transferPricingApplicable", "statutoryAuditApplicable", "advanceTaxApplicable", "pfApplicable", "esiApplicable",
  "msmeApplicable", "dpt3Applicable",
] as const;
export type ClientFlag = (typeof CLIENT_FLAGS)[number];

export const zRole = z.enum(ROLES);
export const zStaffRole = z.enum(["PARTNER", "MANAGER", "STAFF", "ARTICLE", "PRACTICE_ADMIN", "HR_ADMIN"]);
export const zConstitution = z.enum(CONSTITUTIONS);
export const zServiceLine = z.enum(SERVICE_LINES);
export const zIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

/** Format validators for practitioner identifiers (brief §12: fake but correctly formatted). */
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const DIN_RE = /^[0-9]{8}$/;
export const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const LLPIN_RE = /^[A-Z]{3}-[0-9]{4}$/;
export const UDIN_RE = /^[0-9]{8}[A-Z0-9]{6}[0-9A-Z]{4}$/;
export const UDYAM_RE = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
