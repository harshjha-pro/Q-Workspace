import { db } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import { clientWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import type { Capability } from "../../permissions/matrix";

export const idOf = (a: Actor) => (a.kind === "USER" ? a.userId : null);

/**
 * Client ids the actor may see under a capability, or null for "all".
 * Registers hang off clients, so record-level scope reduces to the client scope.
 */
export async function visibleClientIds(actor: Actor, cap: Capability): Promise<string[] | null> {
  const scope = authorize(actor, cap);
  if (scope === "firm" || scope === "firm_read" || actor.kind === "SYSTEM") return null;
  const rows = await db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } });
  return rows.map((r) => r.id);
}

export const inClients = (ids: string[] | null) => (ids === null ? {} : { clientId: { in: ids } });

/** Read-only scopes (team_read / firm_read) may list but never change. */
export function writable(actor: Actor, cap: Capability) {
  const s = authorize(actor, cap);
  return !s.endsWith("_read");
}
