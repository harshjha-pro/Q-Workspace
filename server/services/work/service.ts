import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, scopeOf } from "../../permissions/guards";
import { assertUserAccess, engagementWhere, userWhere } from "../../permissions/scopes";
import type { Actor, StaffActor } from "../../permissions/actor";
import { requireStaff } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { addDays, dayOfWeek, formatDate, isIsoDate, todayIst, weekStart } from "../../lib/dates";
import { LOCATIONS } from "../../domain/enums";
import { getSetting, getSettingNumber } from "../settings/service";
import { refreshStatus } from "../tasks/service";
import { leaveDays, workingDays } from "../leave/service";

const OUTCOME_TYPES = ["ARN", "SRN", "ITR_ACK", "CIN", "TOKEN"] as const;

const entryInput = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1, "Choose a date").max(31),
  clientId: z.string().nullable().optional(),
  engagementId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  internalCategoryId: z.string().nullable().optional(),
  stageIndex: z.number().int().min(0).nullable().optional(),
  minutes: z.number().int().min(15, "At least 15 minutes").max(720, "At most 12 hours per entry").refine((m) => m % 15 === 0, "Use 15-minute steps"),
  description: z.string().max(2000).default(""),
  chips: z.array(z.string()).default([]),
  location: z.enum(LOCATIONS).optional(),
  clientSiteClientId: z.string().nullable().optional(),
  outcomeType: z.enum(OUTCOME_TYPES).nullable().optional(),
  outcomeRef: z.string().trim().nullable().optional(),
  leadId: z.string().nullable().optional(),
  knowledgeArticleId: z.string().nullable().optional(),
  clientUuid: z.string().uuid().nullable().optional(),
  source: z.enum(["WEB", "OFFLINE", "TIMER", "COPY"]).default("WEB"),
});
export type EntryInput = z.input<typeof entryInput>;

// ---------------------------------------------------------------------------
// Weekly lock (spec 5.6; Q-12: Mon–Sat week, lock Sunday 16:00 IST)
// ---------------------------------------------------------------------------
/** The moment the week containing `date` locks (Sunday of that week at the set time, IST). */
export async function lockMomentFor(date: string): Promise<Date> {
  const time = await getSetting<string>("work.weeklyLockTime", "16:00");
  const sunday = addDays(weekStart(date), 6);
  return new Date(`${sunday}T${time}:00+05:30`);
}

export async function isLocked(userId: string, date: string, now = new Date()) {
  if (now < (await lockMomentFor(date))) return false;
  const ws = weekStart(date);
  const ext = await db().weeklyLock.findFirst({ where: { weekStart: ws, extendedUntil: { gt: now }, OR: [{ scope: "FIRM" }, { scope: "USER", userId }] } });
  return !ext;
}

/** Partner extends the lock for the firm or one person (spec 5.6). */
export async function extendLock(actor: Actor, weekStartDate: string, untilDate: string, userId?: string | null) {
  authorize(actor, "work.lock.extend");
  if (!isIsoDate(weekStartDate) || !isIsoDate(untilDate)) throw new DomainError("VALIDATION", "Give valid dates.");
  const ws = weekStart(weekStartDate);
  const until = new Date(`${untilDate}T23:59:59+05:30`);
  const lockAt = await lockMomentFor(ws);
  return transaction(async (tx) => {
    const existing = await tx.weeklyLock.findFirst({ where: { weekStart: ws, scope: userId ? "USER" : "FIRM", userId: userId ?? null } });
    const row = existing
      ? await tx.weeklyLock.update({ where: { id: existing.id }, data: { extendedUntil: until, extendedById: actor.kind === "PORTAL" ? null : actor.userId } })
      : await tx.weeklyLock.create({ data: { weekStart: ws, scope: userId ? "USER" : "FIRM", userId: userId ?? null, lockAt, extendedUntil: until, extendedById: actor.kind === "PORTAL" ? null : actor.userId } });
    await writeAudit(tx, actor, { entityType: "WeeklyLock", entityId: row.id, action: "EXTEND", after: { weekStart: ws, until: untilDate, userId } });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------
type Resolved = { clientId: string | null; engagementId: string | null; taskId: string | null; internalCategoryId: string | null; chargeable: boolean; stageName: string | null };

/** Check the actor may log against this client/engagement/task and fill in the links (P2 work entry). */
async function resolveTarget(actor: StaffActor, d: z.output<typeof entryInput>): Promise<Resolved> {
  if (d.internalCategoryId) {
    const cat = await db().internalCategory.findUnique({ where: { id: d.internalCategoryId } });
    if (!cat || !cat.active) throw new DomainError("VALIDATION", "Unknown category.");
    if (d.clientId || d.engagementId || d.taskId) throw new DomainError("VALIDATION", "Choose a client or an internal category, not both.");
    return { clientId: null, engagementId: null, taskId: null, internalCategoryId: cat.id, chargeable: cat.chargeable, stageName: null };
  }
  let engagementId = d.engagementId ?? null;
  let clientId = d.clientId ?? null;
  let stageName: string | null = null;
  if (d.taskId) {
    const t = await db().task.findUnique({ where: { id: d.taskId }, include: { stageTemplateVersion: { include: { stages: true } } } });
    if (!t) throw notFound("Task");
    if (clientId && t.clientId !== clientId) throw new DomainError("VALIDATION", "Task belongs to another client.");
    clientId = t.clientId;
    engagementId = t.engagementId;
    const idx = d.stageIndex ?? t.stageIndex;
    stageName = t.stageTemplateVersion?.stages.find((s) => s.index === idx)?.name ?? null;
  }
  if (!engagementId) throw new DomainError("VALIDATION", "Choose an engagement or task.", { engagementId: "Required" });
  const scope = authorize(actor, "engagement.view");
  const e = await db().engagement.findFirst({ where: { AND: [{ id: engagementId }, engagementWhere(actor, scope)] }, include: { stageTemplateVersion: { include: { stages: true } } } });
  if (!e) throw forbidden("You are not assigned to this engagement.");
  if (clientId && e.clientId !== clientId) throw new DomainError("VALIDATION", "Engagement belongs to another client.");
  if (!stageName && d.stageIndex !== null && d.stageIndex !== undefined) stageName = e.stageTemplateVersion?.stages.find((s) => s.index === d.stageIndex)?.name ?? null;
  return { clientId: e.clientId, engagementId: e.id, taskId: d.taskId ?? null, internalCategoryId: null, chargeable: e.chargeable, stageName };
}

export type EntryResult = { created: number; warnings: string[]; budget: BudgetInfo | null };
export type BudgetInfo = { budgetMinutes: number; usedMinutes: number; remainingMinutes: number; percent: number; signal: string; health: string };

/** Budget bands (spec 5.3): <85 Normal/On Track, 85–99 Approaching/At Risk, 100–109 Reached/Over, ≥110 Significant overrun. Never blocks. */
export async function budgetFor(engagementId: string): Promise<BudgetInfo | null> {
  const e = await db().engagement.findUnique({ where: { id: engagementId } });
  if (!e || !e.budgetMinutes) return null;
  const used = (await db().workEntry.aggregate({ where: { engagementId, deletedAt: null }, _sum: { minutes: true } }))._sum.minutes ?? 0;
  const [a, b, c] = await getSetting<number[]>("budget.bands", [85, 100, 110]);
  const pct = Math.round((used / e.budgetMinutes) * 100);
  const [signal, health] = pct >= c! ? ["Significant Overrun", "Over Budget"] : pct >= b! ? ["Budget Reached", "Over Budget"] : pct >= a! ? ["Approaching Budget", "At Risk"] : ["Normal", "On Track"];
  return { budgetMinutes: e.budgetMinutes, usedMinutes: used, remainingMinutes: e.budgetMinutes - used, percent: pct, signal, health };
}

export async function createEntries(actor: Actor, input: EntryInput): Promise<EntryResult> {
  requireStaff(actor);
  authorize(actor, "work.log");
  const d = parse(entryInput, input);
  const today = todayIst();
  const dates = [...new Set(d.dates)].sort();
  if (dates.some((x) => !isIsoDate(x) || x > today)) throw new DomainError("VALIDATION", "Entries cannot be made for future dates.", { dates: "Check the dates" });
  const user = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  const location = d.location ?? (user.defaultLocation as (typeof LOCATIONS)[number]);
  if (!user.locationChangeable && location !== user.defaultLocation) throw forbidden("Your location is fixed by the admin.");
  if (d.clientUuid && (await db().workEntry.findUnique({ where: { clientUuid: d.clientUuid } }))) return { created: 0, warnings: ["Already saved."], budget: null };
  const target = await resolveTarget(actor, d);
  for (const date of dates) if (await isLocked(actor.userId, date)) throw ruleViolation(`The week of ${formatDate(date)} is locked. Raise a correction request instead.`);
  const warnings: string[] = [];
  const limit = await getSettingNumber("work.dailySoftWarnMinutes", 720);
  await transaction(async (tx) => {
    for (const [i, date] of dates.entries()) {
      const e = await tx.workEntry.create({
        data: {
          userId: actor.userId, date, ...target, stageIndex: d.stageIndex ?? null, minutes: d.minutes, description: d.description, chips: d.chips.join(","),
          location, clientSiteClientId: location === "CLIENT_SITE" ? d.clientSiteClientId ?? target.clientId : null, outcomeType: d.outcomeType ?? null,
          outcomeRef: d.outcomeRef || null, leadId: d.leadId ?? null, knowledgeArticleId: d.knowledgeArticleId ?? null,
          clientUuid: i === 0 ? d.clientUuid ?? null : null, source: d.source, createdById: actor.userId,
        },
      });
      await writeAudit(tx, actor, { entityType: "WorkEntry", entityId: e.id, action: "CREATE", after: { date, minutes: d.minutes, clientId: target.clientId, taskId: target.taskId, category: target.internalCategoryId } });
      const total = (await tx.workEntry.aggregate({ where: { userId: actor.userId, date, deletedAt: null }, _sum: { minutes: true } }))._sum.minutes ?? 0;
      if (total > limit) warnings.push(`${formatDate(date)}: ${Math.round((total / 60) * 4) / 4} hours logged — more than ${limit / 60}. Please check.`);
    }
    if (target.taskId) await refreshStatus(tx, actor, target.taskId, "Work logged");
    if (target.clientId) await touchRecent(tx, actor.userId, target);
  });
  return { created: dates.length, warnings, budget: target.engagementId ? await budgetFor(target.engagementId) : null };
}

async function touchRecent(tx: Tx, userId: string, t: Resolved) {
  const key = { userId, clientId: t.clientId!, engagementId: t.engagementId ?? "-", taskId: t.taskId ?? "-" };
  await tx.recentPair.upsert({
    where: { userId_clientId_engagementId_taskId: key },
    create: key,
    update: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });
}

async function ownEntry(actor: StaffActor, entryId: string) {
  const e = await db().workEntry.findUnique({ where: { id: entryId } });
  if (!e || e.deletedAt || e.userId !== actor.userId) throw notFound("Entry");
  return e;
}

/** Editable until the weekly lock; after that only through a correction request (spec 5.6). */
export async function updateEntry(actor: Actor, entryId: string, input: { minutes?: number; description?: string; location?: string; outcomeType?: string | null; outcomeRef?: string | null; stageIndex?: number | null }) {
  requireStaff(actor);
  const e = await ownEntry(actor, entryId);
  if (await isLocked(actor.userId, e.date)) throw ruleViolation("This week is locked. Raise a correction request.");
  const d = parse(entryInput.pick({ minutes: true, description: true, location: true, outcomeType: true, outcomeRef: true, stageIndex: true }).partial(), input);
  const user = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (d.location && !user.locationChangeable && d.location !== user.defaultLocation) throw forbidden("Your location is fixed by the admin.");
  return transaction(async (tx) => {
    const data = Object.fromEntries(Object.entries(d).filter(([k]) => k in input));
    const after = await tx.workEntry.update({ where: { id: entryId }, data: { ...data, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "WorkEntry", entityId: entryId, action: "UPDATE", before: e, after });
    return after;
  });
}

export async function deleteEntry(actor: Actor, entryId: string) {
  requireStaff(actor);
  const e = await ownEntry(actor, entryId);
  if (await isLocked(actor.userId, e.date)) throw ruleViolation("This week is locked. Raise a correction request.");
  await transaction(async (tx) => {
    await tx.workEntry.update({ where: { id: entryId }, data: { deletedAt: new Date(), updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "WorkEntry", entityId: entryId, action: "DELETE", before: e });
    if (e.taskId) await refreshStatus(tx, actor, e.taskId, "Work entry removed");
  });
}

/** Copy Entry / Copy Day / Copy Week (spec 5.3, P2-05). Locked target days are skipped and reported. */
export async function copyEntries(actor: Actor, mode: "ENTRY" | "DAY" | "WEEK", from: string, to: string[] | string) {
  requireStaff(actor);
  const today = todayIst();
  let sources: { e: Awaited<ReturnType<typeof ownEntry>>; target: string }[] = [];
  if (mode === "ENTRY") {
    const e = await ownEntry(actor, from);
    sources = (Array.isArray(to) ? to : [to]).map((t) => ({ e, target: t }));
  } else if (mode === "DAY") {
    const rows = await db().workEntry.findMany({ where: { userId: actor.userId, date: from, deletedAt: null } });
    sources = rows.map((e) => ({ e, target: to as string }));
  } else {
    const fromWs = weekStart(from);
    const toWs = weekStart(to as string);
    const rows = await db().workEntry.findMany({ where: { userId: actor.userId, date: { gte: fromWs, lte: addDays(fromWs, 6) }, deletedAt: null } });
    sources = rows.map((e) => ({ e, target: addDays(toWs, Math.round((Date.parse(e.date) - Date.parse(fromWs)) / 86_400_000)) }));
  }
  let created = 0;
  const skipped: string[] = [];
  for (const { e, target } of sources) {
    if (target > today || dayOfWeek(target) === 0 || (await isLocked(actor.userId, target))) {
      skipped.push(target);
      continue;
    }
    const r = await createEntries(actor, {
      dates: [target], clientId: e.clientId, engagementId: e.engagementId, taskId: e.taskId, internalCategoryId: e.internalCategoryId, stageIndex: e.stageIndex,
      minutes: e.minutes, description: e.description, chips: e.chips ? e.chips.split(",") : [], location: e.location as never,
      clientSiteClientId: e.clientSiteClientId, source: "COPY",
    }).catch(() => null);
    if (r) created += r.created;
    else skipped.push(target);
  }
  return { created, skipped: [...new Set(skipped)] };
}

// ---------------------------------------------------------------------------
// Reading: my day, week grid, recent pairs, missing days
// ---------------------------------------------------------------------------
export async function entriesFor(actor: Actor, userId: string, from: string, to: string) {
  requireStaff(actor);
  if (userId !== actor.userId) await assertUserAccess(actor, "work.viewOthers", userId);
  return db().workEntry.findMany({
    where: { userId, date: { gte: from, lte: to }, deletedAt: null },
    include: { client: { select: { id: true, name: true, code: true } }, engagement: { select: { id: true, name: true } }, task: { select: { id: true, title: true } }, internalCategory: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Week View grid: (client/engagement × stage) rows × Mon–Sat, with holidays, leave and lock (spec 5.3, P2-08). */
export async function weekGrid(actor: Actor, userId: string, anyDate: string) {
  const ws = weekStart(anyDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const entries = await entriesFor(actor, userId, days[0]!, days[6]!);
  const rows = new Map<string, { label: string; sub: string; minutes: number[]; entryIds: string[][] }>();
  for (const e of entries) {
    const key = [e.clientId, e.engagementId, e.taskId, e.internalCategoryId, e.stageName].join("|");
    const label = e.internalCategory?.name ?? `${e.client?.name ?? ""}`;
    const sub = e.internalCategory ? "Internal" : [e.task?.title ?? e.engagement?.name, e.stageName].filter(Boolean).join(" · ");
    const row = rows.get(key) ?? { label, sub, minutes: Array(7).fill(0) as number[], entryIds: days.map(() => [] as string[]) };
    const idx = days.indexOf(e.date);
    row.minutes[idx]! += e.minutes;
    row.entryIds[idx]!.push(e.id);
    rows.set(key, row);
  }
  const holidays = new Map((await db().holiday.findMany({ where: { date: { in: days }, stateCode: "-" } })).map((h) => [h.date, h.name]));
  const leave = await leaveDays(userId, days[0]!, days[6]!);
  const locked = await isLocked(userId, ws);
  return {
    weekStart: ws,
    days: days.map((d, i) => ({ date: d, holiday: holidays.get(d) ?? null, leave: leave.get(d) ?? 0, total: [...rows.values()].reduce((s, r) => s + r.minutes[i]!, 0) })),
    rows: [...rows.values()],
    locked,
    lockAt: await lockMomentFor(ws),
  };
}

export async function recentPairs(actor: Actor) {
  requireStaff(actor);
  const pairs = await db().recentPair.findMany({ where: { userId: actor.userId }, orderBy: { lastUsedAt: "desc" }, take: 8 });
  const [clients, engagements, tasks] = await Promise.all([
    db().client.findMany({ where: { id: { in: pairs.map((p) => p.clientId) } }, select: { id: true, name: true } }),
    db().engagement.findMany({ where: { id: { in: pairs.map((p) => p.engagementId) }, status: "ACTIVE" }, select: { id: true, name: true } }),
    db().task.findMany({ where: { id: { in: pairs.map((p) => p.taskId) } }, select: { id: true, title: true, status: true } }),
  ]);
  const c = new Map(clients.map((x) => [x.id, x.name]));
  const e = new Map(engagements.map((x) => [x.id, x.name]));
  const t = new Map(tasks.map((x) => [x.id, x]));
  return pairs
    .filter((p) => e.has(p.engagementId) && (p.taskId === "-" || !["FILED", "FILED_LATE", "NOT_APPLICABLE"].includes(t.get(p.taskId)?.status ?? "")))
    .map((p) => ({ clientId: p.clientId, clientName: c.get(p.clientId) ?? "", engagementId: p.engagementId, engagementName: e.get(p.engagementId) ?? "", taskId: p.taskId === "-" ? null : p.taskId, taskTitle: t.get(p.taskId)?.title ?? null }));
}

/** Engagements and open tasks the actor can log against (Add Work picker). */
export async function workTargets(actor: Actor, clientId: string) {
  requireStaff(actor);
  const scope = authorize(actor, "engagement.view");
  const engagements = await db().engagement.findMany({
    where: { AND: [{ clientId, status: "ACTIVE" }, engagementWhere(actor, scope)] },
    include: {
      stageTemplateVersion: { include: { stages: { orderBy: { index: "asc" } } } },
      tasks: { where: { status: { in: ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"] } }, orderBy: { effectiveDueDate: "asc" }, take: 30, select: { id: true, title: true, stageIndex: true, effectiveDueDate: true } },
    },
    orderBy: { name: "asc" },
  });
  return engagements.map((e) => ({ id: e.id, name: e.name, stages: e.stageTemplateVersion?.stages.map((s) => ({ index: s.index, name: s.name })) ?? [], tasks: e.tasks }));
}

/** Days with nothing logged (spec 8.2): working days since joining, excluding holidays and full-day leave. */
export async function missingDays(userId: string, today = todayIst()) {
  const lookback = await getSettingNumber("work.missingEntryLookbackDays", 14);
  const user = await db().user.findUniqueOrThrow({ where: { id: userId }, include: { employeeProfile: true } });
  const joined = user.employeeProfile?.joiningDate ?? user.createdAt.toISOString().slice(0, 10);
  const from = addDays(today, -lookback) > joined ? addDays(today, -lookback) : joined;
  const to = addDays(today, -1);
  if (to < from) return [];
  const days = await workingDays(from, to);
  const leave = await leaveDays(userId, from, to);
  const logged = new Set((await db().workEntry.groupBy({ by: ["date"], where: { userId, date: { gte: from, lte: to }, deletedAt: null } })).map((g) => g.date));
  return days.filter((d) => !logged.has(d) && (leave.get(d) ?? 0) < 2);
}

/** "2 days not logged: Sat 3, Mon 5 Oct" (P2-03). */
export function missingBanner(days: string[]) {
  if (days.length === 0) return null;
  const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  return `${days.length} day${days.length === 1 ? "" : "s"} not logged: ${days.slice(-6).map(fmt).join(", ")}`;
}

/** People in the actor's scope who have days without entries (P2-02, clickable to names and dates). */
export async function teamMissing(actor: Actor) {
  const scope = scopeOf(actor, "work.viewOthers");
  if (scope === "none") return [];
  const people = await db().user.findMany({ where: { AND: [userWhere(actor, scope), { active: true, role: { in: ["PARTNER", "MANAGER", "STAFF", "ARTICLE"] } }] }, select: { id: true, displayName: true } });
  const out: { userId: string; name: string; days: string[] }[] = [];
  for (const p of people) {
    if (actor.kind === "USER" && p.id === actor.userId) continue;
    const days = await missingDays(p.id);
    if (days.length) out.push({ userId: p.id, name: p.displayName, days });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Corrections after lock (P2-07)
// ---------------------------------------------------------------------------
const correctionInput = z.object({ minutes: z.number().int().min(0).max(720).optional(), description: z.string().optional(), reason: z.string().trim().min(5, "Explain the correction") });

export async function requestCorrection(actor: Actor, entryId: string, input: z.input<typeof correctionInput>) {
  requireStaff(actor);
  const e = await ownEntry(actor, entryId);
  if (!(await isLocked(actor.userId, e.date))) throw ruleViolation("This week is still open — edit the entry directly.");
  const d = parse(correctionInput, input);
  if (d.minutes !== undefined && d.minutes % 15 !== 0) throw new DomainError("VALIDATION", "Use 15-minute steps.", { minutes: "15-minute steps" });
  const { reason, ...proposed } = d;
  const req = await transaction(async (tx) => {
    const r = await tx.correctionRequest.create({ data: { workEntryId: entryId, requestedById: actor.userId, reason, proposedJson: JSON.stringify(proposed), createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "CorrectionRequest", entityId: r.id, action: "CREATE", after: { entryId, proposed, reason } });
    return r;
  });
  const me = await db().user.findUniqueOrThrow({ where: { id: actor.userId } });
  const approver = me.reportingManagerId ?? (await db().user.findFirst({ where: { role: "PARTNER", active: true, id: { not: actor.userId } } }))?.id;
  if (approver) {
    const { notifyUsers } = await import("../notifications/service");
    await notifyUsers([approver], { kind: "CORRECTION", title: `Correction request from ${me.displayName}`, body: reason, link: "/work/corrections", entityType: "CorrectionRequest", entityId: req.id });
  }
  return req;
}

/** Manager approves for their team; Partner for anyone; never your own (D-19). */
export async function decideCorrection(actor: Actor, requestId: string, approve: boolean, note = "") {
  requireStaff(actor);
  const r = await db().correctionRequest.findUnique({ where: { id: requestId } });
  if (!r) throw notFound("Correction request");
  if (r.status !== "PENDING") throw ruleViolation("Already decided.");
  if (r.requestedById === actor.userId) throw forbidden("You cannot approve your own correction.");
  await assertUserAccess(actor, "work.correction.approve", r.requestedById);
  const e = await db().workEntry.findUniqueOrThrow({ where: { id: r.workEntryId } });
  const proposed = JSON.parse(r.proposedJson) as { minutes?: number; description?: string };
  await transaction(async (tx) => {
    await tx.correctionRequest.update({ where: { id: requestId }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: actor.userId, decidedAt: new Date(), decisionNote: note, appliedAt: approve ? new Date() : null } });
    if (approve) {
      const data = proposed.minutes === 0 ? { deletedAt: new Date() } : { ...proposed };
      const after = await tx.workEntry.update({ where: { id: e.id }, data: { ...data, updatedById: actor.userId } });
      await writeAudit(tx, actor, { entityType: "WorkEntry", entityId: e.id, action: "CORRECTION", before: e, after, reason: `Correction approved: ${r.reason}`, lockState: "LOCKED" });
    }
    await writeAudit(tx, actor, { entityType: "CorrectionRequest", entityId: requestId, action: approve ? "APPROVE" : "REJECT", reason: note });
  });
  const { notifyUsers } = await import("../notifications/service");
  await notifyUsers([r.requestedById], { kind: "CORRECTION_DECIDED", title: `Correction ${approve ? "approved" : "rejected"}`, body: note, link: "/work" });
}

export async function listCorrections(actor: Actor, view: "mine" | "approvals") {
  requireStaff(actor);
  if (view === "mine") return db().correctionRequest.findMany({ where: { requestedById: actor.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  const scope = authorize(actor, "work.correction.approve");
  const people = await db().user.findMany({ where: userWhere(actor, scope), select: { id: true } });
  return db().correctionRequest.findMany({ where: { status: "PENDING", requestedById: { in: people.map((p) => p.id).filter((id) => id !== actor.userId) } }, orderBy: { createdAt: "asc" } });
}

// ---------------------------------------------------------------------------
// Timer (P2-42) and offline sync (P2-38)
// ---------------------------------------------------------------------------
export async function activeTimer(actor: Actor) {
  requireStaff(actor);
  return db().workTimer.findFirst({ where: { userId: actor.userId, stoppedAt: null } });
}

export async function startTimer(actor: Actor, target: { clientId?: string | null; engagementId?: string | null; taskId?: string | null }) {
  requireStaff(actor);
  if (await activeTimer(actor)) throw ruleViolation("A timer is already running. Stop it first.");
  await resolveTarget(actor, { ...target, dates: [todayIst()], minutes: 15, description: "", chips: [], source: "TIMER" } as z.output<typeof entryInput>);
  return db().workTimer.create({ data: { userId: actor.userId, clientId: target.clientId ?? null, engagementId: target.engagementId ?? null, taskId: target.taskId ?? null, startedAt: new Date(), createdById: actor.userId } });
}

/** Stop → a rounded entry (nearest 15 minutes, at least 15, at most 12 hours) dated the day the timer started. */
export async function stopTimer(actor: Actor, description = "") {
  requireStaff(actor);
  const t = await activeTimer(actor);
  if (!t) throw ruleViolation("No timer is running.");
  const elapsed = (Date.now() - t.startedAt.getTime()) / 60_000;
  const minutes = Math.min(720, Math.max(15, Math.round(elapsed / 15) * 15));
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(t.startedAt);
  const r = await createEntries(actor, { dates: [date], clientId: t.clientId, engagementId: t.engagementId, taskId: t.taskId, minutes, description, source: "TIMER" });
  await db().workTimer.update({ where: { id: t.id }, data: { stoppedAt: new Date() } });
  return { minutes, ...r };
}

/** Offline queue upload: idempotent on each entry's client UUID; errors come back per entry. */
export async function syncOffline(actor: Actor, entries: EntryInput[]) {
  requireStaff(actor);
  const results: { clientUuid: string | null; ok: boolean; error?: string }[] = [];
  for (const e of entries.slice(0, 200)) {
    try {
      await createEntries(actor, { ...e, source: "OFFLINE" });
      results.push({ clientUuid: e.clientUuid ?? null, ok: true });
    } catch (err) {
      results.push({ clientUuid: e.clientUuid ?? null, ok: false, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return results;
}
