import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, ruleViolation } from "../../lib/errors";
import { authorize, requireStaff } from "../../permissions/guards";
import { assertEngagementAccess, engagementWhere } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { todayIst } from "../../lib/dates";
import { notifyUsers } from "../notifications/service";

/**
 * Close and archive (spec 7.2, P3-06). Closing needs every task closed (Filed / Filed Late / Not Applicable), or a
 * Partner override with a reason. A closed engagement becomes COMPLETED and archived (archivedAt): read-only and
 * searchable at /archive. Closing triggers a client feedback request and, for recurring work, a renewal reminder.
 */
const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

const closeInput = z.object({ overrideReason: z.string().trim().max(500).optional() });

export async function closeReadiness(actor: Actor, engagementId: string) {
  await assertEngagementAccess(actor, "engagement.view", engagementId);
  const [e, open] = await Promise.all([
    db().engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { status: true, archivedAt: true } }),
    db().task.findMany({ where: { engagementId, status: { in: OPEN } }, select: { id: true, title: true, periodLabel: true, effectiveDueDate: true, status: true }, orderBy: { effectiveDueDate: "asc" } }),
  ]);
  return { archived: !!e.archivedAt, status: e.status, openTasks: open };
}

export async function closeEngagement(actor: Actor, engagementId: string, input: z.input<typeof closeInput> = {}) {
  requireStaff(actor);
  await assertEngagementAccess(actor, "engagement.manage", engagementId);
  const d = parse(closeInput, input);
  const e = await db().engagement.findUniqueOrThrow({ where: { id: engagementId }, include: { client: { select: { id: true, name: true, isFirm: true } } } });
  if (e.archivedAt) throw ruleViolation("This engagement is already closed and archived.");
  if (e.status === "CANCELLED") throw ruleViolation("A cancelled engagement cannot be closed.");
  const open = await db().task.count({ where: { engagementId, status: { in: OPEN } } });
  if (open > 0) {
    if (actor.role !== "PARTNER") throw forbidden(`${open} task(s) are still open. Close them, or ask a Partner to close the engagement with a reason.`);
    if (!d.overrideReason || d.overrideReason.length < 5) throw new DomainError("VALIDATION", `${open} task(s) are still open. Give a reason to close anyway.`, { overrideReason: "Required" });
  }
  const now = new Date();
  const after = await transaction(async (tx) => {
    const row = await tx.engagement.update({
      where: { id: engagementId },
      data: { status: "COMPLETED", closedAt: e.closedAt ?? now, archivedAt: now, endDate: e.endDate ?? todayIst(), updatedById: actor.userId },
    });
    await writeAudit(tx, actor, {
      entityType: "Engagement", entityId: engagementId, action: "CLOSE_ARCHIVE",
      before: { status: e.status, archivedAt: null }, after: { status: "COMPLETED", archivedAt: now, openTasksAtClose: open },
      reason: open ? `Partner override: ${d.overrideReason}` : "All tasks closed",
    });
    return row;
  });
  const hooks = await afterClose({ id: e.id, code: e.code, name: e.name, clientId: e.clientId, clientName: e.client.name, isFirm: e.client.isFirm, recurrence: e.recurrence, managerId: e.managerId, partnerId: e.partnerId });
  return { engagement: after, ...hooks };
}

/**
 * Follow-ups after closing (spec 7.2 → 10.8). The CRM module owns feedback requests and renewals; until it exposes a
 * function for them, the engagement's Manager and Partner get an actionable notification instead.
 */
async function afterClose(e: { id: string; code: string; name: string; clientId: string; clientName: string; isFirm: boolean; recurrence: string; managerId: string | null; partnerId: string | null }) {
  if (e.isFirm) return { feedbackRequested: false, renewalReminder: false };
  const people = [e.managerId, e.partnerId].filter((x): x is string => !!x);
  await notifyUsers(people, {
    kind: "FEEDBACK_REQUEST", title: `Ask ${e.clientName} for feedback`, body: `${e.name} (${e.code}) was closed. Send the client feedback request.`,
    link: `/archive/${e.id}`, entityType: "Engagement", entityId: e.id, dedupeKey: `feedback|${e.id}`,
  });
  let renewal = false;
  if (e.recurrence === "RECURRING") {
    await notifyUsers(people, {
      kind: "RENEWAL", title: `Renewal due: ${e.clientName}`, body: `${e.name} (${e.code}) is recurring work and was closed. Plan the renewal / next engagement.`,
      link: `/clients/${e.clientId}`, entityType: "Engagement", entityId: e.id, dedupeKey: `renewal|${e.id}`,
    });
    renewal = true;
  }
  return { feedbackRequested: true, renewalReminder: renewal };
}

export type ArchiveFilter = { q?: string; serviceLine?: string; year?: string; clientId?: string };

/** Archived engagements in the viewer's scope, searchable by name, code, client and closing year. */
export async function listArchive(actor: Actor, f: ArchiveFilter = {}) {
  requireStaff(actor);
  const scope = authorize(actor, "engagement.view");
  const q = f.q?.trim();
  const year = f.year && /^\d{4}$/.test(f.year) ? Number(f.year) : null;
  const rows = await db().engagement.findMany({
    where: {
      AND: [
        engagementWhere(actor, scope),
        { archivedAt: year ? { gte: new Date(`${year}-01-01T00:00:00+05:30`), lt: new Date(`${year + 1}-01-01T00:00:00+05:30`) } : { not: null } },
        f.serviceLine ? { serviceLine: f.serviceLine } : {},
        f.clientId ? { clientId: f.clientId } : {},
        q ? { OR: [{ name: { contains: q } }, { code: { contains: q.toUpperCase() } }, { client: { searchName: { contains: q.toLowerCase() } } }, { client: { code: { contains: q.toUpperCase() } } }] } : {},
      ],
    },
    include: { client: { select: { id: true, code: true, name: true } } },
    orderBy: { archivedAt: "desc" },
    take: 300,
  });
  const names = new Map((await db().user.findMany({ where: { id: { in: rows.flatMap((r) => [r.partnerId ?? "", r.managerId ?? ""]) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, serviceLine: r.serviceLine, recurrence: r.recurrence, status: r.status, client: r.client,
    closedAt: r.closedAt, archivedAt: r.archivedAt, partnerName: r.partnerId ? names.get(r.partnerId) ?? "" : "", managerName: r.managerId ? names.get(r.managerId) ?? "" : "",
  }));
}

/** Basic read-only facts for anyone who can see the engagement (the full report is Manager / Partner only). */
export async function engagementSummary(actor: Actor, engagementId: string) {
  await assertEngagementAccess(actor, "engagement.view", engagementId);
  const e = await db().engagement.findUniqueOrThrow({ where: { id: engagementId }, include: { client: { select: { id: true, code: true, name: true } } } });
  const [tasks, minutes] = await Promise.all([
    db().task.groupBy({ by: ["status"], where: { engagementId }, _count: { _all: true } }),
    db().workEntry.aggregate({ where: { engagementId, deletedAt: null }, _sum: { minutes: true } }),
  ]);
  return {
    id: e.id, code: e.code, name: e.name, serviceLine: e.serviceLine, recurrence: e.recurrence, status: e.status, startDate: e.startDate, endDate: e.endDate,
    closedAt: e.closedAt, archivedAt: e.archivedAt, client: e.client, taskCounts: Object.fromEntries(tasks.map((t) => [t.status, t._count._all])), totalMinutes: minutes._sum.minutes ?? 0,
  };
}
