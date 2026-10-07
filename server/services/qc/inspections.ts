import { z } from "zod";
import { randomInt } from "node:crypto";
import { db, transaction } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { parse } from "../../lib/validate";
import type { Actor } from "../../permissions/actor";
import { authorize, isReadOnlyScope, requireStaff } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { isIsoDate, todayIst } from "../../lib/dates";
import { getSetting } from "../settings/service";
import { notifyUsers } from "../notifications/service";

/**
 * Periodic file inspection (spec 13.2): a random sample of engagements closed in a period, findings,
 * and corrective actions with an owner and due date. Partner runs it; Managers see it read-only.
 */
const isoDate = z.string().refine(isIsoDate, "Use YYYY-MM-DD");

function requireQcWrite(actor: Actor) {
  const scope = authorize(actor, "qc.manage");
  if (isReadOnlyScope(scope)) throw forbidden("Only a Partner runs file inspections.");
}

const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const istEnd = (d: string) => new Date(`${d}T23:59:59.999+05:30`);

/** Engagements closed between two IST dates (closedAt, or end date for those closed without a timestamp). */
export async function closedEngagementsIn(periodFrom: string, periodTo: string) {
  return db().engagement.findMany({
    where: {
      OR: [
        { closedAt: { gte: istStart(periodFrom), lte: istEnd(periodTo) } },
        { closedAt: null, status: { in: ["COMPLETED", "ARCHIVED"] }, endDate: { gte: periodFrom, lte: periodTo } },
      ],
    },
    select: { id: true, code: true, name: true, clientId: true },
  });
}

function sample<T>(list: T[], n: number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  periodFrom: isoDate,
  periodTo: isoDate,
  sampleSize: z.coerce.number().int().min(1).max(100).optional(),
  /** Inspector's own choice instead of a random sample. */
  engagementIds: z.array(z.string()).optional(),
});

export async function createInspection(actor: Actor, input: z.input<typeof createSchema>) {
  requireStaff(actor);
  requireQcWrite(actor);
  const v = parse(createSchema, input);
  if (v.periodFrom > v.periodTo) throw new DomainError("VALIDATION", "From is after To.", { periodTo: "Must be on or after From" });
  let chosen: string[];
  if (v.engagementIds?.length) {
    const found = await db().engagement.findMany({ where: { id: { in: v.engagementIds } }, select: { id: true } });
    if (found.length !== new Set(v.engagementIds).size) throw notFound("Engagement");
    chosen = found.map((e) => e.id);
  } else {
    const size = v.sampleSize ?? (await getSetting<number>("qc.inspectionSampleSize", 5));
    const pool = await closedEngagementsIn(v.periodFrom, v.periodTo);
    if (!pool.length) throw ruleViolation("No engagements were closed in that period, so there is nothing to sample.");
    chosen = sample(pool, Math.max(1, size)).map((e) => e.id);
  }
  return transaction(async (tx) => {
    const i = await tx.qCInspection.create({
      data: { name: v.name, periodFrom: v.periodFrom, periodTo: v.periodTo, inspectorId: actor.userId, createdById: actor.userId, samples: { create: chosen.map((engagementId) => ({ engagementId, createdById: actor.userId })) } },
    });
    await writeAudit(tx, actor, { entityType: "QCInspection", entityId: i.id, action: "CREATE", after: { name: v.name, periodFrom: v.periodFrom, periodTo: v.periodTo, sample: chosen } });
    return i;
  });
}

const findingSchema = z.object({
  engagementId: z.string().min(1).nullish(),
  finding: z.string().trim().min(3).max(2000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  correctiveAction: z.string().trim().max(2000).default(""),
  ownerId: z.string().min(1).nullish(),
  dueDate: isoDate.nullish(),
});

export async function addFinding(actor: Actor, inspectionId: string, input: z.input<typeof findingSchema>) {
  requireStaff(actor);
  requireQcWrite(actor);
  const v = parse(findingSchema, input);
  const insp = await db().qCInspection.findUnique({ where: { id: inspectionId }, include: { samples: true } });
  if (!insp) throw notFound("Inspection");
  if (insp.status === "CLOSED") throw ruleViolation("This inspection is closed.");
  if (v.engagementId && !insp.samples.some((s) => s.engagementId === v.engagementId)) throw ruleViolation("Findings are recorded against engagements in the sample.");
  if (v.ownerId) {
    const o = await db().user.findUnique({ where: { id: v.ownerId } });
    if (!o || !o.active || o.isSystem) throw new DomainError("VALIDATION", "Choose an active person as owner.", { ownerId: "Invalid" });
  }
  if (v.ownerId && !v.dueDate) throw new DomainError("VALIDATION", "Give the corrective action a due date.", { dueDate: "Required with an owner" });
  const f = await transaction(async (tx) => {
    const row = await tx.qCFinding.create({
      data: { inspectionId, engagementId: v.engagementId ?? null, finding: v.finding, severity: v.severity, correctiveAction: v.correctiveAction, ownerId: v.ownerId ?? null, dueDate: v.dueDate ?? null, createdById: actor.userId },
    });
    await writeAudit(tx, actor, { entityType: "QCFinding", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
  if (f.ownerId) {
    await notifyUsers([f.ownerId], { kind: "QC_FINDING", title: "Corrective action assigned to you", body: `${f.correctiveAction || f.finding}${f.dueDate ? ` (due ${f.dueDate})` : ""}`, link: "/qc#findings", entityType: "QCFinding", entityId: f.id, dedupeKey: `QCF|${f.id}` });
  }
  return f;
}

/** Close a corrective action: its owner or a Partner. */
export async function closeFinding(actor: Actor, findingId: string, note = "") {
  requireStaff(actor);
  const f = await db().qCFinding.findUnique({ where: { id: findingId }, include: { inspection: true } });
  if (!f) throw notFound("Finding");
  if (f.closedAt) throw ruleViolation("Already closed.");
  const isOwner = f.ownerId === actor.userId;
  if (!isOwner) requireQcWrite(actor);
  return transaction(async (tx) => {
    const row = await tx.qCFinding.update({
      where: { id: findingId },
      data: { closedAt: new Date(), updatedById: actor.userId, ...(note.trim() ? { correctiveAction: `${f.correctiveAction}${f.correctiveAction ? "\n" : ""}Done: ${note.trim()}` } : {}) },
    });
    await writeAudit(tx, actor, { entityType: "QCFinding", entityId: findingId, action: "CLOSE", reason: note });
    return row;
  });
}

export async function closeInspection(actor: Actor, inspectionId: string) {
  requireStaff(actor);
  requireQcWrite(actor);
  const i = await db().qCInspection.findUnique({ where: { id: inspectionId } });
  if (!i) throw notFound("Inspection");
  if (i.status === "CLOSED") return i;
  return transaction(async (tx) => {
    const row = await tx.qCInspection.update({ where: { id: inspectionId }, data: { status: "CLOSED", closedAt: new Date(), updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "QCInspection", entityId: inspectionId, action: "CLOSE" });
    return row;
  });
}

export async function listInspections(actor: Actor) {
  authorize(actor, "qc.manage");
  const rows = await db().qCInspection.findMany({ include: { samples: true, findings: true }, orderBy: { createdAt: "desc" }, take: 50 });
  const engIds = [...new Set(rows.flatMap((r) => [...r.samples.map((s) => s.engagementId), ...r.findings.map((f) => f.engagementId)]).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.flatMap((r) => [r.inspectorId, ...r.findings.map((f) => f.ownerId)]).filter((x): x is string => !!x))];
  const [engs, users] = await Promise.all([
    db().engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, code: true, name: true, client: { select: { name: true } } } }),
    db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
  ]);
  const e = new Map(engs.map((x) => [x.id, x]));
  const u = new Map(users.map((x) => [x.id, x.displayName]));
  const today = todayIst();
  return rows.map((r) => ({
    id: r.id, name: r.name, periodFrom: r.periodFrom, periodTo: r.periodTo, status: r.status, inspector: u.get(r.inspectorId) ?? "",
    samples: r.samples.map((s) => ({ engagementId: s.engagementId, code: e.get(s.engagementId)?.code ?? "", name: e.get(s.engagementId)?.name ?? "", client: e.get(s.engagementId)?.client.name ?? "" })),
    findings: r.findings.map((f) => ({
      id: f.id, finding: f.finding, severity: f.severity, correctiveAction: f.correctiveAction, ownerId: f.ownerId, owner: f.ownerId ? (u.get(f.ownerId) ?? "") : "", dueDate: f.dueDate,
      engagement: f.engagementId ? (e.get(f.engagementId)?.code ?? "") : "", closedAt: f.closedAt, overdue: !f.closedAt && !!f.dueDate && f.dueDate < today,
    })),
  }));
}

/** Open corrective actions owned by me (shown to any staff member on /qc). */
export async function myCorrectiveActions(actor: Actor) {
  requireStaff(actor);
  return db().qCFinding.findMany({ where: { ownerId: actor.userId, closedAt: null }, include: { inspection: { select: { name: true } } }, orderBy: { dueDate: "asc" } });
}

/**
 * Scheduled job: remind owners (and the inspector) of corrective actions past their due date.
 * Idempotent per finding per day through the notification dedupe key.
 */
export async function runQcFindingReminders() {
  const today = todayIst();
  const overdue = await db().qCFinding.findMany({ where: { closedAt: null, ownerId: { not: null }, dueDate: { lt: today } }, include: { inspection: true } });
  let sent = 0;
  for (const f of overdue) {
    sent += await notifyUsers([f.ownerId!, f.inspection.inspectorId], {
      kind: "QC_FINDING_OVERDUE", title: "Corrective action overdue", body: `${f.correctiveAction || f.finding} (due ${f.dueDate})`, link: "/qc#findings",
      entityType: "QCFinding", entityId: f.id, priority: "HIGH", dedupeKey: `QCF-OD|${f.id}|${today}`,
    });
  }
  return { overdue: overdue.length, notified: sent };
}
