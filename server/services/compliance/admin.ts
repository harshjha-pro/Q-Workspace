import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import { assertClientAccess, taskWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst, isIsoDate } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import {
  computeDueDate, pickRule, periodFromKey, previewExtension as previewEngine, matchExtension, planExtension, valueAt,
  type DueRuleParams, type ExtensionDef, type TaskForExtension,
} from "../../compliance-engine";
import { syncClientCompliance, syncAllClients, applyUpdates, toExisting } from "./sync";
import { loadMaster } from "./master";
import { buildSnapshot } from "./snapshot";
import { notifyUsers } from "../notifications/service";

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

// ---------------------------------------------------------------------------
// Event dates (AGM, auditor appointment) — Rules Spec 4
// ---------------------------------------------------------------------------
const eventInput = z.object({
  eventTypeCode: z.enum(["AGM", "AUDITOR_APPOINTMENT", "INCORPORATION"]),
  periodKey: z.string().regex(/^FY\d{4}-\d{2}$/, "Financial year like FY2025-26"),
  dateValue: zIsoDate,
  auditorAppointedAtAgm: z.boolean().default(false),
});

/** Record or correct an event date; dependent tasks recompute (provisional → confirmed) at once. */
export async function setEventDate(actor: Actor, clientId: string, input: z.input<typeof eventInput>) {
  await assertClientAccess(actor, "client.flags.edit", clientId);
  const d = parse(eventInput, input);
  await transaction(async (tx) => {
    const types = [d.eventTypeCode, ...(d.eventTypeCode === "AGM" && d.auditorAppointedAtAgm ? ["AUDITOR_APPOINTMENT"] : [])];
    for (const eventTypeCode of types) {
      const before = await tx.eventDate.findUnique({ where: { clientId_eventTypeCode_periodKey_partyKey: { clientId, eventTypeCode, periodKey: d.periodKey, partyKey: "-" } } });
      const row = await tx.eventDate.upsert({
        where: { clientId_eventTypeCode_periodKey_partyKey: { clientId, eventTypeCode, periodKey: d.periodKey, partyKey: "-" } },
        create: { clientId, eventTypeCode, periodKey: d.periodKey, dateValue: d.dateValue, createdById: idOf(actor) },
        update: { dateValue: d.dateValue, updatedById: idOf(actor) },
      });
      await tx.clientFlagHistory.create({ data: { clientId, flag: `event.${eventTypeCode}`, partyKey: d.periodKey, oldValue: before?.dateValue ?? null, newValue: d.dateValue, effectiveDate: d.dateValue, reason: before ? "Event date corrected" : "Event date recorded", createdById: idOf(actor) } });
      await writeAudit(tx, actor, { entityType: "EventDate", entityId: row.id, action: before ? "UPDATE" : "CREATE", before, after: row });
    }
  });
  return syncClientCompliance(clientId, { actor });
}

// ---------------------------------------------------------------------------
// Due-Date Master: rule versions, verification, holiday policy, late fees, holidays
// ---------------------------------------------------------------------------
export async function listMaster(actor: Actor) {
  authorize(actor, "task.view");
  return db().complianceType.findMany({
    include: { rules: { orderBy: { version: "desc" } }, lateFeeRates: { orderBy: { effectiveFrom: "desc" } } },
    orderBy: { sortOrder: "asc" },
  });
}

const ruleInput = z.object({
  paramsJson: z.string(),
  effectiveFrom: zIsoDate,
  source: z.string().trim().min(3, "Give the source (notification / circular)"),
  notificationRef: z.string().default(""),
  knowledgeArticleId: z.string().nullable().optional(),
});

function validateParams(json: string): DueRuleParams {
  let p: DueRuleParams;
  try {
    p = JSON.parse(json) as DueRuleParams;
  } catch {
    throw new DomainError("VALIDATION", "Rule parameters are not valid JSON.", { paramsJson: "Invalid JSON" });
  }
  const mmdd = /^\d{2}-\d{2}$/;
  const ok =
    (p.kind === "DAY_AFTER_PERIOD" && Number.isInteger(p.day) && p.day >= 1 && p.day <= 31) ||
    (p.kind === "STATE_GROUP_DAY_AFTER_PERIOD" && typeof p.days === "object") ||
    ((p.kind === "MMDD_ON_OR_AFTER_START" || p.kind === "MMDD_AFTER_END") && ((p.mmdd && mmdd.test(p.mmdd)) || (p.byIndex && Object.values(p.byIndex).every((v) => mmdd.test(v))))) ||
    (p.kind === "EVENT_OFFSET" && typeof p.eventType === "string" && Number.isInteger(p.days)) ||
    p.kind === "MANUAL";
  if (!ok) throw new DomainError("VALIDATION", "Rule parameters do not match the rule kind.", { paramsJson: "Check the parameters" });
  return p;
}

/**
 * Publish a new rule version. "One update to a due date moves every affected task, recorded in the
 * audit trail" (Product Spec 4.3): open tasks for periods on/after the effective date are recomputed.
 * Tasks whose date was moved by an extension keep the extended date (only their original date changes).
 */
export async function addRuleVersion(actor: Actor, typeCode: string, input: z.input<typeof ruleInput>) {
  authorize(actor, "dueDateMaster.manage");
  const d = parse(ruleInput, input);
  const params = validateParams(d.paramsJson);
  const type = await db().complianceType.findUnique({ where: { code: typeCode }, include: { rules: true } });
  if (!type) throw notFound("Compliance type");
  const version = Math.max(0, ...type.rules.map((r) => r.version)) + 1;
  const master = await loadMaster();
  const today = todayIst();
  const rule = await transaction(async (tx) => {
    const r = await tx.dueDateRule.create({
      data: { complianceTypeCode: typeCode, version, kind: params.kind, paramsJson: JSON.stringify(params), effectiveFrom: d.effectiveFrom, source: d.source, notificationRef: d.notificationRef, knowledgeArticleId: d.knowledgeArticleId ?? null, createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "DueDateRule", entityId: r.id, action: "CREATE", after: { typeCode, version, params, effectiveFrom: d.effectiveFrom, source: d.source } });
    const rules = [...(master.rules.get(typeCode) ?? []), { complianceTypeCode: typeCode, version, effectiveFrom: d.effectiveFrom, params }];
    const tasks = await tx.task.findMany({ where: { complianceTypeCode: typeCode, status: { in: ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"] }, periodStart: { gte: d.effectiveFrom } } });
    let moved = 0;
    const snapshots = new Map<string, Awaited<ReturnType<typeof buildSnapshot>>>();
    for (const t of tasks) {
      if (t.periodKey.startsWith("CLOSE-")) continue;
      const snap = snapshots.get(t.clientId) ?? (await buildSnapshot(tx, t.clientId, master.trackingFrom, today));
      snapshots.set(t.clientId, snap);
      const period = periodFromKey(t.periodKey);
      const def = pickRule(rules, period)!;
      const gstin = t.gstinId ? await tx.gSTIN.findUnique({ where: { id: t.gstinId } }) : null;
      const due = computeDueDate(def.params, period, {
        stateGroup: gstin ? master.stateGroups.get(gstin.stateCode) ?? null : null,
        flagsOn: new Set(Object.keys(snap.flags).filter((f) => valueAt(snap.flags[f], period.end))),
        events: snap.events, incorporationDate: snap.incorporationDate, agmCeilingMonths: master.agmCeilingMonths, firstAgmCeilingMonths: master.firstAgmCeilingMonths,
      });
      if (!due.date || due.date === t.originalDueDate) continue;
      const extended = t.effectiveDueDate !== t.originalDueDate;
      await applyUpdates(tx, actor, [{
        taskId: t.id, originalDueDate: due.date, ...(extended ? {} : { effectiveDueDate: due.date }), isProvisional: due.isProvisional,
        history: { oldValue: t.effectiveDueDate, newValue: extended ? t.effectiveDueDate : due.date, source: "MASTER_UPDATE", reference: `${typeCode} rule v${version} (${d.source})` },
      }], new Map([[t.id, toExisting(t)]]));
      moved += 1;
    }
    return { rule: r, moved };
  }, );
  return rule;
}

/** A Partner marks a seeded/edited statutory row as checked against the law in force (decisions D-17). */
export async function verifyRule(actor: Actor, ruleId: string) {
  authorize(actor, "dueDateMaster.manage");
  if (actor.kind !== "SYSTEM" && actor.role !== "PARTNER") throw forbidden("Only a Partner can mark a statutory value as verified.");
  return transaction(async (tx) => {
    const r = await tx.dueDateRule.update({ where: { id: ruleId }, data: { verifiedById: idOf(actor), verifiedAt: new Date() } });
    await writeAudit(tx, actor, { entityType: "DueDateRule", entityId: ruleId, action: "VERIFY" });
    return r;
  });
}

export async function verifyLateFee(actor: Actor, id: string) {
  authorize(actor, "dueDateMaster.manage");
  if (actor.kind !== "SYSTEM" && actor.role !== "PARTNER") throw forbidden("Only a Partner can mark a statutory value as verified.");
  return transaction(async (tx) => {
    const r = await tx.lateFeeRate.update({ where: { id }, data: { verifiedById: idOf(actor), verifiedAt: new Date() } });
    await writeAudit(tx, actor, { entityType: "LateFeeRate", entityId: id, action: "VERIFY" });
    return r;
  });
}

/** Changing a statutory type away from "no auto-shift" is deliberate and logged (Rules Spec 11.4). */
export async function setHolidayPolicy(actor: Actor, typeCode: string, policy: "NONE" | "NEXT_WORKING_DAY" | "PREV_WORKING_DAY", reason: string) {
  authorize(actor, "dueDateMaster.manage");
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  return transaction(async (tx) => {
    const before = await tx.complianceType.findUniqueOrThrow({ where: { code: typeCode } });
    const after = await tx.complianceType.update({ where: { code: typeCode }, data: { weekendHolidayPolicy: policy, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ComplianceType", entityId: typeCode, action: "HOLIDAY_POLICY", before: { policy: before.weekendHolidayPolicy }, after: { policy }, reason });
    return after;
  });
}

export async function setTypeActive(actor: Actor, typeCode: string, active: boolean) {
  authorize(actor, "dueDateMaster.manage");
  return transaction(async (tx) => {
    const after = await tx.complianceType.update({ where: { code: typeCode }, data: { active, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ComplianceType", entityId: typeCode, action: active ? "ACTIVATE" : "DEACTIVATE" });
    return after;
  });
}

const lateFeeInput = z.object({ perDayRupees: z.number().min(0), maxRupees: z.number().min(0).nullable(), interestPctPerMonth: z.number().min(0).max(10), effectiveFrom: zIsoDate, source: z.string().trim().min(3), note: z.string().default("") });

export async function addLateFeeRate(actor: Actor, typeCode: string, input: z.input<typeof lateFeeInput>) {
  authorize(actor, "dueDateMaster.manage");
  const d = parse(lateFeeInput, input);
  return transaction(async (tx) => {
    const r = await tx.lateFeeRate.create({
      data: { complianceTypeCode: typeCode, perDayPaise: Math.round(d.perDayRupees * 100), maxPaise: d.maxRupees === null ? null : Math.round(d.maxRupees * 100), interestBpPerMonth: Math.round(d.interestPctPerMonth * 100), effectiveFrom: d.effectiveFrom, source: d.source, note: d.note, createdById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "LateFeeRate", entityId: r.id, action: "CREATE", after: r });
    return r;
  });
}

export async function listHolidays(actor: Actor, year?: number) {
  if (actor.kind === "PORTAL") throw forbidden();
  return db().holiday.findMany({ where: year ? { date: { startsWith: String(year) } } : {}, orderBy: { date: "asc" } });
}

export async function addHoliday(actor: Actor, input: { date: string; name: string; kind: "NATIONAL" | "STATE" | "FIRM"; stateCode?: string | null }) {
  authorize(actor, "holidays.manage");
  if (!isIsoDate(input.date) || !input.name.trim()) throw new DomainError("VALIDATION", "Give a date and a name.");
  if (input.kind === "STATE" && !input.stateCode) throw new DomainError("VALIDATION", "Choose the state.", { stateCode: "Required" });
  return transaction(async (tx) => {
    const h = await tx.holiday.create({ data: { date: input.date, name: input.name.trim(), kind: input.kind, stateCode: input.kind === "STATE" ? input.stateCode! : "-", createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Holiday", entityId: h.id, action: "CREATE", after: h });
    return h;
  });
}

export async function removeHoliday(actor: Actor, id: string) {
  authorize(actor, "holidays.manage");
  return transaction(async (tx) => {
    const h = await tx.holiday.delete({ where: { id } });
    await writeAudit(tx, actor, { entityType: "Holiday", entityId: id, action: "DELETE", before: h });
  });
}

// ---------------------------------------------------------------------------
// Extensions (Rules Spec 5)
// ---------------------------------------------------------------------------
const extensionInput = z.object({
  typeCodes: z.array(z.string()).min(1, "Choose at least one compliance type"),
  periodsMode: z.enum(["SPECIFIC", "ALL_OPEN"]),
  periodKeys: z.array(z.string()).default([]),
  scope: z.array(z.object({ field: z.enum(["constitution", "gstFrequency", "state", "clientId"]), values: z.array(z.string()).min(1) })).default([]),
  newEffectiveDueDate: zIsoDate,
  reason: z.string().trim().min(3),
  notificationRef: z.string().trim().min(1, "Give the notification / circular number"),
  supersedesId: z.string().nullable().optional(),
});
export type ExtensionInput = z.input<typeof extensionInput>;

async function extensionDef(extensionId: string): Promise<ExtensionDef> {
  const e = await db().extension.findUnique({ where: { id: extensionId }, include: { types: true, scopes: true } });
  if (!e) throw notFound("Extension");
  return {
    reference: e.notificationRef || e.id, typeCodes: e.types.map((t) => t.complianceTypeCode), periodsMode: e.periodsMode as "SPECIFIC",
    periodKeys: e.periodKeys ? e.periodKeys.split(",") : [], scope: e.scopes.map((s) => ({ field: s.field as "state", values: s.valuesCsv.split(",") })), newDate: e.newEffectiveDueDate,
  };
}

async function candidateTasks(def: ExtensionDef): Promise<TaskForExtension[]> {
  const rows = await db().task.findMany({
    where: { complianceTypeCode: { in: def.typeCodes }, ...(def.periodsMode === "SPECIFIC" ? { periodKey: { in: def.periodKeys } } : {}) },
    include: { client: { select: { constitution: true, stateCode: true } }, gstin: { select: { stateCode: true, frequency: true } } },
  });
  return rows.map((t) => ({ ...toExisting(t), constitution: t.client.constitution, state: t.gstin?.stateCode ?? t.client.stateCode, gstFrequency: t.gstin?.frequency ?? null }));
}

export async function createExtension(actor: Actor, input: ExtensionInput) {
  authorize(actor, "extension.publish");
  const d = parse(extensionInput, input);
  if (d.periodsMode === "SPECIFIC" && d.periodKeys.length === 0) throw new DomainError("VALIDATION", "Choose the periods, or 'all open periods'.", { periodKeys: "Required" });
  return transaction(async (tx) => {
    const e = await tx.extension.create({
      data: {
        periodsMode: d.periodsMode, periodKeys: d.periodKeys.join(","), scopeAllClients: d.scope.length === 0, newEffectiveDueDate: d.newEffectiveDueDate,
        reason: d.reason, notificationRef: d.notificationRef, supersedesId: d.supersedesId ?? null, createdById: idOf(actor),
        types: { create: d.typeCodes.map((complianceTypeCode) => ({ complianceTypeCode })) },
        scopes: { create: d.scope.map((s) => ({ field: s.field, valuesCsv: s.values.join(",") })) },
      },
    });
    await writeAudit(tx, actor, { entityType: "Extension", entityId: e.id, action: "CREATE", after: d });
    return e;
  });
}

/** Required confirmation step before publishing: "This will affect N open tasks across M clients". */
export async function previewExtension(actor: Actor, extensionId: string) {
  authorize(actor, "extension.publish");
  const def = await extensionDef(extensionId);
  const candidates = await candidateTasks(def);
  const p = previewEngine(def, candidates);
  await db().extension.update({ where: { id: extensionId }, data: { previewCount: p.tasks } });
  const sampleIds = matchExtension(def, candidates).slice(0, 15).map((t) => t.id);
  const sample = await db().task.findMany({ where: { id: { in: sampleIds } }, select: { id: true, title: true, effectiveDueDate: true, status: true, client: { select: { name: true } } } });
  return { ...p, sample };
}

/** Publish: apply Rules Spec 5.3 to every matched task, notify assignees, supersede the earlier extension. */
export async function publishExtension(actor: Actor, extensionId: string, confirmedCount: number) {
  authorize(actor, "extension.publish");
  const ext = await db().extension.findUniqueOrThrow({ where: { id: extensionId } });
  if (ext.status !== "DRAFT") throw ruleViolation("Only a draft extension can be published. Extensions are append-only: publish a new one to correct it.");
  const def = await extensionDef(extensionId);
  const tasks = await candidateTasks(def);
  const updates = planExtension(def, tasks);
  if (updates.length !== confirmedCount) throw ruleViolation(`The number of affected tasks changed (${updates.length}, you confirmed ${confirmedCount}). Preview again.`);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  await transaction(async (tx) => {
    await applyUpdates(tx, actor, updates, byId);
    await tx.extension.update({ where: { id: extensionId }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: idOf(actor) } });
    if (ext.supersedesId) await tx.extension.update({ where: { id: ext.supersedesId }, data: { status: "SUPERSEDED" } });
    await writeAudit(tx, actor, { entityType: "Extension", entityId: extensionId, action: "PUBLISH", after: { tasks: updates.length, reclassified: updates.filter((u) => u.status === "FILED").length } });
  });
  const assignees = await db().taskAssignment.findMany({ where: { taskId: { in: updates.map((u) => u.taskId) }, role: "ASSIGNEE", toDate: null }, include: { task: true } });
  for (const a of assignees) {
    await notifyUsers([a.userId], { kind: "EXTENSION", title: `Due date extended: ${a.task.title}`, body: `New due date ${def.newDate} (${def.reference})`, link: `/tasks/${a.taskId}`, entityType: "Task", entityId: a.taskId, dedupeKey: `EXTENSION|${extensionId}|${a.taskId}|${a.userId}` });
  }
  return { tasks: updates.length };
}

export async function listExtensions(actor: Actor) {
  authorize(actor, "task.view");
  return db().extension.findMany({ include: { types: true, scopes: true }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Manual due dates, regenerate
// ---------------------------------------------------------------------------
/** For types with a MANUAL rule (PT, closure filings) or a date the rule could not compute. */
export async function setManualDueDate(actor: Actor, taskId: string, date: string, reason: string) {
  const scope = authorize(actor, "task.notApplicable");
  const task = await db().task.findFirst({ where: { AND: [{ id: taskId }, taskWhere(actor, scope)] } });
  if (!task) throw notFound("Task");
  if (!isIsoDate(date) || !reason.trim()) throw new DomainError("VALIDATION", "Give a date and the source.", { date: "Required" });
  if (task.status === "FILED" || task.status === "FILED_LATE" || task.status === "NOT_APPLICABLE") throw ruleViolation("This task is closed.");
  if (task.originalDueDate && !can(actor, "dueDateMaster.manage")) throw forbidden("This task's due date comes from the master. Use an extension instead.");
  await transaction((tx) => applyUpdates(tx, actor, [{
    taskId, originalDueDate: task.originalDueDate ?? date, effectiveDueDate: date, isProvisional: false,
    history: { oldValue: task.effectiveDueDate, newValue: date, source: "MANUAL_ENTRY", reference: reason },
  }], new Map([[taskId, toExisting(task)]])));
}

/** Admin "Regenerate" (Rules Spec 3.3): fills gaps only, never overwrites; logged. */
export async function regenerate(actor: Actor, clientId?: string) {
  authorize(actor, "task.regenerate");
  const result = clientId ? await syncClientCompliance(clientId, { actor }) : await syncAllClients();
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Client", entityId: clientId ?? "*", action: "REGENERATE", after: result }));
  return result;
}
