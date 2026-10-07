import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, todayIst } from "../../lib/dates";
import { toSearch } from "../../lib/codes";
import { CONSTITUTIONS, PAN_RE, GSTIN_RE, SERVICE_LINES, zIsoDate } from "../../domain/enums";
import { notifyUsers } from "../notifications/service";
import {
  ACTIVITY_KINDS, LEAD_SOURCES, LEAD_STAGES, LEAD_STAGE_LABELS, OPEN_LEAD_STAGES, type LeadStage,
  assertLeadAccess, canSeeFees, idOf, leadWhere, normEmail, normGstin, normPan, normPhone, visibleClientIds,
} from "./common";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const upperOpt = (re: RegExp, msg: string) => z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(re, msg).nullable().optional());

const leadInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(160),
  entityType: z.enum(CONSTITUTIONS).default("OTHER"),
  contactName: z.string().trim().max(120).default(""),
  email: z.preprocess(blankToNull, z.string().trim().toLowerCase().email("Not a valid email").nullable().optional()),
  phone: z.preprocess(blankToNull, z.string().trim().regex(/^[+\d][\d\s-]{7,}$/, "Not a valid phone number").nullable().optional()),
  pan: upperOpt(PAN_RE, "PAN format is AAAAA9999A"),
  gstin: upperOpt(GSTIN_RE, "GSTIN format is 15 characters, e.g. 27AAACS1234F1Z5"),
  services: z.array(z.enum(SERVICE_LINES)).default([]),
  estFeePaise: z.number().int().min(0).default(0),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  referrerClientId: z.preprocess(blankToNull, z.string().nullable().optional()),
  referrerName: z.string().trim().max(120).default(""),
  ownerId: z.preprocess(blankToNull, z.string().nullable().optional()),
  nextFollowUp: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  notes: z.string().max(4000).default(""),
  clientId: z.preprocess(blankToNull, z.string().nullable().optional()),
});
export type LeadInput = z.input<typeof leadInput> & { overrideReason?: string };

export type DuplicateMatch = { kind: "LEAD" | "CLIENT"; id: string; label: string; matchedOn: string[]; visible: boolean };

/**
 * Duplicate check on PAN, GSTIN, email and phone against leads AND clients (spec 10.1). Runs firm-wide
 * (a duplicate in another team is still a duplicate) but names only records the actor may see.
 */
export async function findDuplicates(
  actor: Actor,
  ids: { pan?: string | null; gstin?: string | null; email?: string | null; phone?: string | null },
  excludeLeadId?: string,
): Promise<DuplicateMatch[]> {
  authorize(actor, "crm.view");
  const pan = normPan(ids.pan);
  const gstin = normGstin(ids.gstin);
  const email = normEmail(ids.email);
  const phone = normPhone(ids.phone);
  const panFromGstin = gstin ? gstin.slice(2, 12) : null;
  const pans = [...new Set([pan, panFromGstin].filter((x): x is string => !!x))];
  if (!pans.length && !gstin && !email && !phone) return [];
  const out = new Map<string, DuplicateMatch>();
  const add = (kind: "LEAD" | "CLIENT", id: string, label: string, on: string) => {
    const key = `${kind}:${id}`;
    const m = out.get(key) ?? { kind, id, label, matchedOn: [], visible: false };
    if (!m.matchedOn.includes(on)) m.matchedOn.push(on);
    out.set(key, m);
  };

  // Leads
  const leadOr = [
    ...(pans.length ? [{ pan: { in: pans } }] : []),
    ...(gstin ? [{ gstin }] : []),
    ...(pans.length ? pans.map((p) => ({ gstin: { contains: p } })) : []),
    ...(email ? [{ email }] : []),
    ...(phone && phone.length >= 10 ? [{ phone: { contains: phone } }] : []),
  ];
  const leads = await db().lead.findMany({ where: { OR: leadOr, ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}) }, take: 50 });
  for (const l of leads) {
    const label = `Lead: ${l.name} (${LEAD_STAGE_LABELS[l.stage as LeadStage] ?? l.stage})`;
    if (l.pan && pans.includes(l.pan)) add("LEAD", l.id, label, l.pan === pan ? "PAN" : "PAN in GSTIN");
    if (l.gstin && (l.gstin === gstin || pans.includes(l.gstin.slice(2, 12)))) add("LEAD", l.id, label, l.gstin === gstin ? "GSTIN" : "PAN in GSTIN");
    if (email && l.email === email) add("LEAD", l.id, label, "email");
    if (phone && normPhone(l.phone) === phone) add("LEAD", l.id, label, "phone");
  }

  // Clients (PAN, any GSTIN, contacts' email / phone)
  const clientOr = [
    ...(pans.length ? [{ pan: { in: pans } }] : []),
    ...(gstin || pans.length ? [{ gstins: { some: { OR: [...(gstin ? [{ gstin }] : []), ...pans.map((p) => ({ gstin: { contains: p } }))] } } }] : []),
    ...(email ? [{ contacts: { some: { email } } }] : []),
    ...(phone && phone.length >= 10 ? [{ contacts: { some: { OR: [{ phone: { contains: phone } }, { whatsapp: { contains: phone } }] } } }] : []),
  ];
  const clients = await db().client.findMany({
    where: { OR: clientOr, isFirm: false },
    include: { gstins: { select: { gstin: true } }, contacts: { select: { email: true, phone: true, whatsapp: true } } },
    take: 50,
  });
  for (const c of clients) {
    const label = `Client: ${c.name} (${c.code})`;
    if (c.pan && pans.includes(c.pan)) add("CLIENT", c.id, label, c.pan === pan ? "PAN" : "PAN in GSTIN");
    for (const g of c.gstins) if (g.gstin === gstin || pans.includes(g.gstin.slice(2, 12))) add("CLIENT", c.id, label, g.gstin === gstin ? "GSTIN" : "PAN in GSTIN");
    if (email && c.contacts.some((x) => normEmail(x.email) === email)) add("CLIENT", c.id, label, "email");
    if (phone && c.contacts.some((x) => normPhone(x.phone) === phone || normPhone(x.whatsapp) === phone)) add("CLIENT", c.id, label, "phone");
  }

  // Name only what the actor may see; others are reported without identifying details.
  const matches = [...out.values()];
  const visibleLeadIds = new Set((await db().lead.findMany({ where: { AND: [{ id: { in: matches.filter((m) => m.kind === "LEAD").map((m) => m.id) } }, await leadWhere(actor, "crm.view")] }, select: { id: true } })).map((r) => r.id));
  let clientScope: string[] | null = [];
  try {
    clientScope = await visibleClientIds(actor, "client.view");
  } catch {
    clientScope = [];
  }
  for (const m of matches) {
    m.visible = m.kind === "LEAD" ? visibleLeadIds.has(m.id) : clientScope === null || clientScope.includes(m.id);
    if (!m.visible) m.label = m.kind === "LEAD" ? "A lead owned outside your team" : "An existing client outside your team";
  }
  return matches;
}

function describeDuplicates(matches: DuplicateMatch[]) {
  return matches.map((m) => `${m.label} — matches on ${m.matchedOn.join(", ")}`).join("; ");
}

async function checkOwner(ownerId: string | null | undefined) {
  if (!ownerId) return;
  const u = await db().user.findUnique({ where: { id: ownerId } });
  if (!u || !u.active) throw new DomainError("VALIDATION", "Owner must be an active person.", { ownerId: "Choose an active Partner or Manager" });
  if (u.role !== "PARTNER" && u.role !== "MANAGER") throw new DomainError("VALIDATION", "A lead is owned by a Partner or Manager.", { ownerId: "Choose a Partner or Manager" });
}

function checkSource(d: { source?: string; referrerClientId?: string | null; referrerName?: string }) {
  if (d.source === "REFERRAL" && !d.referrerClientId && !d.referrerName?.trim()) {
    throw new DomainError("VALIDATION", "Say who referred this lead.", { referrerName: "Referring client or person" });
  }
}

/** New enquiry (P3-08). Duplicates block saving until an override reason is given. */
export async function createLead(actor: Actor, input: LeadInput) {
  const scope = authorize(actor, "crm.manage");
  const d = parse(leadInput, input);
  checkSource(d);
  if (!d.ownerId && actor.kind === "USER" && (actor.role === "PARTNER" || actor.role === "MANAGER")) d.ownerId = actor.userId;
  await checkOwner(d.ownerId);
  if (d.clientId || d.referrerClientId) {
    const ids = await visibleClientIds(actor, "crm.view");
    for (const cid of [d.clientId, d.referrerClientId]) if (cid && ids && !ids.includes(cid)) throw new DomainError("FORBIDDEN", "That client is outside your scope.");
  }
  void scope;
  const dups = d.clientId ? [] : await findDuplicates(actor, d);
  const override = input.overrideReason?.trim() ?? "";
  if (dups.length && override.length < 5) {
    throw new DomainError("VALIDATION", `Possible duplicate: ${describeDuplicates(dups)}. Check before saving, or give a reason to save anyway.`, { overrideReason: "Reason to save despite the match" });
  }
  const { services, ...rest } = d;
  return transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        ...rest,
        servicesCsv: services.join(","),
        searchName: toSearch(d.name, d.contactName, d.pan, d.gstin, d.email),
        notes: dups.length ? `${d.notes}${d.notes ? "\n" : ""}[Duplicate warning overridden: ${override}]` : d.notes,
        createdById: idOf(actor),
        updatedById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "Lead", entityId: lead.id, action: "CREATE", after: lead, reason: dups.length ? `Duplicate override: ${override} (${describeDuplicates(dups)})` : "" });
    return lead;
  });
}

const leadUpdate = leadInput.omit({ clientId: true });

export async function updateLead(actor: Actor, leadId: string, input: Partial<z.input<typeof leadUpdate>> & { overrideReason?: string }) {
  await assertLeadAccess(actor, "crm.manage", leadId);
  const d = parsePartial(leadUpdate, input);
  const before = await db().lead.findUniqueOrThrow({ where: { id: leadId } });
  if (before.stage === "WON") throw ruleViolation("A won lead is closed; edit the client instead.");
  checkSource({ source: d.source ?? before.source, referrerClientId: d.referrerClientId ?? before.referrerClientId, referrerName: d.referrerName ?? before.referrerName });
  if (d.ownerId !== undefined) await checkOwner(d.ownerId);
  const idsChanged = (["pan", "gstin", "email", "phone"] as const).some((k) => d[k] !== undefined && d[k] !== before[k]);
  let dups: DuplicateMatch[] = [];
  const override = input.overrideReason?.trim() ?? "";
  if (idsChanged && !before.clientId) {
    dups = await findDuplicates(actor, { pan: d.pan ?? before.pan, gstin: d.gstin ?? before.gstin, email: d.email ?? before.email, phone: d.phone ?? before.phone }, leadId);
    if (dups.length && override.length < 5) {
      throw new DomainError("VALIDATION", `Possible duplicate: ${describeDuplicates(dups)}. Check before saving, or give a reason to save anyway.`, { overrideReason: "Reason to save despite the match" });
    }
  }
  const { services, ...rest } = d;
  return transaction(async (tx) => {
    const merged = { ...before, ...rest };
    const after = await tx.lead.update({
      where: { id: leadId },
      data: {
        ...rest,
        ...(services ? { servicesCsv: services.join(",") } : {}),
        searchName: toSearch(merged.name, merged.contactName, merged.pan, merged.gstin, merged.email),
        ...(dups.length ? { notes: `${merged.notes}${merged.notes ? "\n" : ""}[Duplicate warning overridden: ${override}]` } : {}),
        updatedById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "Lead", entityId: leadId, action: "UPDATE", before, after, reason: dups.length ? `Duplicate override: ${override}` : "" });
    return after;
  });
}

const stageInput = z.object({ stage: z.enum(LEAD_STAGES), lostReason: z.preprocess(blankToNull, z.string().trim().nullable().optional()) });

/**
 * Stage rules (spec 10.1): Lost needs a reason; Won is reached by accepting an engagement letter, or
 * directly only for a lead that is already linked to a client; a won lead is final; a lost lead may reopen.
 */
export async function setLeadStage(actor: Actor, leadId: string, input: z.input<typeof stageInput>) {
  await assertLeadAccess(actor, "crm.manage", leadId);
  const d = parse(stageInput, input);
  const before = await db().lead.findUniqueOrThrow({ where: { id: leadId } });
  if (before.stage === d.stage) return before;
  if (before.stage === "WON") throw ruleViolation("A won lead cannot change stage.");
  if (d.stage === "LOST" && (!d.lostReason || d.lostReason.length < 3)) throw new DomainError("VALIDATION", "Give the reason the lead was lost.", { lostReason: "Why was it lost?" });
  if (d.stage === "WON" && !before.clientId) throw ruleViolation("A new client is won by accepting its engagement letter (upload the signed copy).");
  return transaction(async (tx) => {
    const after = await tx.lead.update({
      where: { id: leadId },
      data: {
        stage: d.stage,
        lostReason: d.stage === "LOST" ? d.lostReason : null,
        wonAt: d.stage === "WON" ? new Date() : null,
        nextFollowUp: d.stage === "LOST" || d.stage === "WON" ? null : before.nextFollowUp,
        updatedById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "Lead", entityId: leadId, action: "STAGE", before: { stage: before.stage }, after: { stage: d.stage, lostReason: after.lostReason }, reason: d.lostReason ?? "" });
    return after;
  });
}

const activityInput = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  date: zIsoDate,
  notes: z.string().trim().min(2, "Add a short note").max(4000),
  nextFollowUp: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
});

/** Call / meeting / email / WhatsApp on a lead; sets the next follow-up date (P3-08). */
export async function addLeadActivity(actor: Actor, leadId: string, input: z.input<typeof activityInput>) {
  await assertLeadAccess(actor, "crm.view", leadId);
  const d = parse(activityInput, input);
  if (d.date > todayIst()) throw new DomainError("VALIDATION", "Activity date cannot be in the future.", { date: "Check the date" });
  if (d.nextFollowUp && d.nextFollowUp < todayIst()) throw new DomainError("VALIDATION", "Follow-up date is in the past.", { nextFollowUp: "Pick today or later" });
  const lead = await db().lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.stage === "WON" || lead.stage === "LOST") throw ruleViolation("This lead is closed.");
  return transaction(async (tx) => {
    const a = await tx.activity.create({ data: { ...d, nextFollowUp: d.nextFollowUp ?? null, leadId, clientId: lead.clientId, byUserId: idOf(actor)!, createdById: idOf(actor) } });
    const stage = lead.stage === "NEW" && d.kind !== "NOTE" ? "CONTACTED" : lead.stage;
    await tx.lead.update({ where: { id: leadId }, data: { stage, ...(d.nextFollowUp !== undefined ? { nextFollowUp: d.nextFollowUp } : {}), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Activity", entityId: a.id, action: "CREATE", after: { leadId, ...d } });
    return a;
  });
}

export async function listLeads(actor: Actor, f: { stage?: string; ownerId?: string; q?: string; open?: boolean } = {}) {
  const where = await leadWhere(actor, "crm.view");
  const rows = await db().lead.findMany({
    where: {
      AND: [
        where,
        f.stage ? { stage: f.stage } : f.open ? { stage: { in: OPEN_LEAD_STAGES } } : {},
        f.ownerId ? { ownerId: f.ownerId } : {},
        f.q ? { searchName: { contains: f.q.toLowerCase() } } : {},
      ],
    },
    orderBy: [{ nextFollowUp: "asc" }, { updatedAt: "desc" }],
    take: 500,
  });
  const owners = new Map((await db().user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const fees = canSeeFees(actor);
  return rows.map((r) => ({ ...r, estFeePaise: fees ? r.estFeePaise : 0, ownerName: r.ownerId ? (owners.get(r.ownerId) ?? "") : "" }));
}

/** Business-development hours logged against the lead (WorkEntry.leadId), total and by person. */
export async function leadHours(leadId: string) {
  const rows = await db().workEntry.groupBy({ by: ["userId"], where: { leadId, deletedAt: null }, _sum: { minutes: true } });
  const names = new Map((await db().user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const byPerson = rows.map((r) => ({ userId: r.userId, name: names.get(r.userId) ?? "", minutes: r._sum.minutes ?? 0 })).sort((a, b) => b.minutes - a.minutes);
  return { totalMinutes: byPerson.reduce((s, r) => s + r.minutes, 0), byPerson };
}

export async function getLead(actor: Actor, leadId: string) {
  await assertLeadAccess(actor, "crm.view", leadId);
  const lead = await db().lead.findUniqueOrThrow({ where: { id: leadId }, include: { activities: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } } });
  const fees = canSeeFees(actor);
  const [hours, duplicates, people, proposals, client, referrer] = await Promise.all([
    leadHours(leadId),
    lead.clientId ? Promise.resolve([] as DuplicateMatch[]) : findDuplicates(actor, lead, leadId),
    db().user.findMany({ where: { id: { in: [lead.ownerId, ...lead.activities.map((a) => a.byUserId)].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } }),
    fees ? db().proposal.findMany({ where: { leadId }, orderBy: [{ createdAt: "desc" }] }) : Promise.resolve([]),
    lead.clientId ? db().client.findUnique({ where: { id: lead.clientId }, select: { id: true, code: true, name: true } }) : Promise.resolve(null),
    lead.referrerClientId ? db().client.findUnique({ where: { id: lead.referrerClientId }, select: { id: true, code: true, name: true } }) : Promise.resolve(null),
  ]);
  const letters = fees && proposals.length ? await db().engagementLetter.findMany({ where: { proposalId: { in: proposals.map((p) => p.id) } }, orderBy: { createdAt: "desc" } }) : [];
  return {
    lead: { ...lead, estFeePaise: fees ? lead.estFeePaise : 0 },
    names: new Map(people.map((u) => [u.id, u.displayName])),
    hours, duplicates, proposals, letters, client, referrer, canSeeFees: fees,
  };
}

export async function getLeadOrThrow(leadId: string) {
  const l = await db().lead.findUnique({ where: { id: leadId } });
  if (!l) throw notFound("Lead");
  return l;
}

/**
 * Daily job: tell each owner about leads whose follow-up falls today. Overdue follow-ups from the
 * last week are included once (the office laptop may have been off), deduplicated per follow-up date.
 */
export async function runLeadFollowUps(today: string = todayIst()) {
  const due = await db().lead.findMany({ where: { stage: { in: OPEN_LEAD_STAGES }, nextFollowUp: { lte: today, gte: addDays(today, -7) }, ownerId: { not: null } } });
  let notified = 0;
  for (const l of due) {
    notified += await notifyUsers([l.ownerId!], {
      kind: "LEAD_FOLLOW_UP",
      title: l.nextFollowUp === today ? `Follow up today: ${l.name}` : `Follow-up overdue: ${l.name}`,
      body: `Stage: ${LEAD_STAGE_LABELS[l.stage as LeadStage] ?? l.stage}${l.contactName ? ` · Contact: ${l.contactName}` : ""}${l.phone ? ` · ${l.phone}` : ""}`,
      link: `/crm/leads/${l.id}`,
      entityType: "Lead",
      entityId: l.id,
      dedupeKey: `lead-followup:${l.id}:${l.nextFollowUp}`,
    });
  }
  return { checked: due.length, notified };
}
