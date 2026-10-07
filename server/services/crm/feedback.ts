import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { conflict, notFound, ruleViolation } from "../../lib/errors";
import { assertClientAccess } from "../../permissions/scopes";
import { systemActor, type Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, todayIst, toIstDate } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { idOf, inClients, visibleClientIds } from "./common";

/**
 * Client feedback (P3-15, spec 10.8). The portal / one-time link is Phase 4, so a request is a Feedback
 * row plus copy-ready text the person sends themselves; staff record the client's rating and comment.
 */
const CLOSED = ["COMPLETED", "ARCHIVED"];

export function feedbackMessage(clientContact: string, engagementName: string, firmName: string) {
  return [
    `Dear ${clientContact || "Sir / Madam"},`,
    "",
    `We have completed "${engagementName}". We would value your feedback: on a scale of 1 (poor) to 5 (excellent), how would you rate our service, and is there anything we could do better?`,
    "",
    "You can simply reply to this message with your rating and comments.",
    "[Feedback link: available once the client portal is live]",
    "",
    `Thank you,`,
    firmName || "Your CA team",
  ].join("\n");
}

async function createRequest(actor: Actor, e: { id: string; clientId: string; name: string; managerId: string | null }) {
  const row = await transaction(async (tx) => {
    if (await tx.feedback.findFirst({ where: { engagementId: e.id } })) return null;
    const f = await tx.feedback.create({ data: { engagementId: e.id, clientId: e.clientId, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Feedback", entityId: f.id, action: "REQUEST", after: { engagementId: e.id } });
    return f;
  });
  if (row && e.managerId) {
    await notifyUsers([e.managerId], { kind: "FEEDBACK_REQUEST", title: `Ask for feedback: ${e.name}`, body: "The engagement is closed. Copy the feedback message and send it to the client.", link: "/crm/feedback", entityType: "Feedback", entityId: row.id, dedupeKey: `feedback-request:${row.id}` });
  }
  return row;
}

/** Manual request for a closed engagement. */
export async function requestFeedback(actor: Actor, engagementId: string) {
  const e = await db().engagement.findUnique({ where: { id: engagementId } });
  if (!e) throw notFound("Engagement");
  await assertClientAccess(actor, "crm.manage", e.clientId);
  if (!CLOSED.includes(e.status)) throw ruleViolation("Feedback is requested when the engagement is completed.");
  const f = await createRequest(actor, e);
  if (!f) throw conflict("Feedback has already been requested for this engagement.");
  return f;
}

/** Daily job: engagements completed in the last `crm.feedbackLookbackDays` days get a request. Idempotent. */
export async function runFeedbackRequests(today: string = todayIst()) {
  const days = await getSetting<number>("crm.feedbackLookbackDays", 30);
  const from = new Date(`${addDays(today, -days)}T00:00:00+05:30`);
  const engagements = await db().engagement.findMany({ where: { status: { in: CLOSED }, closedAt: { gte: from }, chargeable: true, client: { isFirm: false } }, select: { id: true, clientId: true, name: true, managerId: true, closedAt: true } });
  let created = 0;
  for (const e of engagements) {
    if (e.closedAt && toIstDate(e.closedAt) > today) continue;
    if (await createRequest(systemActor(), e)) created += 1;
  }
  return { checked: engagements.length, created };
}

const ratingInput = z.object({ rating: z.number().int().min(1, "1 to 5").max(5, "1 to 5"), comment: z.string().trim().max(4000).default("") });

/** Record the client's answer; a low score (≤ `crm.feedbackLowScore`, default 2) alerts the Partner once. */
export async function recordFeedback(actor: Actor, feedbackId: string, input: z.input<typeof ratingInput>) {
  const f = await db().feedback.findUnique({ where: { id: feedbackId } });
  if (!f) throw notFound("Feedback");
  if (actor.kind === "PORTAL") {
    // P4-02: the client answers in the portal, once, for one of their own clients.
    if (!actor.clientIds.includes(f.clientId)) throw notFound("Feedback");
    if (f.receivedAt) throw ruleViolation("Thank you — this feedback is already recorded.");
  } else await assertClientAccess(actor, "crm.manage", f.clientId);
  const d = parse(ratingInput, input);
  const low = await getSetting<number>("crm.feedbackLowScore", 2);
  const e = await db().engagement.findUniqueOrThrow({ where: { id: f.engagementId }, select: { name: true, partnerId: true, client: { select: { name: true, partnerId: true } } } });
  const alert = d.rating <= low && !f.alertedAt;
  const after = await transaction(async (tx) => {
    const row = await tx.feedback.update({ where: { id: feedbackId }, data: { rating: d.rating, comment: d.comment, receivedAt: f.receivedAt ?? new Date(), portalUserId: actor.kind === "PORTAL" ? actor.portalUserId : f.portalUserId, alertedAt: alert ? new Date() : f.alertedAt, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Feedback", entityId: feedbackId, action: "RECORD", before: { rating: f.rating }, after: { rating: d.rating, comment: d.comment } });
    return row;
  });
  if (alert) {
    const partner = e.partnerId ?? e.client.partnerId;
    const partners = partner ? [partner] : (await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } })).map((u) => u.id);
    await notifyUsers(partners, {
      kind: "FEEDBACK_LOW", priority: "HIGH", title: `Low feedback score (${d.rating}/5): ${e.client.name}`, body: `${e.name}${d.comment ? ` — "${d.comment.slice(0, 160)}"` : ""}`,
      link: "/crm/feedback", entityType: "Feedback", entityId: feedbackId, dedupeKey: `feedback-low:${feedbackId}`,
    });
  }
  return after;
}

export async function listFeedback(actor: Actor, f: { pending?: boolean } = {}) {
  const ids = await visibleClientIds(actor, "crm.view");
  const rows = await db().feedback.findMany({ where: { ...inClients(ids), ...(f.pending === undefined ? {} : f.pending ? { receivedAt: null } : { receivedAt: { not: null } }) }, orderBy: { requestedAt: "desc" }, take: 300 });
  const [engs, clients, firm] = await Promise.all([
    db().engagement.findMany({ where: { id: { in: rows.map((r) => r.engagementId) } }, select: { id: true, code: true, name: true } }),
    db().client.findMany({ where: { id: { in: rows.map((r) => r.clientId) } }, select: { id: true, name: true, contacts: { where: { isPrimary: true }, take: 1, select: { name: true } } } }),
    db().firmProfile.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true } }),
  ]);
  const eById = new Map(engs.map((e) => [e.id, e]));
  const cById = new Map(clients.map((c) => [c.id, c]));
  return rows.map((r) => {
    const e = eById.get(r.engagementId);
    const c = cById.get(r.clientId);
    return { ...r, engagement: e, clientName: c?.name ?? "", message: feedbackMessage(c?.contacts[0]?.name ?? "", e?.name ?? "", firm?.name ?? "") };
  });
}

/** Average score and count for CRM analytics (spec 10.8 "results feed CRM analytics"). */
export async function feedbackSummary(actor: Actor) {
  const ids = await visibleClientIds(actor, "crm.view");
  const agg = await db().feedback.aggregate({ where: { ...inClients(ids), rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } });
  const low = await getSetting<number>("crm.feedbackLowScore", 2);
  const lowCount = await db().feedback.count({ where: { ...inClients(ids), rating: { lte: low } } });
  return { average: agg._avg.rating, responses: agg._count.rating, low: lowCount };
}
