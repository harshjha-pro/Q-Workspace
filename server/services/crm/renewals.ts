import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import { systemActor, type Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { addDays, diffDays, formatDate, fyKey, fyLabel, fyStartYear, isoFromParts, todayIst, toIstDate } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { costOfEntries } from "../costs";
import { notifyUsers } from "../notifications/service";
import { renderTemplateFor } from "../../documents/library";
import { amountInWords } from "../../documents/words";
import { assertFees, idOf, inClients, rupees, visibleClientIds } from "./common";

/** Renewals & fee revision (P3-14, spec 10.7). */

type EngagementLite = { id: string; clientId: string; name: string; startDate: string | null; endDate: string | null; createdAt: Date; feeBasis: string; feePaise: number; ratePaisePerHour: number; partnerId: string | null; managerId: string | null };

/** The engagement's current period: start date → end date, or the end of that financial year. */
export function currentPeriod(e: Pick<EngagementLite, "startDate" | "endDate" | "createdAt">) {
  const start = e.startDate ?? toIstDate(e.createdAt);
  const end = e.endDate ?? isoFromParts(fyStartYear(start) + 1, 3, 31);
  const nextStart = addDays(end, 1);
  return { start, end, nextStart, periodKey: fyKey(fyStartYear(nextStart)), label: fyLabel(fyStartYear(nextStart)) };
}

/**
 * Fee revision suggestion from last period's hours × internal cost vs the fee (realization):
 * at least the last fee raised by `crm.renewalMinIncreasePct`, and at least cost plus
 * `crm.renewalTargetMarkupPct`; rounded up to the next ₹500. Firm policy, not statute.
 */
export async function feeSuggestion(e: EngagementLite) {
  const p = currentPeriod(e);
  const entries = await db().workEntry.findMany({ where: { engagementId: e.id, deletedAt: null, date: { gte: p.start, lte: p.end } }, select: { userId: true, date: true, minutes: true } });
  const minutes = entries.reduce((s, x) => s + x.minutes, 0);
  const cost = await costOfEntries(entries);
  const lastFee = e.feeBasis === "TIME" ? Math.round((e.ratePaisePerHour * minutes) / 60) : e.feePaise;
  const markup = await getSetting<number>("crm.renewalTargetMarkupPct", 50);
  const minIncrease = await getSetting<number>("crm.renewalMinIncreasePct", 0);
  const floor = Math.round(lastFee * (1 + minIncrease / 100));
  const costBased = Math.round(cost * (1 + markup / 100));
  const raw = Math.max(floor, costBased);
  const step = 50_000; // ₹500
  const suggested = raw > 0 ? Math.ceil(raw / step) * step : 0;
  return { lastFee, minutes, cost, suggested, realizationPct: cost > 0 ? Math.round((lastFee / cost) * 100) : null };
}

/**
 * Daily job: recurring engagements get a renewal prompt `crm.renewalLeadDays` (60) days before their
 * next period starts. One row per engagement and period (unique), so reruns create nothing new.
 */
export async function runRenewals(today: string = todayIst()) {
  const leadDays = await getSetting<number>("crm.renewalLeadDays", 60);
  const engagements = await db().engagement.findMany({
    where: { recurrence: "RECURRING", status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] }, chargeable: true, NOT: { name: { endsWith: "(recurring)" } } },
    select: { id: true, clientId: true, name: true, startDate: true, endDate: true, createdAt: true, feeBasis: true, feePaise: true, ratePaisePerHour: true, partnerId: true, managerId: true, client: { select: { status: true, isFirm: true } } },
  });
  const actor = systemActor();
  let created = 0;
  for (const e of engagements) {
    if (e.client.isFirm || e.client.status !== "ACTIVE") continue;
    const p = currentPeriod(e);
    const until = diffDays(today, p.nextStart);
    if (until > leadDays || until < -30) continue; // not yet due, or long past (missed periods are not back-filled)
    if (await db().renewal.findUnique({ where: { engagementId_periodKey: { engagementId: e.id, periodKey: p.periodKey } } })) continue;
    created += await createRenewal(actor, e, p) ? 1 : 0;
  }
  return { checked: engagements.length, created };
}

async function createRenewal(actor: Actor, e: EngagementLite, p = currentPeriod(e)) {
  const s = await feeSuggestion(e);
  const row = await transaction(async (tx) => {
    const existing = await tx.renewal.findUnique({ where: { engagementId_periodKey: { engagementId: e.id, periodKey: p.periodKey } } });
    if (existing) return null;
    const r = await tx.renewal.create({ data: { engagementId: e.id, periodKey: p.periodKey, dueDate: p.nextStart, lastFeePaise: s.lastFee, lastMinutes: s.minutes, suggestedFeePaise: s.suggested, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Renewal", entityId: r.id, action: "CREATE", after: { engagementId: e.id, periodKey: p.periodKey, suggested: s.suggested } });
    return r;
  });
  if (row) {
    await notifyUsers([e.managerId, e.partnerId].filter((x): x is string => !!x), {
      kind: "RENEWAL_DUE", title: `Renewal due: ${e.name}`, body: `New period ${p.label} starts ${formatDate(p.nextStart)}. Review the fee revision.`,
      link: "/crm/opportunities?tab=renewals", entityType: "Renewal", entityId: row.id, dedupeKey: `renewal:${row.id}`,
    });
  }
  return row;
}

/** Create the renewal prompt for one engagement now (used by demo data and the "Renew now" button). */
export async function startRenewal(actor: Actor, engagementId: string) {
  assertFees(actor);
  const e = await db().engagement.findUnique({ where: { id: engagementId } });
  if (!e) throw notFound("Engagement");
  await assertClientAccess(actor, "crm.manage", e.clientId);
  if (e.recurrence !== "RECURRING") throw ruleViolation("Only recurring engagements are renewed.");
  const r = await createRenewal(actor, e);
  if (!r) throw ruleViolation("A renewal for the next period already exists.");
  return r;
}

async function loadRenewal(actor: Actor, id: string, cap: "crm.view" | "crm.manage") {
  assertFees(actor);
  const r = await db().renewal.findUnique({ where: { id } });
  if (!r) throw notFound("Renewal");
  const e = await db().engagement.findUniqueOrThrow({ where: { id: r.engagementId } });
  await assertClientAccess(actor, cap, e.clientId);
  return { r, e };
}

export async function listRenewals(actor: Actor, f: { status?: string } = {}) {
  assertFees(actor);
  const ids = await visibleClientIds(actor, "crm.view");
  const rows = await db().renewal.findMany({
    where: { ...(f.status ? { status: f.status } : { status: { in: ["DUE", "PROPOSED", "APPROVED"] } }) },
    orderBy: { dueDate: "asc" },
    take: 500,
  });
  const engs = await db().engagement.findMany({ where: { id: { in: rows.map((r) => r.engagementId) }, ...inClients(ids) }, select: { id: true, code: true, name: true, clientId: true, feeBasis: true, client: { select: { name: true, code: true } } } });
  const byId = new Map(engs.map((e) => [e.id, e]));
  const visible = rows.filter((r) => byId.has(r.engagementId)).map((r) => ({ ...r, engagement: byId.get(r.engagementId)! }));
  if (visible.length) await logSensitiveView(actor, "BILLING", "Renewal", "list", `${visible.length} renewals`);
  return visible;
}

const feeInput = z.object({ feePaise: z.number().int().min(0) });

/** Manager / Partner proposes the revised fee (defaults to the suggestion). */
export async function proposeRenewalFee(actor: Actor, id: string, input: z.input<typeof feeInput>) {
  const { r } = await loadRenewal(actor, id, "crm.manage");
  const d = parse(feeInput, input);
  if (!["DUE", "PROPOSED"].includes(r.status)) throw ruleViolation("This renewal is already decided.");
  return transaction(async (tx) => {
    const after = await tx.renewal.update({ where: { id }, data: { status: "PROPOSED", suggestedFeePaise: d.feePaise, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Renewal", entityId: id, action: "PROPOSE", before: { suggestedFeePaise: r.suggestedFeePaise }, after: { suggestedFeePaise: d.feePaise } });
    return after;
  });
}

/** Partner approves the fee for the new period (spec 10.7 "Partner approves"). */
export async function approveRenewal(actor: Actor, id: string, input: Partial<z.input<typeof feeInput>> = {}) {
  authorize(actor, "proposal.approve");
  const { r } = await loadRenewal(actor, id, "crm.view");
  if (!["DUE", "PROPOSED"].includes(r.status)) throw ruleViolation("This renewal is already decided.");
  const fee = input.feePaise ?? r.suggestedFeePaise;
  if (!Number.isInteger(fee) || fee <= 0) throw new DomainError("VALIDATION", "Enter the approved fee.", { feePaise: "Fee" });
  return transaction(async (tx) => {
    const after = await tx.renewal.update({ where: { id }, data: { status: "APPROVED", approvedFeePaise: fee, approvedById: idOf(actor), approvedAt: new Date(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Renewal", entityId: id, action: "APPROVE", after: { approvedFeePaise: fee } });
    return after;
  });
}

export async function declineRenewal(actor: Actor, id: string, reason: string) {
  const { r } = await loadRenewal(actor, id, "crm.manage");
  if (["LETTER_ISSUED", "DECLINED"].includes(r.status)) throw ruleViolation("This renewal is already closed.");
  if (reason.trim().length < 3) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Reason" });
  await transaction(async (tx) => {
    await tx.renewal.update({ where: { id }, data: { status: "DECLINED", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Renewal", entityId: id, action: "DECLINE", reason });
  });
}

export const DEFAULT_RENEWAL_LETTER = `{{today.date}}

To,
{{client.name}}
{{client.address}}

Subject: Renewal of engagement — {{engagement.name}} for {{extra.period}}

Dear Sir / Madam,

Thank you for your continued trust in {{firm.name}}. Our engagement for {{engagement.name}} comes up for renewal for {{extra.period}}, starting {{extra.newPeriodStart}}.

# Professional fees
Fee for the previous period: {{extra.lastFee}}
Fee for {{extra.period}}: {{extra.newFee}} ({{extra.newFeeWords}})
GST at the applicable rate will be charged extra. Out-of-pocket expenses are billed at actuals.

The scope and other terms of our engagement letter remain unchanged unless agreed otherwise in writing.

Please sign and return a copy of this letter as your confirmation.

For {{firm.name}}

Authorised signatory

Accepted on behalf of {{client.name}}

Signature: ____________________     Date: ____________`;

/** Renewal letter from the approved fee (template RENEWAL_LETTER); stored as an engagement letter. */
export async function generateRenewalLetter(actor: Actor, id: string) {
  const { r, e } = await loadRenewal(actor, id, "crm.manage");
  if (r.status !== "APPROVED") throw ruleViolation("The renewal fee must be approved by a Partner first.");
  if (actor.kind === "USER" && !["PARTNER", "MANAGER", "PRACTICE_ADMIN"].includes(actor.role)) throw forbidden();
  const p = currentPeriod(e);
  const fee = r.approvedFeePaise ?? r.suggestedFeePaise;
  const out = await renderTemplateFor("RENEWAL_LETTER", DEFAULT_RENEWAL_LETTER, {
    clientId: e.clientId, engagementId: e.id,
    extra: { period: p.label, newPeriodStart: formatDate(r.dueDate), lastFee: rupees(r.lastFeePaise), newFee: rupees(fee), newFeeWords: amountInWords(fee) },
  });
  return transaction(async (tx) => {
    const letter = await tx.engagementLetter.create({ data: { clientId: e.clientId, templateVersionId: out.templateVersionId, body: out.text, status: "ISSUED", issuedAt: new Date(), createdById: idOf(actor), updatedById: idOf(actor) } });
    await tx.renewal.update({ where: { id }, data: { status: "LETTER_ISSUED", letterId: letter.id, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Renewal", entityId: id, action: "LETTER", after: { letterId: letter.id, missing: out.missing } });
    return { letter, missing: out.missing };
  });
}
