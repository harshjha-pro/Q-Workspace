import type { Tx } from "../lib/db";
import { db } from "../lib/db";
import { actorRef, type Actor } from "../permissions/actor";

/** Fields never copied into the audit trail in readable form. */
const REDACT = /(Enc|Hash|password|secret|token)$/i;

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "updatedAt" || k === "createdAt") continue;
      out[k] = REDACT.test(k) ? (v ? "[redacted]" : v) : sanitize(v);
    }
    return out;
  }
  return value;
}

/** Only the fields that changed (both sides), so the log stays readable. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return { before: sanitize(before), after: sanitize(after) };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const sb = sanitize(before) as Record<string, unknown>;
  const sa = sanitize(after) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(sb), ...Object.keys(sa)])) {
    if (JSON.stringify(sb[key]) !== JSON.stringify(sa[key])) {
      b[key] = sb[key];
      a[key] = sa[key];
    }
  }
  return { before: b, after: a };
}

export type AuditInput = {
  entityType: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  lockState?: string | null;
};

/**
 * Append one audit row inside the caller's transaction (P1-05). There is deliberately
 * no update or delete function for AuditLog anywhere in the codebase.
 */
export async function writeAudit(tx: Tx, actor: Actor, input: AuditInput) {
  const { before, after } = diff(input.before ?? null, input.after ?? null);
  const ref = actorRef(actor);
  await tx.auditLog.create({
    data: {
      ...ref,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeJson: before == null ? null : JSON.stringify(before),
      afterJson: after == null ? null : JSON.stringify(after),
      reason: input.reason ?? "",
      lockState: input.lockState ?? null,
      ip: actor.kind === "SYSTEM" ? null : (actor.ip ?? null),
      createdById: ref.actorUserId ?? ref.actorPortalUserId,
    },
  });
}

export type SensitiveKind = "CREDENTIAL" | "FINANCIALS" | "NOTICE" | "SALARY" | "BILLING";

/** Log every view of credentials, financials, notices, salary and billing (spec 3.9, P1-09). */
export async function logSensitiveView(
  actor: Actor,
  kind: SensitiveKind,
  entityType: string,
  entityId: string,
  detail = "",
  tx?: Tx,
) {
  const ref = actorRef(actor);
  await (tx ?? db()).sensitiveViewLog.create({
    data: {
      actorUserId: ref.actorUserId,
      actorPortalUserId: ref.actorPortalUserId,
      kind,
      entityType,
      entityId,
      detail,
      ip: actor.kind === "SYSTEM" ? null : (actor.ip ?? null),
      createdById: ref.actorUserId ?? ref.actorPortalUserId,
    },
  });
}
