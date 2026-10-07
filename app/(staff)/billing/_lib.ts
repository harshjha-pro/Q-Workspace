import { db } from "@/server/lib/db";
import { authorize } from "@/server/permissions/guards";
import { clientWhere } from "@/server/permissions/scopes";
import type { Actor } from "@/server/permissions/actor";
import type { Capability } from "@/server/permissions/matrix";

/** Clients the actor may act on under a billing capability, for pickers (closed clients left out). */
export async function billingClientOptions(actor: Actor, cap: Capability) {
  const rows = await db().client.findMany({
    where: { AND: [clientWhere(actor, authorize(actor, cap)), { status: { not: "DISCONTINUED_CLOSED" } }] },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  return rows.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }));
}
