import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db, transaction } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { parse } from "../../lib/validate";
import type { Actor } from "../../permissions/actor";
import { authorize, isReadOnlyScope, requireStaff } from "../../permissions/guards";
import { engagementWhere } from "../../permissions/scopes";
import { writeAudit } from "../../audit";
import { getSettingNumber } from "../settings/service";
import { todayIst } from "../../lib/dates";
import { notifyUsers } from "../notifications/service";
import { signOff } from "../review/service";
import { auditFileCompleteness, isAuditEngagement } from "../dms/folders";

/**
 * Quality control (spec 13.2, P3-27): SQC 1 / SQM checklists per audit engagement, independence
 * declarations, the EQR gate, and helpers shared by inspections and the peer-review pack.
 */
export const QC_TEMPLATE_CODE = "QC_SQC1_AUDIT";
export const QC_TEMPLATE_NAME = "SQC 1 / SQM engagement quality checklist (Unverified: firm to review)";
/** Seeded into ChecklistTemplate QC_SQC1_AUDIT; the firm edits the wording. Items starting "EQR:" are skipped when no EQR is required. */
export const QC_DEFAULT_ITEMS = [
  "Acceptance and continuance: client and engagement acceptance or continuance evaluated and documented before work started",
  "Engagement letter issued and accepted by the client before fieldwork",
  "Independence: every engagement team member has declared independence; any threat and safeguard is recorded",
  "Engagement team: the team has the competence and time; maker, checker and engagement partner are assigned",
  "Planning: overall audit strategy and audit plan documented and approved by the engagement partner",
  "Materiality: overall and performance materiality set, with the basis documented",
  "Risk assessment: significant risks identified and the planned responses documented",
  "Documentation: working papers prepared, reviewed and signed off; all review points cleared",
  "Consultation on difficult or contentious matters documented, with the conclusion reached",
  "EQR: engagement quality review completed by a Partner not otherwise involved, before the report is signed",
  "Reporting: report agreed to the financial statements; management representation letter obtained",
  "Reporting: UDIN generated and recorded in the UDIN register",
  "File assembly: final engagement file assembled within 60 days of the report date (verify the period against SQC 1 / SQM)",
];

const uid = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

/** qc.manage at write level (Partner). Managers hold team_read: they see, but do not change. */
function requireQcWrite(actor: Actor) {
  const scope = authorize(actor, "qc.manage");
  if (isReadOnlyScope(scope)) throw forbidden("Managers can view quality control but only a Partner changes it.");
  return scope;
}

/** Engagements the actor may see in QC (Partner firm, Manager team). */
function qcEngagementWhere(actor: Actor): Prisma.EngagementWhereInput {
  const scope = authorize(actor, "qc.manage");
  return engagementWhere(actor, scope);
}

async function assertQcEngagement(actor: Actor, engagementId: string) {
  const e = await db().engagement.findFirst({ where: { AND: [{ id: engagementId }, qcEngagementWhere(actor)] }, include: { client: true } });
  if (!e) throw (await db().engagement.count({ where: { id: engagementId } })) ? forbidden() : notFound("Engagement");
  return e;
}

// ---------------------------------------------------------------------------
// EQR (13.2): required above the Partner-set threshold; reviewer is a different Partner
// ---------------------------------------------------------------------------

/**
 * Does this engagement need an engagement quality review? Yes when it is flagged eqrRequired, or when it
 * is an audit engagement for a public-interest client or with fee at/above `eqr.feeThresholdPaise`.
 */
export async function eqrRequired(engagementId: string): Promise<boolean> {
  const e = await db().engagement.findUnique({ where: { id: engagementId }, include: { client: { select: { publicInterest: true } } } });
  if (!e) throw notFound("Engagement");
  if (e.eqrRequired) return true;
  if (!isAuditEngagement(e)) return false;
  const threshold = await getSettingNumber("eqr.feeThresholdPaise", 50_000_00);
  return e.client.publicInterest || e.feePaise >= threshold;
}

/** The engagement partner: the engagement's own partner, else the client's. */
async function engagementPartnerId(e: { partnerId: string | null; clientId: string }) {
  if (e.partnerId) return e.partnerId;
  return (await db().client.findUnique({ where: { id: e.clientId }, select: { partnerId: true } }))?.partnerId ?? null;
}

export async function eqrReviewerOf(engagementId: string) {
  const a = await db().engagementAssignment.findFirst({ where: { engagementId, role: "EQR", toDate: null }, include: { user: { select: { id: true, displayName: true } } } });
  return a?.user ?? null;
}

/** Name the EQR Partner. Must be an active Partner other than the engagement partner. */
export async function assignEqrReviewer(actor: Actor, engagementId: string, reviewerId: string) {
  requireStaff(actor);
  requireQcWrite(actor);
  const e = await assertQcEngagement(actor, engagementId);
  if (!(await eqrRequired(engagementId))) throw ruleViolation("EQR is not required for this engagement.");
  const reviewer = await db().user.findUnique({ where: { id: reviewerId } });
  if (!reviewer || !reviewer.active || reviewer.role !== "PARTNER") throw new DomainError("VALIDATION", "The EQR reviewer must be an active Partner.", { reviewerId: "Choose a Partner" });
  if (reviewer.id === (await engagementPartnerId(e))) throw ruleViolation("The EQR reviewer must be a different Partner from the engagement partner.");
  const today = todayIst();
  return transaction(async (tx) => {
    const current = await tx.engagementAssignment.findMany({ where: { engagementId, role: "EQR", toDate: null } });
    for (const c of current) {
      if (c.userId === reviewerId) return c;
      await tx.engagementAssignment.update({ where: { id: c.id }, data: { toDate: today, updatedById: actor.userId } });
    }
    const a = await tx.engagementAssignment.create({ data: { engagementId, userId: reviewerId, role: "EQR", fromDate: today, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "EngagementAssignment", entityId: a.id, action: "ASSIGN_EQR", before: { reviewers: current.map((c) => c.userId) }, after: { engagementId, reviewerId } });
    return a;
  });
}

/**
 * Record the EQR sign-off on an audit task. Adds the QC rules (reviewer ≠ engagement partner, and the
 * named EQR Partner if one is assigned) and then uses the review service's sign-off, so there is one
 * sign-off record and one "EQR before Partner sign-off" rule.
 */
export async function performEqr(actor: Actor, taskId: string, note = "") {
  requireStaff(actor);
  authorize(actor, "eqr.perform");
  const t = await db().task.findUnique({ where: { id: taskId } });
  if (!t) throw notFound("Task");
  if (!t.engagementId) throw ruleViolation("EQR applies to engagement tasks only.");
  const e = await db().engagement.findUniqueOrThrow({ where: { id: t.engagementId } });
  if (!(await eqrRequired(e.id))) throw ruleViolation("EQR is not required for this engagement.");
  if (actor.userId === (await engagementPartnerId(e))) throw forbidden("The EQR reviewer must be a different Partner from the engagement partner.");
  const named = await eqrReviewerOf(e.id);
  if (named && named.id !== actor.userId) throw forbidden(`${named.displayName} is the named EQR reviewer for this engagement.`);
  return signOff(actor, taskId, "EQR", note);
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

async function templateItems(): Promise<string[]> {
  const tpl = await db().checklistTemplate.findUnique({ where: { code: QC_TEMPLATE_CODE }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  return tpl?.items.length ? tpl.items.map((i) => i.label) : QC_DEFAULT_ITEMS;
}

/** Start the QC checklist for an audit engagement (idempotent). Partner. */
export async function startChecklist(actor: Actor, engagementId: string) {
  requireQcWrite(actor);
  const e = await assertQcEngagement(actor, engagementId);
  if (!isAuditEngagement(e)) throw ruleViolation("QC checklists are for audit engagements.");
  const existing = await db().qCChecklist.findFirst({ where: { engagementId, templateCode: QC_TEMPLATE_CODE } });
  if (existing) return existing;
  const eqr = await eqrRequired(engagementId);
  const labels = await templateItems();
  return transaction(async (tx) => {
    const c = await tx.qCChecklist.create({
      data: {
        engagementId, templateCode: QC_TEMPLATE_CODE, createdById: uid(actor),
        items: { create: labels.map((label, i) => ({ label, sortOrder: i, ...(label.startsWith("EQR:") && !eqr ? { response: "NA", note: "EQR not required for this engagement" } : {}), createdById: uid(actor) })) },
      },
    });
    await writeAudit(tx, actor, { entityType: "QCChecklist", entityId: c.id, action: "CREATE", after: { engagementId, items: labels.length } });
    return c;
  });
}

const answerSchema = z.object({ response: z.enum(["YES", "NO", "NA", ""]), note: z.string().max(1000).default("") });

export async function answerChecklistItem(actor: Actor, itemId: string, input: z.input<typeof answerSchema>) {
  requireQcWrite(actor);
  const v = parse(answerSchema, input);
  const item = await db().qCChecklistItem.findUnique({ where: { id: itemId }, include: { checklist: true } });
  if (!item) throw notFound("Checklist item");
  await assertQcEngagement(actor, item.checklist.engagementId);
  if (item.checklist.status === "COMPLETE") throw ruleViolation("This checklist is complete. Reopen it to change answers.");
  if (v.response === "NO" && !v.note.trim()) throw new DomainError("VALIDATION", "Explain a 'No' answer.", { note: "Required for No" });
  return transaction(async (tx) => {
    const row = await tx.qCChecklistItem.update({ where: { id: itemId }, data: { response: v.response, note: v.note, updatedById: uid(actor) } });
    await writeAudit(tx, actor, { entityType: "QCChecklistItem", entityId: itemId, action: "UPDATE", before: item, after: row });
    return row;
  });
}

export async function completeChecklist(actor: Actor, checklistId: string, reopen = false) {
  requireQcWrite(actor);
  const c = await db().qCChecklist.findUnique({ where: { id: checklistId }, include: { items: true } });
  if (!c) throw notFound("Checklist");
  await assertQcEngagement(actor, c.engagementId);
  if (!reopen) {
    const blank = c.items.filter((i) => !i.response).length;
    if (blank) throw ruleViolation(`${blank} item(s) still need an answer.`);
  }
  return transaction(async (tx) => {
    const row = await tx.qCChecklist.update({
      where: { id: checklistId },
      data: reopen ? { status: "OPEN", completedById: null, completedAt: null } : { status: "COMPLETE", completedById: uid(actor), completedAt: new Date() },
    });
    await writeAudit(tx, actor, { entityType: "QCChecklist", entityId: checklistId, action: reopen ? "REOPEN" : "COMPLETE" });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Independence declarations (self only, by every engagement team member)
// ---------------------------------------------------------------------------

/** The team of an engagement: active assignments plus its partner and manager. */
export async function engagementTeam(engagementId: string) {
  const e = await db().engagement.findUnique({ where: { id: engagementId }, select: { partnerId: true, managerId: true, assignments: { where: { toDate: null }, select: { userId: true } } } });
  if (!e) throw notFound("Engagement");
  const ids = [...new Set([e.partnerId, e.managerId, ...e.assignments.map((a) => a.userId)].filter((x): x is string => !!x))];
  return db().user.findMany({ where: { id: { in: ids }, active: true, isSystem: false }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: "asc" } });
}

const declareSchema = z.object({ userId: z.string().optional(), hasConflict: z.boolean().default(false), note: z.string().trim().max(1000).default("") });

export async function declareIndependence(actor: Actor, engagementId: string, input: z.input<typeof declareSchema>) {
  requireStaff(actor);
  authorize(actor, "qc.declare");
  const v = parse(declareSchema, input);
  if (v.userId && v.userId !== actor.userId) throw forbidden("Each person declares their own independence.");
  const e = await db().engagement.findUnique({ where: { id: engagementId } });
  if (!e) throw notFound("Engagement");
  if (!isAuditEngagement(e)) throw ruleViolation("Independence declarations are taken for audit engagements.");
  const team = await engagementTeam(engagementId);
  if (!team.some((m) => m.id === actor.userId)) throw forbidden("Only members of the engagement team declare independence for it.");
  if (v.hasConflict && !v.note) throw new DomainError("VALIDATION", "Describe the conflict or threat.", { note: "Required when there is a conflict" });
  const before = await db().independenceDeclaration.findUnique({ where: { engagementId_userId: { engagementId, userId: actor.userId } } });
  const row = await transaction(async (tx) => {
    const r = await tx.independenceDeclaration.upsert({
      where: { engagementId_userId: { engagementId, userId: actor.userId } },
      create: { engagementId, userId: actor.userId, hasConflict: v.hasConflict, note: v.note, declaredAt: new Date(), createdById: actor.userId },
      update: { hasConflict: v.hasConflict, note: v.note, declaredAt: new Date(), updatedById: actor.userId },
    });
    await writeAudit(tx, actor, { entityType: "IndependenceDeclaration", entityId: r.id, action: before ? "UPDATE" : "CREATE", before, after: r });
    return r;
  });
  if (v.hasConflict) {
    const partner = await engagementPartnerId(e);
    await notifyUsers([partner, e.managerId].filter((x): x is string => !!x && x !== actor.userId), {
      kind: "INDEPENDENCE_CONFLICT", title: `Independence threat declared on ${e.code}`, body: `${actor.displayName}: ${v.note}`, link: `/qc?engagement=${e.id}`,
      entityType: "Engagement", entityId: e.id, priority: "HIGH", dedupeKey: `INDEP|${row.id}|${row.declaredAt.toISOString()}`,
    });
  }
  return row;
}

/** Audit engagements where I am on the team, with my declaration (pending first). */
export async function myIndependence(actor: Actor) {
  requireStaff(actor);
  authorize(actor, "qc.declare");
  const engagements = await db().engagement.findMany({
    where: {
      status: { in: ["ACTIVE", "ON_HOLD"] },
      OR: [{ serviceLine: "AUDIT" }, { engagementType: "AUDIT" }],
      AND: [{ OR: [{ partnerId: actor.userId }, { managerId: actor.userId }, { assignments: { some: { userId: actor.userId, toDate: null } } }] }],
    },
    include: { client: { select: { name: true, code: true } } },
    orderBy: { code: "asc" },
  });
  const decl = await db().independenceDeclaration.findMany({ where: { userId: actor.userId, engagementId: { in: engagements.map((e) => e.id) } } });
  const byEng = new Map(decl.map((d) => [d.engagementId, d]));
  return engagements
    .map((e) => ({ engagementId: e.id, code: e.code, name: e.name, client: e.client.name, declaration: byEng.get(e.id) ?? null }))
    .sort((a, b) => Number(!!a.declaration) - Number(!!b.declaration));
}

// ---------------------------------------------------------------------------
// Overview and per-engagement detail
// ---------------------------------------------------------------------------

export async function qcOverview(actor: Actor, opts: { includeClosed?: boolean } = {}) {
  const engagements = await db().engagement.findMany({
    where: {
      AND: [qcEngagementWhere(actor), { OR: [{ serviceLine: "AUDIT" }, { engagementType: "AUDIT" }] }, opts.includeClosed ? {} : { status: { in: ["ACTIVE", "ON_HOLD"] } }],
    },
    include: { client: { select: { name: true, code: true, publicInterest: true } }, assignments: { where: { toDate: null } } },
    orderBy: { code: "asc" },
    take: 500,
  });
  const ids = engagements.map((e) => e.id);
  const [checklists, decls, eqrSignoffs, threshold] = await Promise.all([
    db().qCChecklist.findMany({ where: { engagementId: { in: ids } }, include: { items: { select: { response: true } } } }),
    db().independenceDeclaration.findMany({ where: { engagementId: { in: ids } }, select: { engagementId: true, userId: true, hasConflict: true } }),
    db().signOff.findMany({ where: { engagementId: { in: ids }, level: "EQR" }, select: { engagementId: true } }),
    getSettingNumber("eqr.feeThresholdPaise", 50_000_00),
  ]);
  const people = new Map((await db().user.findMany({ where: { id: { in: [...new Set(engagements.flatMap((e) => e.assignments.filter((a) => a.role === "EQR").map((a) => a.userId)))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const out = [];
  for (const e of engagements) {
    const team = new Set([e.partnerId, e.managerId, ...e.assignments.filter((a) => a.role !== "EQR").map((a) => a.userId)].filter(Boolean));
    const d = decls.filter((x) => x.engagementId === e.id && team.has(x.userId));
    const c = checklists.find((x) => x.engagementId === e.id);
    const eqr = e.eqrRequired || e.client.publicInterest || e.feePaise >= threshold;
    const reviewer = e.assignments.find((a) => a.role === "EQR");
    out.push({
      id: e.id, code: e.code, name: e.name, client: e.client.name, status: e.status,
      checklist: c ? { id: c.id, status: c.status, answered: c.items.filter((i) => i.response).length, total: c.items.length } : null,
      independence: { declared: d.length, team: team.size, conflicts: d.filter((x) => x.hasConflict).length },
      eqr: { required: eqr, reviewer: reviewer ? (people.get(reviewer.userId) ?? "") : null, done: eqrSignoffs.some((s) => s.engagementId === e.id) },
      auditFile: (await auditFileCompleteness(e.id)).percent,
    });
  }
  return out;
}

export async function engagementQc(actor: Actor, engagementId: string) {
  const e = await assertQcEngagement(actor, engagementId);
  const [checklist, team, decls, required, reviewer, audit, signoffs, partners] = await Promise.all([
    db().qCChecklist.findFirst({ where: { engagementId, templateCode: QC_TEMPLATE_CODE }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    engagementTeam(engagementId),
    db().independenceDeclaration.findMany({ where: { engagementId } }),
    eqrRequired(engagementId),
    eqrReviewerOf(engagementId),
    auditFileCompleteness(engagementId),
    db().signOff.findMany({ where: { engagementId }, orderBy: { signedAt: "asc" } }),
    db().user.findMany({ where: { role: "PARTNER", active: true, isSystem: false }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
  ]);
  const ep = await engagementPartnerId(e);
  const names = new Map((await db().user.findMany({ where: { id: { in: signoffs.map((s) => s.signedById) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return {
    engagement: { id: e.id, code: e.code, name: e.name, client: e.client.name, status: e.status, partnerId: ep },
    checklist,
    team: team.map((m) => ({ ...m, declaration: decls.find((d) => d.userId === m.id) ?? null })),
    eqr: { required, reviewer, candidates: partners.filter((p) => p.id !== ep) },
    auditFile: audit,
    signoffs: signoffs.map((s) => ({ id: s.id, level: s.level, by: names.get(s.signedById) ?? "", at: s.signedAt, taskId: s.taskId })),
    canWrite: !isReadOnlyScope(authorize(actor, "qc.manage")),
  };
}
