/**
 * Central permission matrix (Product Spec 3.8, brief §7). Single source of truth:
 * every service call checks it via authorize()/scopeWhere(); the UI only mirrors it.
 * Mirrors docs/permissions.md — change both together.
 */
import type { Role } from "../domain/enums";

export type Scope =
  | "none" | "self" | "assigned" | "team" | "team_read"
  | "firm" | "firm_read" | "granted" | "portal_own";

type Row = Record<Role, Scope>;
const row = (
  PARTNER: Scope, MANAGER: Scope, STAFF: Scope, ARTICLE: Scope,
  PRACTICE_ADMIN: Scope, HR_ADMIN: Scope, PORTAL: Scope,
): Row => ({ PARTNER, MANAGER, STAFF, ARTICLE, PRACTICE_ADMIN, HR_ADMIN, PORTAL });

//                                     PARTNER      MANAGER      STAFF        ARTICLE      PR_ADMIN     HR_ADMIN     PORTAL
export const MATRIX = {
  // ---- Work & time (spec 3.8 "Log own work", View others' entries)
  "work.log":                     row("self",      "self",      "self",      "self",      "self",      "self",      "none"),
  "work.viewOthers":              row("firm",      "team",      "none",      "none",      "firm_read", "none",      "none"),
  "work.correction.approve":      row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),
  "work.lock.extend":             row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),

  // ---- Clients, engagements, tasks
  "client.view":                  row("firm",      "team",      "assigned",  "assigned",  "firm",      "none",      "portal_own"),
  "client.manage":                row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),
  "client.flags.edit":            row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),
  "engagement.view":              row("firm",      "team",      "assigned",  "assigned",  "firm_read", "none",      "portal_own"),
  "engagement.manage":            row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),
  "task.view":                    row("firm",      "team",      "assigned",  "assigned",  "firm_read", "none",      "portal_own"),
  "task.work":                    row("firm",      "team",      "assigned",  "assigned",  "none",      "none",      "none"),   // stage moves, pending, outcome
  "task.recordFiling":            row("firm",      "team",      "assigned",  "assigned",  "none",      "none",      "none"),
  "task.bulk":                    row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),   // reassign, change checker, NA
  "task.notApplicable":           row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),
  "task.regenerate":              row("none",      "none",      "none",      "none",      "firm",      "none",      "none"),   // Rules Spec 3.3: Admin only

  // ---- Review & sign-off (3.8 "Review (checker)", "Final sign-off / UDIN")
  "review.check":                 row("firm",      "team",      "assigned",  "none",      "none",      "none",      "none"),   // STAFF only if isSenior
  "signoff.final":                row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "udin.record":                  row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "eqr.perform":                  row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),

  // ---- Compliance master
  "dueDateMaster.manage":         row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "extension.publish":            row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "settings.manage":              row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "holidays.manage":              row("firm",      "none",      "none",      "none",      "firm",      "firm",      "none"),

  // ---- Registers
  "notice.view":                  row("firm",      "team",      "assigned",  "assigned",  "firm_read", "none",      "none"),
  "notice.manage":                row("firm",      "team",      "assigned",  "assigned",  "none",      "none",      "none"),
  "dsc.view":                     row("firm",      "team_read", "assigned",  "assigned",  "firm",      "none",      "none"),
  "dsc.manage":                   row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "dsc.movement.record":          row("firm",      "team",      "assigned",  "assigned",  "firm",      "none",      "none"),
  "inwardOutward.manage":         row("firm",      "team",      "assigned",  "assigned",  "firm",      "none",      "none"),
  "vault.view":                   row("firm",      "team",      "granted",   "granted",   "firm",      "none",      "none"),
  "vault.manage":                 row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),
  "vault.grant":                  row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),

  // ---- Billing (7.1: never in Staff/Article screens; Manager read-only own clients)
  "billing.view":                 row("firm",      "team_read", "none",      "none",      "firm",      "none",      "portal_own"),
  "billing.raise":                row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "billing.receipt.record":       row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "billing.approve":              row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),   // write-offs, retainer drafts, chargeable flags
  "disbursement.manage":          row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),

  // ---- CRM
  "crm.view":                     row("firm",      "team",      "assigned",  "none",      "firm",      "none",      "none"),
  "crm.manage":                   row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),
  "proposal.approve":             row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "conflictCheck.decide":         row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "campaign.manage":              row("firm",      "team",      "none",      "none",      "firm",      "none",      "none"),

  // ---- HR (salary columns are a separate capability)
  "hr.records.view":              row("firm",      "team",      "self",      "self",      "none",      "firm",      "none"),
  "hr.records.manage":            row("none",      "none",      "none",      "none",      "none",      "firm",      "none"),
  "salary.view":                  row("firm",      "self",      "self",      "self",      "self",      "firm",      "none"),
  "salary.revise.approve":        row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "payroll.prepare":              row("none",      "none",      "none",      "none",      "none",      "firm",      "none"),
  "payroll.approve":              row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "leave.apply":                  row("self",      "self",      "self",      "self",      "self",      "self",      "none"),
  "leave.approve":                row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),
  "expense.claim":                row("self",      "self",      "self",      "self",      "self",      "self",      "none"),
  "expense.approve":              row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),
  "attendance.regularise.approve":row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),
  "appraisal.write":              row("firm",      "team",      "self",      "self",      "self",      "self",      "none"),   // self = self-review
  "appraisal.moderate":           row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "articleship.view":             row("firm",      "team",      "none",      "self",      "none",      "firm",      "none"),
  "recruitment.manage":           row("firm",      "team_read", "none",      "none",      "none",      "firm",      "none"),
  "assets.manage":                row("firm_read", "none",      "none",      "none",      "none",      "firm",      "none"),
  "exit.manage":                  row("firm",      "team_read", "none",      "none",      "firm_read", "firm",      "none"),
  "users.manage":                 row("firm",      "none",      "none",      "none",      "firm",      "firm",      "none"),   // HR: employee side; PA: logins & teams
  "applause.give":                row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),

  // ---- Analytics (3.8 "Analytics")
  "analytics.personal":           row("self",      "self",      "self",      "self",      "self",      "self",      "none"),
  "analytics.team":               row("firm",      "team",      "none",      "none",      "none",      "none",      "none"),
  "analytics.firm":               row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),   // firm, profitability, CRM, MIS
  "analytics.operational":        row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "analytics.hr":                 row("firm",      "none",      "none",      "none",      "none",      "firm",      "none"),

  // ---- Portal
  "portal.configure":             row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "portal.accounts.manage":       row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "portal.share":                 row("firm",      "team",      "assigned",  "assigned",  "firm",      "none",      "none"),   // share docs, reply to messages
  "portal.use":                   row("none",      "none",      "none",      "none",      "none",      "none",      "portal_own"),

  // ---- Other modules
  "dms.view":                     row("firm",      "team",      "assigned",  "assigned",  "firm_read", "none",      "portal_own"),
  "qc.manage":                    row("firm",      "team_read", "none",      "none",      "none",      "none",      "none"),
  "qc.declare":                   row("self",      "self",      "self",      "self",      "none",      "none",      "none"),   // independence declarations
  "templates.manage":             row("firm",      "none",      "none",      "none",      "firm",      "firm",      "none"),   // HR: HR letters only
  "templates.approve":            row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "knowledge.write":              row("firm",      "team",      "none",      "none",      "firm",      "firm",      "none"),
  "helpdesk.raise":               row("self",      "self",      "self",      "self",      "self",      "self",      "none"),
  "helpdesk.queue":               row("firm",      "none",      "none",      "none",      "firm",      "firm",      "none"),   // HR: HR-query category only
  "meetings.manage":              row("firm",      "team",      "assigned",  "none",      "none",      "none",      "none"),

  // ---- System
  "audit.search":                 row("firm",      "team",      "self",      "self",      "firm",      "none",      "none"),
  "export.run":                   row("firm",      "team",      "self",      "self",      "firm",      "firm",      "none"),
  "import.run":                   row("firm",      "none",      "none",      "none",      "firm",      "firm",      "none"),
  "backup.download":              row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "backup.restore.request":       row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "backup.restore.approve":       row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),
  "jobs.runNow":                  row("firm",      "none",      "none",      "none",      "firm",      "firm",      "none"),   // HR: HR jobs only
  "systemLog.view":               row("firm",      "none",      "none",      "none",      "firm",      "none",      "none"),
  "demo.reset":                   row("firm",      "none",      "none",      "none",      "none",      "none",      "none"),   // demo mode only
} as const satisfies Record<string, Row>;

export type Capability = keyof typeof MATRIX;
