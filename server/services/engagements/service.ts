import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { forbidden, notFound, ruleViolation } from "../../lib/errors";
import { authorize, can } from "../../permissions/guards";
import { assertClientAccess, assertEngagementAccess, engagementWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { nextCode } from "../../lib/codes";
import { ENGAGEMENT_STATUSES, FEE_BASES, RECURRENCES, SERVICE_LINES, zIsoDate } from "../../domain/enums";
import { todayIst } from "../../lib/dates";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const engagementInput = z.object({
  clientId: z.string(),
  name: z.string().trim().min(3).max(160),
  serviceLine: z.enum(SERVICE_LINES),
  engagementType: z.string().min(2), // StageTemplate.code
  recurrence: z.enum(RECURRENCES).default("ONE_TIME"),
  complianceTypeCode: z.preprocess(blankToNull, z.string().nullable().optional()),
  feeBasis: z.enum(FEE_BASES).default("FIXED"),
  feePaise: z.number().int().min(0).default(0),
  ratePaisePerHour: z.number().int().min(0).default(0),
  budgetMinutes: z.number().int().min(0).multipleOf(15, "Budget is in 15-minute steps").default(0),
  chargeable: z.boolean().default(true),
  startDate: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  endDate: z.preprocess(blankToNull, zIsoDate.nullable().optional()),
  partnerId: z.preprocess(blankToNull, z.string().nullable().optional()),
  managerId: z.preprocess(blankToNull, z.string().nullable().optional()),
  eqrRequired: z.boolean().default(false),
});
export type EngagementInput = z.input<typeof engagementInput>;

function checkFeeBasis(d: { feeBasis?: string; ratePaisePerHour?: number }) {
  if (d.feeBasis === "TIME" && !d.ratePaisePerHour) throw ruleViolation("Time-based engagements need an hourly rate.");
}

/** Fee fields are billing data: hidden from Staff and Articles (spec 7.1, permissions invariant 4). */
function shapeFees<T extends { feePaise: number; ratePaisePerHour: number }>(actor: Actor, e: T) {
  if (can(actor, "billing.view")) return { ...e, canSeeFees: true };
  return { ...e, feePaise: 0, ratePaisePerHour: 0, canSeeFees: false };
}

export async function listEngagements(actor: Actor, opts: { clientId?: string; status?: string; q?: string } = {}) {
  const scope = authorize(actor, "engagement.view");
  const rows = await db().engagement.findMany({
    where: {
      AND: [
        engagementWhere(actor, scope),
        opts.clientId ? { clientId: opts.clientId } : {},
        opts.status ? { status: opts.status } : { status: { notIn: ["ARCHIVED", "CANCELLED"] } },
        opts.q ? { OR: [{ name: { contains: opts.q } }, { code: { contains: opts.q.toUpperCase() } }] } : {},
      ],
    },
    include: {
      client: { select: { id: true, code: true, name: true } },
      assignments: { where: { toDate: null }, include: { user: { select: { id: true, displayName: true } } } },
    },
    orderBy: [{ status: "asc" }, { code: "desc" }],
    take: 500,
  });
  return rows.map((r) => shapeFees(actor, r));
}

export async function getEngagement(actor: Actor, engagementId: string) {
  await assertEngagementAccess(actor, "engagement.view", engagementId);
  const e = await db().engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: {
      client: { select: { id: true, code: true, name: true } },
      assignments: { orderBy: { fromDate: "desc" }, include: { user: { select: { id: true, displayName: true, role: true } } } },
      stageTemplateVersion: { include: { template: true, stages: { orderBy: { index: "asc" } } } },
      budgetPeriods: true,
    },
  });
  return shapeFees(actor, e);
}

async function activeTemplateVersion(engagementType: string) {
  const template = await db().stageTemplate.findUnique({
    where: { code: engagementType },
    include: { versions: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!template) throw ruleViolation(`Unknown engagement type ${engagementType}.`);
  return template.versions[0] ?? null;
}

export async function createEngagement(actor: Actor, input: EngagementInput) {
  const data = parse(engagementInput, input);
  await assertClientAccess(actor, "engagement.manage", data.clientId);
  checkFeeBasis(data);
  const version = await activeTemplateVersion(data.engagementType);
  const client = await db().client.findUniqueOrThrow({ where: { id: data.clientId } });
  return transaction(async (tx) => {
    const e = await tx.engagement.create({
      data: {
        ...data,
        code: await nextCode(tx, "engagement"),
        stageTemplateVersionId: version?.id ?? null,
        partnerId: data.partnerId ?? client.partnerId,
        managerId: data.managerId ?? client.managerId,
        startDate: data.startDate ?? todayIst(),
        createdById: idOf(actor),
        updatedById: idOf(actor),
      },
    });
    await writeAudit(tx, actor, { entityType: "Engagement", entityId: e.id, action: "CREATE", after: e });
    if (e.recurrence === "RECURRING") await adoptAutoTasks(tx, e);
    return e;
  });
}

/**
 * Compliance tasks generated before the client's real recurring engagement existed sit on an
 * auto-created "(recurring)" engagement. When the real one is created, its open tasks move to it.
 */
async function adoptAutoTasks(tx: Tx, e: { id: string; clientId: string; engagementType: string; name: string; stageTemplateVersionId: string | null }) {
  const auto = await tx.engagement.findMany({ where: { clientId: e.clientId, engagementType: e.engagementType, name: { endsWith: "(recurring)" }, id: { not: e.id } } });
  if (auto.length === 0) return;
  const hints: Record<string, RegExp> = { TAR: /tax audit/i, "TP-3CEB": /3ceb|transfer/i, "STAT-AUDIT": /statutory/i };
  const tasks = await tx.task.findMany({ where: { engagementId: { in: auto.map((a) => a.id) }, status: { in: ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"] } } });
  for (const t of tasks) {
    const hint = t.complianceTypeCode ? hints[t.complianceTypeCode] : undefined;
    const otherHint = Object.values(hints).some((h) => h.test(e.name));
    if (hint ? !hint.test(e.name) : otherHint) continue;
    await tx.task.update({ where: { id: t.id }, data: { engagementId: e.id } });
  }
}

const engagementUpdate = engagementInput.omit({ clientId: true }).extend({ status: z.enum(ENGAGEMENT_STATUSES) });

export async function updateEngagement(actor: Actor, engagementId: string, input: Partial<z.input<typeof engagementUpdate>>) {
  await assertEngagementAccess(actor, "engagement.manage", engagementId);
  const data = parsePartial(engagementUpdate, input);
  return transaction(async (tx) => {
    const before = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } });
    // Fees and chargeability are Partner decisions (spec 3.1, 7.1); Managers only see them.
    const feeChanged = (["feeBasis", "feePaise", "ratePaisePerHour", "chargeable"] as const).some((k) => data[k] !== undefined && data[k] !== before[k]);
    if (feeChanged && !can(actor, "billing.approve")) throw forbidden("Only a Partner can change fees or chargeability.");
    checkFeeBasis({ feeBasis: data.feeBasis ?? before.feeBasis, ratePaisePerHour: data.ratePaisePerHour ?? before.ratePaisePerHour });
    if (before.status === "ARCHIVED") throw ruleViolation("Archived engagements are read-only.");
    const after = await tx.engagement.update({
      where: { id: engagementId },
      data: { ...data, closedAt: data.status === "COMPLETED" && !before.closedAt ? new Date() : before.closedAt, updatedById: idOf(actor) },
    });
    await writeAudit(tx, actor, { entityType: "Engagement", entityId: engagementId, action: "UPDATE", before, after });
    return after;
  });
}

const assignInput = z.object({ userId: z.string(), role: z.enum(["MEMBER", "MAKER", "CHECKER", "EQR"]).default("MEMBER") });

/** Assign a person to an engagement. Articles never check; HR Admin never touches client work. */
export async function assignToEngagement(actor: Actor, engagementId: string, input: z.input<typeof assignInput>) {
  await assertEngagementAccess(actor, "engagement.manage", engagementId);
  const data = parse(assignInput, input);
  const user = await db().user.findUnique({ where: { id: data.userId } });
  if (!user || !user.active) throw ruleViolation("Only active people can be assigned.");
  if (user.role === "HR_ADMIN" || user.role === "PRACTICE_ADMIN") throw ruleViolation("Admins are not assigned to client work.");
  if ((data.role === "CHECKER" || data.role === "EQR") && user.role === "ARTICLE") throw ruleViolation("Article Assistants are never checkers.");
  if (data.role === "CHECKER" && user.role === "STAFF" && !user.isSenior) throw ruleViolation("Only Seniors, Managers and Partners can be checkers.");
  if (data.role === "EQR" && user.role !== "PARTNER") throw ruleViolation("Engagement quality review is done by a Partner.");
  return transaction(async (tx) => {
    const existing = await tx.engagementAssignment.findFirst({ where: { engagementId, userId: data.userId, role: data.role, toDate: null } });
    if (existing) return existing;
    const a = await tx.engagementAssignment.create({
      data: { engagementId, userId: data.userId, role: data.role, fromDate: todayIst(), createdById: idOf(actor) },
    });
    // Open tasks of the engagement that have nobody in this role get this person (maker ≠ checker kept).
    const taskRoles = data.role === "CHECKER" ? ["CHECKER"] : data.role === "EQR" ? ["EQR"] : ["ASSIGNEE", "MAKER"];
    const open = await tx.task.findMany({ where: { engagementId, status: { in: ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"] } }, include: { assignments: { where: { toDate: null } } } });
    for (const t of open) {
      if (t.assignments.some((x) => taskRoles.includes(x.role))) continue;
      const clash = data.role === "CHECKER" ? t.assignments.some((x) => x.userId === data.userId && x.role === "MAKER") : data.role !== "EQR" && t.assignments.some((x) => x.userId === data.userId && x.role === "CHECKER");
      if (clash) continue;
      for (const role of taskRoles) await tx.taskAssignment.create({ data: { taskId: t.id, userId: data.userId, role, fromDate: todayIst(), createdById: idOf(actor) } });
    }
    await writeAudit(tx, actor, { entityType: "EngagementAssignment", entityId: a.id, action: "CREATE", after: { engagementId, ...data } });
    return a;
  });
}

export async function endEngagementAssignment(actor: Actor, assignmentId: string) {
  const a = await db().engagementAssignment.findUnique({ where: { id: assignmentId } });
  if (!a) throw notFound("Assignment");
  await assertEngagementAccess(actor, "engagement.manage", a.engagementId);
  await transaction(async (tx) => {
    await tx.engagementAssignment.update({ where: { id: assignmentId }, data: { toDate: todayIst(), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "EngagementAssignment", entityId: assignmentId, action: "END" });
  });
}

export async function listStageTemplates() {
  return db().stageTemplate.findMany({
    where: { active: true },
    include: { versions: { where: { status: "ACTIVE" }, include: { stages: { orderBy: { index: "asc" } } } } },
    orderBy: { name: "asc" },
  });
}

const idOf = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
