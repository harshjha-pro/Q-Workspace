import { db } from "../../lib/db";
import { forbidden } from "../../lib/errors";
import { authorize, can, requireStaff } from "../../permissions/guards";
import { assertClientAccess, assertEngagementAccess } from "../../permissions/scopes";
import type { Actor } from "../../permissions/actor";
import { logSensitiveView } from "../../audit";
import { formatDate, toIstDate } from "../../lib/dates";
import { formatMinutes } from "../../lib/money";
import { buildPdf, rs, type PdfBlock } from "../../documents/pdf";
import { billingStatusFor } from "../billing/service";

/**
 * Engagement completion report (spec 7.2, P3-01): hours by person and stage (effort only), key dates,
 * acknowledgments, UDINs, review points raised / cleared and billing status; printable as a PDF.
 * Readable by the engagement's Partners and Managers (engagement.manage scope); billing only with billing.view.
 */
export async function assertReportAccess(actor: Actor, engagementId: string) {
  requireStaff(actor);
  if (actor.role !== "PARTNER" && actor.role !== "MANAGER") throw forbidden("The completion report is for the engagement's Manager and Partner.");
  await assertEngagementAccess(actor, "engagement.manage", engagementId);
}

export async function completionReport(actor: Actor, engagementId: string) {
  await assertReportAccess(actor, engagementId);
  const e = await db().engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { client: { select: { id: true, code: true, name: true } }, assignments: { include: { user: { select: { id: true, displayName: true } } } } },
  });
  const tasks = await db().task.findMany({
    where: { engagementId },
    select: { id: true, title: true, periodLabel: true, status: true, effectiveDueDate: true, filedDate: true, ackType: true, ackNumber: true, closedAt: true, createdAt: true },
    orderBy: [{ effectiveDueDate: "asc" }, { title: "asc" }],
  });
  const taskIds = tasks.map((t) => t.id);
  const taskTitle = new Map(tasks.map((t) => [t.id, t.periodLabel ? `${t.title} (${t.periodLabel})` : t.title]));
  const [entries, acks, udins, points, signOffs] = await Promise.all([
    db().workEntry.groupBy({ by: ["userId", "stageName"], where: { engagementId, deletedAt: null }, _sum: { minutes: true } }),
    db().acknowledgment.findMany({ where: { taskId: { in: taskIds } }, orderBy: { date: "asc" } }),
    db().uDINRecord.findMany({ where: { OR: [{ engagementId }, { taskId: { in: taskIds } }] }, orderBy: { signingDate: "asc" } }),
    db().reviewPoint.findMany({ where: { taskId: { in: taskIds } }, orderBy: { raisedAt: "asc" } }),
    db().signOff.findMany({ where: { OR: [{ engagementId }, { taskId: { in: taskIds } }] }, orderBy: { signedAt: "asc" } }),
  ]);
  const span = await db().workEntry.aggregate({ where: { engagementId, deletedAt: null }, _min: { date: true }, _max: { date: true } });
  const userIds = [...new Set([...entries.map((x) => x.userId), ...points.flatMap((p) => [p.raisedById, p.clearedById ?? ""]), ...udins.map((u) => u.partnerId), ...signOffs.map((s) => s.signedById), e.partnerId ?? "", e.managerId ?? ""])];
  const names = new Map((await db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const name = (id: string | null | undefined) => (id ? names.get(id) ?? "" : "");

  // Hours by person × stage (effort indicator only).
  const stages = [...new Set(entries.map((x) => x.stageName ?? "No stage"))];
  const byPerson = new Map<string, Map<string, number>>();
  for (const x of entries) {
    const m = byPerson.get(x.userId) ?? new Map<string, number>();
    m.set(x.stageName ?? "No stage", (m.get(x.stageName ?? "No stage") ?? 0) + (x._sum.minutes ?? 0));
    byPerson.set(x.userId, m);
  }
  const hours = [...byPerson.entries()].map(([userId, m]) => ({ userId, name: name(userId), byStage: Object.fromEntries(m), minutes: [...m.values()].reduce((a, b) => a + b, 0) })).sort((a, b) => a.name.localeCompare(b.name));
  const stageTotals = Object.fromEntries(stages.map((s) => [s, hours.reduce((a, h) => a + (h.byStage[s] ?? 0), 0)]));
  const totalMinutes = hours.reduce((a, h) => a + h.minutes, 0);

  let billing: Awaited<ReturnType<typeof billingStatusFor>> | null = null;
  if (can(actor, "billing.view")) {
    try {
      await assertClientAccess(actor, "billing.view", e.clientId);
      billing = await billingStatusFor(engagementId);
      await logSensitiveView(actor, "BILLING", "Engagement", engagementId, "completion report");
    } catch {
      billing = null;
    }
  }

  const filedDates = tasks.map((t) => t.filedDate).filter((d): d is string => !!d).sort();
  return {
    engagement: {
      id: e.id, code: e.code, name: e.name, serviceLine: e.serviceLine, recurrence: e.recurrence, status: e.status, budgetMinutes: e.budgetMinutes,
      partnerName: name(e.partnerId), managerName: name(e.managerId), client: e.client, archivedAt: e.archivedAt,
    },
    keyDates: {
      start: e.startDate, end: e.endDate, firstWork: span._min.date, lastWork: span._max.date, firstFiling: filedDates[0] ?? null, lastFiling: filedDates.at(-1) ?? null,
      closed: e.closedAt ? toIstDate(e.closedAt) : null, archived: e.archivedAt ? toIstDate(e.archivedAt) : null,
    },
    team: [...new Map(e.assignments.map((a) => [a.userId, a.user.displayName])).values()],
    stages,
    hours,
    stageTotals,
    totalMinutes,
    tasks: tasks.map((t) => ({ ...t })),
    acknowledgments: acks.map((a) => ({ task: taskTitle.get(a.taskId) ?? "", type: a.ackType, number: a.number, date: a.date })),
    udins: udins.map((u) => ({ documentType: u.documentType, udin: u.udin, status: u.status, signingDate: u.signingDate, generatedOn: u.generatedOn, partner: name(u.partnerId) })),
    reviewPoints: {
      raised: points.length,
      cleared: points.filter((p) => p.status === "CLEARED").length,
      open: points.filter((p) => p.status !== "CLEARED").length,
      items: points.map((p) => ({ task: taskTitle.get(p.taskId) ?? "", text: p.text, status: p.status, raisedBy: name(p.raisedById), raisedAt: toIstDate(p.raisedAt), clearedBy: name(p.clearedById), clearedAt: p.clearedAt ? toIstDate(p.clearedAt) : null })),
    },
    signOffs: signOffs.map((s) => ({ level: s.level, by: name(s.signedById), at: toIstDate(s.signedAt), task: s.taskId ? taskTitle.get(s.taskId) ?? "" : "" })),
    billing,
    canSeeBilling: billing !== null,
  };
}

export type CompletionReport = Awaited<ReturnType<typeof completionReport>>;

/** Printable PDF of the completion report (route /api/lifecycle/completion/[engagementId]). */
export async function completionReportPdf(actor: Actor, engagementId: string) {
  authorize(actor, "engagement.view");
  const r = await completionReport(actor, engagementId);
  const profile = await db().firmProfile.findFirst();
  const blocks: PdfBlock[] = [
    { type: "kv", columns: 2, rows: [
      ["Client", `${r.engagement.client.name} (${r.engagement.client.code})`], ["Engagement", `${r.engagement.name} (${r.engagement.code})`],
      ["Service line", r.engagement.serviceLine.replace(/_/g, " ")], ["Status", r.engagement.status],
      ["Partner", r.engagement.partnerName || "-"], ["Manager", r.engagement.managerName || "-"],
    ] },
    { type: "heading", text: "Key dates" },
    { type: "kv", columns: 2, rows: [
      ["Start", formatDate(r.keyDates.start) || "-"], ["End", formatDate(r.keyDates.end) || "-"],
      ["First work logged", formatDate(r.keyDates.firstWork) || "-"], ["Last work logged", formatDate(r.keyDates.lastWork) || "-"],
      ["First filing", formatDate(r.keyDates.firstFiling) || "-"], ["Last filing", formatDate(r.keyDates.lastFiling) || "-"],
      ["Closed", formatDate(r.keyDates.closed) || "-"], ["Archived", formatDate(r.keyDates.archived) || "-"],
    ] },
    { type: "heading", text: "Hours logged by person and stage (effort only)" },
  ];
  if (r.hours.length) {
    const stages = r.stages.slice(0, 5);
    const other = r.stages.slice(5);
    const cols = [...stages, ...(other.length ? ["Other stages"] : [])];
    const w = Math.max(50, Math.floor(360 / (cols.length + 1)));
    blocks.push({
      type: "table",
      columns: [{ header: "Person", width: 140 }, ...cols.map((c) => ({ header: c, width: w, align: "right" as const })), { header: "Total", width: w, align: "right" as const }],
      rows: r.hours.map((h) => [h.name, ...stages.map((s) => (h.byStage[s] ? formatMinutes(h.byStage[s]!) : "-")), ...(other.length ? [formatMinutes(other.reduce((a, s) => a + (h.byStage[s] ?? 0), 0))] : []), formatMinutes(h.minutes)]),
      totals: ["Total", ...stages.map((s) => formatMinutes(r.stageTotals[s] ?? 0)), ...(other.length ? [formatMinutes(other.reduce((a, s) => a + (r.stageTotals[s] ?? 0), 0))] : []), formatMinutes(r.totalMinutes)],
    });
  } else blocks.push({ type: "text", text: "No work logged against this engagement." });
  blocks.push({ type: "heading", text: `Acknowledgments (${r.acknowledgments.length})` });
  if (r.acknowledgments.length) blocks.push({ type: "table", columns: [{ header: "Task", width: 220 }, { header: "Type", width: 60 }, { header: "Number", width: 150 }, { header: "Date", width: 70 }], rows: r.acknowledgments.map((a) => [a.task, a.type, a.number, formatDate(a.date)]) });
  else blocks.push({ type: "text", text: "None recorded." });
  blocks.push({ type: "heading", text: `UDINs (${r.udins.length})` });
  if (r.udins.length) blocks.push({ type: "table", columns: [{ header: "Document", width: 170 }, { header: "UDIN", width: 140 }, { header: "Signed", width: 70 }, { header: "Partner", width: 120 }], rows: r.udins.map((u) => [u.documentType, u.udin ?? `(${u.status.toLowerCase()})`, formatDate(u.signingDate), u.partner]) });
  else blocks.push({ type: "text", text: "None." });
  blocks.push({ type: "heading", text: "Review points" });
  blocks.push({ type: "kv", columns: 2, rows: [["Raised", String(r.reviewPoints.raised)], ["Cleared", String(r.reviewPoints.cleared)], ["Still open", String(r.reviewPoints.open)]] });
  if (r.canSeeBilling && r.billing) {
    blocks.push({ type: "heading", text: "Billing status" });
    blocks.push({ type: "kv", columns: 2, rows: [["Status", r.billing.label], ["Billed", rs(r.billing.billedPaise)], ["Received", rs(r.billing.receivedPaise)], ["Written off", rs(r.billing.writtenOffPaise)], ["Outstanding", rs(r.billing.outstandingPaise)], ["Last invoice", formatDate(r.billing.lastInvoiceDate) || "-"]] });
  }
  const body = await buildPdf({
    title: "Engagement completion report",
    subtitle: `${r.engagement.client.name} · ${r.engagement.name}`,
    header: profile ? [profile.name, profile.address].filter(Boolean) : undefined,
    blocks,
    footer: "Internal document. Hours are an effort record, not a performance measure.",
  });
  return { body, fileName: `completion-${r.engagement.code}.pdf` };
}
