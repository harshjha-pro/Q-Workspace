import { z } from "zod";
import path from "node:path";
import { db, transaction, type Tx } from "../../lib/db";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import { parse } from "../../lib/validate";
import { systemActor, type Actor } from "../../permissions/actor";
import { can } from "../../permissions/guards";
import { clientWhere, engagementWhere } from "../../permissions/scopes";
import { writeAudit, logSensitiveView } from "../../audit";
import { readStoredFile, storeFile } from "../../lib/storage";
import { getSetting } from "../settings/service";
import { documentTokens, tokenize } from "./text";
import {
  CONFIDENTIALITY, LOGGED_LEVELS, allowedConfidentiality, assertCanFile, assertDocumentAccess, canCurate, dmsScope,
  visibleDocumentWhere, visibleEngagementIds,
} from "./access";
import { AUDIT_SECTION_CODES, auditFileCompleteness, defaultPeriodKey, ensureAuditSections, ensureFolders, isAuditEngagement, PERIOD_KEY_RE } from "./folders";

export { ensureFolders, auditFileCompleteness, defaultPeriodKey, updateAuditSection, AUDIT_SECTIONS } from "./folders";
export { CONFIDENTIALITY, CONFIDENTIALITY_LABELS } from "./access";

export const DOCUMENT_KINDS = [
  "WORKING_PAPER", "FINANCIAL_STATEMENTS", "REPORT", "CERTIFICATE", "NOTICE", "NOTICE_REPLY", "LETTER", "CORRESPONDENCE", "CLIENT_DATA", "MINUTES", "OTHER",
] as const;
export const DOCUMENT_KIND_LABELS: Record<string, string> = {
  WORKING_PAPER: "Working paper", FINANCIAL_STATEMENTS: "Financial statements", REPORT: "Report", CERTIFICATE: "Certificate", NOTICE: "Notice",
  NOTICE_REPLY: "Notice reply", LETTER: "Letter", CORRESPONDENCE: "Correspondence", CLIENT_DATA: "Client data", MINUTES: "Minutes", OTHER: "Other",
  PEER_REVIEW_PACK: "Peer-review pack", GENERATED: "Generated",
};
export const SUGGESTED_TAGS = ["signed", "final", "client copy", "draft", "report", "working paper", "superseded"];

const uid = (a: Actor) => (a.kind === "PORTAL" ? null : a.userId);

/** "Signed, FINAL ,client copy" → "signed,final,client copy" (lower-case, unique, short). */
export function normaliseTags(input: string | string[]): string {
  const list = (Array.isArray(input) ? input : input.split(","))
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, "").replace(/\s+/g, " ").slice(0, 30))
    .filter(Boolean);
  return [...new Set(list)].slice(0, 20).join(",");
}
export const tagList = (csv: string) => (csv ? csv.split(",").filter(Boolean) : []);

async function maxBytes() {
  const mb = await getSetting<number>("upload.maxMegabytes", 25);
  return (typeof mb === "number" && mb > 0 ? mb : 25) * 1024 * 1024;
}

/** Replace a document's search tokens (D-11). Runs in the caller's transaction. */
async function writeTokens(tx: Tx, documentId: string, tokens: string[]) {
  await tx.documentSearchToken.deleteMany({ where: { documentId } });
  if (tokens.length) await tx.documentSearchToken.createMany({ data: tokens.map((token) => ({ documentId, token })) });
}

/** Rebuild the index for one document from its metadata and current file (used after tag/name changes). */
export async function reindexDocument(documentId: string, tx?: Tx) {
  const doc = await (tx ?? db()).document.findUnique({ where: { id: documentId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!doc) return;
  const v = doc.versions[0];
  let file: { name: string; data: Buffer } | undefined;
  if (v) {
    try {
      file = { name: v.originalName, data: await readStoredFile(v.storagePath) };
    } catch {
      file = undefined; // a missing file still leaves the name and tags searchable
    }
  }
  const tokens = documentTokens(doc, file);
  if (tx) await writeTokens(tx, documentId, tokens);
  else await transaction((t) => writeTokens(t, documentId, tokens));
}

function withExt(name: string, fileName: string) {
  const ext = path.extname(fileName);
  return ext && !name.toLowerCase().endsWith(ext.toLowerCase()) ? `${name}${ext}` : name;
}

// ---------------------------------------------------------------------------
// Upload, generated documents, versions
// ---------------------------------------------------------------------------

const uploadSchema = z.object({
  clientId: z.string().min(1),
  engagementId: z.string().min(1).nullish(),
  taskId: z.string().min(1).nullish(),
  periodKey: z.string().regex(PERIOD_KEY_RE, "Use a short period such as FY2026-27").nullish(),
  name: z.string().trim().max(200).nullish(),
  kind: z.string().trim().min(1).max(40).default("OTHER"),
  confidentiality: z.enum(CONFIDENTIALITY).default("NORMAL"),
  tags: z.union([z.string(), z.array(z.string())]).default(""),
  auditSectionCode: z.string().nullish(),
  note: z.string().max(500).default(""),
});
export type UploadInput = z.input<typeof uploadSchema>;

type CreateArgs = {
  actor: Actor; tx: Tx;
  clientId: string; engagementId: string | null; taskId: string | null; folderId: string;
  name: string; kind: string; sourceType: string; confidentiality: string; tagsCsv: string; auditSectionCode: string | null;
  stored: Awaited<ReturnType<typeof storeFile>>; originalName: string; data: Buffer; note: string;
};

async function createDocumentRow(a: CreateArgs) {
  const doc = await a.tx.document.create({
    data: {
      folderId: a.folderId, clientId: a.clientId, engagementId: a.engagementId, taskId: a.taskId, name: a.name, kind: a.kind,
      sourceType: a.sourceType, confidentiality: a.confidentiality, tagsCsv: a.tagsCsv, auditSectionCode: a.auditSectionCode, createdById: uid(a.actor),
      versions: {
        create: { version: 1, storagePath: a.stored.storagePath, originalName: a.originalName, mimeType: a.stored.mimeType, sizeBytes: a.stored.sizeBytes, sha256: a.stored.sha256, note: a.note, createdById: uid(a.actor) },
      },
    },
  });
  await writeTokens(a.tx, doc.id, documentTokens(doc, { name: a.originalName, data: a.data }));
  await writeAudit(a.tx, a.actor, {
    entityType: "Document", entityId: doc.id, action: "CREATE",
    after: { name: doc.name, clientId: doc.clientId, engagementId: doc.engagementId, kind: doc.kind, sourceType: doc.sourceType, confidentiality: doc.confidentiality, tags: doc.tagsCsv, sha256: a.stored.sha256 },
  });
  return doc;
}

async function checkTask(clientId: string, engagementId: string | null, taskId: string | null) {
  if (!taskId) return;
  const t = await db().task.findUnique({ where: { id: taskId }, select: { clientId: true, engagementId: true } });
  if (!t) throw notFound("Task");
  if (t.clientId !== clientId || (engagementId && t.engagementId && t.engagementId !== engagementId)) throw ruleViolation("That task belongs to another client or engagement.");
}

/** Upload a document into a client / engagement / period folder (P3-26). */
export async function uploadDocument(actor: Actor, input: UploadInput, file: { name: string; data: Buffer }) {
  const v = parse(uploadSchema, input);
  await assertCanFile(actor, v.clientId, v.engagementId);
  if (!allowedConfidentiality(actor).includes(v.confidentiality)) throw forbidden("You cannot file documents at that confidentiality level.");
  if (v.auditSectionCode && !AUDIT_SECTION_CODES.includes(v.auditSectionCode)) throw new DomainError("VALIDATION", "Unknown audit file section.", { auditSectionCode: "Unknown section" });
  const engagementId = v.engagementId ?? null;
  const taskId = v.taskId ?? null;
  await checkTask(v.clientId, engagementId, taskId);
  const client = await db().client.findUniqueOrThrow({ where: { id: v.clientId }, select: { code: true } });
  const engagement = engagementId ? await db().engagement.findUniqueOrThrow({ where: { id: engagementId } }) : null;
  if (v.auditSectionCode && (!engagement || !isAuditEngagement(engagement))) throw ruleViolation("Audit file sections apply to audit engagements only.");
  const stored = await storeFile([client.code, engagement?.code ?? "_client"], file.name, file.data, await maxBytes());
  const periodKey = engagement ? (v.periodKey || defaultPeriodKey(engagement)) : null;
  return transaction(async (tx) => {
    const f = await ensureFolders(v.clientId, engagementId, periodKey, { tx });
    if (engagement && isAuditEngagement(engagement)) await ensureAuditSections(engagement.id, { tx });
    return createDocumentRow({
      actor, tx, clientId: v.clientId, engagementId, taskId, folderId: (f.period ?? f.engagement ?? f.client).id,
      name: withExt(v.name || file.name, file.name), kind: v.kind, sourceType: "UPLOAD", confidentiality: v.confidentiality, tagsCsv: normaliseTags(v.tags),
      auditSectionCode: v.auditSectionCode ?? null, stored, originalName: file.name, data: file.data, note: v.note,
    });
  });
}

export type GeneratedDocumentInput = {
  clientId: string;
  engagementId?: string | null;
  taskId?: string | null;
  /** File name including the extension, e.g. "Reply to notice 143(2).pdf". */
  name: string;
  buffer: Buffer;
  kind?: string;
  /** UPLOAD | PORTAL | NOTICE | UDIN | MESSAGE | GENERATED | IMPORT */
  sourceType?: string;
  confidentiality?: string;
  tags?: string | string[];
  periodKey?: string | null;
  auditSectionCode?: string | null;
  note?: string;
  /** Who caused it (audit trail). Defaults to the System actor. */
  actor?: Actor;
};

/**
 * File a document another module produced or received (notice attachments, UDIN-signed reports,
 * portal uploads, message attachments, generated letters) into the right client folder.
 * The CALLER checks permissions; this function only validates the file and records it.
 */
export async function fileGeneratedDocument(input: GeneratedDocumentInput) {
  const actor = input.actor ?? systemActor();
  const confidentiality = input.confidentiality ?? "NORMAL";
  if (!(CONFIDENTIALITY as readonly string[]).includes(confidentiality)) throw new DomainError("VALIDATION", "Unknown confidentiality level.");
  const engagementId = input.engagementId ?? null;
  const taskId = input.taskId ?? null;
  await checkTask(input.clientId, engagementId, taskId);
  const client = await db().client.findUnique({ where: { id: input.clientId }, select: { code: true } });
  if (!client) throw notFound("Client");
  const engagement = engagementId ? await db().engagement.findUnique({ where: { id: engagementId } }) : null;
  if (engagementId && (!engagement || engagement.clientId !== input.clientId)) throw ruleViolation("That engagement belongs to another client.");
  const stored = await storeFile([client.code, engagement?.code ?? "_client"], input.name, input.buffer, await maxBytes());
  const periodKey = engagement ? (input.periodKey || defaultPeriodKey(engagement)) : null;
  const section = input.auditSectionCode && engagement && isAuditEngagement(engagement) && AUDIT_SECTION_CODES.includes(input.auditSectionCode) ? input.auditSectionCode : null;
  return transaction(async (tx) => {
    const f = await ensureFolders(input.clientId, engagementId, periodKey, { tx, actor });
    return createDocumentRow({
      actor, tx, clientId: input.clientId, engagementId, taskId, folderId: (f.period ?? f.engagement ?? f.client).id,
      name: input.name, kind: input.kind ?? "GENERATED", sourceType: input.sourceType ?? "GENERATED", confidentiality,
      tagsCsv: normaliseTags(input.tags ?? ""), auditSectionCode: section, stored, originalName: input.name, data: input.buffer, note: input.note ?? "",
    });
  });
}

async function loadDoc(documentId: string) {
  const doc = await db().document.findUnique({ where: { id: documentId } });
  if (!doc || doc.employeeUserId) throw notFound("Document");
  return doc;
}

/** Add a new version. Refused while someone else has the document checked out. */
export async function addVersion(actor: Actor, documentId: string, file: { name: string; data: Buffer }, note = "", opts: { releaseCheckout?: boolean } = {}) {
  const doc = await loadDoc(documentId);
  if (doc.archivedAt) throw ruleViolation("This document is archived.");
  await assertDocumentAccess(actor, doc, "write");
  if (doc.checkedOutById && doc.checkedOutById !== uid(actor)) throw ruleViolation("Someone else has checked this document out. Wait for them to check it in.");
  const client = await db().client.findUniqueOrThrow({ where: { id: doc.clientId! }, select: { code: true } });
  const engagement = doc.engagementId ? await db().engagement.findUnique({ where: { id: doc.engagementId }, select: { code: true } }) : null;
  const stored = await storeFile([client.code, engagement?.code ?? "_client"], file.name, file.data, await maxBytes());
  return transaction(async (tx) => {
    const fresh = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
    if (fresh.checkedOutById && fresh.checkedOutById !== uid(actor)) throw ruleViolation("Someone else has checked this document out.");
    const version = fresh.currentVersion + 1;
    await tx.documentVersion.create({
      data: { documentId, version, storagePath: stored.storagePath, originalName: file.name, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sha256: stored.sha256, note: note.slice(0, 500), createdById: uid(actor) },
    });
    const release = opts.releaseCheckout && fresh.checkedOutById === uid(actor);
    const updated = await tx.document.update({
      where: { id: documentId },
      data: { currentVersion: version, updatedById: uid(actor), ...(release ? { checkedOutById: null, checkedOutAt: null } : {}) },
    });
    await writeTokens(tx, documentId, documentTokens(updated, { name: file.name, data: file.data }));
    await writeAudit(tx, actor, { entityType: "Document", entityId: documentId, action: release ? "CHECK_IN" : "NEW_VERSION", after: { version, sha256: stored.sha256, note } });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Check-out / check-in
// ---------------------------------------------------------------------------

export async function checkOut(actor: Actor, documentId: string) {
  const doc = await loadDoc(documentId);
  if (doc.archivedAt) throw ruleViolation("This document is archived.");
  await assertDocumentAccess(actor, doc, "write");
  return transaction(async (tx) => {
    // Conditional update: two people clicking at once cannot both win.
    const r = await tx.document.updateMany({ where: { id: documentId, checkedOutById: null }, data: { checkedOutById: uid(actor), checkedOutAt: new Date(), updatedById: uid(actor) } });
    if (r.count === 0) {
      const holder = await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { checkedOutById: true } });
      throw ruleViolation(holder.checkedOutById === uid(actor) ? "You already have this document checked out." : "Someone else has already checked this document out.");
    }
    await writeAudit(tx, actor, { entityType: "Document", entityId: documentId, action: "CHECK_OUT" });
  });
}

/** Only the person who checked the document out can check it in (optionally with a new version). */
export async function checkIn(actor: Actor, documentId: string, file?: { name: string; data: Buffer } | null, note = "") {
  const doc = await loadDoc(documentId);
  await assertDocumentAccess(actor, doc, "write");
  if (!doc.checkedOutById) throw ruleViolation("This document is not checked out.");
  if (doc.checkedOutById !== uid(actor)) throw forbidden("Only the person who checked it out can check it in. A Partner can force-release it.");
  if (file) return addVersion(actor, documentId, file, note, { releaseCheckout: true });
  return transaction(async (tx) => {
    const updated = await tx.document.update({ where: { id: documentId }, data: { checkedOutById: null, checkedOutAt: null, updatedById: uid(actor) } });
    await writeAudit(tx, actor, { entityType: "Document", entityId: documentId, action: "CHECK_IN", reason: note });
    return updated;
  });
}

/** Partner override when the person holding a check-out is away. */
export async function forceRelease(actor: Actor, documentId: string, reason: string) {
  if (actor.kind !== "USER" || actor.role !== "PARTNER") throw forbidden("Only a Partner can force-release a check-out.");
  const doc = await loadDoc(documentId);
  await assertDocumentAccess(actor, doc, "write");
  if (!doc.checkedOutById) throw ruleViolation("This document is not checked out.");
  if (!reason.trim()) throw new DomainError("VALIDATION", "Give a reason.", { reason: "Required" });
  const holder = doc.checkedOutById;
  return transaction(async (tx) => {
    await tx.document.update({ where: { id: documentId }, data: { checkedOutById: null, checkedOutAt: null, updatedById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "Document", entityId: documentId, action: "FORCE_RELEASE", before: { checkedOutById: holder }, reason: reason.trim() });
  });
}

// ---------------------------------------------------------------------------
// Metadata: tags, name, confidentiality, section, archive
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(40),
  tags: z.union([z.string(), z.array(z.string())]),
  confidentiality: z.enum(CONFIDENTIALITY),
  auditSectionCode: z.string().nullable(),
  sharedWithClient: z.boolean(),
});

export async function updateDocument(actor: Actor, documentId: string, input: Partial<z.input<typeof updateSchema>>) {
  const doc = await loadDoc(documentId);
  if (doc.archivedAt) throw ruleViolation("This document is archived.");
  await assertDocumentAccess(actor, doc, "write");
  const v = parse(updateSchema.partial(), input);
  const data: Record<string, unknown> = {};
  if (v.name !== undefined) data.name = v.name;
  if (v.kind !== undefined) data.kind = v.kind;
  if (v.tags !== undefined) data.tagsCsv = normaliseTags(v.tags);
  if (v.confidentiality !== undefined && v.confidentiality !== doc.confidentiality) {
    if (!canCurate(actor)) throw forbidden("Only a Manager or Partner changes confidentiality.");
    if (!allowedConfidentiality(actor).includes(v.confidentiality)) throw forbidden("You cannot set that confidentiality level.");
    data.confidentiality = v.confidentiality;
  }
  if (v.auditSectionCode !== undefined) {
    if (v.auditSectionCode) {
      if (!AUDIT_SECTION_CODES.includes(v.auditSectionCode)) throw new DomainError("VALIDATION", "Unknown audit file section.");
      const e = doc.engagementId ? await db().engagement.findUnique({ where: { id: doc.engagementId } }) : null;
      if (!e || !isAuditEngagement(e)) throw ruleViolation("Audit file sections apply to audit engagements only.");
    }
    data.auditSectionCode = v.auditSectionCode || null;
  }
  if (v.sharedWithClient !== undefined && v.sharedWithClient !== doc.sharedWithClient) {
    if (!can(actor, "portal.share")) throw forbidden();
    if (v.sharedWithClient && doc.confidentiality !== "NORMAL" && doc.confidentiality !== "FINANCIALS" && doc.confidentiality !== "NOTICE") throw ruleViolation("Internal confidential documents cannot be shared with the client.");
    data.sharedWithClient = v.sharedWithClient;
  }
  if (!Object.keys(data).length) return doc;
  return transaction(async (tx) => {
    const updated = await tx.document.update({ where: { id: documentId }, data: { ...data, updatedById: uid(actor) } });
    if (data.name !== undefined || data.tagsCsv !== undefined || data.kind !== undefined) await reindexDocument(documentId, tx);
    await writeAudit(tx, actor, { entityType: "Document", entityId: documentId, action: "UPDATE", before: doc, after: updated });
    return updated;
  });
}

export async function setTags(actor: Actor, documentId: string, tags: string | string[]) {
  return updateDocument(actor, documentId, { tags });
}

/** Soft delete: the document leaves lists and search; versions stay on disk for retention. */
export async function archiveDocument(actor: Actor, documentId: string, reason: string) {
  const doc = await loadDoc(documentId);
  await assertDocumentAccess(actor, doc, "write");
  if (!canCurate(actor)) throw forbidden("Only a Manager or Partner archives documents.");
  if (doc.checkedOutById) throw ruleViolation("Check the document in first.");
  return transaction(async (tx) => {
    await tx.document.update({ where: { id: documentId }, data: { archivedAt: new Date(), updatedById: uid(actor) } });
    await tx.documentSearchToken.deleteMany({ where: { documentId } });
    await writeAudit(tx, actor, { entityType: "Document", entityId: documentId, action: "ARCHIVE", reason });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function logIfSensitive(actor: Actor, doc: { id: string; confidentiality: string }, detail: string) {
  const kind = LOGGED_LEVELS[doc.confidentiality];
  if (kind) await logSensitiveView(actor, kind, "Document", doc.id, detail);
}

export async function getDocument(actor: Actor, documentId: string) {
  const doc = await db().document.findUnique({ where: { id: documentId }, include: { versions: { orderBy: { version: "desc" } }, folder: true } });
  if (!doc || doc.employeeUserId) throw notFound("Document");
  const s = await assertDocumentAccess(actor, doc, "read");
  await logIfSensitive(actor, doc, "opened");
  const userIds = [...new Set([doc.checkedOutById, doc.createdById, ...doc.versions.map((v) => v.createdById)].filter((x): x is string => !!x))];
  const people = new Map((await db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const [client, engagement, task] = await Promise.all([
    doc.clientId ? db().client.findUnique({ where: { id: doc.clientId }, select: { id: true, code: true, name: true } }) : null,
    doc.engagementId ? db().engagement.findUnique({ where: { id: doc.engagementId }, select: { id: true, code: true, name: true, serviceLine: true, engagementType: true } }) : null,
    doc.taskId ? db().task.findUnique({ where: { id: doc.taskId }, select: { id: true, title: true } }) : null,
  ]);
  const me = uid(actor);
  return {
    ...doc,
    tags: tagList(doc.tagsCsv),
    client, engagement, task,
    isAudit: engagement ? isAuditEngagement(engagement) : false,
    checkedOutByName: doc.checkedOutById ? (people.get(doc.checkedOutById) ?? "Someone") : null,
    versions: doc.versions.map((v) => ({ ...v, byName: v.createdById ? (people.get(v.createdById) ?? "") : v.uploadedByPortalUserId ? "Client (portal)" : "System" })),
    can: {
      write: !s.readOnly && !doc.archivedAt,
      checkIn: !!doc.checkedOutById && doc.checkedOutById === me,
      checkOut: !s.readOnly && !doc.checkedOutById && !doc.archivedAt,
      forceRelease: !!doc.checkedOutById && actor.kind === "USER" && actor.role === "PARTNER" && doc.checkedOutById !== me,
      curate: !s.readOnly && canCurate(actor),
      share: !s.readOnly && can(actor, "portal.share"),
    },
  };
}

/** One version's bytes, after the access check; downloads are audited and sensitive ones logged. */
export async function documentVersionForDownload(actor: Actor, documentId: string, version?: number) {
  const doc = await db().document.findUnique({ where: { id: documentId } });
  if (!doc || doc.employeeUserId) throw notFound("Document");
  await assertDocumentAccess(actor, doc, "read");
  const v = await db().documentVersion.findFirst({ where: { documentId, ...(version ? { version } : {}) }, orderBy: { version: "desc" } });
  if (!v) throw notFound("Document version");
  await logIfSensitive(actor, doc, `download v${v.version}`);
  await transaction((tx) => writeAudit(tx, actor, { entityType: "Document", entityId: doc.id, action: "DOWNLOAD", after: { version: v.version } }));
  const ext = path.extname(v.originalName);
  const base = doc.name.toLowerCase().endsWith(ext.toLowerCase()) ? doc.name : `${doc.name}${ext}`;
  return { data: await readStoredFile(v.storagePath), fileName: version && version !== doc.currentVersion && ext ? `${base.slice(0, -ext.length)} (v${v.version})${ext}` : base, mimeType: v.mimeType };
}

export type DocRow = {
  id: string; name: string; kind: string; confidentiality: string; tags: string[]; currentVersion: number; sourceType: string;
  clientId: string | null; clientName: string; engagementId: string | null; engagementCode: string; folderPath: string; auditSectionCode: string | null;
  checkedOut: boolean; updatedAt: Date; sizeBytes: number;
};

async function toRows(docs: { id: string; name: string; kind: string; confidentiality: string; tagsCsv: string; currentVersion: number; sourceType: string; clientId: string | null; engagementId: string | null; folderId: string | null; auditSectionCode: string | null; checkedOutById: string | null; updatedAt: Date }[]): Promise<DocRow[]> {
  const clientIds = [...new Set(docs.map((d) => d.clientId).filter((x): x is string => !!x))];
  const engIds = [...new Set(docs.map((d) => d.engagementId).filter((x): x is string => !!x))];
  const folderIds = [...new Set(docs.map((d) => d.folderId).filter((x): x is string => !!x))];
  const [clients, engs, folders, sizes] = await Promise.all([
    db().client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
    db().engagement.findMany({ where: { id: { in: engIds } }, select: { id: true, code: true } }),
    db().folder.findMany({ where: { id: { in: folderIds } }, select: { id: true, path: true } }),
    db().documentVersion.findMany({ where: { documentId: { in: docs.map((d) => d.id) } }, select: { documentId: true, version: true, sizeBytes: true } }),
  ]);
  const cn = new Map(clients.map((c) => [c.id, c.name]));
  const ec = new Map(engs.map((e) => [e.id, e.code]));
  const fp = new Map(folders.map((f) => [f.id, f.path]));
  const sz = new Map(sizes.map((s) => [`${s.documentId}:${s.version}`, s.sizeBytes]));
  return docs.map((d) => ({
    id: d.id, name: d.name, kind: d.kind, confidentiality: d.confidentiality, tags: tagList(d.tagsCsv), currentVersion: d.currentVersion, sourceType: d.sourceType,
    clientId: d.clientId, clientName: d.clientId ? (cn.get(d.clientId) ?? "") : "", engagementId: d.engagementId, engagementCode: d.engagementId ? (ec.get(d.engagementId) ?? "") : "",
    folderPath: d.folderId ? (fp.get(d.folderId) ?? "") : "", auditSectionCode: d.auditSectionCode, checkedOut: !!d.checkedOutById, updatedAt: d.updatedAt,
    sizeBytes: sz.get(`${d.id}:${d.currentVersion}`) ?? 0,
  }));
}

/**
 * Permission-aware full-text search (D-11). Every query word must match the start of an indexed
 * token (names, tags, text inside txt/csv/json/xml/docx/xlsx and simple PDFs). Results are filtered by
 * exactly the same visibility rules as browsing, so nobody finds what they could not open.
 */
export async function searchDocuments(actor: Actor, q: string, opts: { clientId?: string; engagementId?: string; take?: number } = {}) {
  const where = await visibleDocumentWhere(actor);
  const words = tokenize(q).slice(0, 8);
  if (!words.length) return [];
  const sets: Set<string>[] = [];
  for (const w of words) {
    const hits = await db().documentSearchToken.findMany({ where: { token: { startsWith: w } }, select: { documentId: true }, distinct: ["documentId"], take: 5000 });
    sets.push(new Set(hits.map((h) => h.documentId)));
  }
  const ids = [...sets[0]!].filter((id) => sets.every((s) => s.has(id)));
  if (!ids.length) return [];
  const docs = await db().document.findMany({
    where: { AND: [where, { id: { in: ids } }, opts.clientId ? { clientId: opts.clientId } : {}, opts.engagementId ? { engagementId: opts.engagementId } : {}] },
    orderBy: { updatedAt: "desc" },
    take: Math.min(opts.take ?? 100, 500),
  });
  return toRows(docs);
}

/** Recent documents the actor can see, newest first, with optional tag filter. */
export async function listDocuments(actor: Actor, opts: { clientId?: string; engagementId?: string | null; folderId?: string; tag?: string; take?: number } = {}) {
  const where = await visibleDocumentWhere(actor);
  const docs = await db().document.findMany({
    where: {
      AND: [
        where,
        opts.clientId ? { clientId: opts.clientId } : {},
        opts.engagementId !== undefined ? { engagementId: opts.engagementId } : {},
        opts.folderId ? { folderId: opts.folderId } : {},
        opts.tag ? { tagsCsv: { contains: opts.tag.toLowerCase() } } : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(opts.take ?? 200, 1000),
  });
  return toRows(docs);
}

/** Clients the actor can browse, with their document counts. */
export async function browseClients(actor: Actor, q = "") {
  const { scope } = dmsScope(actor);
  if (actor.kind === "PORTAL") return [];
  const clients = await db().client.findMany({
    where: { AND: [clientWhere(actor, scope), { archivedAt: null }, q.trim() ? { searchName: { contains: q.trim().toLowerCase() } } : {}] },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  const where = await visibleDocumentWhere(actor);
  const counts = await db().document.groupBy({ by: ["clientId"], where: { AND: [where, { clientId: { in: clients.map((c) => c.id) } }] }, _count: { _all: true } });
  const byClient = new Map(counts.map((c) => [c.clientId, c._count._all]));
  return clients.map((c) => ({ ...c, documentCount: byClient.get(c.id) ?? 0 }));
}

/** A client's folder: engagements the actor can see (folders created lazily) and client-level documents. */
export async function clientDocuments(actor: Actor, clientId: string) {
  const { scope } = dmsScope(actor);
  if (actor.kind !== "SYSTEM") {
    const ok = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere(actor, scope)] } });
    if (!ok) throw (await db().client.count({ where: { id: clientId } })) ? forbidden() : notFound("Client");
  }
  const client = await db().client.findUniqueOrThrow({ where: { id: clientId }, select: { id: true, code: true, name: true } });
  await ensureFolders(clientId);
  const engIds = await visibleEngagementIds(actor);
  const engagements = await db().engagement.findMany({
    where: { AND: [{ clientId }, engIds === null ? {} : { id: { in: engIds } }, scope === "team" ? engagementWhere(actor, scope) : {}] },
    select: { id: true, code: true, name: true, serviceLine: true, engagementType: true, status: true },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });
  const where = await visibleDocumentWhere(actor);
  const counts = await db().document.groupBy({ by: ["engagementId"], where: { AND: [where, { clientId }] }, _count: { _all: true } });
  const byEng = new Map(counts.map((c) => [c.engagementId, c._count._all]));
  const clientLevel = await listDocuments(actor, { clientId, engagementId: null });
  return {
    client,
    engagements: engagements.map((e) => ({ ...e, isAudit: isAuditEngagement(e), documentCount: byEng.get(e.id) ?? 0 })),
    clientLevel,
    readOnly: dmsScope(actor).readOnly,
  };
}

/** An engagement's folders by period, its documents and (audit) the file index with completeness. */
export async function engagementDocuments(actor: Actor, engagementId: string, periodKey?: string | null) {
  const e = await db().engagement.findUnique({ where: { id: engagementId }, include: { client: { select: { id: true, code: true, name: true } } } });
  if (!e) throw notFound("Engagement");
  await assertCanSeeEngagement(actor, e.clientId, engagementId);
  const def = defaultPeriodKey(e);
  await ensureFolders(e.clientId, engagementId, def);
  const periods = await db().folder.findMany({ where: { engagementId, kind: "PERIOD" }, orderBy: { periodKey: "desc" } });
  const selected = periodKey === "all" ? null : periods.find((p) => p.periodKey === (periodKey || def)) ?? null;
  const docs = await listDocuments(actor, { engagementId, ...(selected ? { folderId: selected.id } : {}) });
  const audit = isAuditEngagement(e) ? await auditFileCompleteness(engagementId) : null;
  return {
    engagement: { id: e.id, code: e.code, name: e.name, serviceLine: e.serviceLine, engagementType: e.engagementType, status: e.status },
    client: e.client,
    periods: periods.map((p) => ({ id: p.id, periodKey: p.periodKey ?? "", path: p.path })),
    selectedPeriod: selected?.periodKey ?? "all",
    defaultPeriod: def,
    documents: docs,
    audit,
    readOnly: dmsScope(actor).readOnly,
  };
}

async function assertCanSeeEngagement(actor: Actor, clientId: string, engagementId: string) {
  const { scope } = dmsScope(actor);
  if (actor.kind === "SYSTEM") return;
  if (actor.kind === "PORTAL") {
    if (!actor.clientIds.includes(clientId)) throw forbidden();
    return;
  }
  const ok = await db().client.count({ where: { AND: [{ id: clientId }, clientWhere(actor, scope)] } });
  if (!ok) throw forbidden();
  if (scope === "assigned") {
    const e = await db().engagement.count({ where: { AND: [{ id: engagementId }, engagementWhere(actor, scope)] } });
    if (!e) throw forbidden();
  }
}

/** People who could be shown as "checked out by" etc. — tiny helper for pages. */
export async function documentCounts(actor: Actor) {
  const where = await visibleDocumentWhere(actor);
  const [total, checkedOut] = await Promise.all([
    db().document.count({ where }),
    db().document.count({ where: { AND: [where, { checkedOutById: uid(actor) ?? "__none__" }] } }),
  ]);
  return { total, checkedOutByMe: checkedOut };
}
