/**
 * Phase 3: documents, quality control and template library seed (P3-26, P3-27, P3-28).
 * Reference: default firm templates (DRAFT, "firm draft" marker) and the SQC 1 / SQM checklist template
 * (items as data, marked Unverified in its name).
 * Demo: approved templates, client → engagement → period folders with ~60 documents (small PDFs),
 * versions and a check-out, audit file sections, independence declarations, QC checklists, one file
 * inspection with findings and one peer-review pack. Uses the services so rules and audit trail apply.
 */
import type { PrismaClient } from "../../../generated/prisma/client";
import { db } from "../../../server/lib/db";
import { addDays, todayIst } from "../../../server/lib/dates";
import type { StaffActor } from "../../../server/permissions/actor";
import { buildPdf } from "../../../server/documents/pdf";
import { fieldsIn } from "../../../server/documents/merge";
import { DEFAULT_TEMPLATES, DRAFT_MARKER } from "../../../server/services/doc-templates/defaults";
import { saveDraft, approveVersion, generateFromTemplate } from "../../../server/services/doc-templates/service";
import { uploadDocument, addVersion, checkOut, auditFileCompleteness, updateAuditSection } from "../../../server/services/dms/service";
import { QC_DEFAULT_ITEMS, QC_TEMPLATE_CODE, QC_TEMPLATE_NAME, declareIndependence, engagementTeam, startChecklist, answerChecklistItem, completeChecklist } from "../../../server/services/qc/service";
import { createInspection, addFinding, closeFinding, closedEngagementsIn } from "../../../server/services/qc/inspections";
import { buildPeerReviewPack } from "../../../server/services/qc/peer-review";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export async function seedDmsReference(prisma: PrismaClient) {
  for (const t of DEFAULT_TEMPLATES) {
    if (await prisma.template.findUnique({ where: { code: t.code } })) continue; // never overwrite the firm's edits
    await prisma.template.create({
      data: {
        code: t.code, name: t.name, category: t.category, outputFormat: t.outputFormat, createdById: "system",
        versions: { create: { version: 1, body: t.body, mergeFieldsCsv: fieldsIn(t.body).join(","), status: "DRAFT", createdById: "system" } },
      },
    });
  }
  if (!(await prisma.checklistTemplate.findUnique({ where: { code: QC_TEMPLATE_CODE } }))) {
    await prisma.checklistTemplate.create({
      data: {
        code: QC_TEMPLATE_CODE, name: QC_TEMPLATE_NAME, engagementType: "AUDIT", createdById: "system",
        items: { create: QC_DEFAULT_ITEMS.map((label, i) => ({ label, sortOrder: i, required: true, keywords: "", createdById: "system" })) },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Demo activity
// ---------------------------------------------------------------------------

type U = { id: string; username: string; role: string; isSenior: boolean; displayName: string };
const actorOf = (u: U): StaffActor => ({ kind: "USER", userId: u.id, role: u.role as StaffActor["role"], isSenior: u.isSenior, displayName: u.displayName });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(1326);
const amt = () => `${(Math.floor(rand() * 9000) + 1000).toLocaleString("en-IN")},${String(Math.floor(rand() * 900) + 100)}.00`;

type DocSpec = { name: string; kind: string; confidentiality?: string; tags: string[]; section?: string; lines: string[] };

const SPECS: Record<string, DocSpec[]> = {
  AUDIT: [
    { name: "Draft financial statements", kind: "FINANCIALS", confidentiality: "FINANCIALS", tags: ["draft"], lines: ["Balance sheet and statement of profit and loss (draft for discussion)", "Property, plant and equipment", "Trade receivables", "Inventories", "Trade payables"] },
    { name: "Audit plan and materiality memo", kind: "WORKING_PAPER", tags: ["working paper", "final"], section: "PLANNING", lines: ["Overall audit strategy", "Materiality basis: profit before tax (firm judgement documented)", "Team and timeline"] },
    { name: "Risk assessment summary", kind: "WORKING_PAPER", tags: ["working paper"], section: "RISK", lines: ["Revenue recognition: cut-off testing planned", "Management override of controls", "Inventory valuation"] },
    { name: "Fieldwork: vouching of purchases", kind: "WORKING_PAPER", tags: ["working paper"], section: "FIELDWORK", lines: ["Sample of purchase invoices vouched to GRN and payment", "Exceptions noted and cleared with accounts team"] },
    { name: "Query list to management", kind: "CORRESPONDENCE", tags: ["client copy"], section: "QUERIES", lines: ["Confirmation of balances from major debtors pending", "Fixed asset additions: invoices requested", "Related party list to be confirmed"] },
    { name: "Signed audit report", kind: "REPORT", tags: ["signed", "final", "report"], section: "REPORTS", lines: ["Independent auditor's report on the financial statements", "Opinion, basis for opinion, key matters, responsibilities"] },
  ],
  DIRECT_TAX: [
    { name: "Computation of total income", kind: "WORKING_PAPER", confidentiality: "FINANCIALS", tags: ["final"], lines: ["Income from business or profession", "Income from other sources", "Deductions and tax payable (computed by the tax utility)"] },
    { name: "AIS and 26AS reconciliation", kind: "WORKING_PAPER", tags: ["working paper"], lines: ["Interest income matched", "TDS credits matched to Form 26AS", "Differences explained"] },
    { name: "Return acknowledgement", kind: "REPORT", tags: ["final", "client copy"], lines: ["Acknowledgement of return filed electronically", "Verification status: e-verified"] },
  ],
  GST: [
    { name: "GSTR-3B working", kind: "WORKING_PAPER", tags: ["working paper"], lines: ["Outward supplies from sales register", "Eligible ITC as per books and GSTR-2B", "Net tax payable and challan"] },
    { name: "ITC reconciliation with GSTR-2B", kind: "WORKING_PAPER", tags: ["working paper"], lines: ["Vendor-wise mismatch list", "Follow-up sent to vendors for missing invoices"] },
  ],
  COMPANY_LAW: [
    { name: "Board meeting minutes", kind: "MINUTES", tags: ["signed", "final"], lines: ["Minutes of the meeting of the Board of Directors", "Adoption of accounts, approval of Board report"] },
    { name: "Annual return attachments", kind: "WORKING_PAPER", tags: ["working paper"], lines: ["List of shareholders and directors", "Details of meetings held during the year"] },
  ],
  ACCOUNTING: [
    { name: "Monthly MIS", kind: "REPORT", confidentiality: "FINANCIALS", tags: ["client copy"], lines: ["Revenue and expenses for the month", "Cash and bank position", "Receivables ageing"] },
    { name: "Bank reconciliation statement", kind: "WORKING_PAPER", tags: ["working paper"], lines: ["Balance as per books", "Cheques issued but not presented", "Balance as per bank statement"] },
  ],
  NOTICE: [
    { name: "Notice received", kind: "NOTICE", confidentiality: "NOTICE", tags: ["client copy"], lines: ["Copy of the notice received on the portal", "Response due date tracked in the notices register"] },
    { name: "Draft reply to notice", kind: "NOTICE_REPLY", confidentiality: "NOTICE", tags: ["draft"], lines: ["Background facts", "Submissions with enclosures", "Request to drop proceedings"] },
  ],
  ADVISORY: [
    { name: "Draft advisory report", kind: "REPORT", tags: ["draft", "report"], lines: ["Scope and approach", "Findings", "Recommendations"] },
  ],
};

async function pdfFor(spec: DocSpec, clientName: string, engagementName: string, extra = "") {
  return buildPdf({
    title: spec.name,
    header: [clientName, engagementName],
    subtitle: extra || "Prepared by QEPEX India for internal and client use",
    blocks: [
      ...spec.lines.map((t) => ({ type: "text" as const, text: t })),
      ...(spec.kind === "FINANCIALS" || spec.confidentiality === "FINANCIALS"
        ? [{ type: "table" as const, columns: [{ header: "Particulars", width: 3 }, { header: "Current year", width: 1, align: "right" as const }, { header: "Previous year", width: 1, align: "right" as const }], rows: spec.lines.slice(1).map((l) => [l, amt(), amt()]) }]
        : []),
    ],
    footer: "Demo document",
    watermark: spec.tags.includes("draft") ? "DRAFT" : undefined,
  });
}

export async function seedDmsDemo() {
  const today = todayIst();
  const people = new Map((await db().user.findMany({ where: { isSystem: false }, select: { id: true, username: true, role: true, isSenior: true, displayName: true } })).map((u) => [u.username, u]));
  const P = (username: string) => people.get(username)!;
  if (!people.has("arvind.mehta")) return;
  const arvind = actorOf(P("arvind.mehta"));
  const byId = new Map([...people.values()].map((u) => [u.id, u]));

  // 1. Partner reviews and approves a few default templates (the draft marker line is removed first).
  for (const code of ["ENGAGEMENT_LETTER_AUDIT", "ENGAGEMENT_LETTER_GST", "ENGAGEMENT_LETTER_DIRECT_TAX", "NOTICE_REPLY_INCOME_TAX", "CERTIFICATE_NET_WORTH", "HR_OFFER", "HR_EXPERIENCE", "PROPOSAL", "RENEWAL_LETTER", "BOARD_RESOLUTION_GENERAL"]) {
    const t = await db().template.findUnique({ where: { code }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!t || !t.versions[0] || t.versions[0].status !== "DRAFT") continue;
    const reviewed = t.versions[0].body.replace(`${DRAFT_MARKER}\n`, "");
    const v = await saveDraft(arvind, t.id, reviewed);
    await approveVersion(arvind, v.id);
  }

  // 2. Documents across engagements (uploaded by a maker on the engagement, else its manager).
  const engagements = await db().engagement.findMany({
    where: { status: { in: ["ACTIVE", "COMPLETED"] }, client: { isFirm: false } },
    include: { client: { select: { id: true, name: true } }, assignments: { where: { toDate: null } } },
    orderBy: { code: "asc" },
  });
  const specKey = (e: { serviceLine: string; engagementType: string }) => (e.engagementType === "NOTICE" ? "NOTICE" : e.engagementType === "AUDIT" || e.serviceLine === "AUDIT" ? "AUDIT" : e.serviceLine);
  const audits = engagements.filter((e) => specKey(e) === "AUDIT").slice(0, 5);
  const others = ["NOTICE", "DIRECT_TAX", "GST", "COMPANY_LAW", "ACCOUNTING", "ADVISORY"].flatMap((k) => engagements.filter((e) => specKey(e) === k).slice(0, k === "NOTICE" ? 3 : 2));
  const uploaded: { id: string; uploader: StaffActor; name: string }[] = [];
  for (const [i, e] of [...audits, ...others].entries()) {
    const makerId = e.assignments.find((a) => a.role === "MAKER")?.userId ?? e.managerId;
    const uploader = makerId ? byId.get(makerId) : undefined;
    if (!uploader) continue;
    const specs = SPECS[specKey(e)] ?? [];
    // The last audit is mid-way: no report yet.
    const list = specKey(e) === "AUDIT" && i === audits.length - 1 ? specs.slice(0, 4) : specs;
    for (const s of list) {
      try {
        const doc = await uploadDocument(actorOf(uploader), {
          clientId: e.clientId, engagementId: e.id, name: s.name, kind: s.kind, confidentiality: (s.confidentiality ?? "NORMAL") as "NORMAL", tags: s.tags, auditSectionCode: s.section ?? null,
        }, { name: `${s.name}.pdf`, data: await pdfFor(s, e.client.name, e.name) });
        uploaded.push({ id: doc.id, uploader: actorOf(uploader), name: s.name });
      } catch {
        // A demo upload refused by a rule is skipped rather than stopping the seed.
      }
    }
  }
  // Client-level KYC documents for a few clients (Manager files them).
  for (const e of audits.slice(0, 4)) {
    const mgr = e.managerId ? byId.get(e.managerId) : undefined;
    if (!mgr) continue;
    await uploadDocument(actorOf(mgr), { clientId: e.clientId, name: "KYC: constitution documents and PAN", kind: "CLIENT_DATA", tags: ["final"] }, {
      name: "kyc.pdf", data: await pdfFor({ name: "KYC documents", kind: "CLIENT_DATA", tags: [], lines: ["Certificate of incorporation / deed", "PAN of the entity", "Authorised signatory list"] }, e.client.name, "Client KYC"),
    }).catch(() => undefined);
  }

  // 3. Versions and one open check-out.
  for (const d of uploaded.filter((u) => /Draft financial statements|GSTR-3B working|Draft reply/.test(u.name)).slice(0, 4)) {
    const spec = Object.values(SPECS).flat().find((s) => s.name === d.name)!;
    await addVersion(d.uploader, d.id, { name: `${d.name} v2.pdf`, data: await pdfFor(spec, "Revised", d.name, "Revised after review comments") }, "Revised after manager review").catch(() => undefined);
  }
  const co = uploaded.find((u) => u.name === "Risk assessment summary");
  if (co) await checkOut(co.uploader, co.id).catch(() => undefined);

  // 4. Audit file index: Manager ticks the sections that are done.
  for (const [i, e] of audits.entries()) {
    const mgr = e.managerId ? byId.get(e.managerId) : undefined;
    if (!mgr) continue;
    const c = await auditFileCompleteness(e.id);
    for (const s of c.sections) {
      if (s.documentCount && (i < audits.length - 1 || ["PLANNING", "RISK"].includes(s.code))) await updateAuditSection(actorOf(mgr), s.id, { complete: true }).catch(() => undefined);
    }
  }

  // 5. Documents generated from approved templates.
  for (const e of audits.slice(0, 2)) {
    const mgr = e.managerId ? byId.get(e.managerId) : undefined;
    if (mgr) await generateFromTemplate(actorOf(mgr), { code: "ENGAGEMENT_LETTER_AUDIT", clientId: e.clientId, engagementId: e.id, format: "PDF", tags: "client copy", fileName: `Engagement letter ${e.code}` }).catch(() => undefined);
  }

  // 6. Independence declarations by audit teams (a few left pending; one threat declared).
  const allAudits = engagements.filter((e) => specKey(e) === "AUDIT" && e.status === "ACTIVE");
  for (const [i, e] of allAudits.entries()) {
    const team = await engagementTeam(e.id);
    for (const [j, m] of team.entries()) {
      const u = byId.get(m.id);
      if (!u) continue;
      if (i % 4 === 3 && j === team.length - 1) continue; // pending
      const conflict = i === 1 && m.role === "ARTICLE";
      await declareIndependence(actorOf(u), e.id, conflict ? { hasConflict: true, note: "A relative holds shares in the client; not on this client's fieldwork until the Partner decides." } : { hasConflict: false }).catch(() => undefined);
    }
  }

  // 7. QC checklists: one complete, one in progress, one just started.
  for (const [i, e] of audits.slice(0, 3).entries()) {
    const c = await startChecklist(arvind, e.id).catch(() => null);
    if (!c || i === 2) continue;
    const items = await db().qCChecklistItem.findMany({ where: { checklistId: c.id }, orderBy: { sortOrder: "asc" } });
    for (const [k, it] of items.entries()) {
      if (it.response) continue;
      if (i === 1 && k > 6) break;
      await answerChecklistItem(arvind, it.id, { response: "YES" });
    }
    if (i === 0) await completeChecklist(arvind, c.id).catch(() => undefined);
  }

  // 8. File inspection of closed engagements (or, in a fresh demo, a chosen sample of audits).
  const from = addDays(today, -365);
  const closed = await closedEngagementsIn(from, today);
  const insp = await createInspection(arvind, {
    name: "Annual file inspection", periodFrom: from, periodTo: today,
    ...(closed.length ? { sampleSize: 3 } : { engagementIds: audits.slice(0, 3).map((e) => e.id) }),
  }).catch(() => null);
  if (insp) {
    const sample = await db().qCInspectionSample.findMany({ where: { inspectionId: insp.id } });
    const owner = P("rohan.iyer");
    await addFinding(arvind, insp.id, { engagementId: sample[0]?.engagementId ?? null, finding: "Basis of performance materiality not written down in the planning memo", severity: "MEDIUM", correctiveAction: "Add the basis to the planning memo template and brief the team", ownerId: owner.id, dueDate: addDays(today, 21) });
    await addFinding(arvind, insp.id, { engagementId: sample[1]?.engagementId ?? null, finding: "Two independence declarations were signed after fieldwork started", severity: "HIGH", correctiveAction: "Collect declarations at engagement start; Manager to check before fieldwork", ownerId: P("sneha.kulkarni").id, dueDate: addDays(today, -3) });
    const f3 = await addFinding(arvind, insp.id, { engagementId: sample[0]?.engagementId ?? null, finding: "Query list not cross-referenced to working papers", severity: "LOW", correctiveAction: "Cross-reference queries", ownerId: P("priya.nair").id, dueDate: addDays(today, -10) });
    await closeFinding(actorOf(P("priya.nair")), f3.id, "Cross-references added").catch(() => undefined);
  }

  // 9. Peer-review pack for the last twelve months.
  await buildPeerReviewPack(arvind, { periodFrom: from, periodTo: today }).catch(() => undefined);
}
