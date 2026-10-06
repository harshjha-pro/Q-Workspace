/**
 * Client-change hook: a flag / GSTIN / director / status / event change regenerates that client's
 * compliance tasks immediately. Extra listeners (tests, later modules) can subscribe.
 */
export type ApplicabilityReason =
  | "CLIENT_CREATED"
  | "FLAGS_CHANGED"
  | "STATUS_CHANGED"
  | "CONSTITUTION_CHANGED"
  | "GSTIN_CHANGED"
  | "DIRECTORS_CHANGED"
  | "PT_CHANGED"
  | "EVENT_DATE_CHANGED";

type Listener = (clientId: string, reason: ApplicabilityReason) => Promise<void>;
const g = globalThis as unknown as { __qepexApplicabilityListeners?: Listener[] };
const listeners = (g.__qepexApplicabilityListeners ??= []);

export function onApplicabilityChanged(listener: Listener) {
  listeners.push(listener);
}

/**
 * Called after a client change is committed. Regenerates that client's compliance tasks at once
 * (Rules Spec 3.1: event-triggered, not only nightly). A failure here never undoes the client change;
 * it is logged and the nightly job retries.
 */
export async function emitApplicabilityChanged(clientId: string, reason: ApplicabilityReason) {
  for (const l of listeners) await l(clientId, reason);
  try {
    const { syncClientCompliance } = await import("../compliance/sync");
    await syncClientCompliance(clientId);
  } catch (e) {
    const { logger } = await import("../../lib/logger");
    logger().error({ clientId, reason, err: e instanceof Error ? e.message : String(e) }, "compliance sync after client change failed");
  }
}
