import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { can } from "../../permissions/guards";
import { writeAudit, logSensitiveView } from "../../audit";
import { addDays } from "../../lib/dates";
import { zIsoDate } from "../../domain/enums";
import { idOf, isSalaryAdmin } from "./common";

/**
 * Internal cost of an hour per designation (Q-22): Partner or HR set ₹/hour, effective-dated. Read by
 * server/services/costs.ts for realization. Visible only to Partner and HR (salary-level data).
 */
function canManage(actor: Actor) {
  return can(actor, "hr.records.manage") || can(actor, "salary.revise.approve");
}

export async function listCostRates(actor: Actor) {
  if (!isSalaryAdmin(actor) || actor.kind === "PORTAL") throw forbidden();
  const designations = await db().designation.findMany({ orderBy: [{ level: "desc" }, { name: "asc" }], include: { costRates: { orderBy: { effectiveFrom: "desc" } }, _count: { select: { users: true } } } });
  await logSensitiveView(actor, "SALARY", "CostRate", "*", "cost rates");
  return designations;
}

const rateInput = z.object({ designationId: z.string().min(1), ratePaisePerHour: z.coerce.number().int().min(0).max(10_000_000), effectiveFrom: zIsoDate });

/** New rate from a date; the open rate before it is closed the day before. */
export async function setCostRate(actor: Actor, input: z.input<typeof rateInput>) {
  if (!canManage(actor)) throw forbidden();
  const d = parse(rateInput, input);
  if (!(await db().designation.count({ where: { id: d.designationId } }))) throw notFound("Designation");
  const clash = await db().costRate.findFirst({ where: { designationId: d.designationId, effectiveFrom: d.effectiveFrom } });
  if (clash) throw new DomainError("VALIDATION", "A rate already starts on that date; pick another date.", { effectiveFrom: "Already used" });
  return transaction(async (tx) => {
    const prev = await tx.costRate.findFirst({ where: { designationId: d.designationId, effectiveFrom: { lt: d.effectiveFrom } }, orderBy: { effectiveFrom: "desc" } });
    if (prev && (!prev.effectiveTo || prev.effectiveTo >= d.effectiveFrom)) {
      await tx.costRate.update({ where: { id: prev.id }, data: { effectiveTo: addDays(d.effectiveFrom, -1), updatedById: idOf(actor) } });
    }
    const next = await tx.costRate.findFirst({ where: { designationId: d.designationId, effectiveFrom: { gt: d.effectiveFrom } }, orderBy: { effectiveFrom: "asc" } });
    const row = await tx.costRate.create({ data: { ...d, effectiveTo: next ? addDays(next.effectiveFrom, -1) : null, createdById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "CostRate", entityId: row.id, action: "CREATE", after: row });
    return row;
  });
}
