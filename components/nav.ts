import type { Capability } from "@/server/permissions/matrix";
import type { Actor } from "@/server/permissions/actor";
import { can, scopeOf } from "@/server/permissions/guards";

export type NavItem = { href: string; label: string; section: string };
type NavDef = NavItem & { cap?: Capability; anyOf?: Capability[]; check?: (a: Actor) => boolean };

/**
 * Role-based navigation (spec 9.3). Built from the permission matrix so the menu can never
 * offer something the server would refuse. Phases add their pages here.
 */
const NAV: NavDef[] = [
  { href: "/", label: "Home", section: "Work" },
  { href: "/work", label: "Add work", section: "Work", cap: "work.log" },
  { href: "/work/week", label: "My week", section: "Work", cap: "work.log" },
  { href: "/tasks", label: "Tasks", section: "Work", cap: "task.view" },
  { href: "/this-week", label: "This week", section: "Work", cap: "task.view" },
  { href: "/calendar", label: "Calendar", section: "Work", cap: "task.view" },
  { href: "/firm-compliance", label: "Firm's own compliance", section: "Work", anyOf: ["dueDateMaster.manage", "signoff.final"] },
  { href: "/leave", label: "Leave", section: "Work", cap: "leave.apply" },
  { href: "/notifications", label: "Notifications", section: "Work" },
  { href: "/clients", label: "Clients", section: "Practice", cap: "client.view" },
  { href: "/engagements", label: "Engagements", section: "Practice", cap: "engagement.view" },
  { href: "/notices", label: "Notices", section: "Registers", cap: "notice.view" },
  { href: "/registers/dsc", label: "DSC register", section: "Registers", cap: "dsc.view" },
  { href: "/registers/udin", label: "UDIN register", section: "Registers", cap: "udin.record" },
  { href: "/registers/inward", label: "Inward / outward", section: "Registers", cap: "inwardOutward.manage" },
  { href: "/exports", label: "Exports", section: "Registers", cap: "export.run" },
  { href: "/documents", label: "Documents", section: "Registers", cap: "dms.view" },
  { href: "/billing", label: "Billing", section: "Billing", cap: "billing.view" },
  { href: "/billing/invoices", label: "Invoices", section: "Billing", cap: "billing.view" },
  { href: "/billing/receipts", label: "Receipts", section: "Billing", cap: "billing.view" },
  { href: "/billing/disbursements", label: "Disbursements", section: "Billing", cap: "billing.view" },
  { href: "/crm/leads", label: "Leads", section: "Clients & growth", cap: "crm.view" },
  { href: "/crm/opportunities", label: "Opportunities & renewals", section: "Clients & growth", cap: "crm.view" },
  { href: "/crm/feedback", label: "Client feedback", section: "Clients & growth", cap: "crm.view" },
  { href: "/crm/campaigns", label: "Client communications", section: "Clients & growth", cap: "campaign.manage" },
  { href: "/meetings", label: "Client meetings", section: "Clients & growth", cap: "meetings.manage" },
  { href: "/people", label: "People", section: "People", check: canListPeople },
  { href: "/me", label: "My profile", section: "People" },
  { href: "/me/payslips", label: "Payslips & tax", section: "People", cap: "leave.apply" },
  { href: "/me/expenses", label: "Expense claims", section: "People", cap: "expense.claim" },
  { href: "/me/articleship", label: "My articleship", section: "People", check: (a) => a.kind === "USER" && a.role === "ARTICLE" },
  { href: "/me/growth", label: "Goals, CPE & skills", section: "People", cap: "leave.apply" },
  { href: "/applause", label: "Applause", section: "People", cap: "leave.apply" },
  { href: "/hr", label: "HR", section: "HR", anyOf: ["hr.records.manage", "payroll.prepare", "payroll.approve"] },
  { href: "/hr/payroll", label: "Payroll", section: "HR", anyOf: ["payroll.prepare", "payroll.approve"] },
  { href: "/hr/attendance", label: "Attendance", section: "HR", anyOf: ["hr.records.view", "attendance.regularise.approve"] },
  { href: "/hr/leave-policies", label: "Leave policies", section: "HR", cap: "hr.records.manage" },
  { href: "/hr/cost-rates", label: "Cost rates", section: "HR", anyOf: ["salary.revise.approve", "payroll.prepare"] },
  { href: "/hr/expenses", label: "Expense approvals", section: "HR", cap: "expense.approve" },
  { href: "/hr/recruitment", label: "Recruitment", section: "HR", cap: "recruitment.manage" },
  { href: "/hr/appraisals", label: "Appraisals", section: "HR", anyOf: ["appraisal.write", "appraisal.moderate"] },
  { href: "/hr/articleship", label: "Articleship", section: "HR", cap: "articleship.view" },
  { href: "/hr/assets", label: "Assets", section: "HR", cap: "assets.manage" },
  { href: "/hr/exits", label: "Exits", section: "HR", cap: "exit.manage" },
  { href: "/hr/letters", label: "HR letters & policies", section: "HR", cap: "hr.records.manage" },
  { href: "/knowledge", label: "Knowledge base", section: "Help" },
  { href: "/helpdesk", label: "Helpdesk", section: "Help", cap: "helpdesk.raise" },
  { href: "/admin/compliance", label: "Due-date master", section: "Admin", cap: "dueDateMaster.manage" },
  { href: "/qc", label: "Quality control", section: "Admin", anyOf: ["qc.manage", "qc.declare"] },
  { href: "/admin/retention", label: "Retention & purge", section: "Admin", cap: "settings.manage" },
  { href: "/archive", label: "Archive", section: "Admin", anyOf: ["engagement.view"] },
  { href: "/admin/doc-templates", label: "Document templates", section: "Admin", cap: "templates.manage" },
  { href: "/admin/portal-users", label: "Portal users", section: "Admin", cap: "portal.accounts.manage" },
  { href: "/admin/firm", label: "Firm profile", section: "Admin", cap: "settings.manage" },
  { href: "/admin/templates", label: "Stage templates", section: "Admin", check: (a) => can(a, "templates.manage") && a.kind === "USER" && a.role !== "HR_ADMIN" },
  { href: "/admin/teams", label: "Client teams", section: "Admin", cap: "users.manage" },
  { href: "/admin/import", label: "Import", section: "Admin", cap: "import.run" },
  { href: "/admin/backups", label: "Backup & restore", section: "Admin", cap: "backup.restore.request" },
  { href: "/admin/jobs", label: "Scheduled jobs", section: "Admin", cap: "jobs.runNow" },
  { href: "/admin/audit", label: "Audit trail", section: "Admin", cap: "audit.search" },
  { href: "/admin/settings", label: "Settings", section: "Admin", cap: "settings.manage" },
  { href: "/admin/system-log", label: "System log", section: "Admin", cap: "systemLog.view" },
];

/** People list: admins, HR and anyone who can see more than their own record (Manager → team). */
export function canListPeople(actor: Actor) {
  return can(actor, "users.manage") || !["none", "self"].includes(scopeOf(actor, "hr.records.view"));
}

export function navFor(actor: Actor): NavItem[] {
  return NAV.filter((n) => (n.check ? n.check(actor) : n.cap ? can(actor, n.cap) : n.anyOf ? n.anyOf.some((c) => can(actor, c)) : true)).map(({ href, label, section }) => ({ href, label, section }));
}
