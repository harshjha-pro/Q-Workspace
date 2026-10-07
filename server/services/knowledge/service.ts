import { z } from "zod";
import { db, transaction, type Tx } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound } from "../../lib/errors";
import { authorize, can, requireStaff } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { SERVICE_LINES } from "../../domain/enums";

/**
 * Knowledge base (spec 13.4, P3-29): circulars, notifications, due-date extensions, internal SOPs and helpdesk
 * FAQs, tagged by service line. Every staff member reads published articles; `knowledge.write` holders write.
 * Statutory content is summarised as firm notes pointing to the official circular — never a source of rates.
 */
export const ARTICLE_KINDS = ["CIRCULAR", "NOTIFICATION", "EXTENSION", "SOP", "FAQ"] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

/** Link targets. The table stores one code column, so non-type targets are stored with a prefix (D-collab-1). */
export const LINK_TYPES = ["COMPLIANCE_TYPE", "EXTENSION", "DUE_DATE_RULE"] as const;
export type LinkType = (typeof LINK_TYPES)[number];
const PREFIX: Record<LinkType, string> = { COMPLIANCE_TYPE: "", EXTENSION: "EXT:", DUE_DATE_RULE: "RULE:" };

export function encodeLink(entityType: LinkType, entityId: string) {
  return `${PREFIX[entityType]}${entityId}`;
}
export function decodeLink(code: string): { entityType: LinkType; entityId: string } {
  if (code.startsWith("EXT:")) return { entityType: "EXTENSION", entityId: code.slice(4) };
  if (code.startsWith("RULE:")) return { entityType: "DUE_DATE_RULE", entityId: code.slice(5) };
  return { entityType: "COMPLIANCE_TYPE", entityId: code };
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const tags = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((t) => String(t).trim()).filter(Boolean);

const articleInput = z.object({
  title: z.string().trim().min(3, "Give a title").max(200),
  body: z.string().trim().min(10, "Write the article"),
  kind: z.enum(ARTICLE_KINDS),
  serviceLine: z.preprocess(blank, z.enum(SERVICE_LINES).nullable().optional()),
  sourceRef: z.string().trim().max(300).default(""),
  tags: z.preprocess(tags, z.array(z.string().max(40)).max(20)).default([]),
  publish: z.boolean().default(true),
});
export type ArticleInput = z.input<typeof articleInput>;

function writer(actor: Actor) {
  requireStaff(actor);
  authorize(actor, "knowledge.write");
  return actor.userId;
}

async function createArticleTx(tx: Tx, actor: Actor, d: z.infer<typeof articleInput>, extraTags: string[] = []) {
  const userId = actor.kind === "USER" ? actor.userId : null;
  const tagSet = [...new Set([...d.tags, ...extraTags])];
  const a = await tx.knowledgeArticle.create({
    data: {
      title: d.title, body: d.body, kind: d.kind, serviceLine: d.serviceLine ?? null, sourceRef: d.sourceRef, tagsCsv: tagSet.join(","),
      publishedAt: d.publish ? new Date() : null, createdById: userId, updatedById: userId,
    },
  });
  await writeAudit(tx, actor, { entityType: "KnowledgeArticle", entityId: a.id, action: "CREATE", after: { title: a.title, kind: a.kind, serviceLine: a.serviceLine, published: d.publish } });
  return a;
}

export async function createArticle(actor: Actor, input: ArticleInput) {
  writer(actor);
  const d = parse(articleInput, input);
  return transaction((tx) => createArticleTx(tx, actor, d));
}

/** Used by the helpdesk "convert to FAQ" inside its own transaction. */
export async function createFaqTx(tx: Tx, actor: Actor, input: { title: string; body: string; serviceLine?: string | null }) {
  const d = parse(articleInput, { title: input.title, body: input.body, kind: "FAQ", serviceLine: input.serviceLine ?? null, tags: ["FAQ"], publish: true });
  return createArticleTx(tx, actor, d, ["FAQ"]);
}

export async function updateArticle(actor: Actor, id: string, input: Partial<ArticleInput>) {
  writer(actor);
  const d = parsePartial(articleInput, input);
  return transaction(async (tx) => {
    const before = await tx.knowledgeArticle.findUnique({ where: { id } });
    if (!before) throw notFound("Article");
    const { tags: t, publish, ...rest } = d;
    const after = await tx.knowledgeArticle.update({
      where: { id },
      data: {
        ...rest,
        ...(t !== undefined ? { tagsCsv: t.join(",") } : {}),
        ...(publish !== undefined ? { publishedAt: publish ? (before.publishedAt ?? new Date()) : null } : {}),
        updatedById: actor.kind === "USER" ? actor.userId : null,
      },
    });
    await writeAudit(tx, actor, { entityType: "KnowledgeArticle", entityId: id, action: "UPDATE", before, after });
    return after;
  });
}

export type ArticleFilter = { q?: string; kind?: string; serviceLine?: string; tag?: string; includeDrafts?: boolean };

/** Search title, body and tags; non-writers see published articles only. Newest first. */
export async function listArticles(actor: Actor, f: ArticleFilter = {}) {
  requireStaff(actor);
  const drafts = f.includeDrafts && can(actor, "knowledge.write");
  const q = f.q?.trim();
  const rows = await db().knowledgeArticle.findMany({
    where: {
      AND: [
        drafts ? {} : { publishedAt: { not: null } },
        f.kind ? { kind: f.kind } : {},
        f.serviceLine ? { serviceLine: f.serviceLine } : {},
        f.tag ? { tagsCsv: { contains: f.tag } } : {},
        q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }, { tagsCsv: { contains: q } }, { sourceRef: { contains: q } }] } : {},
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const reads = await readCounts(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, tags: r.tagsCsv ? r.tagsCsv.split(",") : [], readBy: reads.get(r.id) ?? 0 }));
}

/** Distinct people who logged 'Knowledge Updates' time against each article (spec 13.4). Counts only. */
export async function readCounts(articleIds: string[]) {
  if (!articleIds.length) return new Map<string, number>();
  const rows = await db().workEntry.groupBy({ by: ["knowledgeArticleId", "userId"], where: { knowledgeArticleId: { in: articleIds }, deletedAt: null } });
  const out = new Map<string, number>();
  for (const r of rows) if (r.knowledgeArticleId) out.set(r.knowledgeArticleId, (out.get(r.knowledgeArticleId) ?? 0) + 1);
  return out;
}

export async function getArticle(actor: Actor, id: string) {
  requireStaff(actor);
  const a = await db().knowledgeArticle.findUnique({ where: { id }, include: { links: true } });
  if (!a) throw notFound("Article");
  if (!a.publishedAt && !can(actor, "knowledge.write")) throw forbidden();
  const typeCodes = a.links.map((l) => decodeLink(l.complianceTypeCode)).filter((l) => l.entityType === "COMPLIANCE_TYPE").map((l) => l.entityId);
  const types = new Map((await db().complianceType.findMany({ where: { code: { in: typeCodes } }, select: { code: true, name: true } })).map((t) => [t.code, t.name]));
  const people = await db().user.findMany({ where: { id: { in: [a.createdById, a.updatedById].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
  const names = new Map(people.map((p) => [p.id, p.displayName]));
  const myRead = await db().workEntry.count({ where: { knowledgeArticleId: id, userId: actor.userId, deletedAt: null } });
  return {
    ...a,
    tags: a.tagsCsv ? a.tagsCsv.split(",") : [],
    links: a.links.map((l) => {
      const d = decodeLink(l.complianceTypeCode);
      return { id: l.id, ...d, label: d.entityType === "COMPLIANCE_TYPE" ? `${types.get(d.entityId) ?? d.entityId} (${d.entityId})` : d.entityType === "EXTENSION" ? "Due-date extension" : "Due-date rule change" };
    }),
    readBy: (await readCounts([id])).get(id) ?? 0,
    readByMe: myRead > 0,
    createdByName: a.createdById ? names.get(a.createdById) ?? "" : "",
    updatedByName: a.updatedById ? names.get(a.updatedById) ?? "" : "",
  };
}

/**
 * Link an article to a compliance type, a published extension or a due-date rule (spec 13.4: "linked from the
 * Due-Date Master when a change is made"). Allowed for knowledge writers and Due-Date Master managers. Idempotent.
 */
export async function linkArticle(actor: Actor, articleId: string, entityType: LinkType, entityId: string) {
  requireStaff(actor);
  if (!can(actor, "knowledge.write") && !can(actor, "dueDateMaster.manage")) throw forbidden();
  if (!LINK_TYPES.includes(entityType)) throw new DomainError("VALIDATION", "Unknown link type.");
  const article = await db().knowledgeArticle.findUnique({ where: { id: articleId } });
  if (!article) throw notFound("Article");
  const exists =
    entityType === "COMPLIANCE_TYPE" ? await db().complianceType.count({ where: { code: entityId } })
      : entityType === "EXTENSION" ? await db().extension.count({ where: { id: entityId } })
        : await db().dueDateRule.count({ where: { id: entityId } });
  if (!exists) throw notFound(entityType === "COMPLIANCE_TYPE" ? "Compliance type" : entityType === "EXTENSION" ? "Extension" : "Due-date rule");
  const code = encodeLink(entityType, entityId);
  return transaction(async (tx) => {
    const existing = await tx.knowledgeArticleLink.findUnique({ where: { articleId_complianceTypeCode: { articleId, complianceTypeCode: code } } });
    if (existing) return existing;
    const l = await tx.knowledgeArticleLink.create({ data: { articleId, complianceTypeCode: code, createdById: actor.userId } });
    await writeAudit(tx, actor, { entityType: "KnowledgeArticleLink", entityId: l.id, action: "CREATE", after: { articleId, entityType, entityId } });
    return l;
  });
}

export async function unlinkArticle(actor: Actor, linkId: string) {
  requireStaff(actor);
  if (!can(actor, "knowledge.write") && !can(actor, "dueDateMaster.manage")) throw forbidden();
  await transaction(async (tx) => {
    const l = await tx.knowledgeArticleLink.findUnique({ where: { id: linkId } });
    if (!l) throw notFound("Link");
    await tx.knowledgeArticleLink.delete({ where: { id: linkId } });
    await writeAudit(tx, actor, { entityType: "KnowledgeArticleLink", entityId: linkId, action: "DELETE", before: { articleId: l.articleId, code: l.complianceTypeCode } });
  });
}

/** Articles linked to a compliance type / extension / rule — for the Due-Date Master pages. */
export async function articlesLinkedTo(actor: Actor, entityType: LinkType, entityId: string) {
  requireStaff(actor);
  const links = await db().knowledgeArticleLink.findMany({ where: { complianceTypeCode: encodeLink(entityType, entityId) }, include: { article: true } });
  return links.filter((l) => l.article.publishedAt || can(actor, "knowledge.write")).map((l) => ({ linkId: l.id, id: l.article.id, title: l.article.title, kind: l.article.kind }));
}

/** Published articles for pickers (e.g. the 'Knowledge Updates' work entry). */
export async function knowledgeArticleOptions(actor: Actor) {
  requireStaff(actor);
  const rows = await db().knowledgeArticle.findMany({ where: { publishedAt: { not: null } }, select: { id: true, title: true, kind: true }, orderBy: { publishedAt: "desc" }, take: 200 });
  return rows.map((r) => ({ id: r.id, name: `${r.title} (${r.kind.toLowerCase()})` }));
}

/** Compliance types for the link picker. */
export async function complianceTypeOptions() {
  const rows = await db().complianceType.findMany({ where: { active: true }, select: { code: true, name: true }, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ id: r.code, name: `${r.name} (${r.code})` }));
}
