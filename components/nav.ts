import type { Capability } from "@/server/permissions/matrix";
import type { Actor } from "@/server/permissions/actor";
import { can, scopeOf } from "@/server/permissions/guards";

export type NavItem = { href: string; label: string; section: string };
type NavDef = NavItem & { cap?: Capability; anyOf?: Capability[]; check?: (a: Actor) => boolean };

/**
 * Role-based navigation (spec 9.3). Built from the permission matrix so the menu can never
 * offer something the server would refuse. Only Phase 1 pages are listed; later phases add theirs.
 */
const NAV: NavDef[] = [
  { href: "/", label: "Home", section: "Work" },
  { href: "/clients", label: "Clients", section: "Practice", cap: "client.view" },
  { href: "/engagements", label: "Engagements", section: "Practice", cap: "engagement.view" },
  { href: "/people", label: "People", section: "People", check: canListPeople },
  { href: "/me", label: "My profile", section: "People" },
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
