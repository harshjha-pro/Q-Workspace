import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { toCsv } from "../../lib/csv";
import { CONSTITUTIONS, SERVICE_LINES } from "../../domain/enums";
import { idOf, visibleClientIds } from "./common";

/**
 * Client communications (P3-16, spec 10.9): greetings and firm updates to a client segment. Nothing is
 * sent from the app — it builds the recipient list with copy-ready text and a CSV, and people mark rows
 * as sent. Contacts who opted out are never included.
 */
const segmentSchema = z.object({
  categories: z.array(z.enum(["A", "B", "C"])).default([]),
  serviceLines: z.array(z.enum(SERVICE_LINES)).default([]),
  constitutions: z.array(z.enum(CONSTITUTIONS)).default([]),
  groupIds: z.array(z.string()).default([]),
  primaryOnly: z.boolean().default(true),
  channel: z.enum(["PREFERRED", "EMAIL", "WHATSAPP"]).default("PREFERRED"),
});
export type Segment = z.infer<typeof segmentSchema>;

const campaignInput = z.object({
  name: z.string().trim().min(3, "Name the campaign").max(160),
  messageText: z.string().trim().min(10, "Write the message").max(8000),
  segment: segmentSchema.default({ categories: [], serviceLines: [], constitutions: [], groupIds: [], primaryOnly: true, channel: "PREFERRED" }),
});

function campaignWhere(actor: Actor) {
  const scope = authorize(actor, "campaign.manage");
  return scope === "firm" || actor.kind === "SYSTEM" ? {} : { createdById: idOf(actor) };
}

async function loadCampaign(actor: Actor, id: string) {
  const c = await db().campaign.findFirst({ where: { id, ...campaignWhere(actor) } });
  if (!c) {
    if (await db().campaign.count({ where: { id } })) throw forbidden();
    throw notFound("Campaign");
  }
  return c;
}

export const parseSegment = (json: string): Segment => segmentSchema.parse(JSON.parse(json || "{}"));

export async function createCampaign(actor: Actor, input: z.input<typeof campaignInput>) {
  campaignWhere(actor);
  const d = parse(campaignInput, input);
  return transaction(async (tx) => {
    const c = await tx.campaign.create({ data: { name: d.name, messageText: d.messageText, segmentJson: JSON.stringify(d.segment), createdById: idOf(actor), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Campaign", entityId: c.id, action: "CREATE", after: c });
    return c;
  });
}

export async function updateCampaign(actor: Actor, id: string, input: z.input<typeof campaignInput>) {
  const c = await loadCampaign(actor, id);
  if (c.status === "DONE") throw ruleViolation("A finished campaign cannot be changed.");
  const d = parse(campaignInput, input);
  return transaction(async (tx) => {
    const after = await tx.campaign.update({ where: { id }, data: { name: d.name, messageText: d.messageText, segmentJson: JSON.stringify(d.segment), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Campaign", entityId: id, action: "UPDATE", before: c, after });
    return after;
  });
}

/**
 * Build (or rebuild) the recipient list: active clients in the actor's scope that match the segment,
 * their contacts (primary only, unless widened) who have not opted out and have a usable channel.
 * Rows already marked sent are kept.
 */
export async function buildRecipients(actor: Actor, id: string) {
  const c = await loadCampaign(actor, id);
  if (c.status === "DONE") throw ruleViolation("This campaign is finished.");
  const seg = parseSegment(c.segmentJson);
  const ids = await visibleClientIds(actor, "campaign.manage");
  const clients = await db().client.findMany({
    where: {
      status: "ACTIVE", isFirm: false,
      ...(ids ? { id: { in: ids } } : {}),
      ...(seg.categories.length ? { category: { in: seg.categories } } : {}),
      ...(seg.constitutions.length ? { constitution: { in: seg.constitutions } } : {}),
      ...(seg.groupIds.length ? { groupId: { in: seg.groupIds } } : {}),
      ...(seg.serviceLines.length ? { engagements: { some: { serviceLine: { in: seg.serviceLines }, status: { in: ["ACTIVE", "ON_HOLD"] } } } } : {}),
    },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } },
  });
  let skippedOptOut = 0;
  let skippedNoChannel = 0;
  const rows: { clientId: string; contactId: string; channel: string }[] = [];
  for (const cl of clients) {
    const contacts = seg.primaryOnly ? cl.contacts.filter((x, i) => x.isPrimary || (i === 0 && !cl.contacts.some((y) => y.isPrimary))) : cl.contacts;
    for (const ct of contacts) {
      if (ct.optOutCampaigns) {
        skippedOptOut += 1;
        continue;
      }
      const want = seg.channel === "PREFERRED" ? (ct.preferredChannel === "EMAIL" ? "EMAIL" : "WHATSAPP") : seg.channel;
      const channel = want === "EMAIL" ? (ct.email ? "EMAIL" : ct.whatsapp || ct.phone ? "WHATSAPP" : null) : ct.whatsapp || ct.phone ? "WHATSAPP" : ct.email ? "EMAIL" : null;
      if (!channel) {
        skippedNoChannel += 1;
        continue;
      }
      rows.push({ clientId: cl.id, contactId: ct.id, channel });
    }
  }
  return transaction(async (tx) => {
    const sent = await tx.campaignRecipient.findMany({ where: { campaignId: id, markedSentAt: { not: null } }, select: { contactId: true } });
    const sentContacts = new Set(sent.map((s) => s.contactId));
    await tx.campaignRecipient.deleteMany({ where: { campaignId: id, markedSentAt: null } });
    const fresh = rows.filter((r) => !sentContacts.has(r.contactId));
    if (fresh.length) await tx.campaignRecipient.createMany({ data: fresh.map((r) => ({ ...r, campaignId: id, createdById: idOf(actor) })) });
    await tx.campaign.update({ where: { id }, data: { status: "READY", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Campaign", entityId: id, action: "BUILD_RECIPIENTS", after: { recipients: fresh.length + sent.length, skippedOptOut, skippedNoChannel } });
    return { recipients: fresh.length + sent.length, skippedOptOut, skippedNoChannel };
  });
}

/** Message for one recipient: {name} → contact name, {client} → client name. */
export const personalise = (text: string, contactName: string, clientName: string) => text.replace(/\{name\}/g, contactName).replace(/\{client\}/g, clientName);

export async function getCampaign(actor: Actor, id: string) {
  const c = await loadCampaign(actor, id);
  const recipients = await db().campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" } });
  const contacts = new Map((await db().contact.findMany({ where: { id: { in: recipients.map((r) => r.contactId).filter((x): x is string => !!x) } } })).map((x) => [x.id, x]));
  const clients = new Map((await db().client.findMany({ where: { id: { in: recipients.map((r) => r.clientId) } }, select: { id: true, code: true, name: true } })).map((x) => [x.id, x]));
  const rows = recipients.map((r) => {
    const ct = r.contactId ? contacts.get(r.contactId) : undefined;
    const cl = clients.get(r.clientId);
    return {
      ...r, contactName: ct?.name ?? "", role: ct?.role ?? "", email: ct?.email ?? "", phone: ct?.whatsapp || ct?.phone || "", optedOut: !!ct?.optOutCampaigns,
      clientCode: cl?.code ?? "", clientName: cl?.name ?? "", message: personalise(c.messageText, ct?.name ?? "", cl?.name ?? ""),
    };
  });
  return { campaign: c, segment: parseSegment(c.segmentJson), recipients: rows };
}

export async function listCampaigns(actor: Actor) {
  const rows = await db().campaign.findMany({ where: campaignWhere(actor), orderBy: { createdAt: "desc" }, include: { recipients: { select: { markedSentAt: true } } }, take: 200 });
  return rows.map(({ recipients, ...c }) => ({ ...c, total: recipients.length, sent: recipients.filter((r) => r.markedSentAt).length }));
}

/** Mark recipients as sent (one, or every remaining one). Opted-out contacts are refused. */
export async function markRecipientsSent(actor: Actor, campaignId: string, recipientId?: string) {
  const c = await loadCampaign(actor, campaignId);
  if (c.status === "DRAFT") throw ruleViolation("Build the recipient list first.");
  const pending = await db().campaignRecipient.findMany({ where: { campaignId, markedSentAt: null, ...(recipientId ? { id: recipientId } : {}) } });
  if (recipientId && !pending.length) throw ruleViolation("Already marked sent.");
  const optedOut = new Set((await db().contact.findMany({ where: { id: { in: pending.map((p) => p.contactId).filter((x): x is string => !!x) }, optOutCampaigns: true }, select: { id: true } })).map((x) => x.id));
  const ok = pending.filter((p) => !p.contactId || !optedOut.has(p.contactId));
  if (recipientId && !ok.length) throw ruleViolation("This contact has opted out of client communications.");
  return transaction(async (tx) => {
    await tx.campaignRecipient.updateMany({ where: { id: { in: ok.map((p) => p.id) } }, data: { markedSentAt: new Date(), markedSentById: idOf(actor) } });
    if (optedOut.size) await tx.campaignRecipient.deleteMany({ where: { id: { in: pending.filter((p) => p.contactId && optedOut.has(p.contactId)).map((p) => p.id) } } });
    const left = await tx.campaignRecipient.count({ where: { campaignId, markedSentAt: null } });
    if (left === 0) await tx.campaign.update({ where: { id: campaignId }, data: { status: "DONE", updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Campaign", entityId: campaignId, action: "MARK_SENT", after: { marked: ok.length, removedOptedOut: optedOut.size } });
    return { marked: ok.length, removedOptedOut: optedOut.size };
  });
}

export async function campaignCsv(actor: Actor, id: string) {
  const { campaign, recipients } = await getCampaign(actor, id);
  const live = recipients.filter((r) => !r.optedOut);
  const csv = toCsv(
    ["Client code", "Client", "Contact", "Role", "Channel", "Email", "Phone / WhatsApp", "Message", "Marked sent"],
    live.map((r) => [r.clientCode, r.clientName, r.contactName, r.role, r.channel, r.email, r.phone, r.message, r.markedSentAt ? r.markedSentAt.toISOString().slice(0, 10) : ""]),
  );
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Campaign", entityId: id, action: "EXPORT", after: { rows: live.length } }));
  if (!live.length && !recipients.length) throw new DomainError("VALIDATION", "No recipients yet. Build the list first.");
  return { body: Buffer.from(csv, "utf8"), fileName: `Campaign - ${campaign.name}.csv`, contentType: "text/csv; charset=utf-8" };
}
