/**
 * Client-change hook. Phase 1 has no task generation yet; in Phase 2 the compliance
 * service registers a listener here so a flag/GSTIN/director/status change regenerates
 * tasks for that client immediately (Rules Spec 3.1), not only overnight.
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

export async function emitApplicabilityChanged(clientId: string, reason: ApplicabilityReason) {
  for (const l of listeners) await l(clientId, reason);
}
