import ExcelJS from "exceljs";
import { db, transaction } from "../../lib/db";
import { DomainError } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { systemActor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { addDays, formatDate, formatDateTime, parseIso, todayIst } from "../../lib/dates";
import { storeFile } from "../../lib/storage";
import { buildPdf, rs, type PdfBlock } from "../../documents/pdf";
import { tokenize } from "../dms/text";
import { notifyUsers } from "../notifications/service";
import { getFirmProfile } from "../billing/firm";
import { assertFirmAnalytics, monthName } from "./common";
import { firmDashboard } from "./firm";
import { complianceDashboard } from "./compliance";
import { profitabilityDashboard } from "./profitability";
import { engagementPortfolio } from "./engagements";
import { crmDashboard } from "./crm";
import { peopleDashboard } from "./people";

/**
 * Monthly Partner MIS (P5-07): a PDF and an Excel workbook for a calendar month, built on the 5th for the month
 * before by the MONTHLY_MIS job (or on demand by a Partner), stored as firm-level documents in `_firm/mis`
 * (Partner only, like peer-review packs) and announced in-app to the Partners. Flow figures (filings due, fees
 * billed, hours, leads) cover the month; balances (receivable, unbilled work, overdue now) are as on the build
 * date, which the cover states. Rebuilding a month adds a new version to the same two documents.
 */
const FOLDER = "_firm/mis";
const KIND = "PARTNER_MIS";

export function previousMonth(today: string) {
  const { y, m } = parseIso(today);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const to = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  return { from: `${ym}-01`, to };
};
const longMonth = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const pctS = (p: number | null) => (p === null ? "-" : `${p}%`);
const hrsS = (h: number) => `${h.toLocaleString("en-IN", { maximumFractionDigits: 1 })} hrs`;

export async function misData(actor: Actor, month: string, asOf = todayIst()) {
  assertFirmAnalytics(actor);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DomainError("VALIDATION", "Month must be YYYY-MM.");
  const r = monthRange(month);
  if (r.from > asOf) throw new DomainError("VALIDATION", "That month has not started yet.");
  const period = `custom:${r.from}:${r.to}`;
  const opts = { period, today: asOf };
  const [firm, compliance, profit, portfolio, crm, people] = await Promise.all([
    firmDashboard(actor, opts),
    complianceDashboard(actor, opts),
    profitabilityDashboard(actor, opts),
    engagementPortfolio(actor),
    crmDashboard(actor, opts),
    peopleDashboard(actor, opts),
  ]);
  return { month, label: longMonth(month), from: r.from, to: r.to, asOf, firm, compliance, profit, portfolio, crm, people };
}
export type MisData = Awaited<ReturnType<typeof misData>>;

/** The headline rows shared by the PDF summary and the Excel "Summary" sheet. */
function summaryRows(d: MisData): [string, string, string][] {
  const c = d.compliance.headline, f = d.firm, p = d.profit.headline, cr = d.crm.headline, pe = d.people.headline;
  return [
    ["Compliance", "Filings due in the month", String(c.due)],
    ["Compliance", "Filed on time", `${pctS(c.onTimePct)} (${c.filedOnTime} on time, ${c.filedLate} late)`],
    ["Compliance", "Overdue on build date", String(c.overdueNow)],
    ["Compliance", "Late-fee exposure (estimate)", rs(c.exposurePaise)],
    ["Effort", "Hours logged", hrsS(f.effort.hours)],
    ["Effort", "Chargeable share", pctS(f.effort.chargeableShare)],
    ["Billing", "Invoiced", `${rs(f.billing.invoicedPaise)} (${f.billing.invoiceCount} invoice${f.billing.invoiceCount === 1 ? "" : "s"})`],
    ["Billing", "Collected", rs(f.billing.collectedPaise)],
    ["Billing", "Receivable on build date", rs(f.billing.receivablePaise)],
    ["Billing", "Over 90 days", rs(f.billing.over90Paise)],
    ["Profitability", "Fees billed (taxable)", rs(p.billedPaise)],
    ["Profitability", "Cost of hours", rs(p.costPaise)],
    ["Profitability", "Realization", pctS(p.realizationPct)],
    ["Profitability", "Unbilled work at cost", rs(p.wipCostPaise)],
    ["Profitability", "DSO (days)", p.dsoDays === null ? "-" : String(p.dsoDays)],
    ["Engagements", "Over budget / approaching", `${d.portfolio.summary.over} / ${d.portfolio.summary.atRisk} of ${d.portfolio.summary.active}`],
    ["Clients", "Active / new in month", `${f.clients.active} / ${f.clients.newInPeriod}`],
    ["CRM", "Leads created / won / lost", `${cr.leadsCreated} / ${cr.won} / ${cr.lost}`],
    ["CRM", "Proposal pipeline", `${rs(cr.pipelinePaise)} (${cr.proposalsSent} sent)`],
    ["CRM", "Client feedback", cr.avgRating === null ? "No responses" : `${cr.avgRating} / 5 from ${cr.feedbackReceived}`],
    ["People", "Headcount / joined / left", `${pe.headcount} / ${pe.joiners} / ${pe.leavers}`],
    ["People", "Attrition (12 months)", pctS(pe.attritionPct)],
  ];
}

export async function misPdf(d: MisData): Promise<Buffer> {
  const firm = await getFirmProfile();
  const s = summaryRows(d);
  const blocks: PdfBlock[] = [
    { type: "text", text: `Flow figures cover ${formatDate(d.from)} to ${formatDate(d.to)}. Balances are as on ${formatDate(d.asOf)}. Hours are effort logged, not a target.`, size: 8.5 },
    { type: "heading", text: "Summary" },
    { type: "table", columns: [{ header: "Area", width: 90 }, { header: "Measure", width: 200 }, { header: "Value", width: 209, align: "right" }], rows: s },
    { type: "heading", text: "Compliance by type" },
    { type: "table", columns: [{ header: "Type", width: 200 }, { header: "Due", width: 60, align: "right" }, { header: "On time", width: 70, align: "right" }, { header: "Late", width: 55, align: "right" }, { header: "Overdue", width: 55, align: "right" }, { header: "On time %", width: 59, align: "right" }],
      rows: d.compliance.byType.slice(0, 13).map((t) => [t.name, String(t.due), String(t.onTime), String(t.late), String(t.overdue), pctS(t.onTimePct)]) },
    { type: "heading", text: "Largest late-fee exposures (estimate, on build date)" },
    d.compliance.topExposures.length
      ? { type: "table", columns: [{ header: "Client", width: 160 }, { header: "Filing", width: 190 }, { header: "Days late", width: 60, align: "right" }, { header: "Exposure", width: 89, align: "right" }],
        rows: d.compliance.topExposures.slice(0, 10).map((e) => [e.client, e.title, String(e.daysLate), e.needsTaxDue ? "Tax due not entered" : e.hasRate ? rs(e.totalPaise) : "No rate"]) }
      : { type: "text", text: "Nothing overdue." },
    { type: "heading", text: "Realization by service line" },
    { type: "table", columns: [{ header: "Service line", width: 200 }, { header: "Billed", width: 110, align: "right" }, { header: "Cost", width: 110, align: "right" }, { header: "Realization", width: 79, align: "right" }],
      rows: d.profit.realizationByLine.map((l) => [l.label, rs(l.billedPaise), rs(l.costPaise), pctS(l.realizationPct)]) },
    { type: "heading", text: "Receivables and unbilled work by age (on build date)" },
    { type: "table", columns: [{ header: "Age", width: 140 }, { header: "Receivable", width: 130, align: "right" }, { header: "Unbilled at cost", width: 130, align: "right" }, { header: "Unbilled hours", width: 99, align: "right" }],
      rows: d.profit.cash.ageing.map((a, i) => [a.label, rs(a.amountPaise), rs(d.profit.wip.buckets[i]!.costPaise), hrsS(d.profit.wip.buckets[i]!.hours)]) },
    { type: "heading", text: "Client concentration (fees billed, last 12 months)" },
    { type: "kv", columns: 2, rows: [["Largest client", pctS(d.profit.concentration.top1Pct)], ["Top 5", pctS(d.profit.concentration.top5Pct)], ["Top 10", pctS(d.profit.concentration.top10Pct)], ["Clients billed", String(d.profit.concentration.clients)]] },
    { type: "table", columns: [{ header: "Client", width: 280 }, { header: "Fees", width: 120, align: "right" }, { header: "Share", width: 99, align: "right" }],
      rows: d.profit.concentration.top.slice(0, 5).map((c) => [c.name, rs(c.paise), pctS(c.sharePct)]) },
    { type: "heading", text: "Engagements most over budget" },
    { type: "table", columns: [{ header: "Engagement", width: 230 }, { header: "Client", width: 150 }, { header: "Used", width: 60, align: "right" }, { header: "Logged", width: 59, align: "right" }],
      rows: d.portfolio.rows.filter((r) => r.health === "Over").slice(0, 10).map((r) => [`${r.code} ${r.name}`, r.client, pctS(r.percent), hrsS(r.usedHours)]) },
    { type: "heading", text: "Growth and people" },
    { type: "kv", columns: 2, rows: [
      ["Conversion", pctS(d.crm.headline.conversionPct)], ["Proposals accepted", pctS(d.crm.headline.acceptancePct)],
      ["Follow-ups overdue", String(d.crm.headline.followUpsOverdue)], ["Renewals due (window)", String(d.crm.renewals.due)],
      ["Open positions", String(d.people.headline.openPositions)], ["Serving notice", String(d.people.headline.onNotice)],
      ["CPE shortfall", `${d.people.headline.cpeShortfall} of ${d.people.headline.cpeMembers}`], ["Articles completing soon", String(d.people.headline.articlesCompletingSoon)],
    ] },
  ];
  return buildPdf({
    title: `Partner MIS: ${d.label}`,
    header: [firm.name || "QEPEX", firm.address.replace(/\s*\n\s*/g, ", ")].filter(Boolean),
    subtitle: `Built ${formatDateTime(new Date())}`,
    blocks,
    footer: "Confidential: Partners only",
  });
}

function sheet(wb: ExcelJS.Workbook, name: string, cols: { key: string; header: string; width?: number; money?: boolean }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4), style: c.money ? { numFmt: "#,##,##0.00" } : undefined }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
/** Money in the workbook is rupees as numbers (paise ÷ 100), so it sums in Excel. */
const rupees = (paise: number) => Math.round(paise) / 100;

export async function misWorkbook(d: MisData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QEPEX Work Tracker";
  sheet(wb, "Summary", [{ key: "area", header: "Area", width: 16 }, { key: "measure", header: "Measure", width: 34 }, { key: "value", header: "Value", width: 40 }],
    [{ area: `Partner MIS ${d.label}`, measure: `Flows ${d.from} to ${d.to}; balances as on ${d.asOf}`, value: "Confidential: Partners only" }, ...summaryRows(d).map(([area, measure, value]) => ({ area, measure, value }))]);
  sheet(wb, "Compliance by type", [{ key: "name", header: "Type", width: 30 }, { key: "due", header: "Due" }, { key: "onTime", header: "On time" }, { key: "late", header: "Late" }, { key: "overdue", header: "Overdue" }, { key: "onTimePct", header: "On time %" }], d.compliance.byType);
  sheet(wb, "Late-fee exposure", [{ key: "client", header: "Client", width: 32 }, { key: "title", header: "Filing", width: 40 }, { key: "daysLate", header: "Days late" }, { key: "fee", header: "Fee (Rs)", money: true }, { key: "interest", header: "Interest (Rs)", money: true }, { key: "note", header: "Note", width: 22 }],
    d.compliance.topExposures.map((e) => ({ client: e.client, title: e.title, daysLate: e.daysLate, fee: rupees(e.feePaise), interest: rupees(e.interestPaise), note: e.needsTaxDue ? "Tax due not entered" : e.hasRate ? "" : "No rate" })));
  sheet(wb, "Monthly trend", [{ key: "label", header: "Month" }, { key: "invoiced", header: "Invoiced (Rs)", money: true }, { key: "collected", header: "Collected (Rs)", money: true }, { key: "onTimePct", header: "Filed on time %" }],
    d.firm.trend.map((t) => ({ label: t.label, invoiced: rupees(t.invoicedPaise), collected: rupees(t.collectedPaise), onTimePct: t.onTimePct })));
  sheet(wb, "Realization", [{ key: "label", header: "Service line", width: 28 }, { key: "billed", header: "Billed (Rs)", money: true }, { key: "cost", header: "Cost (Rs)", money: true }, { key: "pct", header: "Realization %" }],
    d.profit.realizationByLine.map((l) => ({ label: l.label, billed: rupees(l.billedPaise), cost: rupees(l.costPaise), pct: l.realizationPct })));
  sheet(wb, "Lowest realization", [{ key: "code", header: "Engagement" }, { key: "name", header: "Name", width: 34 }, { key: "client", header: "Client", width: 30 }, { key: "billed", header: "Billed (Rs)", money: true }, { key: "cost", header: "Cost (Rs)", money: true }, { key: "pct", header: "Realization %" }],
    d.profit.lowestRealization.map((r) => ({ code: r.code, name: r.name, client: r.client, billed: rupees(r.billedPaise), cost: rupees(r.costPaise), pct: r.realizationPct })));
  sheet(wb, "Unbilled work", [{ key: "code", header: "Engagement" }, { key: "name", header: "Name", width: 34 }, { key: "client", header: "Client", width: 30 }, { key: "hours", header: "Hours" }, { key: "cost", header: "At cost (Rs)", money: true }, { key: "value", header: "Billable value (Rs)", money: true }, { key: "last", header: "Last invoice" }, { key: "age", header: "Oldest work (days)" }],
    d.profit.wip.top.map((r) => ({ code: r.code, name: r.name, client: r.client, hours: r.hours, cost: rupees(r.costPaise), value: rupees(r.valuePaise), last: r.lastInvoice ?? "Never", age: r.ageDays })));
  sheet(wb, "Receivables ageing", [{ key: "label", header: "Age" }, { key: "amount", header: "Receivable (Rs)", money: true }], d.profit.cash.ageing.map((a) => ({ label: a.label, amount: rupees(a.amountPaise) })));
  sheet(wb, "Concentration", [{ key: "name", header: "Client", width: 34 }, { key: "fees", header: "Fees, 12 months (Rs)", money: true }, { key: "share", header: "Share %" }, { key: "cumulative", header: "Cumulative %" }],
    d.profit.concentration.top.map((c) => ({ name: c.name, fees: rupees(c.paise), share: c.sharePct, cumulative: c.cumulativePct })));
  sheet(wb, "Engagement budgets", [{ key: "code", header: "Engagement" }, { key: "name", header: "Name", width: 34 }, { key: "client", header: "Client", width: 30 }, { key: "budget", header: "Budget hrs" }, { key: "used", header: "Logged hrs" }, { key: "pct", header: "Used %" }, { key: "signal", header: "Status", width: 20 }],
    d.portfolio.rows.map((r) => ({ code: r.code, name: r.name, client: r.client, budget: r.budgetHours, used: r.usedHours, pct: r.percent, signal: r.signal })));
  sheet(wb, "CRM", [{ key: "measure", header: "Measure", width: 34 }, { key: "value", header: "Value", width: 20 }], [
    ...d.crm.funnel.map((f) => ({ measure: `Leads created in month now ${f.stage.toLowerCase().replace("_", " ")}`, value: f.count })),
    { measure: "Conversion %", value: d.crm.headline.conversionPct }, { measure: "Proposal pipeline (Rs)", value: rupees(d.crm.headline.pipelinePaise) },
    { measure: "Proposals accepted %", value: d.crm.headline.acceptancePct }, { measure: "Average feedback rating", value: d.crm.headline.avgRating },
  ]);
  sheet(wb, "People", [{ key: "measure", header: "Measure", width: 34 }, { key: "value", header: "Value", width: 20 }], [
    ...Object.entries(d.people.headline).map(([measure, value]) => ({ measure, value })),
    ...d.people.byDesignation.map((r) => ({ measure: `Headcount: ${r.name}`, value: r.count })),
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Store (or add a version to) the month's PDF and workbook; tag "mis YYYY-MM" finds them again. */
async function storeMisDoc(actor: Actor, month: string, ext: "pdf" | "xlsx", body: Buffer) {
  const name = `Partner MIS ${monthName(month).replace(" ", " 20")}.${ext}`;
  const stored = await storeFile(["_firm", "mis"], name, body, 50 * 1024 * 1024);
  const by = actor.kind === "PORTAL" ? null : actor.userId;
  return transaction(async (tx) => {
    let folder = await tx.folder.findFirst({ where: { kind: "SYSTEM", clientId: null, path: FOLDER } });
    if (!folder) folder = await tx.folder.create({ data: { kind: "SYSTEM", name: "Partner MIS", path: FOLDER, createdById: by } });
    const existing = await tx.document.findFirst({ where: { folderId: folder.id, kind: KIND, name, archivedAt: null } });
    const version = { storagePath: stored.storagePath, originalName: name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, createdById: by };
    if (existing) {
      const doc = await tx.document.update({ where: { id: existing.id }, data: { currentVersion: existing.currentVersion + 1, updatedById: by, versions: { create: { version: existing.currentVersion + 1, ...version } } } });
      await writeAudit(tx, actor, { entityType: "PartnerMis", entityId: doc.id, action: "UPDATE", after: { month, file: ext, version: doc.currentVersion } });
      return doc;
    }
    {
      const doc = await tx.document.create({ data: { folderId: folder.id, name, kind: KIND, sourceType: "GENERATED", confidentiality: "NORMAL", tagsCsv: `mis ${month}`, createdById: by, versions: { create: { version: 1, ...version } } } });
      await tx.documentSearchToken.createMany({ data: tokenize(`${name} partner mis ${month}`).map((token) => ({ documentId: doc.id, token })) });
      await writeAudit(tx, actor, { entityType: "PartnerMis", entityId: doc.id, action: "CREATE", after: { month, file: ext, version: doc.currentVersion } });
      return doc;
    }
  });
}

export async function buildMis(actor: Actor, month: string, asOf = todayIst()) {
  const d = await misData(actor, month, asOf);
  const [pdf, xlsx] = await Promise.all([misPdf(d), misWorkbook(d)]);
  const pdfDoc = await storeMisDoc(actor, month, "pdf", pdf);
  const xlsxDoc = await storeMisDoc(actor, month, "xlsx", xlsx);
  const partners = await db().user.findMany({ where: { role: "PARTNER", active: true, isSystem: false }, select: { id: true } });
  await notifyUsers(partners.map((p) => p.id), {
    kind: "MIS_READY",
    title: `Partner MIS for ${d.label} is ready`,
    body: `PDF and Excel built ${formatDate(asOf)}. Filed on time ${pctS(d.compliance.headline.onTimePct)}, invoiced ${rs(d.firm.billing.invoicedPaise)}, receivable ${rs(d.firm.billing.receivablePaise)}.`,
    link: "/analytics/mis",
    entityType: "Document",
    entityId: pdfDoc.id,
    dedupeKey: `MIS|${month}|v${pdfDoc.currentVersion}`,
  });
  return { month, label: d.label, pdfDocumentId: pdfDoc.id, xlsxDocumentId: xlsxDoc.id, version: pdfDoc.currentVersion };
}

/** MONTHLY_MIS job: on the 5th (or the first run after a missed one) build last month's MIS once. */
export async function runMonthlyMis(today = todayIst()) {
  const month = previousMonth(today);
  const folder = await db().folder.findFirst({ where: { kind: "SYSTEM", clientId: null, path: FOLDER } });
  const done = folder ? await db().document.count({ where: { folderId: folder.id, kind: KIND, tagsCsv: `mis ${month}`, archivedAt: null } }) : 0;
  if (done >= 2) return { month, built: false, reason: "already built" };
  const r = await buildMis(systemActor(), month, today);
  return { month, built: true, version: r.version };
}

export async function listMis(actor: Actor) {
  assertFirmAnalytics(actor);
  const folder = await db().folder.findFirst({ where: { kind: "SYSTEM", clientId: null, path: FOLDER } });
  if (!folder) return [];
  const docs = await db().document.findMany({ where: { folderId: folder.id, kind: KIND, archivedAt: null }, select: { id: true, name: true, tagsCsv: true, currentVersion: true, updatedAt: true, createdAt: true }, orderBy: { tagsCsv: "desc" } });
  const byMonth = new Map<string, { month: string; label: string; pdf?: (typeof docs)[number]; xlsx?: (typeof docs)[number] }>();
  for (const doc of docs) {
    const month = doc.tagsCsv.replace(/^mis /, "");
    const r = byMonth.get(month) ?? { month, label: longMonth(month) };
    if (doc.name.endsWith(".pdf")) r.pdf = doc;
    else r.xlsx = doc;
    byMonth.set(month, r);
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}
