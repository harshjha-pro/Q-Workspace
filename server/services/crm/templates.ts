import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse, parsePartial } from "../../lib/validate";
import { forbidden, notFound } from "../../lib/errors";
import { authorize } from "../../permissions/guards";
import type { Actor } from "../../permissions/actor";
import { writeAudit } from "../../audit";
import { FEE_BASES, SERVICE_LINES } from "../../domain/enums";
import { fyStartYear, isoFromParts, todayIst } from "../../lib/dates";
import { idOf } from "./common";

/**
 * Service templates (spec 10.2): the building blocks of proposals. The frozen schema has no columns for
 * the engagement type or an effort estimate, so the effort placeholder is one line in `timelines`
 * ("Estimated effort: 60 hrs") and the engagement type is derived from the service line + name.
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

export async function saveServiceTemplate(actor: Actor, input: ServiceTemplateInput, id?: string) {
  assertTemplateAdmin(actor);
  const d = id ? parsePartial(templateInput, input) : parse(templateInput, input);
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

/** Engagement type (StageTemplate.code) and recurrence suggested for a service; the user confirms on acceptance. */
export function engagementSpecFor(serviceLine: string, name: string): { engagementType: string; recurrence: "RECURRING" | "ONE_TIME" } {
  const hit = serviceLine === "ADVISORY" ? undefined : TYPE_HINTS.find(([re]) => re.test(name));
  const engagementType = hit?.[1] ?? LINE_DEFAULT[serviceLine] ?? "OTHER";
  const recurrence = ONE_TIME_TYPES.has(engagementType) || /one[- ]time|project|valuation|registration/i.test(name) ? "ONE_TIME" : "RECURRING";
  return { engagementType, recurrence };
}

/**
 * Budget suggestion from past actuals (spec 10.2 / 8): the average logged hours of similar engagements
 * (same engagement type) that are completed, or that started in an earlier financial year. Falls back to
 * the template's effort placeholder. Rounded to whole hours.
 */
export async function suggestBudgetMinutes(engagementType: string, fallbackMinutes = 0, today = todayIst()) {
  const fyStart = isoFromParts(fyStartYear(today), 4, 1);
  const similar = await db().engagement.findMany({
    where: { engagementType, OR: [{ status: { in: ["COMPLETED", "ARCHIVED"] } }, { startDate: { lt: fyStart } }], NOT: { name: { endsWith: "(recurring)" } } },
    select: { id: true },
    take: 500,
  });
  if (similar.length) {
    const sums = await db().workEntry.groupBy({ by: ["engagementId"], where: { engagementId: { in: similar.map((s) => s.id) }, deletedAt: null }, _sum: { minutes: true } });
    const logged = sums.map((s) => s._sum.minutes ?? 0).filter((m) => m > 0);
    if (logged.length) {
      const avg = logged.reduce((a, b) => a + b, 0) / logged.length;
      return { minutes: Math.max(60, Math.round(avg / 60) * 60), basis: `Average of ${logged.length} past ${logged.length === 1 ? "engagement" : "engagements"}`, samples: logged.length };
    }
  }
  return { minutes: fallbackMinutes, basis: fallbackMinutes ? "Template estimate (no past actuals yet)" : "No past actuals yet", samples: 0 };
}
