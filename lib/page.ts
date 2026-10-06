import { notFound, redirect } from "next/navigation";
import { isDomainError } from "@/server/lib/errors";
import { can } from "@/server/permissions/guards";
import type { Actor } from "@/server/permissions/actor";
import type { Capability } from "@/server/permissions/matrix";

/** Page-level guard: send people without the capability to a friendly "no access" page. */
export function requireCap(actor: Actor, cap: Capability) {
  if (!can(actor, cap)) redirect("/denied");
}

/** Run a service read for a page; FORBIDDEN → /denied, NOT_FOUND → 404. */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isDomainError(e) && e.code === "FORBIDDEN") redirect("/denied");
    if (isDomainError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}
