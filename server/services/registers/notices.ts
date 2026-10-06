import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { assertClientAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { writeAudit, logSensitiveView } from "../../audit";
import { addDays, todayIst } from "../../lib/dates";
import { getSettingNumber } from "../settings/service";
import { notifyUsers } from "../notifications/service";
import { idOf, inClients, visibleClientIds } from "./common";

export const AUTHORITIES = ["INCOME_TAX", "GST", "TDS_TRACES", "MCA_ROC", "OTHER"] as const;
export const NOTICE_STATUSES = ["OPEN", "RESPONDED", "HEARING", "CLOSED"] as const;
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const noticeInput = z.object({
  clientId: z.string().min(1),
  authority: z.enum(AUTHORITIES),
  ayOrPeriod: z.string().trim().default(""),
  noticeType: z.string().trim().default(""),
  section: z.string().trim().default(""),
  referenceNo: z.string().trim().default(""),
  noticeDate: iso.nullable().optional(),
  receivedDate: iso,
  responseDueDate: iso.nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  reviewerId: z.string().nullable().optional(),
  engagementId: z.string().nullable().optional(),
  summary: z.string().default(""),
  demandRupees: z.number().min(0).optional(),
  createTask: z.boolean().default(true),
});
export type NoticeInput = z.input<typeof noticeInput>;

/** Notice register (spec 6.2). Response due defaults to received + setting (Q-13: 15 days); a response task is created. */
export async function createNotice(actor: Actor, input: NoticeInput) {
  const d = parse(noticeInput, input);
  await assertClientAccess(actor, "notice.manage", d.clientId);
  if (d.noticeDate && d.noticeDate > d.receivedDate) throw new DomainError("VALIDATION", "The notice date is after the received date.", { noticeDate: "Check the date" });
  if (d.receivedDate > todayIst()) throw new DomainError("VALIDATION", "Received date cannot be in the future.", { receivedDate: "Check the date" });
  const due = d.responseDueDate ?? addDays(d.receivedDate, await getSettingNumber("notice.defaultResponseDays", 15));
  const engagement = d.engagementId ? await db().engagement.findFirst({ where: { id: d.engagementId, clientId: d.clientId } }) : null;
  const notice = await transaction(async (tx) => {
    const n = await tx.notice.create({
      data: {
        clientId: d.clientId, authority: d.authority, ayOrPeriod: d.ayOrPeriod, noticeType: d.noticeType, section: d.section, referenceNo: d.referenceNo,
        noticeDate: d.noticeDate ?? null, receivedDate: d.receivedDate, responseDueDate: due, assigneeId: d.assigneeId ?? null, reviewerId: d.reviewerId ?? null,
        engagementId: engagement?.id ?? null, summary: d.summary, demandPaise: Math.round((d.demandRupees ?? 0) * 100), demandStatus: d.demandRupees ? "RAISED" : "NONE",
        createdById: idOf(actor),
      },
    });
    if (d.createTask) {
      const t = await tx.task.create({
        data: {
          clientId: d.clientId, engagementId: engagement?.id ?? null, title: `Notice response: ${label(n)}`, periodKey: `NOTICE-${n.id}`,
          originalDueDate: due, effectiveDueDate: due, isOneOff: true, stageTemplateVersionId: engagement?.stageTemplateVersionId ?? null, createdById: idOf(actor),
        },
      });
      await tx.taskStatusHistory.create({ data: { taskId: t.id, toStatus: "UPCOMING", reason: "Notice received", createdById: idOf(actor) } });
      for (const [userId, roles] of [[d.assigneeId, ["ASSIGNEE", "MAKER"]], [d.reviewerId, ["CHECKER"]]] as const) {
        if (userId) for (const role of roles) await tx.taskAssignment.create({ data: { taskId: t.id, userId, role, fromDate: todayIst(), createdById: idOf(actor) } });
      }
      await tx.notice.update({ where: { id: n.id }, data: { taskId: t.id } });
    }
    await writeAudit(tx, actor, { entityType: "Notice", entityId: n.id, action: "CREATE", after: { ...d, responseDueDate: due } });
    return n;
  });
  const people = [d.assigneeId, d.reviewerId].filter((x): x is string => !!x && x !== idOf(actor));
  if (people.length) await notifyUsers(people, { kind: "NOTICE", title: `Notice assigned: ${label(notice)}`, body: `Response due ${due}`, link: `/notices/${notice.id}`, entityType: "Notice", entityId: notice.id });
  return notice;
}

export function label(n: { authority: string; section: string; ayOrPeriod: string }) {
  return [n.authority.replace(/_/g, " "), n.section && `u/s ${n.section}`, n.ayOrPeriod].filter(Boolean).join(" · ");
}

async function loadNotice(actor: Actor, id: string, cap: "notice.view" | "notice.manage") {
  const n = await db().notice.findUnique({ where: { id }, include: { hearings: { orderBy: { date: "asc" } } } });
  if (!n) throw notFound("Notice");
  const ids = await visibleClientIds(actor, cap);
  const mine = actor.kind === "USER" && (n.assigneeId === actor.userId || n.reviewerId === actor.userId);
  if (ids && !ids.includes(n.clientId) && !mine) throw forbidden();
  return n;
}

/** Opening a notice is a sensitive view and is logged (spec 3.9). */
export async function getNotice(actor: Actor, id: string) {
  const n = await loadNotice(actor, id, "notice.view");
  await logSensitiveView(actor, "NOTICE", "Notice", id);
  const client = await db().client.findUniqueOrThrow({ where: { id: n.clientId }, select: { id: true, name: true, code: true } });
  const people = await db().user.findMany({ where: { id: { in: [n.assigneeId, n.reviewerId].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
  return { ...n, client, people: Object.fromEntries(people.map((p) => [p.id, p.displayName])) };
}

export async function listNotices(actor: Actor, f: { status?: string; clientId?: string; authority?: string } = {}) {
  const ids = await visibleClientIds(actor, "notice.view");
  const mine = actor.kind === "USER" ? [{ assigneeId: actor.userId }, { reviewerId: actor.userId }] : [];
  return db().notice.findMany({
    where: {
      AND: [
        ids === null ? {} : { OR: [inClients(ids), ...mine] },
        f.status === "ALL" ? {} : f.status ? { status: f.status } : { status: { not: "CLOSED" } },
        f.clientId ? { clientId: f.clientId } : {},
        f.authority ? { authority: f.authority } : {},
      ],
    },
    include: { hearings: { where: { date: { gte: todayIst() } }, orderBy: { date: "asc" }, take: 1 } },
    orderBy: [{ responseDueDate: "asc" }],
    take: 500,
  });
}

const noticeUpdate = noticeInput.omit({ clientId: true, createTask: true }).extend({
  status: z.enum(NOTICE_STATUSES),
  outcome: z.string(),
  demandStatus: z.enum(["NONE", "RAISED", "DROPPED", "REDUCED", "PAID"]),
});

export async function updateNotice(actor: Actor, id: string, input: Partial<z.input<typeof noticeUpdate>>) {
  const before = await loadNotice(actor, id, "notice.manage");
  const d = parsePartial(noticeUpdate, input);
  if (d.status === "CLOSED" && !(d.outcome ?? before.outcome).trim()) throw new DomainError("VALIDATION", "Record the outcome before closing.", { outcome: "Required" });
  const { demandRupees, ...rest } = d;
  return transaction(async (tx) => {
    const after = await tx.notice.update({
      where: { id },
      data: { ...rest, ...(demandRupees !== undefined ? { demandPaise: Math.round(demandRupees * 100) } : {}), closedAt: d.status === "CLOSED" ? new Date() : d.status ? null : undefined, updatedById: idOf(actor) },
    });
    if (d.responseDueDate && before.taskId) await tx.task.update({ where: { id: before.taskId }, data: { effectiveDueDate: d.responseDueDate } });
    // The response task follows the notice's people, so the right person gets its reminders.
    if (before.taskId) {
      const people: [string | null | undefined, string | null, string[]][] = [[d.assigneeId, before.assigneeId, ["ASSIGNEE", "MAKER"]], [d.reviewerId, before.reviewerId, ["CHECKER"]]];
      for (const [next, prev, roles] of people) {
        if (next === undefined || next === prev) continue;
        await tx.taskAssignment.updateMany({ where: { taskId: before.taskId, role: { in: roles }, toDate: null }, data: { toDate: todayIst() } });
        if (next) for (const role of roles) await tx.taskAssignment.create({ data: { taskId: before.taskId, userId: next, role, fromDate: todayIst(), createdById: idOf(actor) } });
      }
    }
    await writeAudit(tx, actor, { entityType: "Notice", entityId: id, action: "UPDATE", before, after });
    return after;
  });
}

const hearingInput = z.object({ date: iso, kind: z.enum(["HEARING", "ADJOURNMENT"]).default("HEARING"), notes: z.string().default(""), outcome: z.string().default("") });

/** Hearings and adjournments; each hearing date gets 7/3/1-day reminders from the reminder job (spec 6.2). */
export async function addHearing(actor: Actor, noticeId: string, input: z.input<typeof hearingInput>) {
  const n = await loadNotice(actor, noticeId, "notice.manage");
  if (n.status === "CLOSED") throw ruleViolation("The notice is closed.");
  const d = parse(hearingInput, input);
  return transaction(async (tx) => {
    const h = await tx.hearing.create({ data: { noticeId, ...d, createdById: idOf(actor) } });
    await tx.notice.update({ where: { id: noticeId }, data: { status: "HEARING" } });
    await writeAudit(tx, actor, { entityType: "Hearing", entityId: h.id, action: "CREATE", after: d });
    return h;
  });
}
