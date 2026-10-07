import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { storeFile } from "../../lib/storage";
import { notifyUsers } from "../notifications/service";
import { assertLeadAccess, idOf, nameSimilarity } from "./common";

/** Client onboarding checklist (P3-11, spec 10.4). Codes match the OnboardingItem schema comment. */
export const ONBOARDING_ITEMS: { code: string; label: string; auditOnly?: boolean }[] = [
  { code: "KYC_PAN", label: "KYC: PAN card" },
  { code: "KYC_ADDRESS", label: "KYC: address proof" },
  { code: "KYC_CONSTITUTION", label: "KYC: constitution documents (deed / MoA & AoA / registration certificate)" },
  { code: "KYC_SIGNATORY", label: "KYC: authorised signatory (ID and board resolution / authority letter)" },
  { code: "MASTER_DATA", label: "GST / MCA master data entered on the client record" },
  { code: "FLAGS_CONFIRMED", label: "Applicability flags confirmed, so the compliance calendar starts correctly" },
  { code: "CONFLICT_CHECK", label: "Conflict and independence check — Partner's decision recorded" },
  { code: "PREV_AUDITOR_NOC", label: "Previous auditor: communication / NOC recorded with attachment", auditOnly: true },
  { code: "PORTAL_INVITE", label: "Client portal invitation (portal arrives in Phase 4 — mark when done)" },
  { code: "CREDENTIALS", label: "Portal credentials collected into the vault (never by email)" },
];
const KYC = ["KYC_PAN", "KYC_ADDRESS", "KYC_CONSTITUTION", "KYC_SIGNATORY"];
export const CONFLICT_DECISIONS = ["CLEARED", "CLEARED_WITH_SAFEGUARDS", "DECLINED"] as const;

/** Create the checklist inside the caller's transaction (used on letter acceptance). Idempotent. */
export async function ensureChecklistTx(tx: Tx, actor: Actor, clientId: string, opts: { audit?: boolean } = {}) {
  let list = await tx.onboardingChecklist.findUnique({ where: { clientId }, include: { items: true } });
  if (!list) {
    list = await tx.onboardingChecklist.create({ data: { clientId, createdById: idOf(actor) }, include: { items: true } });
    await writeAudit(tx, actor, { entityType: "OnboardingChecklist", entityId: list.id, action: "CREATE", after: { clientId } });
  }
  const have = new Set(list.items.map((i) => i.code));
  for (const item of ONBOARDING_ITEMS) {
    if (have.has(item.code) || (item.auditOnly && !opts.audit)) continue;
    await tx.onboardingItem.create({ data: { checklistId: list.id, code: item.code, label: item.label, createdById: idOf(actor) } });
  }
  return list;
}

export async function startOnboarding(actor: Actor, clientId: string, opts: { audit?: boolean } = {}) {
  await assertClientAccess(actor, "crm.manage", clientId);
  const hasAudit = opts.audit ?? (await db().engagement.count({ where: { clientId, serviceLine: "AUDIT", status: { notIn: ["CANCELLED", "ARCHIVED"] } } })) > 0;
  return transaction((tx) => ensureChecklistTx(tx, actor, clientId, { audit: hasAudit }));
}

export async function getOnboarding(actor: Actor, clientId: string) {
  await assertClientAccess(actor, "crm.view", clientId);
  const [client, checklist, checks, lead] = await Promise.all([
    db().client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, code: true, name: true, pan: true, constitution: true, kycStatus: true, groupId: true, _count: { select: { gstins: true, directors: true } } } }),
    db().onboardingChecklist.findUnique({ where: { clientId }, include: { items: { orderBy: { createdAt: "asc" } } } }),
    db().conflictCheck.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    db().lead.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" } }),
  ]);
  const order = new Map(ONBOARDING_ITEMS.map((i, n) => [i.code, n]));
  const items = (checklist?.items ?? []).sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
  const docIds = items.map((i) => i.documentId).filter((x): x is string => !!x);
  const docs = new Map((await db().document.findMany({ where: { id: { in: docIds } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const people = new Map((await db().user.findMany({ where: { id: { in: [...items.map((i) => i.doneById), ...checks.flatMap((c) => [c.checkedById, c.decidedById])].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return { client, checklist, items, checks, lead, docs, people };
}

/** KYC status on the client follows the four KYC items. */
async function syncKyc(tx: Tx, actor: Actor, checklistId: string) {
  const list = await tx.onboardingChecklist.findUniqueOrThrow({ where: { id: checklistId }, include: { items: true } });
  const kycDone = list.items.filter((i) => KYC.includes(i.code) && i.done).length;
  const kycStatus = kycDone === 0 ? "PENDING" : kycDone === KYC.length ? "COMPLETE" : "PARTIAL";
  const client = await tx.client.findUniqueOrThrow({ where: { id: list.clientId }, select: { kycStatus: true } });
  if (client.kycStatus !== kycStatus) {
    await tx.client.update({ where: { id: list.clientId }, data: { kycStatus, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Client", entityId: list.clientId, action: "KYC_STATUS", before: { kycStatus: client.kycStatus }, after: { kycStatus }, reason: "Onboarding checklist" });
  }
  const allDone = list.items.length > 0 && list.items.every((i) => i.done);
  if (allDone !== !!list.completedAt) {
    await tx.onboardingChecklist.update({ where: { id: checklistId }, data: { completedAt: allDone ? new Date() : null, updatedById: idOf(actor) } });
    if (allDone) await writeAudit(tx, actor, { entityType: "OnboardingChecklist", entityId: checklistId, action: "COMPLETED" });
  }
}

async function loadItem(actor: Actor, itemId: string) {
  const item = await db().onboardingItem.findUnique({ where: { id: itemId }, include: { checklist: true } });
  if (!item) throw notFound("Checklist item");
  await assertClientAccess(actor, "crm.manage", item.checklist.clientId);
  return item;
}

const itemInput = z.object({ done: z.boolean(), note: z.string().trim().max(2000).default("") });

export async function setOnboardingItem(actor: Actor, itemId: string, input: z.input<typeof itemInput>) {
  const item = await loadItem(actor, itemId);
  const d = parse(itemInput, input);
  if (item.code === "CONFLICT_CHECK") throw ruleViolation("This item is completed by the Partner's conflict-check decision.");
  if (item.code === "PREV_AUDITOR_NOC" && d.done && !item.documentId) throw ruleViolation("Attach the previous auditor's communication / NOC first.");
  return transaction(async (tx) => {
    const after = await tx.onboardingItem.update({
      where: { id: itemId },
      data: { done: d.done, note: d.note || item.note, doneAt: d.done ? new Date() : null, doneById: d.done ? idOf(actor) : null, updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "OnboardingItem", entityId: itemId, action: d.done ? "DONE" : "UNDONE", before: { done: item.done }, after: { done: d.done, note: d.note } });
    await syncKyc(tx, actor, item.checklistId);
    return after;
  });
}

/** Attach a document (KYC copy, NOC) to a checklist item; stored in the client's documents. */
export async function attachOnboardingDocument(actor: Actor, itemId: string, file: { name: string; data: Buffer }) {
  const item = await loadItem(actor, itemId);
  const client = await db().client.findUniqueOrThrow({ where: { id: item.checklist.clientId }, select: { id: true, code: true } });
  const stored = await storeFile([client.code, "onboarding"], file.name, file.data);
  return transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        clientId: client.id, name: `${item.label.split(":")[0]} - ${file.name}`, kind: item.code.startsWith("KYC") ? "KYC" : item.code === "PREV_AUDITOR_NOC" ? "NOC" : "ONBOARDING",
        sourceType: "UPLOAD", confidentiality: "NORMAL", createdById: idOf(actor),
        versions: { create: { version: 1, storagePath: stored.storagePath, originalName: file.name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: idOf(actor) } },
      },
    });
    const done = item.code !== "CONFLICT_CHECK";
    await tx.onboardingItem.update({ where: { id: itemId }, data: { documentId: doc.id, ...(done ? { done: true, doneAt: item.doneAt ?? new Date(), doneById: item.doneById ?? idOf(actor) } : {}), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "OnboardingItem", entityId: itemId, action: "ATTACH", after: { documentId: doc.id, name: file.name } });
    await syncKyc(tx, actor, item.checklistId);
    return doc;
  });
}

/**
 * Conflict & independence check (spec 10.4): compares a new client (or a lead) with existing clients
 * and groups on PAN, name similarity and group similarity, plus directors shared with other clients.
 * The result is recorded and waits for a Partner's decision.
 */
export async function findConflicts(target: { name: string; pan: string | null; excludeClientId?: string; groupId?: string | null }) {
  const lines: string[] = [];
  const clients = await db().client.findMany({ where: { isFirm: false, ...(target.excludeClientId ? { id: { not: target.excludeClientId } } : {}) }, select: { id: true, code: true, name: true, pan: true, status: true, groupId: true, group: { select: { name: true } } } });
  for (const c of clients) {
    const why: string[] = [];
    if (target.pan && c.pan === target.pan) why.push("same PAN");
    const sim = nameSimilarity(target.name, c.name);
    if (sim >= 0.5) why.push(`similar name (${Math.round(sim * 100)}%)`);
    if (why.length) lines.push(`Client ${c.code} ${c.name}${c.group ? ` [group ${c.group.name}]` : ""} (${c.status.toLowerCase()}): ${why.join(", ")}`);
  }
  const groups = await db().clientGroup.findMany({ select: { id: true, code: true, name: true } });
  for (const g of groups) {
    if (g.id === target.groupId) continue;
    const sim = nameSimilarity(target.name, g.name);
    if (sim >= 0.5) lines.push(`Group ${g.code} ${g.name}: similar name (${Math.round(sim * 100)}%)`);
  }
  if (target.excludeClientId) {
    const dirs = await db().clientDirector.findMany({ where: { clientId: target.excludeClientId, ceasedOn: null }, select: { directorId: true } });
    if (dirs.length) {
      const shared = await db().clientDirector.findMany({ where: { directorId: { in: dirs.map((x) => x.directorId) }, clientId: { not: target.excludeClientId }, ceasedOn: null }, include: { client: { select: { code: true, name: true } }, director: { select: { name: true } } } });
      for (const s of shared) lines.push(`Shared director ${s.director.name} with client ${s.client.code} ${s.client.name}`);
    }
  }
  return lines;
}

export async function runConflictCheck(actor: Actor, clientId: string) {
  await assertClientAccess(actor, "crm.manage", clientId);
  const c = await db().client.findUniqueOrThrow({ where: { id: clientId } });
  const lines = await findConflicts({ name: c.name, pan: c.pan, excludeClientId: c.id, groupId: c.groupId });
  return recordCheck(actor, { clientId }, lines, c.name);
}

export async function runLeadConflictCheck(actor: Actor, leadId: string) {
  await assertLeadAccess(actor, "crm.manage", leadId);
  const l = await db().lead.findUniqueOrThrow({ where: { id: leadId } });
  const lines = await findConflicts({ name: l.name, pan: l.pan, excludeClientId: l.clientId ?? undefined });
  return recordCheck(actor, { leadId, clientId: l.clientId }, lines, l.name);
}

async function recordCheck(actor: Actor, target: { clientId?: string | null; leadId?: string }, lines: string[], name: string) {
  const row = await transaction(async (tx) => {
    const r = await tx.conflictCheck.create({
      data: { clientId: target.clientId ?? null, leadId: target.leadId ?? null, checkedById: idOf(actor) ?? "system", matchesText: lines.length ? lines.join("\n") : "No matches found against existing clients and groups.", createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "ConflictCheck", entityId: r.id, action: "CREATE", after: { ...target, matches: lines.length } });
    return r;
  });
  const partners = await db().user.findMany({ where: { role: "PARTNER", active: true }, select: { id: true } });
  await notifyUsers(partners.map((p) => p.id), {
    kind: "CONFLICT_CHECK", title: `Conflict check to decide: ${name}`, body: lines.length ? `${lines.length} possible match(es) found.` : "No matches found.",
    link: target.clientId ? `/crm/onboarding/${target.clientId}` : `/crm/leads/${target.leadId}`, entityType: "ConflictCheck", entityId: row.id, dedupeKey: `conflict:${row.id}`,
  });
  return row;
}

const decisionInput = z.object({ decision: z.enum(CONFLICT_DECISIONS), notes: z.string().trim().max(2000).default("") });

/** Only a Partner decides (conflictCheck.decide). Safeguards or a decline need a note. */
export async function decideConflict(actor: Actor, checkId: string, input: z.input<typeof decisionInput>) {
  authorize(actor, "conflictCheck.decide");
  const d = parse(decisionInput, input);
  const c = await db().conflictCheck.findUnique({ where: { id: checkId } });
  if (!c) throw notFound("Conflict check");
  if (c.partnerDecision) throw ruleViolation("This check is already decided; run a new check if facts changed.");
  if (d.decision !== "CLEARED" && d.notes.length < 5) throw new DomainError("VALIDATION", "Record the safeguards or the reason for declining.", { notes: "Notes" });
  return transaction(async (tx) => {
    const after = await tx.conflictCheck.update({ where: { id: checkId }, data: { partnerDecision: d.decision, decidedById: idOf(actor), decidedAt: new Date(), notes: d.notes, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ConflictCheck", entityId: checkId, action: "DECIDE", after: { decision: d.decision }, reason: d.notes });
    if (c.clientId) {
      const list = await tx.onboardingChecklist.findUnique({ where: { clientId: c.clientId } });
      const item = list ? await tx.onboardingItem.findUnique({ where: { checklistId_code: { checklistId: list.id, code: "CONFLICT_CHECK" } } }) : null;
      if (item && list) {
        const cleared = d.decision !== "DECLINED";
        await tx.onboardingItem.update({ where: { id: item.id }, data: { done: cleared, doneAt: cleared ? new Date() : null, doneById: cleared ? idOf(actor) : null, note: `${d.decision.replace(/_/g, " ").toLowerCase()}${d.notes ? `: ${d.notes}` : ""}`, updatedById: idOf(actor) } });
        await syncKyc(tx, actor, list.id);
      }
    }
    return after;
  });
}

/** Clients with an open onboarding checklist (for the CRM overview). */
export async function listOpenOnboarding(actor: Actor) {
  const { visibleClientIds, inClients } = await import("./common");
  const ids = await visibleClientIds(actor, "crm.view");
  const lists = await db().onboardingChecklist.findMany({ where: { completedAt: null, ...inClients(ids) }, include: { items: { select: { done: true } } }, take: 100 });
  const names = new Map((await db().client.findMany({ where: { id: { in: lists.map((l) => l.clientId) } }, select: { id: true, name: true, code: true } })).map((c) => [c.id, `${c.name} (${c.code})`]));
  return lists.map((l) => ({ clientId: l.clientId, name: names.get(l.clientId) ?? "", done: l.items.filter((i) => i.done).length, total: l.items.length }));
}
