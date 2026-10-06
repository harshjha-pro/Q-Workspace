import { MATRIX, type Capability, type Scope } from "./matrix";
import type { Actor } from "./actor";
import { forbidden } from "../lib/errors";

/** The scope a capability grants this actor. The SYSTEM actor (scheduled jobs) has firm scope. */
export function scopeOf(actor: Actor, cap: Capability): Scope {
  if (actor.kind === "SYSTEM") return "firm";
  return MATRIX[cap][actor.role];
}

/** True if the actor holds the capability at any scope (used for navigation and buttons). */
export function can(actor: Actor, cap: Capability): boolean {
  if (actor.kind === "SYSTEM") return true;
  const scope = scopeOf(actor, cap);
  if (scope === "none") return false;
  // review.check for STAFF needs the Senior flag (permissions.md invariant 3).
  if (cap === "review.check" && actor.kind === "USER" && actor.role === "STAFF" && !actor.isSenior) return false;
  return true;
}

/** Throws FORBIDDEN unless the actor holds the capability. Record-level checks use scopeWhere(). */
export function authorize(actor: Actor, cap: Capability): Scope {
  if (!can(actor, cap)) throw forbidden();
  return scopeOf(actor, cap);
}

export function isReadOnlyScope(scope: Scope): boolean {
  return scope === "firm_read" || scope === "team_read";
}

export function requireStaff(actor: Actor): asserts actor is Extract<Actor, { kind: "USER" }> {
  if (actor.kind !== "USER") throw forbidden();
}
