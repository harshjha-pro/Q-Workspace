import { db } from "@/server/lib/db";
import { authorize } from "@/server/permissions/guards";
import { clientWhere } from "@/server/permissions/scopes";
import type { Actor } from "@/server/permissions/actor";
import type { Capability } from "@/server/permissions/matrix";

export type Option = { id: string; name: string };

/** Clients the actor may act on under a capability (closed clients left out), for pickers. */
export async function clientOptions(actor: Actor, cap: Capability): Promise<Option[]> {
  const rows = await db().client.findMany({
    where: { AND: [clientWhere(actor, authorize(actor, cap)), { status: { not: "DISCONTINUED_CLOSED" } }] },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ id: c.id, name: `${c.name} (${c.code})` }));
}

/** Active people for assignee / custodian pickers. */
export async function peopleOptions(roles?: string[]): Promise<(Option & { role: string })[]> {
  const rows = await db().user.findMany({
    where: { active: true, isSystem: false, ...(roles ? { role: { in: roles } } : {}) },
    select: { id: true, displayName: true, role: true },
    orderBy: { displayName: "asc" },
  });
  return rows.map((u) => ({ id: u.id, name: u.displayName, role: u.role }));
}

/** id → client name for rows that carry only a clientId. */
export async function clientNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await db().client.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((c) => [c.id, c.name]));
}

/** id → display name for rows that carry only a userId. */
export async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await db().user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
  return new Map(rows.map((u) => [u.id, u.displayName]));
}

/** Words for enum values: "TDS_TRACES" → "TDS TRACES", "OFFICE" → "Office". */
export function words(v: string, capitalise = false): string {
  const s = v.replace(/_/g, " ").toLowerCase();
  return capitalise ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
