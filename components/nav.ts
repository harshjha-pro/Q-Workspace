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
  { href: "/leave", label: "Leave", section: "Work", cap: "leave.apply" },
  { href: "/notifications", label: "Notifications", section: "Work" },
  { href: "/clients", label: "Clients", section: "Practice", cap: "client.view" },
  { href: "/engagements", label: "Engagements", section: "Practice", cap: "engagement.view" },
  { href: "/notices", label: "Notices", section: "Registers", cap: "notice.view" },
  { href: "/registers/dsc", label: "DSC register", section: "Registers", cap: "dsc.view" },
  { href: "/registers/udin", label: "UDIN register", section: "Registers", cap: "udin.record" },
  { href: "/registers/inward", label: "Inward / outward", section: "Registers", cap: "inwardOutward.manage" },
  { href: "/exports", label: "Exports", section: "Registers", cap: "export.run" },
  { href: "/people", label: "People", section: "People", check: canListPeople },
  { href: "/me", label: "My profile", section: "People" },
  { href: "/admin/compliance", label: "Due-date master", section: "Admin", cap: "dueDateMaster.manage" },
  { href: "/admin/templates", label: "Stage templates", section: "Admin", cap: "templates.approve" },
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
