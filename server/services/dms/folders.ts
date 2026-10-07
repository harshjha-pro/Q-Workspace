import { db, transaction, type Tx } from "../../lib/db";
import { notFound, ruleViolation } from "../../lib/errors";
import { systemActor, type Actor } from "../../permissions/actor";
import { assertEngagementAccess } from "../../permissions/scopes";
import { writeAudit } from "../../audit";
import { fyKey, fyStartYear, todayIst } from "../../lib/dates";

/**
 * Folder structure per client → engagement → period (spec 13.1), created on demand and
 * idempotently: calling ensureFolders again returns the same rows. Other modules call it to file
 * generated documents (notices, UDIN, portal uploads, letters).
 */
export type EnsuredFolders = {
  client: { id: string; path: string };
  engagement: { id: string; path: string } | null;
  period: { id: string; path: string } | null;
};

/** "FY2025-26" from an engagement's name ("… FY 2025-26" / "… AY 2026-27"), start date, or today. */
export function defaultPeriodKey(e: { name?: string | null; startDate?: string | null } | null, today = todayIst()): string {
  const fy = e?.name?.match(/FY\s?(\d{4})-(\d{2})/i);
  if (fy) return `FY${fy[1]}-${fy[2]}`;
  const ay = e?.name?.match(/AY\s?(\d{4})-(\d{2})/i);
  if (ay) return fyKey(Number(ay[1]) - 1);
  return fyKey(fyStartYear(e?.startDate ?? today));
}

export const PERIOD_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,30}$/;

async function findOrCreate(
  tx: Tx, actor: Actor,
  key: { kind: string; clientId: string; engagementId: string | null; periodKey: string | null },
  data: { name: string; path: string; parentId: string | null },
) {
  const found = await tx.folder.findFirst({ where: key, orderBy: { createdAt: "asc" } });
  if (found) return found;
  const f = await tx.folder.create({ data: { ...key, ...data, createdById: actor.kind === "PORTAL" ? null : actor.userId } });
  await writeAudit(tx, actor, { entityType: "Folder", entityId: f.id, action: "CREATE", after: { path: f.path, kind: f.kind } });
  return f;
}

export async function ensureFolders(
  clientId: string, engagementId?: string | null, periodKey?: string | null,
  opts: { tx?: Tx; actor?: Actor } = {},
): Promise<EnsuredFolders> {
  const actor = opts.actor ?? systemActor();
  if (periodKey && !PERIOD_KEY_RE.test(periodKey)) throw ruleViolation("Period must be short letters/digits, e.g. FY2026-27.");
  const run = async (tx: Tx): Promise<EnsuredFolders> => {
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true, code: true, name: true } });
    if (!client) throw notFound("Client");
    const cf = await findOrCreate(tx, actor, { kind: "CLIENT", clientId, engagementId: null, periodKey: null }, { name: `${client.code} · ${client.name}`, path: client.code, parentId: null });
    if (!engagementId) return { client: cf, engagement: null, period: null };
    const e = await tx.engagement.findUnique({ where: { id: engagementId }, select: { id: true, code: true, name: true, clientId: true } });
    if (!e) throw notFound("Engagement");
    if (e.clientId !== clientId) throw ruleViolation("That engagement belongs to another client.");
    const ef = await findOrCreate(tx, actor, { kind: "ENGAGEMENT", clientId, engagementId, periodKey: null }, { name: `${e.code} · ${e.name}`, path: `${client.code}/${e.code}`, parentId: cf.id });
    if (!periodKey) return { client: cf, engagement: ef, period: null };
    const pf = await findOrCreate(tx, actor, { kind: "PERIOD", clientId, engagementId, periodKey }, { name: periodKey, path: `${client.code}/${e.code}/${periodKey}`, parentId: ef.id });
    return { client: cf, engagement: ef, period: pf };
  };
  return opts.tx ? run(opts.tx) : transaction(run);
}

// ---------------------------------------------------------------------------
// Audit file index (spec 13.1): standard sections and completeness before Partner sign-off
// ---------------------------------------------------------------------------

export const AUDIT_SECTIONS = [
  { code: "PLANNING", name: "Planning" },
  { code: "RISK", name: "Risk assessment" },
  { code: "FIELDWORK", name: "Fieldwork" },
  { code: "QUERIES", name: "Queries" },
  { code: "REPORTS", name: "Reports" },
] as const;
export const AUDIT_SECTION_CODES = AUDIT_SECTIONS.map((s) => s.code) as string[];

export const isAuditEngagement = (e: { serviceLine: string; engagementType: string }) => e.serviceLine === "AUDIT" || e.engagementType === "AUDIT";

/** Create the five standard sections for an audit engagement (idempotent). */
export async function ensureAuditSections(engagementId: string, opts: { tx?: Tx; actor?: Actor } = {}) {
  const actor = opts.actor ?? systemActor();
  const run = async (tx: Tx) => {
    const existing = new Set((await tx.auditFileSection.findMany({ where: { engagementId }, select: { code: true } })).map((s) => s.code));
    for (const s of AUDIT_SECTIONS) {
      if (existing.has(s.code)) continue;
      const row = await tx.auditFileSection.create({ data: { engagementId, code: s.code, name: s.name, createdById: actor.kind === "PORTAL" ? null : actor.userId } });
      await writeAudit(tx, actor, { entityType: "AuditFileSection", entityId: row.id, action: "CREATE", after: { engagementId, code: s.code } });
    }
  };
  return opts.tx ? run(opts.tx) : transaction(run);
}

export type AuditFileCompleteness = {
  applicable: boolean;
  percent: number;
  sections: { id: string; code: string; name: string; required: boolean; complete: boolean; documentCount: number }[];
};

/**
 * Completeness = completed required sections ÷ required sections. A section counts only when it is
 * ticked complete (a section cannot be ticked while it holds no document). Non-audit engagements
 * report applicable=false and 100%.
 */
export async function auditFileCompleteness(engagementId: string): Promise<AuditFileCompleteness> {
  const e = await db().engagement.findUnique({ where: { id: engagementId }, select: { serviceLine: true, engagementType: true } });
  if (!e) throw notFound("Engagement");
  if (!isAuditEngagement(e)) return { applicable: false, percent: 100, sections: [] };
  await ensureAuditSections(engagementId);
  const [rows, counts] = await Promise.all([
    db().auditFileSection.findMany({ where: { engagementId } }),
    db().document.groupBy({ by: ["auditSectionCode"], where: { engagementId, archivedAt: null, auditSectionCode: { not: null } }, _count: { _all: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.auditSectionCode, c._count._all]));
  const order = (code: string) => AUDIT_SECTION_CODES.indexOf(code);
  const sections = rows
    .sort((a, b) => order(a.code) - order(b.code))
    .map((s) => ({ id: s.id, code: s.code, name: s.name, required: s.required, complete: s.complete, documentCount: countBy.get(s.code) ?? 0 }));
  const req = sections.filter((s) => s.required);
  const percent = req.length ? Math.round((req.filter((s) => s.complete).length / req.length) * 100) : 100;
  return { applicable: true, percent, sections };
}

/** Tick / untick a section, or mark it not required. Manager (team) or Partner. */
export async function updateAuditSection(actor: Actor, sectionId: string, input: { complete?: boolean; required?: boolean }) {
  const s = await db().auditFileSection.findUnique({ where: { id: sectionId } });
  if (!s) throw notFound("Audit file section");
  await assertEngagementAccess(actor, "engagement.manage", s.engagementId);
  if (input.complete) {
    const docs = await db().document.count({ where: { engagementId: s.engagementId, auditSectionCode: s.code, archivedAt: null } });
    if (!docs) throw ruleViolation(`File at least one document under ${s.name} before marking it complete.`);
  }
  return transaction(async (tx) => {
    const row = await tx.auditFileSection.update({
      where: { id: sectionId },
      data: { ...(input.complete !== undefined ? { complete: input.complete } : {}), ...(input.required !== undefined ? { required: input.required } : {}), updatedById: actor.kind === "PORTAL" ? null : actor.userId },
    });
    await writeAudit(tx, actor, { entityType: "AuditFileSection", entityId: sectionId, action: "UPDATE", before: s, after: row });
    return row;
  });
}
