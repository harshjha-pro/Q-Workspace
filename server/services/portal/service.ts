import { db } from "../../lib/db";
import { authorize } from "../../permissions/guards";
import { forbidden } from "../../lib/errors";
import type { PortalActor } from "../../permissions/actor";
import { addDays, formatDate, todayIst } from "../../lib/dates";
import { visibleDocumentWhere } from "../dms/access";

/**
 * Portal reads (P4-02). Every function takes the PortalActor and narrows to `actor.clientIds`, which the
 * session re-reads from PortalUserClient on every request — removing a link takes effect at once.
 * Results are portal DTOs (permissions.md invariant 7): no hours, staff names, internal notes, review
 * points or other clients. Fields are picked one by one, never spread from a row.
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

/** The clients a page shows: one chosen client (checked) or all of the user's. */
export function scopeClients(actor: PortalActor, clientId?: string | null): string[] {
  authorize(actor, "portal.use");
  if (clientId) {
    assertPortalClient(actor, clientId);
    return [clientId];
  }
  return actor.clientIds;
}

// ---------------------------------------------------------------------------------------------------------
// Filings in plain words
// ---------------------------------------------------------------------------------------------------------

const CLOSED = ["FILED", "FILED_LATE", "NOT_APPLICABLE"];

/**
 * Status as the client should read it. Review, stages and who is working on it are internal, so
 * "under review" is simply "in progress".
 */
export function plainStatus(t: { status: string; effectiveDueDate: string | null; filedDate: string | null; pendingFromClient: boolean }, today = todayIst()): { text: string; tone: "green" | "amber" | "red" | "blue" | "neutral" } {
  if (t.status === "FILED" || t.status === "FILED_LATE") return { text: t.filedDate ? `Filed on ${formatDate(t.filedDate)}` : "Filed", tone: "green" };
  if (t.status === "NOT_APPLICABLE") return { text: "Not applicable", tone: "neutral" };
  if (t.pendingFromClient || t.status === "PENDING_FROM_CLIENT") return { text: "Waiting for your documents", tone: "amber" };
  if (t.effectiveDueDate && t.effectiveDueDate < today) return { text: `Overdue (was due ${formatDate(t.effectiveDueDate)})`, tone: "red" };
  if (t.status === "UPCOMING") return { text: t.effectiveDueDate ? `Due on ${formatDate(t.effectiveDueDate)}` : "Upcoming", tone: "neutral" };
  return { text: t.effectiveDueDate ? `In progress — due ${formatDate(t.effectiveDueDate)}` : "In progress", tone: "blue" };
}

export type PortalFiling = {
  id: string; clientId: string; clientName: string; title: string; period: string; dueDate: string | null; filedDate: string | null;
  status: { text: string; tone: string }; acks: { type: string; number: string; date: string; documentId: string | null }[];
};

/** Upcoming (next `days`) and recent filings (last 12 months), newest first within each. */
export async function portalFilings(actor: PortalActor, opts: { clientId?: string | null; days?: number } = {}) {
  const ids = scopeClients(actor, opts.clientId);
  const today = todayIst();
  const tasks = await db().task.findMany({
    where: {
      clientId: { in: ids },
      supersededByTaskId: null,
      OR: [
        { status: { notIn: CLOSED }, effectiveDueDate: { lte: addDays(today, opts.days ?? 60) } },
        { status: { in: ["FILED", "FILED_LATE"] }, filedDate: { gte: addDays(today, -365) } },
      ],
    },
    select: {
      id: true, clientId: true, title: true, periodLabel: true, effectiveDueDate: true, filedDate: true, status: true, pendingFromClient: true,
      acknowledgments: { select: { ackType: true, number: true, date: true, documentId: true } },
    },
    orderBy: [{ effectiveDueDate: "asc" }],
    take: 500,
  });
  const names = await clientNames(ids);
  // Acknowledgment files are shown only when the document itself is shared with the client.
  const docIds = tasks.flatMap((t) => t.acknowledgments.map((a) => a.documentId)).filter((x): x is string => !!x);
  const shared = new Set((await db().document.findMany({ where: { id: { in: docIds }, sharedWithClient: true, archivedAt: null }, select: { id: true } })).map((d) => d.id));
  const rows: PortalFiling[] = tasks.map((t) => ({
    id: t.id, clientId: t.clientId, clientName: names.get(t.clientId) ?? "", title: t.title, period: t.periodLabel, dueDate: t.effectiveDueDate, filedDate: t.filedDate,
    status: plainStatus(t, today),
    acks: t.acknowledgments.map((a) => ({ type: a.ackType, number: a.number, date: a.date, documentId: a.documentId && shared.has(a.documentId) ? a.documentId : null })),
  }));
  return {
    upcoming: rows.filter((r) => !r.filedDate && r.status.text !== "Not applicable"),
    recent: rows.filter((r) => r.filedDate).sort((a, b) => (b.filedDate ?? "").localeCompare(a.filedDate ?? "")),
  };
}

async function clientNames(ids: string[]) {
  return new Map((await db().client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
}

// ---------------------------------------------------------------------------------------------------------
// Documents requested from the client
// ---------------------------------------------------------------------------------------------------------

export type PortalRequest = { id: string; clientId: string; clientName: string; label: string; requestedOn: string | null; forWhat: string; dueDate: string | null; uploaded: boolean };

/**
 * Items the firm has asked for: requested and not yet received, plus ones the client uploaded that
 * staff have not confirmed yet (shown as "uploaded, being checked"). The staff note on an item is internal.
 */
export async function portalRequests(actor: PortalActor, opts: { clientId?: string | null } = {}) {
  const ids = scopeClients(actor, opts.clientId);
  const items = await db().checklistItem.findMany({
    where: { clientId: { in: ids }, OR: [{ status: "REQUESTED" }, { status: "RECEIVED", receivedPendingConfirm: true }] },
    select: { id: true, clientId: true, taskId: true, label: true, requestedAt: true, status: true, receivedPendingConfirm: true },
    orderBy: [{ requestedAt: "asc" }, { sortOrder: "asc" }],
  });
  const taskIds = [...new Set(items.map((i) => i.taskId).filter((x): x is string => !!x))];
  const tasks = new Map((await db().task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true, periodLabel: true, effectiveDueDate: true, status: true } })).map((t) => [t.id, t]));
  const names = await clientNames(ids);
  return items
    .filter((i) => !i.taskId || !CLOSED.includes(tasks.get(i.taskId)?.status ?? ""))
    .map<PortalRequest>((i) => {
      const t = i.taskId ? tasks.get(i.taskId) : undefined;
      return {
        id: i.id, clientId: i.clientId, clientName: names.get(i.clientId) ?? "", label: i.label, requestedOn: i.requestedAt,
        forWhat: t ? [t.title, t.periodLabel].filter(Boolean).join(" · ") : "General", dueDate: t?.effectiveDueDate ?? null, uploaded: i.receivedPendingConfirm,
      };
    });
}

// ---------------------------------------------------------------------------------------------------------
// Shared documents
// ---------------------------------------------------------------------------------------------------------

/** Documents the firm shared with the client, and the client's own uploads. Same rule as DMS (D-11). */
export async function portalDocuments(actor: PortalActor, opts: { clientId?: string | null; take?: number } = {}) {
  const ids = scopeClients(actor, opts.clientId);
  const where = await visibleDocumentWhere(actor);
  const docs = await db().document.findMany({
    where: { AND: [where, { clientId: { in: ids } }] },
    select: { id: true, clientId: true, name: true, kind: true, sourceType: true, updatedAt: true, currentVersion: true },
    orderBy: { updatedAt: "desc" },
    take: opts.take ?? 200,
  });
  const names = await clientNames(ids);
  return docs.map((d) => ({ id: d.id, clientId: d.clientId!, clientName: names.get(d.clientId!) ?? "", name: d.name, kind: d.kind, fromYou: d.sourceType === "PORTAL", updatedAt: d.updatedAt }));
}

// ---------------------------------------------------------------------------------------------------------
// Invoices and receipts
// ---------------------------------------------------------------------------------------------------------

const PLAIN_INVOICE: Record<string, string> = { RAISED: "Unpaid", PARTLY_RECEIVED: "Part paid", FULLY_RECEIVED: "Paid", WRITTEN_OFF: "Closed", CANCELLED: "Cancelled" };

/** Issued invoices (never drafts) and receipts. Write-offs and internal notes are not shown. */
export async function portalBilling(actor: PortalActor, opts: { clientId?: string | null } = {}) {
  authorize(actor, "billing.view");
  const ids = scopeClients(actor, opts.clientId);
  const today = todayIst();
  const [invoices, receipts, firm] = await Promise.all([
    db().invoice.findMany({
      where: { clientId: { in: ids }, status: { not: "DRAFT" }, number: { not: null } },
      select: { id: true, clientId: true, number: true, date: true, dueDate: true, status: true, totalPaise: true, receivedPaise: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    db().receipt.findMany({
      where: { clientId: { in: ids }, reversedAt: null },
      select: { id: true, clientId: true, date: true, amountPaise: true, mode: true, reference: true, tdsPaise: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    db().firmProfile.findFirst({ select: { name: true, bankName: true, bankAccount: true, bankIfsc: true, upiId: true } }),
  ]);
  const names = await clientNames(ids);
  const open = (s: string) => s === "RAISED" || s === "PARTLY_RECEIVED";
  const rows = invoices.map((i) => {
    const balancePaise = open(i.status) ? Math.max(0, i.totalPaise - i.receivedPaise) : 0;
    return {
      id: i.id, clientId: i.clientId, clientName: names.get(i.clientId) ?? "", number: i.number!, date: i.date, dueDate: i.dueDate, totalPaise: i.totalPaise,
      balancePaise, status: PLAIN_INVOICE[i.status] ?? i.status, overdue: balancePaise > 0 && !!i.dueDate && i.dueDate < today,
    };
  });
  const payTo = firm && (firm.bankAccount || firm.upiId) ? { name: firm.name, bankName: firm.bankName, bankAccount: firm.bankAccount, bankIfsc: firm.bankIfsc, upiId: firm.upiId } : null;
  return {
    invoices: rows,
    receipts: receipts.map((r) => ({ id: r.id, clientId: r.clientId, clientName: names.get(r.clientId) ?? "", date: r.date, amountPaise: r.amountPaise, tdsPaise: r.tdsPaise, mode: r.mode, reference: r.reference })),
    outstandingPaise: rows.reduce((a, r) => a + r.balancePaise, 0),
    payTo,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------------------

export async function portalDashboard(actor: PortalActor, opts: { clientId?: string | null } = {}) {
  const ids = scopeClients(actor, opts.clientId);
  const [requests, filings, billing, approvals, letters, proposals, feedback, unread] = await Promise.all([
    portalRequests(actor, opts),
    portalFilings(actor, { ...opts, days: 30 }),
    portalBilling(actor, opts),
    db().clientApprovalRequest.count({ where: { clientId: { in: ids }, status: "OPEN" } }),
    db().engagementLetter.count({ where: { clientId: { in: ids }, status: "ISSUED" } }),
    db().proposal.count({ where: { clientId: { in: ids }, status: "SENT" } }),
    db().feedback.count({ where: { clientId: { in: ids }, receivedAt: null } }),
    db().message.count({ where: { readByClientAt: null, authorPortalUserId: null, thread: { clientId: { in: ids } } } }),
  ]);
  return {
    toUpload: requests.filter((r) => !r.uploaded).length,
    beingChecked: requests.filter((r) => r.uploaded).length,
    dueSoon: filings.upcoming.slice(0, 8),
    recentlyFiled: filings.recent.slice(0, 5),
    outstandingPaise: billing.outstandingPaise,
    overdueInvoices: billing.invoices.filter((i) => i.overdue).length,
    toApprove: approvals,
    toAccept: letters + proposals,
    feedbackRequested: feedback,
    unreadMessages: unread,
  };
}
