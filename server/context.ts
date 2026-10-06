import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSession, type ResolvedSession } from "./services/auth/sessions";
import type { StaffActor } from "./permissions/actor";

/** Session for this request (cached per request). Null when logged out or the session is no longer valid. */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const s = await auth();
  const sid = (s as unknown as { sid?: string } | null)?.sid;
  if (!sid) return null;
  return resolveSession(sid);
});

/**
 * The staff actor for pages and server actions. Redirects to /login when there is no
 * valid session, and to the security page while mandatory 2FA is not yet enrolled
 * (permissions.md invariant 10) or a password change is pending.
 */
export async function requireStaff(opts: { allowPending?: boolean } = {}): Promise<StaffActor> {
  const s = await getSession();
  if (!s || s.actor.kind !== "USER") redirect("/login");
  if (!opts.allowPending && (s.needsTotpEnrolment || s.mustChangePassword)) redirect("/account/security");
  return s.actor;
}
