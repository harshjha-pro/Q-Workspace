import type { Role } from "../domain/enums";

/** Who is acting. Resolved on every request from the session + a DB check (decisions D-09). */
export type StaffActor = {
  kind: "USER";
  userId: string;
  role: Exclude<Role, "PORTAL">;
  isSenior: boolean;
  displayName: string;
  sessionId?: string;
  ip?: string;
};
export type PortalActor = {
  kind: "PORTAL";
  portalUserId: string;
  role: "PORTAL";
  clientIds: string[];
  displayName: string;
  sessionId?: string;
  ip?: string;
};
export type SystemActor = { kind: "SYSTEM"; role: "SYSTEM"; userId: string; displayName: "System" };
export type Actor = StaffActor | PortalActor | SystemActor;

export const SYSTEM_USER_ID = "system";
export const systemActor = (): SystemActor => ({ kind: "SYSTEM", role: "SYSTEM", userId: SYSTEM_USER_ID, displayName: "System" });

export const actorUserId = (a: Actor): string | null => (a.kind === "PORTAL" ? null : a.userId);
export const actorRef = (a: Actor) =>
  a.kind === "PORTAL"
    ? { actorType: "PORTAL", actorUserId: null, actorPortalUserId: a.portalUserId }
    : { actorType: a.kind === "SYSTEM" ? "SYSTEM" : "USER", actorUserId: a.userId, actorPortalUserId: null };
