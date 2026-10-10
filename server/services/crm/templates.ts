import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { pastActuals } from "../analytics/estimates";
import { parse, parsePartial } from "../../lib/validate";
import { DomainError, forbidden, notFound } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { FEE_BASES, SERVICE_LINES } from "../../domain/enums";
import { fyStartYear, isoFromParts, todayIst } from "../../lib/dates";
import { idOf } from "./common";

/**
 * Service templates (spec 10.2): the building blocks of proposals. Since the Q-39 migration the template
 * carries its engagement type and effort placeholder (`budgetMinutes`) as columns. Templates saved before it
 * fall back to deriving the type from the service line + name and to an "Estimated effort: 60 hrs" line in
 * `timelines` (D-77).
 */
const templateInput = z.object({
  serviceLine: z.enum(SERVICE_LINES),
  name: z.string().trim().min(3).max(120),
  scope: z.string().max(8000).default(""),
  deliverables: z.string().max(8000).default(""),
  timelines: z.string().max(4000).default(""),
  feeBasis: z.enum(FEE_BASES).default("FIXED"),
  defaultFeePaise: z.number().int().min(0).default(0),
  oopTerms: z.string().max(4000).default(""),
  engagementType: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullable().default(null)),
  budgetMinutes: z.number().int().min(0).multipleOf(15, "Effort is in 15-minute steps").default(0),
  active: z.boolean().default(true),
});
export type ServiceTemplateInput = z.input<typeof templateInput>;

/** Templates are firm-wide standards: Partners and the Practice Admin maintain them. */
function assertTemplateAdmin(actor: Actor) {
  const scope = authorize(actor, "crm.manage");
  if (scope !== "firm") throw forbidden("Only a Partner or the Practice Admin can change service templates.");
}

export async function listServiceTemplates(actor: Actor, opts: { includeInactive?: boolean } = {}) {
  authorize(actor, "crm.view");
  return db().serviceTemplate.findMany({ where: opts.includeInactive ? {} : { active: true }, orderBy: [{ serviceLine: "asc" }, { name: "asc" }] });
}

/** Engagement types a template can name (the active stage templates). */
export async function listEngagementTypes(actor: Actor) {
  authorize(actor, "crm.view");
  return db().stageTemplate.findMany({ where: { active: true }, select: { code: true, name: true }, orderBy: { name: "asc" } });
}

export async function saveServiceTemplate(actor: Actor, input: ServiceTemplateInput, id?: string) {
  assertTemplateAdmin(actor);
  const d = id ? parsePartial(templateInput, input) : parse(templateInput, input);
  if (d.engagementType && !(await db().stageTemplate.findUnique({ where: { code: d.engagementType } })))
    throw new DomainError("VALIDATION", `Unknown engagement type ${d.engagementType}.`, { engagementType: "Choose a type" });
  return transaction(async (tx) => {
    const before = id ? await tx.serviceTemplate.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound("Service template");
    const row = id
      ? await tx.serviceTemplate.update({ where: { id }, data: { ...d, updatedById: idOf(actor) } })
      : await tx.serviceTemplate.create({ data: { ...(d as z.infer<typeof templateInput>), createdById: idOf(actor), updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "ServiceTemplate", entityId: row.id, action: id ? "UPDATE" : "CREATE", before, after: row });
    return row;
  });
}

/** "Estimated effort: 60 hrs" in the template's timelines → 3600 minutes. */
export function effortPlaceholderMinutes(timelines: string): number {
  const m = /estimated effort:\s*(\d+(?:\.\d+)?)\s*h/i.exec(timelines);
  return m ? Math.round(Number(m[1]) * 4) * 15 : 0;
}

const TYPE_HINTS: [RegExp, string][] = [
  [/\btds\b|\btcs\b/i, "TDS_RETURN"],
  [/payroll|\bpf\b|\besi\b|provident/i, "PAYROLL_STATUTORY"],
  [/audit/i, "AUDIT"],
  [/\bgst\b/i, "GST_RETURN"],
  [/\bitr\b|income[- ]tax return/i, "INCOME_TAX_RETURN"],
  [/\broc\b|annual filing|secretarial|mca/i, "ROC_ANNUAL"],
  [/bookkeeping|accounting|books/i, "BOOKKEEPING"],
  [/notice|assessment|scrutiny/i, "NOTICE"],
];
const LINE_DEFAULT: Record<string, string> = {
  GST: "GST_RETURN", DIRECT_TAX: "INCOME_TAX_RETURN", AUDIT: "AUDIT", COMPANY_LAW: "ROC_ANNUAL", ACCOUNTING: "BOOKKEEPING", ADVISORY: "OTHER",
};
const ONE_TIME_TYPES = new Set(["OTHER", "NOTICE"]);

type TemplateLike = { serviceLine: string; name: string; timelines: string; engagementType: string | null; budgetMinutes: number };

/** The template's own engagement type and effort placeholder, falling back to the pre-Q-39 derivation. */
export function templateSpec(t: TemplateLike) {
  const derived = engagementSpecFor(t.serviceLine, t.name);
  const engagementType = t.engagementType || derived.engagementType;
  const recurrence = t.engagementType ? engagementSpecFor(t.serviceLine, t.name, engagementType).recurrence : derived.recurrence;
  return { engagementType, recurrence, effortMinutes: t.budgetMinutes || effortPlaceholderMinutes(t.timelines) };
}

/** Spec for a proposal: from its service template when it has one (Q-39), else derived from line + title. */
export async function proposalSpec(p: { serviceTemplateId: string | null; serviceLine: string; title: string }) {
  const t = p.serviceTemplateId ? await db().serviceTemplate.findUnique({ where: { id: p.serviceTemplateId } }) : null;
  if (t?.engagementType) {
    const s = templateSpec(t);
    return { engagementType: s.engagementType, recurrence: s.recurrence };
  }
  return engagementSpecFor(p.serviceLine, p.title);
}

/** Engagement type (StageTemplate.code) and recurrence suggested for a service; the user confirms on acceptance. */
export function engagementSpecFor(serviceLine: string, name: string, knownType?: string): { engagementType: string; recurrence: "RECURRING" | "ONE_TIME" } {
  const hit = serviceLine === "ADVISORY" ? undefined : TYPE_HINTS.find(([re]) => re.test(name));
  const engagementType = knownType ?? hit?.[1] ?? LINE_DEFAULT[serviceLine] ?? "OTHER";
  const recurrence = ONE_TIME_TYPES.has(engagementType) || /one[- ]time|project|valuation|registration/i.test(name) ? "ONE_TIME" : "RECURRING";
  return { engagementType, recurrence };
}

/**
 * Budget suggestion from past actuals (spec 10.2 / 8): the median logged hours of similar engagements (same
 * engagement type, completed or started in an earlier financial year; see analytics/estimates, P5-08). Falls back
 * to the template's effort placeholder. Rounded to whole hours.
 */
export async function suggestBudgetMinutes(engagementType: string, fallbackMinutes = 0, today = todayIst()) {
  const a = await pastActuals(engagementType, { today });
  if (a.samples) return { minutes: Math.max(60, Math.round(a.median / 60) * 60), basis: `Median of ${a.samples} past ${a.samples === 1 ? "engagement" : "engagements"}`, samples: a.samples };
  return { minutes: fallbackMinutes, basis: fallbackMinutes ? "Template estimate (no past actuals yet)" : "No past actuals yet", samples: 0 };
}
