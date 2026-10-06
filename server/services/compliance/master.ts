import type { Tx } from "../../lib/db";
import { db } from "../../lib/db";
import type { ComplianceTypeDef, DueRuleDef, DueRuleParams, HolidayCalendar } from "../../compliance-engine";
import { getSetting, getSettingNumber } from "../settings/service";

export type Family = { code: string; name: string; stageTemplateCode: string; checklistTemplateCode: string | null; reviewLevel: string; requiresSignoff: boolean; requiresUdin: boolean };

export type Master = {
  types: Map<string, ComplianceTypeDef & { ackType: string; serviceLine: string; name: string }>;
  rules: Map<string, DueRuleDef[]>;
  families: Map<string, Family>;
  stateGroups: Map<string, string>;
  holidays: HolidayCalendar;
  agmCeilingMonths: number;
  firstAgmCeilingMonths: number;
  trackingFrom: string;
};

/** Load the Due-Date Master into engine shapes. Inactive types are left out (no generation). */
export async function loadMaster(tx: Tx = db()): Promise<Master> {
  const [types, rules, families, groups, holidays] = await Promise.all([
    tx.complianceType.findMany({ where: { active: true } }),
    tx.dueDateRule.findMany({ where: { status: "ACTIVE" } }),
    tx.stageTemplateFamily.findMany(),
    tx.gstStateGroup.findMany({ orderBy: { effectiveFrom: "asc" } }),
    tx.holiday.findMany({ where: { stateCode: "-" } }),
  ]);
  const ruleMap = new Map<string, DueRuleDef[]>();
  for (const r of rules) {
    const list = ruleMap.get(r.complianceTypeCode) ?? [];
    list.push({ complianceTypeCode: r.complianceTypeCode, version: r.version, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, params: JSON.parse(r.paramsJson) as DueRuleParams });
    ruleMap.set(r.complianceTypeCode, list);
  }
  return {
    types: new Map(types.map((t) => [t.code, {
      code: t.code, name: t.name, shortName: t.shortName, frequency: t.frequency as never, periodBasis: t.periodBasis as never, partyBasis: t.partyBasis as never,
      familyCode: t.familyCode, weekendHolidayPolicy: t.weekendHolidayPolicy as never, isClosure: t.isClosure, ackType: t.ackType, serviceLine: t.serviceLine,
    }])),
    rules: ruleMap,
    families: new Map(families.map((f) => [f.code, f])),
    stateGroups: new Map(groups.map((g) => [g.stateCode, g.groupCode])),
    holidays: { dates: new Set(holidays.map((h) => h.date)), workingSaturdays: await getSetting<boolean>("work.workingSaturdays", true) },
    agmCeilingMonths: await getSettingNumber("compliance.agmCeilingMonths", 6),
    firstAgmCeilingMonths: await getSettingNumber("compliance.firstAgmCeilingMonths", 9),
    trackingFrom: await getSetting<string>("compliance.trackingFrom", "2026-04-01"),
  };
}
