import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, notFound, ruleViolation } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";

const idOf = (a: Actor) => (a.kind === "USER" ? a.userId : null);
const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

export async function listTemplates(actor: Actor) {
  authorize(actor, "templates.manage");
  return db().stageTemplate.findMany({
    include: { versions: { orderBy: { version: "desc" }, include: { stages: { orderBy: { index: "asc" } }, _count: { select: { tasks: { where: { status: { in: OPEN } } } } } } } },
    orderBy: { name: "asc" },
  });
}

const stageInput = z.object({
  name: z.string().trim().min(2),
  reviewLevel: z.enum(["NONE", "SENIOR", "MANAGER", "PARTNER"]).default("NONE"),
  isClientApproval: z.boolean().default(false),
  isFiling: z.boolean().default(false),
  requiresUdin: z.boolean().default(false),
  requiresDsc: z.boolean().default(false),
});
const draftInput = z.object({ stages: z.array(stageInput).min(2, "At least two stages").max(15), note: z.string().default("") });

/** Templates are versioned: edits create a draft; open tasks keep their version until mapped (P2-24). */
export async function createDraft(actor: Actor, templateId: string, input: z.input<typeof draftInput>) {
  authorize(actor, "templates.manage");
  const d = parse(draftInput, input);
  if (d.stages.filter((s) => s.isFiling).length > 1) throw new DomainError("VALIDATION", "Only one stage can be the filing stage.");
  const t = await db().stageTemplate.findUnique({ where: { id: templateId }, include: { versions: true } });
  if (!t) throw notFound("Template");
  if (t.versions.some((v) => v.status === "DRAFT")) throw ruleViolation("A draft already exists — publish or discard it first.");
  const version = Math.max(0, ...t.versions.map((v) => v.version)) + 1;
  return transaction(async (tx) => {
    const v = await tx.stageTemplateVersion.create({
      data: { templateId, version, status: "DRAFT", effectiveFrom: todayIst(), note: d.note, createdById: idOf(actor), stages: { create: d.stages.map((s, index) => ({ ...s, index })) } },
    });
    await writeAudit(tx, actor, { entityType: "StageTemplateVersion", entityId: v.id, action: "CREATE", after: d });
    return v;
  });
}

export async function discardDraft(actor: Actor, versionId: string) {
  authorize(actor, "templates.manage");
  const v = await db().stageTemplateVersion.findUnique({ where: { id: versionId } });
  if (!v || v.status !== "DRAFT") throw notFound("Draft");
  await transaction(async (tx) => {
    await tx.stageDef.deleteMany({ where: { versionId } });
    await tx.stageTemplateVersion.delete({ where: { id: versionId } });
    await writeAudit(tx, actor, { entityType: "StageTemplateVersion", entityId: versionId, action: "DISCARD" });
  });
}

/**
 * Partner publishes a draft. With `moveOpenTasks`, every open task and active engagement on older versions moves
 * to the new version, each task's current stage translated through `mapping` (old index → new index).
 * Without it, open work stays on its version and only new tasks use the new one.
 */
export async function publishVersion(actor: Actor, versionId: string, opts: { moveOpenTasks: boolean; mapping?: Record<number, number> }) {
  authorize(actor, "templates.approve");
  const v = await db().stageTemplateVersion.findUnique({ where: { id: versionId }, include: { stages: true } });
  if (!v || v.status !== "DRAFT") throw notFound("Draft");
  const older = await db().stageTemplateVersion.findMany({ where: { templateId: v.templateId, id: { not: versionId }, status: "ACTIVE" }, include: { stages: true } });
  const maxNew = v.stages.length - 1;
  if (opts.moveOpenTasks) {
    const used = new Set((await db().task.findMany({ where: { stageTemplateVersionId: { in: older.map((o) => o.id) }, status: { in: OPEN } }, select: { stageIndex: true } })).map((t) => t.stageIndex));
    for (const idx of used) {
      const to = opts.mapping?.[idx];
      if (to === undefined) throw new DomainError("VALIDATION", `Choose where open tasks at old stage ${idx + 1} should go.`);
      if (to < 0 || to > maxNew) throw new DomainError("VALIDATION", `Stage ${to + 1} does not exist in the new version.`);
    }
  }
  return transaction(async (tx) => {
    await tx.stageTemplateVersion.update({ where: { id: versionId }, data: { status: "ACTIVE", approvedById: idOf(actor), effectiveFrom: todayIst() } });
    await tx.stageTemplateVersion.updateMany({ where: { id: { in: older.map((o) => o.id) } }, data: { status: "RETIRED" } });
    let moved = 0;
    if (opts.moveOpenTasks) {
      const tasks = await tx.task.findMany({ where: { stageTemplateVersionId: { in: older.map((o) => o.id) }, status: { in: OPEN } }, select: { id: true, stageIndex: true } });
      for (const t of tasks) {
        await tx.task.update({ where: { id: t.id }, data: { stageTemplateVersionId: versionId, stageIndex: opts.mapping![t.stageIndex]! } });
        moved += 1;
      }
      await tx.engagement.updateMany({ where: { stageTemplateVersionId: { in: older.map((o) => o.id) }, status: "ACTIVE" }, data: { stageTemplateVersionId: versionId } });
    }
    await writeAudit(tx, actor, { entityType: "StageTemplateVersion", entityId: versionId, action: "PUBLISH", after: { moveOpenTasks: opts.moveOpenTasks, mapping: opts.mapping, moved } });
    return { moved };
  });
}

/** The version new tasks and engagements should use. */
export async function activeVersionFor(templateCode: string) {
  return db().stageTemplateVersion.findFirst({ where: { template: { code: templateCode }, status: "ACTIVE" }, orderBy: { version: "desc" } });
}
