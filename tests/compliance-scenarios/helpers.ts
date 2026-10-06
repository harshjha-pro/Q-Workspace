import { COMPLIANCE_MASTER, GST_STATE_GROUPS } from "@/prisma/seed/compliance-master";
import type { ClientSnapshot, ComplianceTypeDef, DueRuleDef, ExistingTask, TaskCreate } from "@/server/compliance-engine";
import { obligationsFor, planGeneration, naturalKey } from "@/server/compliance-engine";

export const TYPES = new Map<string, ComplianceTypeDef>(COMPLIANCE_MASTER.map((r) => [r.code, r]));
export const RULES = new Map<string, DueRuleDef[]>(COMPLIANCE_MASTER.map((r) => [r.code, [{ complianceTypeCode: r.code, version: 1, effectiveFrom: "2017-04-01", params: r.rule }]]));
export const GROUPS = new Map(Object.entries(GST_STATE_GROUPS));
export const NO_HOLIDAYS = { dates: new Set<string>(), workingSaturdays: true };

export function client(over: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    id: "c1", constitution: "PRIVATE_COMPANY", status: "ACTIVE", stateCode: "MH", fyEnd: "03-31", trackingFrom: "2026-04-01",
    flags: {}, gstins: [], directors: [], ptRegistrations: [], events: {}, ...over,
  };
}

export const flag = (from: string, value = true) => [{ from, value }];

export function generate(c: ClientSnapshot, today: string, existing: TaskCreate[] | ExistingTask[] = [], over: Partial<Parameters<typeof planGeneration>[0]> = {}) {
  return planGeneration({
    client: c, obligations: obligationsFor(c), types: TYPES, rules: RULES,
    existingKeys: new Set(existing.map((t) => naturalKey(t.typeCode, t.partyKey, t.periodKey))),
    today, holidays: NO_HOLIDAYS, stateGroups: GROUPS, gstinStates: new Map(c.gstins.map((g) => [g.id, g.stateCode])),
    partyLabels: new Map(), agmCeilingMonths: 6, firstAgmCeilingMonths: 9, ...over,
  });
}

/** Turn planned creates into "existing" tasks for follow-up steps. */
export function asExisting(creates: TaskCreate[], status: ExistingTask["status"] = "UPCOMING"): ExistingTask[] {
  return creates.map((t, i) => ({
    id: `t${i}`, clientId: t.clientId, typeCode: t.typeCode, partyKey: t.partyKey, periodKey: t.periodKey, periodStart: t.periodStart,
    status, originalDueDate: t.dueDate, effectiveDueDate: t.dueDate, isProvisional: t.isProvisional, filedDate: null,
  }));
}

export const only = (ts: { typeCode: string }[], code: string) => ts.filter((t) => t.typeCode === code);
