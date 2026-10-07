import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { db, transaction } from "../../lib/db";
import { DomainError, forbidden } from "../../lib/errors";
import type { Actor, StaffActor } from "../../permissions/actor";
import { authorize, isReadOnlyScope, requireStaff } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { formatDateTime, isIsoDate, toIstDate } from "../../lib/dates";
import { readStoredFile, storeFile } from "../../lib/storage";
import { closedEngagementsIn } from "./inspections";
import { tagList } from "../dms/service";
import { tokenize } from "../dms/text";

/**
 * Peer-review pack (spec 13.2): the engagements of a period with their UDINs, reports (documents
 * tagged report / signed), review evidence (review requests, points, sign-offs), independence and QC
 * status. Exported as an Excel workbook, and as a zip of that workbook plus the listed documents.
 * Firm-wide, so Partner only.
 */
function requirePartnerQc(actor: Actor): asserts actor is StaffActor {
  requireStaff(actor);
  const scope = authorize(actor, "qc.manage");
  if (isReadOnlyScope(scope)) throw forbidden("The peer-review pack is firm-wide; only a Partner prepares it.");
}

const REPORT_TAGS = ["report", "signed"];
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const istEnd = (d: string) => new Date(`${d}T23:59:59.999+05:30`);

export type PeerReviewPeriod = { periodFrom: string; periodTo: string };

function checkPeriod(p: PeerReviewPeriod) {
  if (!isIsoDate(p.periodFrom) || !isIsoDate(p.periodTo)) throw new DomainError("VALIDATION", "Dates must be YYYY-MM-DD.");
  if (p.periodFrom > p.periodTo) throw new DomainError("VALIDATION", "From is after To.");
}

export async function peerReviewPackData(actor: Actor, p: PeerReviewPeriod) {
  requirePartnerQc(actor);
  checkPeriod(p);
  const [udins, signoffs, closed] = await Promise.all([
    db().uDINRecord.findMany({ where: { engagementId: { not: null }, signingDate: { gte: p.periodFrom, lte: p.periodTo } }, select: { engagementId: true } }),
    db().signOff.findMany({ where: { engagementId: { not: null }, level: "PARTNER", signedAt: { gte: istStart(p.periodFrom), lte: istEnd(p.periodTo) } }, select: { engagementId: true } }),
    closedEngagementsIn(p.periodFrom, p.periodTo),
  ]);
  const ids = [...new Set([...udins.map((u) => u.engagementId!), ...signoffs.map((s) => s.engagementId!), ...closed.map((c) => c.id)])];
  const engagements = await db().engagement.findMany({ where: { id: { in: ids } }, include: { client: { select: { code: true, name: true, partnerId: true } } }, orderBy: { code: "asc" } });
  const tasks = await db().task.findMany({ where: { engagementId: { in: ids } }, select: { id: true, engagementId: true, title: true } });
  const taskIds = tasks.map((t) => t.id);
  const [allUdins, docs, reviews, points, allSignoffs, decls, checklists, assignments] = await Promise.all([
    db().uDINRecord.findMany({ where: { engagementId: { in: ids } }, orderBy: { signingDate: "asc" } }),
    db().document.findMany({ where: { engagementId: { in: ids }, archivedAt: null, employeeUserId: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }),
    db().reviewRequest.findMany({ where: { taskId: { in: taskIds } } }),
    db().reviewPoint.findMany({ where: { taskId: { in: taskIds } } }),
    db().signOff.findMany({ where: { OR: [{ engagementId: { in: ids } }, { taskId: { in: taskIds } }] }, orderBy: { signedAt: "asc" } }),
    db().independenceDeclaration.findMany({ where: { engagementId: { in: ids } } }),
    db().qCChecklist.findMany({ where: { engagementId: { in: ids } } }),
    db().engagementAssignment.findMany({ where: { engagementId: { in: ids }, toDate: null } }),
  ]);
  const userIds = [...new Set([...engagements.map((e) => e.partnerId ?? e.client.partnerId), ...allUdins.map((u) => u.partnerId), ...allSignoffs.map((s) => s.signedById), ...reviews.flatMap((r) => [r.makerId, r.checkerId])].filter((x): x is string => !!x))];
  const names = new Map((await db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const taskEng = new Map(tasks.map((t) => [t.id, t.engagementId]));
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));

  return engagements.map((e) => {
    const eTasks = new Set(tasks.filter((t) => t.engagementId === e.id).map((t) => t.id));
    const eReviews = reviews.filter((r) => eTasks.has(r.taskId));
    const ePoints = points.filter((x) => eTasks.has(x.taskId));
    const eSign = allSignoffs.filter((s) => s.engagementId === e.id || (s.taskId && taskEng.get(s.taskId) === e.id));
    const reports = docs.filter((d) => d.engagementId === e.id && tagList(d.tagsCsv).some((t) => REPORT_TAGS.includes(t)));
    const team = new Set([e.partnerId, e.managerId, ...assignments.filter((a) => a.engagementId === e.id && a.role !== "EQR").map((a) => a.userId)].filter(Boolean));
    const qc = checklists.find((c) => c.engagementId === e.id);
    return {
      engagementId: e.id, code: e.code, name: e.name, serviceLine: e.serviceLine, status: e.status,
      clientCode: e.client.code, clientName: e.client.name, partner: names.get(e.partnerId ?? e.client.partnerId ?? "") ?? "",
      udins: allUdins.filter((u) => u.engagementId === e.id).map((u) => ({ udin: u.udin ?? "", status: u.status, documentType: u.documentType, signingDate: u.signingDate, generatedOn: u.generatedOn ?? "", partner: names.get(u.partnerId) ?? "" })),
      reports: reports.map((d) => ({ id: d.id, name: d.name, tags: tagList(d.tagsCsv).join(", "), version: d.currentVersion, storagePath: d.versions[0]?.storagePath ?? null, originalName: d.versions[0]?.originalName ?? d.name, sizeBytes: d.versions[0]?.sizeBytes ?? 0 })),
      reviews: {
        requests: eReviews.length,
        approved: eReviews.filter((r) => r.status === "APPROVED").length,
        returned: eReviews.filter((r) => r.status === "RETURNED").length,
        pointsRaised: ePoints.length,
        pointsCleared: ePoints.filter((x) => x.status === "CLEARED").length,
        detail: eReviews.map((r) => ({ task: taskTitle.get(r.taskId) ?? "", level: r.level, maker: names.get(r.makerId) ?? "", checker: r.checkerId ? (names.get(r.checkerId) ?? "") : "", status: r.status, submitted: formatDateTime(r.submittedAt), decided: r.decidedAt ? formatDateTime(r.decidedAt) : "" })),
      },
      signoffs: eSign.map((s) => ({ level: s.level, by: names.get(s.signedById) ?? "", on: toIstDate(s.signedAt), task: s.taskId ? (taskTitle.get(s.taskId) ?? "") : "" })),
      independence: { declared: decls.filter((d) => d.engagementId === e.id && team.has(d.userId)).length, team: team.size, conflicts: decls.filter((d) => d.engagementId === e.id && d.hasConflict).length },
      qcChecklist: qc ? qc.status : "NOT STARTED",
    };
  });
}

export type PackRow = Awaited<ReturnType<typeof peerReviewPackData>>[number];

function sheet(wb: ExcelJS.Workbook, name: string, cols: { key: string; header: string; width?: number }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function peerReviewWorkbook(rows: PackRow[], p: PeerReviewPeriod): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QEPEX Work Tracker";
  const info = wb.addWorksheet("About");
  info.getColumn(1).width = 100;
  [`Peer-review pack for ${p.periodFrom} to ${p.periodTo}`, `Prepared ${formatDateTime(new Date())}`, `${rows.length} engagement(s): those with a UDIN or Partner sign-off in the period, or closed in it.`, "Reports are documents tagged 'report' or 'signed'. Review evidence comes from the review and sign-off records."].forEach((l, i) => (info.getCell(i + 1, 1).value = l));
  sheet(wb, "Engagements", [
    { key: "client", header: "Client", width: 32 }, { key: "code", header: "Engagement" }, { key: "name", header: "Name", width: 36 }, { key: "serviceLine", header: "Service line" },
    { key: "partner", header: "Partner", width: 20 }, { key: "udins", header: "UDINs", width: 30 }, { key: "reports", header: "Reports" }, { key: "reviews", header: "Reviews (approved/returned)" },
    { key: "points", header: "Review points (cleared/raised)" }, { key: "signoffs", header: "Sign-offs", width: 30 }, { key: "independence", header: "Independence (declared/team)" }, { key: "qc", header: "QC checklist" },
  ], rows.map((r) => ({
    client: `${r.clientCode} ${r.clientName}`, code: r.code, name: r.name, serviceLine: r.serviceLine, partner: r.partner,
    udins: r.udins.map((u) => u.udin || `(${u.status.toLowerCase()})`).join(", "), reports: r.reports.length,
    reviews: `${r.reviews.requests} (${r.reviews.approved}/${r.reviews.returned})`, points: `${r.reviews.pointsCleared}/${r.reviews.pointsRaised}`,
    signoffs: r.signoffs.map((s) => `${s.level} ${s.by} ${s.on}`).join("; "), independence: `${r.independence.declared}/${r.independence.team}${r.independence.conflicts ? ` (${r.independence.conflicts} conflict)` : ""}`, qc: r.qcChecklist,
  })));
  sheet(wb, "UDINs", [{ key: "code", header: "Engagement" }, { key: "client", header: "Client", width: 30 }, { key: "documentType", header: "Document", width: 30 }, { key: "signingDate", header: "Signed" }, { key: "udin", header: "UDIN", width: 22 }, { key: "generatedOn", header: "Generated" }, { key: "status", header: "Status" }, { key: "partner", header: "Partner", width: 20 }],
    rows.flatMap((r) => r.udins.map((u) => ({ code: r.code, client: r.clientName, ...u }))));
  sheet(wb, "Reports", [{ key: "code", header: "Engagement" }, { key: "client", header: "Client", width: 30 }, { key: "name", header: "Document", width: 40 }, { key: "tags", header: "Tags", width: 24 }, { key: "version", header: "Version" }, { key: "file", header: "File in zip", width: 50 }],
    rows.flatMap((r) => r.reports.map((d) => ({ code: r.code, client: r.clientName, name: d.name, tags: d.tags, version: d.version, file: zipName(r.code, d.name, d.originalName, d.id) }))));
  sheet(wb, "Review evidence", [{ key: "code", header: "Engagement" }, { key: "task", header: "Task", width: 36 }, { key: "level", header: "Level" }, { key: "maker", header: "Maker", width: 20 }, { key: "checker", header: "Checker", width: 20 }, { key: "status", header: "Status" }, { key: "submitted", header: "Submitted", width: 20 }, { key: "decided", header: "Decided", width: 20 }],
    rows.flatMap((r) => r.reviews.detail.map((d) => ({ code: r.code, ...d }))));
  sheet(wb, "Sign-offs", [{ key: "code", header: "Engagement" }, { key: "task", header: "Task", width: 36 }, { key: "level", header: "Level" }, { key: "by", header: "Signed by", width: 20 }, { key: "on", header: "On" }],
    rows.flatMap((r) => r.signoffs.map((s) => ({ code: r.code, ...s }))));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function zipName(code: string, name: string, originalName: string, id: string) {
  const ext = originalName.includes(".") ? originalName.slice(originalName.lastIndexOf(".")) : "";
  const base = (name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, name.length - ext.length) : name).replace(/[^\w .()-]/g, "_").slice(0, 80);
  return `${code}/${base}-${id.slice(-6)}${ext}`;
}

/** Excel only (download route). Audited as an export. */
export async function exportPeerReviewWorkbook(actor: Actor, p: PeerReviewPeriod) {
  const rows = await peerReviewPackData(actor, p);
  const body = await peerReviewWorkbook(rows, p);
  await transaction((tx) => writeAudit(tx, actor, { entityType: "PeerReviewPack", entityId: `${p.periodFrom}_${p.periodTo}`, action: "EXPORT", after: { ...p, engagements: rows.length } }));
  return { body, fileName: `peer-review-${p.periodFrom}-to-${p.periodTo}.xlsx` };
}

/**
 * Build the zip (workbook + every listed report), store it as a firm-level document and record the
 * PeerReviewPack. Returns the pack row; the zip downloads from /api/dms/<documentId>.
 */
export async function buildPeerReviewPack(actor: Actor, p: PeerReviewPeriod) {
  requirePartnerQc(actor);
  const rows = await peerReviewPackData(actor, p);
  const zip = new AdmZip();
  zip.addFile("peer-review-pack.xlsx", await peerReviewWorkbook(rows, p));
  let files = 0;
  const missing: string[] = [];
  for (const r of rows) {
    for (const d of r.reports) {
      if (!d.storagePath) continue;
      try {
        zip.addFile(zipName(r.code, d.name, d.originalName, d.id), await readStoredFile(d.storagePath));
        files += 1;
      } catch {
        missing.push(`${r.code}: ${d.name}`);
      }
    }
  }
  if (missing.length) zip.addFile("MISSING-FILES.txt", Buffer.from(`These files could not be read from storage:\n${missing.join("\n")}\n`));
  const buffer = zip.toBuffer();
  const name = `Peer-review pack ${p.periodFrom} to ${p.periodTo}.zip`;
  const stored = await storeFile(["_firm", "peer-review"], name, buffer, 1024 * 1024 * 1024);
  return transaction(async (tx) => {
    let folder = await tx.folder.findFirst({ where: { kind: "SYSTEM", clientId: null, path: "_firm/peer-review" } });
    if (!folder) folder = await tx.folder.create({ data: { kind: "SYSTEM", name: "Peer-review packs", path: "_firm/peer-review", createdById: actor.userId } });
    const doc = await tx.document.create({
      data: {
        folderId: folder.id, name, kind: "PEER_REVIEW_PACK", sourceType: "GENERATED", confidentiality: "NORMAL", tagsCsv: "peer review", createdById: actor.userId,
        versions: { create: { version: 1, storagePath: stored.storagePath, originalName: name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: actor.userId } },
      },
    });
    await tx.documentSearchToken.createMany({ data: tokenize(`${name} peer review pack`).map((token) => ({ documentId: doc.id, token })) });
    const pack = await tx.peerReviewPack.create({ data: { periodFrom: p.periodFrom, periodTo: p.periodTo, documentId: doc.id, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "PeerReviewPack", entityId: pack.id, action: "CREATE", after: { ...p, engagements: rows.length, files, missing: missing.length, documentId: doc.id } });
    return { ...pack, engagements: rows.length, files, missing };
  });
}

export async function listPeerReviewPacks(actor: Actor) {
  requirePartnerQc(actor);
  const packs = await db().peerReviewPack.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const names = new Map((await db().user.findMany({ where: { id: { in: packs.map((x) => x.createdById).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return packs.map((x) => ({ ...x, by: x.createdById ? (names.get(x.createdById) ?? "") : "" }));
}
