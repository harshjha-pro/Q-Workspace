import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound } from "../../lib/errors";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, parseIso, todayIst } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import { updateClient } from "../clients/service";
import { ACTIVITY_KINDS, idOf, visibleClientIds } from "./common";

/** Contacts & communication log (P3-12, spec 10.5). Communication rows are Activity rows with a clientId. */
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const commInput = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  date: zIsoDate,
  notes: z.string().trim().min(2, "Add a short note").max(4000),
  engagementId: z.preprocess(blankToNull, z.string().nullable().optional()),
  nextFollowUp: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
});

/** Anyone who may see the client in CRM (incl. assigned Staff) can log a call / meeting / email / WhatsApp. */
export async function logClientCommunication(actor: Actor, clientId: string, input: z.input<typeof commInput>) {
  await assertClientAccess(actor, "crm.view", clientId);
  const d = parse(commInput, input);
  if (d.date > todayIst()) throw new DomainError("VALIDATION", "Date cannot be in the future.", { date: "Check the date" });
  if (d.engagementId) {
    const e = await db().engagement.findUnique({ where: { id: d.engagementId }, select: { clientId: true } });
    if (!e || e.clientId !== clientId) throw new DomainError("VALIDATION", "That engagement is not this client's.", { engagementId: "Choose this client's engagement" });
  }
  return transaction(async (tx) => {
    const a = await tx.activity.create({ data: { ...d, engagementId: d.engagementId ?? null, nextFollowUp: d.nextFollowUp ?? null, clientId, byUserId: idOf(actor)!, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Activity", entityId: a.id, action: "CREATE", after: { clientId, ...d } });
    return a;
  });
}

export async function getClientCommunications(actor: Actor, clientId: string) {
  await assertClientAccess(actor, "crm.view", clientId);
  const [client, activities, engagements] = await Promise.all([
    db().client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, code: true, name: true, category: true, tags: true, incorporationDate: true, preferredChannel: true, contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] } } }),
    db().activity.findMany({ where: { clientId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 300 }),
    db().engagement.findMany({ where: { clientId, status: { notIn: ["ARCHIVED", "CANCELLED"] } }, select: { id: true, code: true, name: true }, orderBy: { code: "desc" } }),
  ]);
  const people = new Map((await db().user.findMany({ where: { id: { in: activities.map((a) => a.byUserId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const engNames = new Map(engagements.map((e) => [e.id, `${e.code} ${e.name}`]));
  return { client, activities, engagements, people, engNames };
}

/** Campaign opt-out per contact (P3-16). */
export async function setContactOptOut(actor: Actor, contactId: string, optOut: boolean) {
  const c = await db().contact.findUnique({ where: { id: contactId } });
  if (!c) throw notFound("Contact");
  await assertClientAccess(actor, "crm.manage", c.clientId);
  return transaction(async (tx) => {
    const after = await tx.contact.update({ where: { id: contactId }, data: { optOutCampaigns: optOut, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Contact", entityId: contactId, action: optOut ? "OPT_OUT" : "OPT_IN", before: { optOutCampaigns: c.optOutCampaigns }, after: { optOutCampaigns: optOut } });
    return after;
  });
}

const tagInput = z.object({ category: z.preprocess(blankToNull, z.enum(["A", "B", "C"]).nullable()), tags: z.string().max(400).default("") });

/** Client category A/B/C and tags — stored on the client through the clients service. */
export async function setClientCategoryTags(actor: Actor, clientId: string, input: z.input<typeof tagInput>) {
  await assertClientAccess(actor, "crm.manage", clientId);
  const d = parse(tagInput, input);
  const tags = d.tags.split(",").map((t) => t.trim()).filter(Boolean).join(", ");
  return updateClient(actor, clientId, { category: d.category, tags });
}

export type KeyDate = { date: string; kind: "BIRTHDAY" | "INCORPORATION"; clientId: string; clientName: string; who: string; years: number | null };

/** Birthdays of contacts and incorporation anniversaries in the next N days (spec 10.5). */
export async function keyDates(actor: Actor, days = 30, today = todayIst()): Promise<KeyDate[]> {
  const ids = await visibleClientIds(actor, "crm.view");
  const window = new Map<string, string>(); // MM-DD → date in window
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i);
    window.set(d.slice(5), d);
  }
  // 29 Feb anniversaries fall on 28 Feb in other years.
  if (!window.has("02-29") && window.has("02-28")) window.set("02-29", window.get("02-28")!);
  const out: KeyDate[] = [];
  const contacts = await db().contact.findMany({ where: { birthday: { not: null }, client: { status: { in: ["ACTIVE", "DORMANT"] }, ...(ids ? { id: { in: ids } } : {}) } }, include: { client: { select: { id: true, name: true } } } });
  for (const c of contacts) {
    const hit = window.get(c.birthday!.slice(5));
    if (hit) out.push({ date: hit, kind: "BIRTHDAY", clientId: c.clientId, clientName: c.client.name, who: c.name, years: null });
  }
  const clients = await db().client.findMany({ where: { incorporationDate: { not: null }, status: { in: ["ACTIVE", "DORMANT"] }, isFirm: false, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true, incorporationDate: true } });
  for (const c of clients) {
    const hit = window.get(c.incorporationDate!.slice(5));
    if (hit) out.push({ date: hit, kind: "INCORPORATION", clientId: c.id, clientName: c.name, who: c.name, years: parseIso(hit).y - parseIso(c.incorporationDate!).y });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
}

