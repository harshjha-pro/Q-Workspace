import { db } from "@/server/lib/db";
import { authorize } from "@/server/permissions/guards";
import { clientWhere } from "@/server/permissions/scopes";
import type { Actor } from "@/server/permissions/actor";
import type { Capability } from "@/server/permissions/matrix";

export type Option = { id: string; name: string };

/** Active Partners and Managers (lead owners). */
export async function ownerOptions(): Promise<Option[]> {
  const rows = await db().user.findMany({ where: { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER"] } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
  return rows.map((u) => ({ id: u.id, name: u.displayName }));
}

/** People who can be put on an engagement team. */
export async function teamOptions(): Promise<Option[]> {
  const rows = await db().user.findMany({ where: { active: true, isSystem: false, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: "asc" } });
  return rows.map((u) => ({ id: u.id, name: `${u.displayName} (${u.role.charAt(0)}${u.role.slice(1).toLowerCase()})` }));
}

/** Clients in the actor's scope under a capability, for pickers. */
export async function clientOptions(actor: Actor, cap: Capability): Promise<Option[]> {
  const rows = await db().client.findMany({
    where: { AND: [clientWhere(actor, authorize(actor, cap)), { status: { not: "DISCONTINUED_CLOSED" }, isFirm: false }] },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ id: c.id, name: `${c.name} (${c.code})` }));
}

export async function stageTemplateOptions(): Promise<Option[]> {
  const rows = await db().stageTemplate.findMany({ where: { active: true }, select: { code: true, name: true }, orderBy: { name: "asc" } });
  return rows.map((t) => ({ id: t.code, name: t.name }));
}

export async function groupOptions(): Promise<Option[]> {
  const rows = await db().clientGroup.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return rows.map((g) => ({ id: g.id, name: g.name }));
}
