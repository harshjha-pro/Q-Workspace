import { db } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import type { PortalActor } from "../../permissions/actor";

/**
 * Portal reads (P4-02). Every function takes the PortalActor and narrows to `actor.clientIds`, which the
 * session re-reads from PortalUserClient on every request — removing a link takes effect at once.
 */
export async function portalClients(actor: PortalActor) {
  authorize(actor, "portal.use");
  return db().client.findMany({ where: { id: { in: actor.clientIds }, isFirm: false }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
}

/** Throws unless the client is one of the portal user's own. */
export function assertPortalClient(actor: PortalActor, clientId: string) {
  authorize(actor, "portal.use");
  if (!actor.clientIds.includes(clientId)) throw forbidden();
}
