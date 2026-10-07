import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can, scopeOf } from "../../permissions/guards";
import { userWhere } from "../../permissions/scopes";
import { systemActor, type Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { addDays, diffDays, todayIst } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { hrPeople, idOf, namesOf, seesSalaryFirm, zIso } from "./common";

// ---------------------------------------------------------------------------
// Articleship tracking (spec 11.7, P3-02)
// ---------------------------------------------------------------------------

export type ArticleshipRules = { extendByExcessLeave: boolean; completionAlertDays: number; countedLeaveTypes: string[] };

/** Rules live in settings so they can follow ICAI/ICSI regulation changes (spec 11.7, last bullet). */
export async function articleshipRules(): Promise<ArticleshipRules> {
  const [extendByExcessLeave, completionAlertDays, countedLeaveTypes] = await Promise.all([
    getSetting<boolean>("articleship.extendByExcessLeave", true),
    getSetting<number>("articleship.completionAlertDays", 90),
    getSetting<string[]>("articleship.countedLeaveTypes", ["PERSONAL", "SICK", "EXAM_STUDY", "OTHER"]),
  ]);
  return { extendByExcessLeave, completionAlertDays, countedLeaveTypes };
}

/**
 * Pure rule: leave taken beyond the entitlement extends completion day-for-day (when the rule is on).
 * Leave is counted in half days; a half day of excess still pushes completion by a full day.
 */
export function completionFor(rec: { expectedEndDate: string; leaveEntitledDays: number }, takenHalfDays: number, rules: Pick<ArticleshipRules, "extendByExcessLeave">) {
  const excessHalfDays = Math.max(0, takenHalfDays - rec.leaveEntitledDays * 2);
  const excessDays = Math.ceil(excessHalfDays / 2);
  const revisedEndDate = rules.extendByExcessLeave && excessDays > 0 ? addDays(rec.expectedEndDate, excessDays) : rec.expectedEndDate;
  return { excessHalfDays, excessDays, excessLeave: excessHalfDays > 0, revisedEndDate };
}

/** Approved leave (half days) since the start of articleship, of the leave types the rule counts. */
async function leaveTakenHalfDays(userId: string, from: string, types: string[]) {
  const reqs = await db().leaveRequest.findMany({ where: { userId, status: "APPROVED", fromDate: { gte: from }, leaveType: { in: types } }, select: { halfDays: true, leaveType: true } });
  const byType: Record<string, number> = {};
  for (const r of reqs) byType[r.leaveType] = (byType[r.leaveType] ?? 0) + r.halfDays;
  return { total: reqs.reduce((s, r) => s + r.halfDays, 0), byType };
}

async function summarise(rec: { userId: string; startDate: string; expectedEndDate: string; leaveEntitledDays: number; status: string }, rules: ArticleshipRules, today: string) {
  const taken = await leaveTakenHalfDays(rec.userId, rec.startDate, rules.countedLeaveTypes);
  const c = completionFor(rec, taken.total, rules);
  const daysToCompletion = diffDays(today, c.revisedEndDate);
  return {
    takenHalfDays: taken.total, takenByType: taken.byType, entitledHalfDays: rec.leaveEntitledDays * 2,
    ...c, daysToCompletion, completionApproaching: rec.status === "ACTIVE" && daysToCompletion <= rules.completionAlertDays,
  };
}

function viewScopeWhere(actor: Actor) {
  const scope = authorize(actor, "articleship.view");
  return userWhere(actor, scope);
}

/** Articleship register for HR / Partner (firm), Managers (team) and the article (self). */
export async function listArticleship(actor: Actor, today = todayIst()) {
  const where = viewScopeWhere(actor);
  const rules = await articleshipRules();
  const rows = await db().articleshipRecord.findMany({ where: { userId: { in: (await db().user.findMany({ where, select: { id: true } })).map((u) => u.id) } }, orderBy: { expectedEndDate: "asc" } });
  const names = await namesOf([...rows.map((r) => r.userId), ...rows.map((r) => r.principalId)]);
  const out = [];
  for (const r of rows) out.push({ ...r, name: names.get(r.userId) ?? "", principal: names.get(r.principalId) ?? "", ...(await summarise(r, rules, today)) });
  return { rows: out, rules };
}

/** Articles without a record yet (HR registers them). */
export async function articlesWithoutRecord(actor: Actor) {
  authorize(actor, "hr.records.manage");
  return db().user.findMany({ where: { role: "ARTICLE", active: true, isSystem: false, NOT: { id: { in: (await db().articleshipRecord.findMany({ select: { userId: true } })).map((r) => r.userId) } } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
}

/** Hours by engagement service line (effort shown as share %, never a score). */
export async function exposureByServiceLine(userId: string, from?: string, to?: string) {
  const entries = await db().workEntry.groupBy({
    by: ["engagementId"],
    where: { userId, deletedAt: null, ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    _sum: { minutes: true },
  });
  const engIds = entries.map((e) => e.engagementId).filter((x): x is string => !!x);
  const lines = new Map((await db().engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, serviceLine: true } })).map((e) => [e.id, e.serviceLine]));
  const byLine = new Map<string, number>();
  for (const e of entries) {
    const line = e.engagementId ? (lines.get(e.engagementId) ?? "OTHER") : "INTERNAL";
    byLine.set(line, (byLine.get(line) ?? 0) + (e._sum.minutes ?? 0));
  }
  const total = [...byLine.values()].reduce((s, m) => s + m, 0);
  return {
    totalMinutes: total,
    lines: [...byLine.entries()].sort((a, b) => b[1] - a[1]).map(([serviceLine, minutes]) => ({ serviceLine, minutes, sharePct: total ? Math.round((minutes / total) * 1000) / 10 : 0 })),
  };
}

export async function getArticleship(actor: Actor, userId: string, today = todayIst()) {
  const scope = authorize(actor, "articleship.view");
  const visible = await db().user.count({ where: { AND: [{ id: userId }, userWhere(actor, scope)] } });
  if (!visible) throw forbidden();
  const rec = await db().articleshipRecord.findUnique({ where: { userId }, include: { entries: { orderBy: { date: "desc" } } } });
  if (!rec) throw notFound("Articleship record");
  const rules = await articleshipRules();
  const summary = await summarise(rec, rules, today);
  const names = await namesOf([rec.userId, rec.principalId, ...rec.entries.map((e) => e.authorId)]);
  const exposure = await exposureByServiceLine(userId, rec.startDate);
  const studyLeave = await db().leaveRequest.findMany({ where: { userId, leaveType: "EXAM_STUDY", fromDate: { gte: rec.startDate } }, orderBy: { fromDate: "desc" }, select: { id: true, fromDate: true, toDate: true, halfDays: true, status: true, note: true } });
  let stipend: null | { stipendYear: number; minimums: { locationClass: string; amountPaise: number; effectiveFrom: string; verified: boolean; source: string }[] } = null;
  if (seesSalaryFirm(actor)) {
    await logSensitiveView(actor, "SALARY", "ArticleshipRecord", rec.id, "stipend details");
    const mins = await db().stipendMinimum.findMany({ where: { institute: rec.institute, yearOfTraining: rec.stipendYear, effectiveFrom: { lte: today } }, orderBy: { effectiveFrom: "desc" } });
    const latest = new Map<string, (typeof mins)[number]>();
    for (const m of mins) if (!latest.has(m.locationClass)) latest.set(m.locationClass, m);
    stipend = { stipendYear: rec.stipendYear, minimums: [...latest.values()].map((m) => ({ locationClass: m.locationClass, amountPaise: m.amountPaise, effectiveFrom: m.effectiveFrom, verified: !!m.verifiedAt, source: m.source })) };
  }
  const canNote = await canAddNote(actor, rec, "FEEDBACK");
  return {
    record: rec, name: names.get(rec.userId) ?? "", principal: names.get(rec.principalId) ?? "",
    notes: rec.entries.map((e) => ({ ...e, author: names.get(e.authorId) ?? "" })),
    summary, rules, exposure, studyLeave, stipend, canNote, canClassNote: await canAddNote(actor, rec, "CLASS"),
    canEdit: can(actor, "hr.records.manage") || (actor.kind === "USER" && actor.role === "PARTNER"),
  };
}

const recordInput = z.object({
  institute: z.enum(["ICAI", "ICSI"]),
  registrationNo: z.string().trim().min(1, "Enter the registration number").max(50),
  principalId: z.string().min(1, "Choose the principal"),
  startDate: zIso,
  expectedEndDate: zIso,
  leaveEntitledDays: z.coerce.number().int().min(0).max(1000),
  stipendYear: z.coerce.number().int().min(1).max(5).default(1),
  notes: z.string().max(4000).default(""),
});
export type ArticleshipRecordInput = z.input<typeof recordInput>;

/** Create or edit an articleship record: HR or a Partner. */
export async function saveArticleshipRecord(actor: Actor, userId: string, input: ArticleshipRecordInput) {
  if (!can(actor, "hr.records.manage") && !(actor.kind === "USER" && actor.role === "PARTNER")) throw forbidden();
  const p = parse(recordInput, input);
  if (p.expectedEndDate <= p.startDate) throw ruleViolation("Expected completion must be after the start date.");
  const user = await db().user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "ARTICLE") throw ruleViolation("Articleship records are for Article Assistants only.");
  const principal = await db().user.findUnique({ where: { id: p.principalId } });
  if (!principal || principal.role !== "PARTNER") throw ruleViolation("The principal must be a Partner.");
  const before = await db().articleshipRecord.findUnique({ where: { userId } });
  return transaction(async (tx) => {
    const after = before
      ? await tx.articleshipRecord.update({ where: { userId }, data: { ...p, updatedById: idOf(actor) } })
      : await tx.articleshipRecord.create({ data: { ...p, userId, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ArticleshipRecord", entityId: after.id, action: before ? "UPDATE" : "CREATE", before, after });
    return after;
  });
}

export const NOTE_KINDS = ["PRINCIPAL_NOTE", "FEEDBACK", "CLASS", "EXAM"] as const;
export const NOTE_LABELS: Record<(typeof NOTE_KINDS)[number], string> = { PRINCIPAL_NOTE: "Principal's note", FEEDBACK: "Periodic feedback", CLASS: "Class", EXAM: "Exam" };

/** Notes/feedback: principal, Partners and the article's Manager; classes/exams also HR and the article. */
async function canAddNote(actor: Actor, rec: { userId: string; principalId: string }, kind: string) {
  if (actor.kind !== "USER") return actor.kind === "SYSTEM";
  if (actor.role === "PARTNER" || actor.userId === rec.principalId) return true;
  if (actor.role === "MANAGER" && scopeOf(actor, "articleship.view") === "team") {
    return (await db().user.count({ where: { AND: [{ id: rec.userId }, userWhere(actor, "team")] } })) > 0;
  }
  if (kind === "CLASS" || kind === "EXAM") return actor.role === "HR_ADMIN" || actor.userId === rec.userId;
  return false;
}

const noteInput = z.object({ kind: z.enum(NOTE_KINDS), date: zIso, text: z.string().trim().min(2, "Write the note").max(4000) });

export async function addArticleshipNote(actor: Actor, recordId: string, input: z.input<typeof noteInput>) {
  const p = parse(noteInput, input);
  const rec = await db().articleshipRecord.findUnique({ where: { id: recordId } });
  if (!rec) throw notFound("Articleship record");
  if (!(await canAddNote(actor, rec, p.kind))) throw forbidden();
  const note = await transaction(async (tx) => {
    const n = await tx.articleshipNote.create({ data: { recordId, authorId: actor.kind === "PORTAL" ? "" : actor.userId, ...p, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ArticleshipNote", entityId: n.id, action: "CREATE", after: { recordId, kind: p.kind, date: p.date } });
    return n;
  });
  if ((p.kind === "FEEDBACK" || p.kind === "PRINCIPAL_NOTE") && actor.kind === "USER" && actor.userId !== rec.userId) {
    await notifyUsers([rec.userId], { kind: "ARTICLESHIP", title: "New feedback on your articleship", link: "/me/articleship", dedupeKey: `art-note-${note.id}` });
  }
  return note;
}

/**
 * Record completion / termination / transfer (exit paperwork with the institute, spec 11.12).
 * Called by the exit flow; HR or a Partner may also call it directly.
 */
export async function closeArticleship(actor: Actor, userId: string, outcome: "COMPLETED" | "TERMINATED" | "TRANSFERRED", date: string, note: string) {
  if (!can(actor, "hr.records.manage") && !can(actor, "exit.manage")) throw forbidden();
  if (actor.kind === "USER" && !["HR_ADMIN", "PARTNER"].includes(actor.role)) throw forbidden();
  const rec = await db().articleshipRecord.findUnique({ where: { userId } });
  if (!rec) return null;
  return transaction(async (tx) => {
    const after = await tx.articleshipRecord.update({
      where: { userId },
      data: { status: outcome, completionDate: outcome === "COMPLETED" ? date : rec.completionDate, terminationDate: outcome !== "COMPLETED" ? date : rec.terminationDate, notes: note ? `${rec.notes}${rec.notes ? "\n" : ""}${date}: ${note}` : rec.notes, updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "ArticleshipRecord", entityId: rec.id, action: outcome, before: { status: rec.status }, after: { status: outcome, date } });
    return after;
  });
}

/**
 * Scheduled job: keep revised completion dates in step with leave, and flag completions approaching
 * (≤ articleship.completionAlertDays) to HR and the principal for replacement planning.
 */
export async function runArticleshipCompletion(today = todayIst()) {
  const rules = await articleshipRules();
  const rows = await db().articleshipRecord.findMany({ where: { status: "ACTIVE" } });
  const hr = await hrPeople();
  let updated = 0;
  let flagged = 0;
  for (const r of rows) {
    const s = await summarise(r, rules, today);
    const revised = s.revisedEndDate === r.expectedEndDate ? null : s.revisedEndDate;
    if (revised !== r.revisedEndDate) {
      await transaction(async (tx) => {
        await tx.articleshipRecord.update({ where: { id: r.id }, data: { revisedEndDate: revised, updatedById: "system" } });
        await writeAudit(tx, systemActor(), { entityType: "ArticleshipRecord", entityId: r.id, action: "REVISED_END", reason: "Excess leave", before: { revisedEndDate: r.revisedEndDate }, after: { revisedEndDate: revised, excessDays: s.excessDays } });
      });
      updated += 1;
    }
    if (s.completionApproaching) {
      const name = (await namesOf([r.userId])).get(r.userId) ?? "An article";
      flagged += await notifyUsers([...hr, r.principalId], {
        kind: "ARTICLESHIP", title: `${name}: articleship completes in ${Math.max(0, s.daysToCompletion)} days`, body: "Plan the replacement.", link: `/hr/articleship/${r.userId}`, dedupeKey: `art-complete-${r.id}-${s.revisedEndDate}`,
      });
    }
  }
  return { checked: rows.length, updated, flagged };
}
