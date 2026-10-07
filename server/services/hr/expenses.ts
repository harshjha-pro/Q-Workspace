import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can, scopeOf } from "../../permissions/guards";
import { assertClientAccess, userWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, todayIst } from "../../lib/dates";
import { readStoredFile } from "../../lib/storage";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { idOf, isHrOrPartner, latestVersion, namesOf, seesClientNames, staffId, storeHrDocument, zIso } from "./common";

// ---------------------------------------------------------------------------
// Expenses and conveyance (spec 11.10, P3-22, Q-21)
// ---------------------------------------------------------------------------

export const EXPENSE_KINDS = ["CONVEYANCE", "TRAVEL", "OTHER"] as const;
export const EXPENSE_LABELS: Record<(typeof EXPENSE_KINDS)[number], string> = { CONVEYANCE: "Conveyance", TRAVEL: "Travel", OTHER: "Other" };
export const CONVEYANCE_MODES = ["TWO_WHEELER", "FOUR_WHEELER", "PER_VISIT"] as const;
export const MODE_LABELS: Record<(typeof CONVEYANCE_MODES)[number], string> = { TWO_WHEELER: "Two-wheeler (per km)", FOUR_WHEELER: "Car (per km)", PER_VISIT: "Per visit" };

/** Conveyance rate on a date for a mode (Q-21: blank by default → the claimant types the amount). */
export async function conveyanceRate(mode: string, date: string) {
  return db().conveyanceRate.findFirst({ where: { mode, effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: "desc" } });
}

/** Rate × km (or × visits). Null when no rate is configured. */
export async function suggestedConveyance(mode: string, date: string, kmOrVisits: number) {
  const r = await conveyanceRate(mode, date);
  return r ? { ratePaise: r.ratePaise, amountPaise: r.ratePaise * kmOrVisits } : null;
}

/**
 * Client Site work entries not yet claimed, one line per day and client (spec 11.10: auto-suggested).
 * Client names are shown only when the claimant can see the client.
 */
export async function conveyanceSuggestions(actor: Actor, today = todayIst()) {
  const me = staffId(actor);
  const days = await getSetting<number>("expenses.conveyanceLookbackDays", 30);
  const entries = await db().workEntry.findMany({
    where: { userId: me, deletedAt: null, location: "CLIENT_SITE", date: { gte: addDays(today, -days), lte: today } },
    select: { id: true, date: true, clientId: true, clientSiteClientId: true, minutes: true },
    orderBy: { date: "desc" },
  });
  const claimed = new Set((await db().expenseClaim.findMany({ where: { userId: me, status: { not: "REJECTED" }, workEntryId: { in: entries.map((e) => e.id) } }, select: { workEntryId: true } })).map((c) => c.workEntryId));
  const groups = new Map<string, { date: string; clientId: string | null; workEntryIds: string[]; visits: number }>();
  for (const e of entries) {
    if (claimed.has(e.id)) continue;
    const clientId = e.clientSiteClientId ?? e.clientId;
    const key = `${e.date}|${clientId ?? "-"}`;
    const g = groups.get(key) ?? { date: e.date, clientId, workEntryIds: [], visits: 1 };
    g.workEntryIds.push(e.id);
    groups.set(key, g);
  }
  const clients = new Map((await db().client.findMany({ where: { id: { in: [...groups.values()].map((g) => g.clientId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const perVisit = await conveyanceRate("PER_VISIT", today);
  return [...groups.values()].map((g) => ({ ...g, client: g.clientId ? (clients.get(g.clientId) ?? "") : "", perVisitPaise: perVisit?.ratePaise ?? null }));
}

const claimInput = z.object({
  date: zIso,
  kind: z.enum(EXPENSE_KINDS),
  amountPaise: z.coerce.number().int().min(0).nullish(),
  mode: z.enum(CONVEYANCE_MODES).nullish(),
  distanceKm: z.coerce.number().int().min(0).max(5000).nullish(),
  visits: z.coerce.number().int().min(1).max(50).nullish(),
  clientId: z.string().nullish(),
  workEntryId: z.string().nullish(),
  clientRecoverable: z.boolean().default(false),
  description: z.string().trim().max(1000).default(""),
});
export type ClaimInput = z.input<typeof claimInput>;

/** Raise a claim for myself. Conveyance amount = configured rate × km/visits, else the amount typed. */
export async function createClaim(actor: Actor, input: ClaimInput, receipt?: { name: string; data: Buffer }) {
  authorize(actor, "expense.claim");
  const me = staffId(actor);
  const p = parse(claimInput, input);
  if (p.date > todayIst()) throw ruleViolation("Claims cannot be made for a future date.");
  if (p.clientId) await assertClientAccess(actor, "client.view", p.clientId);
  if (p.clientRecoverable && !p.clientId) throw new DomainError("VALIDATION", "Choose the client to recover this from.", { clientId: "Required for a client-recoverable claim" });
  if (p.workEntryId) {
    const e = await db().workEntry.findUnique({ where: { id: p.workEntryId } });
    if (!e || e.userId !== me || e.deletedAt) throw notFound("Work entry");
    if (await db().expenseClaim.findFirst({ where: { workEntryId: p.workEntryId, status: { not: "REJECTED" } } })) throw ruleViolation("This client visit is already claimed.");
  }
  let amount = p.amountPaise ?? null;
  if (p.kind === "CONVEYANCE" && p.mode) {
    const units = p.mode === "PER_VISIT" ? (p.visits ?? 1) : (p.distanceKm ?? 0);
    const s = await suggestedConveyance(p.mode, p.date, units);
    if (s && (amount == null || amount === 0)) amount = s.amountPaise;
  }
  if (!amount || amount <= 0) throw new DomainError("VALIDATION", "Enter the amount (no conveyance rate is set for this mode).", { amountPaise: "Enter the amount" });
  const claim = await transaction(async (tx) => {
    const doc = receipt ? await storeHrDocument(tx, actor, { segments: ["expenses", me], fileName: receipt.name, data: receipt.data, kind: "RECEIPT", employeeUserId: me, sourceType: "UPLOAD" }) : null;
    const c = await tx.expenseClaim.create({
      data: {
        userId: me, date: p.date, kind: p.kind, amountPaise: amount!, distanceKm: p.distanceKm ?? null, clientId: p.clientId ?? null, workEntryId: p.workEntryId ?? null,
        clientRecoverable: p.clientRecoverable, description: p.description || (p.mode ? MODE_LABELS[p.mode] : ""), receiptDocId: doc?.id ?? null, createdById: me,
      },
    });
    await writeAudit(tx, actor, { entityType: "ExpenseClaim", entityId: c.id, action: "CREATE", after: c });
    return c;
  });
  const approver = await approverFor(me);
  if (approver) await notifyUsers([approver], { kind: "EXPENSE", title: `Expense claim from ${actor.displayName}`, link: "/hr/expenses", dedupeKey: `expense-${claim.id}` });
  return claim;
}

async function approverFor(userId: string) {
  const u = await db().user.findUnique({ where: { id: userId }, include: { reportingManager: true } });
  if (u?.reportingManager?.active && ["MANAGER", "PARTNER"].includes(u.reportingManager.role)) return u.reportingManager.id;
  return (await db().user.findFirst({ where: { role: "PARTNER", active: true, id: { not: userId } }, orderBy: { createdAt: "asc" } }))?.id ?? null;
}

export async function cancelClaim(actor: Actor, claimId: string) {
  const me = staffId(actor);
  const c = await db().expenseClaim.findUnique({ where: { id: claimId } });
  if (!c || c.userId !== me) throw notFound("Claim");
  if (c.status !== "PENDING") throw ruleViolation("Only pending claims can be withdrawn.");
  await transaction(async (tx) => {
    await tx.expenseClaim.update({ where: { id: claimId }, data: { status: "REJECTED", decidedAt: new Date(), updatedById: me } });
    await writeAudit(tx, actor, { entityType: "ExpenseClaim", entityId: claimId, action: "WITHDRAW", before: { status: c.status }, after: { status: "REJECTED" } });
  });
}

/**
 * Approve or reject (Manager for their team, Partner firm-wide; never one's own claim). A client-recoverable
 * claim, once approved, goes to the disbursements register as UNRECOVERED for billing.
 */
export async function decideClaim(actor: Actor, claimId: string, approve: boolean, note = "") {
  const scope = authorize(actor, "expense.approve");
  const me = staffId(actor);
  const c = await db().expenseClaim.findUnique({ where: { id: claimId } });
  if (!c) throw notFound("Claim");
  if (c.userId === me) throw ruleViolation("You cannot approve your own claim.");
  const inScope = await db().user.count({ where: { AND: [{ id: c.userId }, userWhere(actor, scope)] } });
  if (!inScope) throw forbidden();
  if (c.status !== "PENDING") throw ruleViolation("This claim has already been decided.");
  if (!approve && !note.trim()) throw new DomainError("VALIDATION", "Give a reason for rejecting.", { note: "Required" });
  await transaction(async (tx) => {
    await tx.expenseClaim.update({ where: { id: claimId }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: me, decidedAt: new Date(), updatedById: me } });
    if (approve && c.clientRecoverable && c.clientId) {
      const d = await tx.disbursement.create({
        data: {
          clientId: c.clientId, date: c.date, amountPaise: c.amountPaise, kind: c.kind === "OTHER" ? "OTHER" : "TRAVEL",
          description: `${EXPENSE_LABELS[c.kind as keyof typeof EXPENSE_LABELS] ?? c.kind} claim: ${c.description}`.slice(0, 500), paidBy: "FIRM",
          receiptDocumentId: c.receiptDocId, status: "UNRECOVERED", expenseClaimId: c.id, createdById: me,
        },
      });
      await writeAudit(tx, actor, { entityType: "Disbursement", entityId: d.id, action: "CREATE", after: d, reason: "Client-recoverable expense claim approved" });
    }
    await writeAudit(tx, actor, { entityType: "ExpenseClaim", entityId: claimId, action: approve ? "APPROVE" : "REJECT", before: { status: c.status }, after: { status: approve ? "APPROVED" : "REJECTED" }, reason: note });
  });
  await notifyUsers([c.userId], { kind: "EXPENSE", title: `Expense claim ${approve ? "approved" : "rejected"}`, body: note, link: "/me/expenses", dedupeKey: `expense-decided-${c.id}` });
}

/** Mark approved claims paid, with payroll or separately (HR or Partner). */
export async function markClaimPaid(actor: Actor, claimId: string, via: "PAYROLL" | "SEPARATE", payrollRunId?: string | null) {
  if (!isHrOrPartner(actor)) throw forbidden();
  const c = await db().expenseClaim.findUnique({ where: { id: claimId } });
  if (!c) throw notFound("Claim");
  if (c.status !== "APPROVED") throw ruleViolation("Only approved claims can be marked paid.");
  await transaction(async (tx) => {
    await tx.expenseClaim.update({ where: { id: claimId }, data: { status: "PAID", paidVia: via, paidAt: new Date(), payrollRunId: payrollRunId ?? null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ExpenseClaim", entityId: claimId, action: "PAID", after: { paidVia: via } });
  });
}

async function decorate(actor: Actor, rows: { userId: string; clientId: string | null; approverId: string | null }[]) {
  const names = await namesOf(rows.flatMap((r) => [r.userId, r.approverId]));
  // Only the claimant's own claims reach here; they chose clients they can see.
  const clients = new Map((await db().client.findMany({ where: { id: { in: rows.map((r) => r.clientId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return { names, clients };
}

export async function myClaims(actor: Actor) {
  const me = staffId(actor);
  const rows = await db().expenseClaim.findMany({ where: { userId: me }, orderBy: { date: "desc" }, take: 200 });
  const { names, clients } = await decorate(actor, rows);
  return rows.map((r) => ({ ...r, approver: names.get(r.approverId ?? "") ?? "", client: r.clientId ? (clients.get(r.clientId) ?? "") : "" }));
}

/**
 * Approvals queue (Manager team / Partner firm) and, for HR, the payment queue. HR has no client data,
 * so HR sees "client-recoverable" without the client name.
 */
export async function claimsForReview(actor: Actor, view: "pending" | "approved" | "all" = "pending") {
  const approver = can(actor, "expense.approve");
  const hr = actor.kind === "USER" && actor.role === "HR_ADMIN";
  if (!approver && !hr) throw forbidden();
  const me = staffId(actor);
  let userIds: string[] | undefined;
  if (approver && scopeOf(actor, "expense.approve") !== "firm") userIds = (await db().user.findMany({ where: userWhere(actor, scopeOf(actor, "expense.approve")), select: { id: true } })).map((u) => u.id);
  const rows = await db().expenseClaim.findMany({
    where: { ...(userIds ? { userId: { in: userIds } } : {}), ...(view === "pending" ? { status: "PENDING" } : view === "approved" ? { status: "APPROVED" } : {}) },
    orderBy: { date: "desc" },
    take: 300,
  });
  const names = await namesOf(rows.flatMap((r) => [r.userId, r.approverId]));
  const clients = seesClientNames(actor) ? new Map((await db().client.findMany({ where: { id: { in: rows.map((r) => r.clientId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name])) : new Map<string, string>();
  return rows.map((r) => ({
    ...r, clientId: seesClientNames(actor) ? r.clientId : null, claimant: names.get(r.userId) ?? "", approver: names.get(r.approverId ?? "") ?? "",
    client: r.clientId ? (clients.get(r.clientId) ?? (seesClientNames(actor) ? "" : "(client)")) : "", mine: r.userId === me,
  }));
}

/** Receipt download: claimant, their approver scope, HR or Partner. */
export async function receiptDownload(actor: Actor, claimId: string) {
  const me = staffId(actor);
  const c = await db().expenseClaim.findUnique({ where: { id: claimId } });
  if (!c?.receiptDocId) throw notFound("Receipt");
  let ok = c.userId === me || isHrOrPartner(actor);
  if (!ok && can(actor, "expense.approve")) ok = (await db().user.count({ where: { AND: [{ id: c.userId }, userWhere(actor, scopeOf(actor, "expense.approve"))] } })) > 0;
  if (!ok) throw forbidden();
  const v = await latestVersion(c.receiptDocId);
  if (!v) throw notFound("Receipt");
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Document", entityId: c.receiptDocId!, action: "DOWNLOAD", after: { claimId } }));
  return { body: await readStoredFile(v.storagePath), contentType: v.mimeType, fileName: v.originalName };
}

// ---- Conveyance rates (Q-21: a setting, default blank)

const rateInput = z.object({ mode: z.enum(CONVEYANCE_MODES), ratePaise: z.coerce.number().int().min(1, "Enter the rate"), effectiveFrom: zIso });

export async function listConveyanceRates() {
  return db().conveyanceRate.findMany({ orderBy: [{ mode: "asc" }, { effectiveFrom: "desc" }] });
}

export async function addConveyanceRate(actor: Actor, input: z.input<typeof rateInput>) {
  if (!isHrOrPartner(actor)) throw forbidden();
  const p = parse(rateInput, input);
  return transaction(async (tx) => {
    const r = await tx.conveyanceRate.create({ data: { ...p, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ConveyanceRate", entityId: r.id, action: "CREATE", after: r });
    return r;
  });
}
