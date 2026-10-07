import { db } from "../lib/db";
import { formatDate, todayIst, fyLabel, fyStartYear } from "../lib/dates";
import { CONSTITUTION_LABELS, type Constitution } from "../domain/enums";

/**
 * Merge fields for templates (spec 13.3): {{client.name}}, {{engagement.fee}}, {{employee.name}}…
 * Unknown fields are left visible as [[field]] and reported, so a letter never goes out with a gap
 * nobody noticed.
 */
export type MergeData = Record<string, Record<string, string>>;

export function renderMerge(body: string, data: MergeData): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(/\{\{\s*([a-zA-Z]+)\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, group: string, field: string) => {
    const v = data[group]?.[field];
    if (v === undefined || v === "") {
      missing.add(`${group}.${field}`);
      return `[[${group}.${field}]]`;
    }
    return v;
  });
  return { text, missing: [...missing] };
}

export function fieldsIn(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z]+\.[a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!))];
}

const inr = (paise: number) => `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Build merge data from whichever records the document is about. Callers check permissions first. */
export async function mergeDataFor(ctx: { clientId?: string | null; engagementId?: string | null; userId?: string | null; extra?: Record<string, string>; fallback?: MergeData }): Promise<MergeData> {
  const data = await baseMergeData(ctx);
  // Fallback values fill fields the records leave empty — e.g. a letter for a lead, before its client and
  // engagement exist, takes the client name and fee from the lead and the proposal.
  for (const [group, fields] of Object.entries(ctx.fallback ?? {})) {
    data[group] ??= {};
    for (const [k, v] of Object.entries(fields)) if (!data[group]![k] && v) data[group]![k] = v;
  }
  return data;
}

async function baseMergeData(ctx: { clientId?: string | null; engagementId?: string | null; userId?: string | null; extra?: Record<string, string> }): Promise<MergeData> {
  const today = todayIst();
  const firm = await db().firmProfile.findFirst();
  const data: MergeData = {
    today: { date: formatDate(today), fy: fyLabel(fyStartYear(today)) },
    firm: { name: firm?.name ?? "", address: firm?.address ?? "", gstin: firm?.gstin ?? "", pan: firm?.pan ?? "", email: firm?.email ?? "", phone: firm?.phone ?? "" },
    extra: ctx.extra ?? {},
  };
  const engagement = ctx.engagementId ? await db().engagement.findUnique({ where: { id: ctx.engagementId } }) : null;
  const clientId = ctx.clientId ?? engagement?.clientId ?? null;
  if (clientId) {
    const c = await db().client.findUnique({ where: { id: clientId }, include: { contacts: { where: { isPrimary: true }, take: 1 }, partner: true, manager: true } });
    if (c) {
      data.client = {
        name: c.name, code: c.code, pan: c.pan ?? "", tan: c.tan ?? "", cin: c.cinLlpin ?? "", constitution: CONSTITUTION_LABELS[c.constitution as Constitution] ?? c.constitution,
        address: c.address ?? "", contactName: c.contacts[0]?.name ?? "", contactEmail: c.contacts[0]?.email ?? "", partner: c.partner?.displayName ?? "", manager: c.manager?.displayName ?? "",
      };
    }
  }
  if (engagement) {
    const people = new Map((await db().user.findMany({ where: { id: { in: [engagement.partnerId, engagement.managerId].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    data.engagement = {
      name: engagement.name, code: engagement.code, fee: inr(engagement.feePaise), feeBasis: engagement.feeBasis, budgetHours: String(Math.round(engagement.budgetMinutes / 60)),
      startDate: engagement.startDate ? formatDate(engagement.startDate) : "", partner: people.get(engagement.partnerId ?? "") ?? "", manager: people.get(engagement.managerId ?? "") ?? "",
    };
  }
  if (ctx.userId) {
    const u = await db().user.findUnique({ where: { id: ctx.userId }, include: { designation: true, employeeProfile: true } });
    if (u) {
      data.employee = {
        name: u.displayName, designation: u.designation?.name ?? "", joiningDate: u.employeeProfile?.joiningDate ? formatDate(u.employeeProfile.joiningDate) : "",
        employeeCode: u.employeeProfile?.employeeCode ?? "",
      };
    }
  }
  return data;
}
