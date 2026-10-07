import { db, type Tx } from "../../lib/db";
import { forbidden, notFound } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { clientWhere, assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import type { Capability } from "../../permissions/matrix";
import { getSetting } from "../settings/service";
import { SERVICE_LINES } from "../../domain/enums";

export const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

/** Billing screens are staff-only; portal invoice views need their own DTO (permissions.md invariant 7). */
export function staffOnly(actor: Actor) {
  if (actor.kind === "PORTAL") throw forbidden();
}

/** Capability check for billing; portal actors are always refused here. */
export function authorizeBilling(actor: Actor, cap: Capability) {
  staffOnly(actor);
  return authorize(actor, cap);
}

/** Client ids visible under billing.view (null = all). Managers get their team's clients, read-only. */
export async function billingClientIds(actor: Actor): Promise<string[] | null> {
  const scope = authorizeBilling(actor, "billing.view");
  if (scope === "firm" || scope === "firm_read" || actor.kind === "SYSTEM") return null;
  const rows = await db().client.findMany({ where: clientWhere(actor, scope), select: { id: true } });
  return rows.map((r) => r.id);
}
export const inClients = (ids: string[] | null) => (ids === null ? {} : { clientId: { in: ids } });

/** Realization and internal cost are for Partners / Practice Admin only (firm scope on billing.view). */
export function canSeeCosts(actor: Actor) {
  if (actor.kind === "SYSTEM") return true;
  if (actor.kind === "PORTAL") return false;
  try {
    return authorize(actor, "billing.view") === "firm";
  } catch {
    return false;
  }
}

export async function assertInvoiceAccess(actor: Actor, cap: Capability, invoiceId: string) {
  staffOnly(actor);
  const inv = await db().invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound("Invoice");
  await assertClientAccess(actor, cap, inv.clientId);
  return inv;
}

// ---------------------------------------------------------------------------
// Fields the frozen schema lacks are kept as JSON in the existing `notes` columns.
// ---------------------------------------------------------------------------

export type InvoiceMeta = {
  text?: string;
  recipientGstin?: string;
  ackNo?: string;
  ackDate?: string;
  cancelReason?: string;
  retainerPeriod?: string;
  periodFrom?: string;
  periodTo?: string;
};
export type ReceiptMeta = { text?: string; tdsPaise?: number; reversedAt?: string; reversedReason?: string; reversedById?: string };

export function readMeta<T extends { text?: string }>(notes: string | null | undefined): T {
  const s = (notes ?? "").trim();
  if (s.startsWith("{")) {
    try {
      const v = JSON.parse(s) as unknown;
      if (v && typeof v === "object") return v as T;
    } catch {
      /* plain text that happens to start with "{" */
    }
  }
  return (s ? { text: s } : {}) as T;
}
export function writeMeta(meta: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return Object.keys(clean).length ? JSON.stringify(clean) : "";
}
export const tdsOf = (r: { notes: string }) => readMeta<ReceiptMeta>(r.notes).tdsPaise ?? 0;
export const isReversed = (r: { notes: string }) => !!readMeta<ReceiptMeta>(r.notes).reversedAt;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  RAISED: "Invoice raised",
  PARTLY_RECEIVED: "Partly received",
  FULLY_RECEIVED: "Fully received",
  WRITTEN_OFF: "Written off",
  CANCELLED: "Cancelled",
};
export const OPEN_STATUSES = ["RAISED", "PARTLY_RECEIVED"];
export const ISSUED_STATUSES = ["RAISED", "PARTLY_RECEIVED", "FULLY_RECEIVED", "WRITTEN_OFF"];

export const outstandingOf = (i: { totalPaise: number; receivedPaise: number; writtenOffPaise: number }) =>
  Math.max(0, i.totalPaise - i.receivedPaise - i.writtenOffPaise);

/** Spec 7.1 statuses from the settled amounts (receipts incl. client TDS, approved write-offs). */
export function statusFromAmounts(total: number, received: number, writtenOff: number): string {
  if (received + writtenOff >= total) return writtenOff > 0 ? "WRITTEN_OFF" : "FULLY_RECEIVED";
  if (received > 0 || writtenOff > 0) return "PARTLY_RECEIVED";
  return "RAISED";
}

/**
 * Re-derive received / written-off / status of an issued invoice from its allocations and approved
 * write-offs, and move linked disbursements to Recovered (or back) when it is (no longer) fully received.
 */
export async function recomputeInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!ISSUED_STATUSES.includes(inv.status)) return inv;
  const [alloc, wo] = await Promise.all([
    tx.receiptAllocation.aggregate({ where: { invoiceId }, _sum: { amountPaise: true } }),
    tx.writeOff.aggregate({ where: { invoiceId, status: "APPROVED" }, _sum: { amountPaise: true } }),
  ]);
  const received = alloc._sum.amountPaise ?? 0;
  const writtenOff = wo._sum.amountPaise ?? 0;
  const status = statusFromAmounts(inv.totalPaise, received, writtenOff);
  const updated = await tx.invoice.update({ where: { id: invoiceId }, data: { receivedPaise: received, writtenOffPaise: writtenOff, status } });
  const lineIds = (await tx.invoiceLine.findMany({ where: { invoiceId, disbursementId: { not: null } }, select: { id: true } })).map((l) => l.id);
  if (lineIds.length) {
    await tx.disbursement.updateMany({
      where: { invoiceLineId: { in: lineIds } },
      data: { status: status === "FULLY_RECEIVED" ? "RECOVERED" : "ADDED_TO_INVOICE" },
    });
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Settings (registered centrally; these fallbacks apply until then). All Unverified (Q-18).
// ---------------------------------------------------------------------------

/** Unverified defaults — the firm must confirm SAC codes per service line (Q-18). */
export const DEFAULT_SAC: Record<string, string> = {
  ACCOUNTING: "998222",
  AUDIT: "998221",
  DIRECT_TAX: "998231",
  GST: "998231",
  COMPANY_LAW: "998216",
  ADVISORY: "998311",
};

export async function billingSettings() {
  const [gstRateBp, sacMap, defaultSac, prefix, terms, unbilledDays, reminderDays, retainerDivisor, retainerDay] = await Promise.all([
    getSetting<number>("billing.gstRateBp", 1800),
    getSetting<Record<string, string>>("billing.sacByServiceLine", DEFAULT_SAC),
    getSetting<string>("billing.defaultSac", "998231"),
    getSetting<string>("billing.invoicePrefix", "QI"),
    getSetting<number>("billing.paymentTermsDays", 15),
    getSetting<number>("billing.unbilledAlertDays", 30),
    getSetting<number[]>("billing.reminderDays", [15, 30, 60]),
    getSetting<number>("billing.retainerMonthlyDivisor", 12),
    getSetting<number>("billing.retainerDraftDay", 1),
  ]);
  return {
    gstRateBp: Number.isInteger(gstRateBp) && gstRateBp >= 0 ? gstRateBp : 1800,
    sacFor: (serviceLine: string | null | undefined) => (serviceLine && sacMap?.[serviceLine]) || (serviceLine && DEFAULT_SAC[serviceLine]) || defaultSac,
    prefix: typeof prefix === "string" && /^[A-Z0-9-]{1,6}$/.test(prefix) ? prefix : "QI",
    paymentTermsDays: Number.isInteger(terms) && terms >= 0 ? terms : 15,
    unbilledAlertDays: Number.isInteger(unbilledDays) && unbilledDays > 0 ? unbilledDays : 30,
    reminderDays: Array.isArray(reminderDays) && reminderDays.every((n) => Number.isInteger(n) && n > 0) ? [...reminderDays].sort((a, b) => a - b) : [15, 30, 60],
    retainerDivisor: Number.isInteger(retainerDivisor) && retainerDivisor > 0 ? retainerDivisor : 12,
    retainerDay: Number.isInteger(retainerDay) && retainerDay >= 1 && retainerDay <= 28 ? retainerDay : 1,
  };
}
export const SERVICE_LINE_KEYS = SERVICE_LINES;

/** Name lookups for rows that carry only ids. */
export async function nameMaps(clientIds: (string | null | undefined)[], userIds: (string | null | undefined)[] = []) {
  const c = [...new Set(clientIds.filter((x): x is string => !!x))];
  const u = [...new Set(userIds.filter((x): x is string => !!x))];
  const [clients, users] = await Promise.all([
    c.length ? db().client.findMany({ where: { id: { in: c } }, select: { id: true, name: true, code: true, partnerId: true } }) : [],
    u.length ? db().user.findMany({ where: { id: { in: u } }, select: { id: true, displayName: true } }) : [],
  ]);
  return { clients: new Map(clients.map((x) => [x.id, x])), users: new Map(users.map((x) => [x.id, x.displayName])) };
}
