import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { parse } from "../../lib/validate";
import type { Actor } from "../../permissions/actor";
import { authorize, can } from "../../permissions/guards";
import { assertClientAccess, assertEngagementAccess, assertUserAccess } from "../../permissions/scopes";
import { writeAudit } from "../../audit";
import { fieldsIn, mergeDataFor, renderMerge } from "../../documents/merge";
import { approvedTemplateBody } from "../../documents/library";
import { buildPdf, type PdfBlock } from "../../documents/pdf";
import { buildDocx } from "../../documents/docx";
import { assertCanFile } from "../dms/access";
import { fileGeneratedDocument } from "../dms/service";

/**
 * Template library (spec 13.3, P3-28): firm templates by category, merge fields from the client,
 * engagement and employee masters, versions Draft → Approved (Partner) → Retired, preview, and Word/PDF
 * generation filed into the DMS. Only APPROVED versions are ever used to generate (library.ts).
 */
export const TEMPLATE_CATEGORIES = [
  "BOARD_RESOLUTION", "SHAREHOLDER_RESOLUTION", "MEETING_NOTICE", "MINUTES", "CERTIFICATE", "ENGAGEMENT_LETTER", "REPRESENTATION_LETTER",
  "NOTICE_REPLY", "HR_LETTER", "RENEWAL_LETTER", "PROPOSAL", "REMINDER_MESSAGE", "OTHER",
] as const;
export const CATEGORY_LABELS: Record<string, string> = {
  BOARD_RESOLUTION: "Board resolutions", SHAREHOLDER_RESOLUTION: "Shareholder resolutions", MEETING_NOTICE: "Notices of meetings", MINUTES: "Minutes",
  CERTIFICATE: "CA / CS certificates", ENGAGEMENT_LETTER: "Engagement letters", REPRESENTATION_LETTER: "Representation letters", NOTICE_REPLY: "Notice replies",
  HR_LETTER: "HR letters", RENEWAL_LETTER: "Renewal letters", PROPOSAL: "Proposals", REMINDER_MESSAGE: "Reminder messages", OTHER: "Other",
};
export const OUTPUT_FORMATS = ["PDF", "DOCX", "TEXT"] as const;

/** Every merge field mergeDataFor() fills (server/documents/merge.ts), for the editor's field list. */
export const MERGE_FIELDS: { group: string; needs: string; fields: { key: string; label: string }[] }[] = [
  { group: "today", needs: "always", fields: [{ key: "today.date", label: "Today's date" }, { key: "today.fy", label: "Current financial year" }] },
  { group: "firm", needs: "always", fields: ["name", "address", "gstin", "pan", "email", "phone"].map((f) => ({ key: `firm.${f}`, label: `Firm ${f}` })) },
  {
    group: "client", needs: "a client", fields: [
      ["name", "Name"], ["code", "Client code"], ["pan", "PAN"], ["tan", "TAN"], ["cin", "CIN / LLPIN"], ["constitution", "Constitution"], ["address", "Address"],
      ["contactName", "Primary contact"], ["contactEmail", "Primary contact email"], ["partner", "Client partner"], ["manager", "Client manager"],
    ].map(([k, l]) => ({ key: `client.${k}`, label: l! })),
  },
  {
    group: "engagement", needs: "an engagement", fields: [
      ["name", "Name"], ["code", "Engagement code"], ["fee", "Fee"], ["feeBasis", "Fee basis"], ["budgetHours", "Budget hours"], ["startDate", "Start date"], ["partner", "Engagement partner"], ["manager", "Engagement manager"],
    ].map(([k, l]) => ({ key: `engagement.${k}`, label: l! })),
  },
  { group: "employee", needs: "an employee", fields: [["name", "Name"], ["designation", "Designation"], ["joiningDate", "Joining date"], ["employeeCode", "Employee code"]].map(([k, l]) => ({ key: `employee.${k}`, label: l! })) },
  { group: "extra", needs: "typed when generating", fields: [{ key: "extra.anything", label: "Any {{extra.name}} field: you type its value when generating" }] },
];

const uid = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);
const isHrOnly = (a: Actor) => a.kind === "USER" && a.role === "HR_ADMIN";

/** templates.manage; HR Admin manages HR letters only. */
function assertManage(actor: Actor, category?: string) {
  authorize(actor, "templates.manage");
  if (category && isHrOnly(actor) && category !== "HR_LETTER") throw forbidden("HR manages HR letter templates only.");
}

async function loadTemplate(actor: Actor, templateId: string) {
  const t = await db().template.findUnique({ where: { id: templateId } });
  if (!t) throw notFound("Template");
  assertManage(actor, t.category);
  return t;
}

export async function listTemplates(actor: Actor, opts: { category?: string; q?: string } = {}) {
  assertManage(actor);
  const rows = await db().template.findMany({
    where: {
      ...(isHrOnly(actor) ? { category: "HR_LETTER" } : opts.category ? { category: opts.category } : {}),
      ...(opts.q?.trim() ? { OR: [{ name: { contains: opts.q.trim() } }, { code: { contains: opts.q.trim().toUpperCase() } }] } : {}),
    },
    include: { versions: { orderBy: { version: "desc" } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map((t) => ({
    id: t.id, code: t.code, name: t.name, category: t.category, outputFormat: t.outputFormat, active: t.active,
    latest: t.versions[0] ? { version: t.versions[0].version, status: t.versions[0].status } : null,
    approvedVersion: t.versions.find((v) => v.status === "APPROVED")?.version ?? null,
  }));
}

export async function getTemplate(actor: Actor, templateId: string) {
  await loadTemplate(actor, templateId);
  const t = await db().template.findUniqueOrThrow({ where: { id: templateId }, include: { versions: { orderBy: { version: "desc" } } } });
  const ids = [...new Set(t.versions.flatMap((v) => [v.createdById, v.approvedById]).filter((x): x is string => !!x))];
  const names = new Map((await db().user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return {
    ...t,
    versions: t.versions.map((v) => ({ ...v, fields: v.mergeFieldsCsv ? v.mergeFieldsCsv.split(",") : [], by: v.createdById ? (names.get(v.createdById) ?? "") : "System", approvedBy: v.approvedById ? (names.get(v.approvedById) ?? "") : "" })),
    canApprove: can(actor, "templates.approve"),
  };
}

const CODE_RE = /^[A-Z][A-Z0-9_]{2,59}$/;
const createSchema = z.object({
  code: z.string().trim().transform((s) => s.toUpperCase()).refine((s) => CODE_RE.test(s), "Use capitals, digits and _ (e.g. HR_OFFER)"),
  name: z.string().trim().min(3).max(120),
  category: z.enum(TEMPLATE_CATEGORIES),
  outputFormat: z.enum(OUTPUT_FORMATS).default("PDF"),
  body: z.string().max(100_000).default(""),
});

export async function createTemplate(actor: Actor, input: z.input<typeof createSchema>) {
  const v = parse(createSchema, input);
  assertManage(actor, v.category);
  if (await db().template.findUnique({ where: { code: v.code } })) throw new DomainError("VALIDATION", "That code is already used.", { code: "Already used" });
  return transaction(async (tx) => {
    const t = await tx.template.create({
      data: { code: v.code, name: v.name, category: v.category, outputFormat: v.outputFormat, createdById: uid(actor), versions: { create: { version: 1, body: v.body, mergeFieldsCsv: fieldsIn(v.body).join(","), createdById: uid(actor) } } },
    });
    await writeAudit(tx, actor, { entityType: "Template", entityId: t.id, action: "CREATE", after: { code: t.code, name: t.name, category: t.category } });
    return t;
  });
}

const metaSchema = z.object({ name: z.string().trim().min(3).max(120), outputFormat: z.enum(OUTPUT_FORMATS), active: z.boolean() });

export async function updateTemplateMeta(actor: Actor, templateId: string, input: Partial<z.input<typeof metaSchema>>) {
  const t = await loadTemplate(actor, templateId);
  const v = parse(metaSchema.partial(), input);
  return transaction(async (tx) => {
    const row = await tx.template.update({ where: { id: templateId }, data: { ...v, updatedById: uid(actor) } });
    await writeAudit(tx, actor, { entityType: "Template", entityId: templateId, action: "UPDATE", before: t, after: row });
    return row;
  });
}

/** Save the working draft: edits the latest DRAFT version, or starts a new DRAFT after an approved one. */
export async function saveDraft(actor: Actor, templateId: string, body: string) {
  await loadTemplate(actor, templateId);
  if (body.length > 100_000) throw new DomainError("VALIDATION", "The template is too long.", { body: "Too long" });
  if (!body.trim()) throw new DomainError("VALIDATION", "The template body is empty.", { body: "Required" });
  return transaction(async (tx) => {
    const latest = await tx.templateVersion.findFirst({ where: { templateId }, orderBy: { version: "desc" } });
    const fields = fieldsIn(body).join(",");
    if (latest && latest.status === "DRAFT") {
      const row = await tx.templateVersion.update({ where: { id: latest.id }, data: { body, mergeFieldsCsv: fields, updatedById: uid(actor) } });
      await writeAudit(tx, actor, { entityType: "TemplateVersion", entityId: row.id, action: "UPDATE", after: { version: row.version, fields } });
      return row;
    }
    const row = await tx.templateVersion.create({ data: { templateId, version: (latest?.version ?? 0) + 1, body, mergeFieldsCsv: fields, createdById: uid(actor) } });
    await writeAudit(tx, actor, { entityType: "TemplateVersion", entityId: row.id, action: "CREATE", after: { version: row.version, fields } });
    return row;
  });
}

/** Partner approves a draft; the previously approved version is retired in the same step. */
export async function approveVersion(actor: Actor, versionId: string) {
  authorize(actor, "templates.approve");
  const v = await db().templateVersion.findUnique({ where: { id: versionId }, include: { template: true } });
  if (!v) throw notFound("Template version");
  if (v.status !== "DRAFT") throw ruleViolation("Only a draft can be approved.");
  if (!v.body.trim()) throw ruleViolation("An empty template cannot be approved.");
  return transaction(async (tx) => {
    const old = await tx.templateVersion.findMany({ where: { templateId: v.templateId, status: "APPROVED" } });
    for (const o of old) {
      await tx.templateVersion.update({ where: { id: o.id }, data: { status: "RETIRED", updatedById: uid(actor) } });
      await writeAudit(tx, actor, { entityType: "TemplateVersion", entityId: o.id, action: "RETIRE", reason: `Superseded by version ${v.version}` });
    }
    const row = await tx.templateVersion.update({ where: { id: versionId }, data: { status: "APPROVED", approvedById: uid(actor), approvedAt: new Date(), updatedById: uid(actor) } });
    await writeAudit(tx, actor, { entityType: "TemplateVersion", entityId: versionId, action: "APPROVE", after: { code: v.template.code, version: v.version } });
    return row;
  });
}

/** Retire a version (approved or draft). With no approved version left, generation stops for this template. */
export async function retireVersion(actor: Actor, versionId: string, reason = "") {
  authorize(actor, "templates.approve");
  const v = await db().templateVersion.findUnique({ where: { id: versionId } });
  if (!v) throw notFound("Template version");
  if (v.status === "RETIRED") return v;
  return transaction(async (tx) => {
    const row = await tx.templateVersion.update({ where: { id: versionId }, data: { status: "RETIRED", updatedById: uid(actor) } });
    await writeAudit(tx, actor, { entityType: "TemplateVersion", entityId: versionId, action: "RETIRE", reason });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Preview and generation
// ---------------------------------------------------------------------------

type Ctx = { clientId?: string | null; engagementId?: string | null; userId?: string | null; extra?: Record<string, string> };

/** The caller must be allowed to read every record whose fields are merged in. */
async function assertMergeContext(actor: Actor, ctx: Ctx) {
  if (ctx.clientId) await assertClientAccess(actor, "client.view", ctx.clientId);
  if (ctx.engagementId) {
    await assertEngagementAccess(actor, "engagement.view", ctx.engagementId);
    if (ctx.clientId) {
      const e = await db().engagement.findUnique({ where: { id: ctx.engagementId }, select: { clientId: true } });
      if (e?.clientId !== ctx.clientId) throw ruleViolation("That engagement belongs to another client.");
    }
  }
  if (ctx.userId) await assertUserAccess(actor, "hr.records.view", ctx.userId);
}

const cleanExtra = (extra?: Record<string, string>) =>
  Object.fromEntries(Object.entries(extra ?? {}).filter(([k, v]) => /^[a-zA-Z0-9_]{1,40}$/.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 5000)]));

/**
 * Merge a template (any version, or unsaved editor text) with a chosen client / engagement / employee.
 * Returns the text and the fields that had no value (shown as [[field]] in the text).
 */
export async function previewTemplate(actor: Actor, input: { templateId: string; versionId?: string; body?: string } & Ctx) {
  const t = await loadTemplate(actor, input.templateId);
  let body = input.body;
  if (body === undefined) {
    const v = input.versionId
      ? await db().templateVersion.findFirst({ where: { id: input.versionId, templateId: t.id } })
      : await db().templateVersion.findFirst({ where: { templateId: t.id }, orderBy: { version: "desc" } });
    if (!v) throw notFound("Template version");
    body = v.body;
  }
  await assertMergeContext(actor, input);
  return renderMerge(body, await mergeDataFor({ clientId: input.clientId, engagementId: input.engagementId, userId: input.userId, extra: cleanExtra(input.extra) }));
}

/** Approved, active templates someone can generate from (client documents, or HR letters for HR/Partner). */
export async function generatableTemplates(actor: Actor, kind: "client" | "employee" = "client") {
  if (kind === "employee") {
    if (!(can(actor, "hr.records.manage") || (actor.kind === "USER" && actor.role === "PARTNER"))) return [];
  } else if (!can(actor, "dms.view") || isHrOnly(actor)) return [];
  const rows = await db().template.findMany({
    where: { active: true, versions: { some: { status: "APPROVED" } }, ...(kind === "employee" ? { category: "HR_LETTER" } : { category: { not: "HR_LETTER" } }) },
    include: { versions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map((t) => ({
    code: t.code, name: t.name, category: t.category, outputFormat: t.outputFormat, version: t.versions[0]!.version,
    extraFields: fieldsIn(t.versions[0]!.body).filter((f) => f.startsWith("extra.")).map((f) => f.slice(6)),
  }));
}

/** Turn merged text into a file. "# " lines are headings; blank lines are spacing. */
export async function renderToFile(title: string, text: string, format: "PDF" | "DOCX" | "TEXT"): Promise<{ buffer: Buffer; ext: string; mimeType: string }> {
  if (format === "TEXT") return { buffer: Buffer.from(text, "utf8"), ext: "txt", mimeType: "text/plain" };
  const firm = await db().firmProfile.findFirst();
  const header = firm ? [firm.name, firm.address, [firm.gstin && `GSTIN ${firm.gstin}`, firm.email, firm.phone].filter(Boolean).join("  ·  ")].filter(Boolean) : [];
  if (format === "DOCX") return { buffer: await buildDocx({ header, body: text }), ext: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const blocks: PdfBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "text", text: para.join("\n") });
    para = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      flush();
      blocks.push({ type: "heading", text: line.slice(2) });
    } else if (!line.trim()) {
      flush();
    } else para.push(line);
  }
  flush();
  return { buffer: await buildPdf({ title, header, blocks }), ext: "pdf", mimeType: "application/pdf" };
}

const generateSchema = z.object({
  code: z.string().min(1),
  clientId: z.string().min(1).nullish(),
  engagementId: z.string().min(1).nullish(),
  taskId: z.string().min(1).nullish(),
  userId: z.string().min(1).nullish(),
  format: z.enum(OUTPUT_FORMATS).optional(),
  fileName: z.string().trim().max(150).optional(),
  extra: z.record(z.string(), z.string()).optional(),
  tags: z.string().optional(),
  confidentiality: z.string().optional(),
  /** File client documents into the DMS (default true). Employee letters are only downloaded. */
  file: z.boolean().default(true),
});

/**
 * Generate a Word/PDF document from the APPROVED version of a template, for a client / engagement
 * (filed into the DMS) or, for HR letters, an employee (returned for download).
 */
export async function generateFromTemplate(actor: Actor, input: z.input<typeof generateSchema>) {
  const v = parse(generateSchema, input);
  const t = await db().template.findUnique({ where: { code: v.code } });
  if (!t || !t.active) throw notFound("Template");
  const approved = await approvedTemplateBody(t.code, "");
  if (!approved.templateVersionId) throw ruleViolation("This template has no approved version yet. A Partner must approve it first.");
  let clientId = v.clientId ?? null;
  if (v.engagementId && !clientId) clientId = (await db().engagement.findUnique({ where: { id: v.engagementId }, select: { clientId: true } }))?.clientId ?? null;
  if (t.category === "HR_LETTER") {
    if (!v.userId) throw new DomainError("VALIDATION", "Choose the employee.", { userId: "Required" });
    if (!(can(actor, "hr.records.manage") || (actor.kind === "USER" && actor.role === "PARTNER"))) throw forbidden("HR letters are generated by HR or a Partner.");
    await assertUserAccess(actor, "hr.records.view", v.userId);
  } else {
    if (!clientId) throw new DomainError("VALIDATION", "Choose the client.", { clientId: "Required" });
    await assertCanFile(actor, clientId, v.engagementId);
    await assertMergeContext(actor, { clientId, engagementId: v.engagementId, userId: v.userId });
  }
  const merged = renderMerge(approved.body, await mergeDataFor({ clientId, engagementId: v.engagementId, userId: v.userId, extra: cleanExtra(v.extra) }));
  const format = v.format ?? (t.outputFormat as "PDF" | "DOCX" | "TEXT");
  const out = await renderToFile(t.name, merged.text, format);
  const base = (v.fileName || t.name).replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `${base}.${out.ext}`;
  let documentId: string | null = null;
  if (t.category !== "HR_LETTER" && v.file && clientId) {
    const doc = await fileGeneratedDocument({
      clientId, engagementId: v.engagementId ?? null, taskId: v.taskId ?? null, name: fileName, buffer: out.buffer,
      kind: kindFor(t.category), sourceType: "GENERATED", confidentiality: v.confidentiality ?? "NORMAL", tags: v.tags ?? "draft", actor,
      note: `Generated from ${t.code} v${(await db().templateVersion.findUniqueOrThrow({ where: { id: approved.templateVersionId } })).version}`,
    });
    documentId = doc.id;
  } else {
    await transaction((tx) => writeAudit(tx, actor, { entityType: "Template", entityId: t.id, action: "GENERATE", after: { code: t.code, userId: v.userId ?? null, clientId, format } }));
  }
  return { buffer: out.buffer, fileName, mimeType: out.mimeType, missing: merged.missing, documentId, templateVersionId: approved.templateVersionId };
}

function kindFor(category: string) {
  return ({ CERTIFICATE: "CERTIFICATE", NOTICE_REPLY: "NOTICE_REPLY", MINUTES: "MINUTES", BOARD_RESOLUTION: "MINUTES", SHAREHOLDER_RESOLUTION: "MINUTES" } as Record<string, string>)[category] ?? "LETTER";
}
