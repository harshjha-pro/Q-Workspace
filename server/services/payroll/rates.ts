import { z } from "zod";
import { db, transaction } from "../../lib/db";
import { parse } from "../../lib/validate";
import { DomainError, forbidden, notFound, ruleViolation } from "../../lib/errors";
import type { Actor } from "../../permissions/actor";
import { authorize, can } from "../../permissions/guards";
import { writeAudit } from "../../audit";
import { zIsoDate } from "../../domain/enums";
import { requiredTaxKeys, type Regime, type TaxParams, type TaxSlabRow, type PfRateRow, type EsiRateRow, type PtSlabRow } from "../../payroll-engine";
import { assertPayrollRole, fyCode, idOf } from "./common";

/** Everything the engine needs for one FY, loaded once per run. */
export type RateBook = {
  pf: PfRateRow[];
  esi: EsiRateRow[];
  pt: PtSlabRow[];
  slabs: Record<Regime, TaxSlabRow[]>;
  params: Record<Regime, TaxParams>;
};

export async function loadRateBook(fyStart: number): Promise<RateBook> {
  const fy = fyCode(fyStart);
  const [pf, esi, pt, slabs, params] = await Promise.all([
    db().pfRate.findMany(), db().esiRate.findMany(), db().professionalTaxSlab.findMany(),
    db().incomeTaxSlab.findMany({ where: { fy } }), db().taxParameter.findMany({ where: { fy } }),
  ]);
  const paramsFor = (regime: Regime): TaxParams => {
    const out: TaxParams = {};
    for (const p of params.filter((x) => x.regime === "ANY")) out[p.key] = p.valueInt;
    for (const p of params.filter((x) => x.regime === regime)) out[p.key] = p.valueInt;
    return out;
  };
  return {
    pf, esi, pt,
    slabs: { NEW: slabs.filter((s) => s.regime === "NEW"), OLD: slabs.filter((s) => s.regime === "OLD") },
    params: { NEW: paramsFor("NEW"), OLD: paramsFor("OLD") },
  };
}

/** A run cannot be computed on a missing table: say exactly what to add. */
export function missingTaxSetup(book: RateBook, regime: Regime, fyStart: number): string | null {
  const missing = requiredTaxKeys(regime).filter((k) => book.params[regime][k] === undefined);
  if (book.slabs[regime].length === 0) missing.unshift("income-tax slabs");
  return missing.length ? `${fyCode(fyStart)} ${regime === "NEW" ? "new" : "old"} regime is missing: ${missing.join(", ")}. Add them under Payroll → Statutory rates.` : null;
}

// ---------------------------------------------------------------------------
// Statutory tables page (HR / Partner add rows; a Partner verifies — D-17)
// ---------------------------------------------------------------------------
export const RATE_TABLES = ["PF", "ESI", "PT", "SLAB", "PARAM", "STIPEND"] as const;
export type RateTable = (typeof RATE_TABLES)[number];

export async function listRateTables(actor: Actor) {
  assertPayrollRole(actor);
  const [pf, esi, pt, slabs, params, stipend] = await Promise.all([
    db().pfRate.findMany({ orderBy: { effectiveFrom: "desc" } }),
    db().esiRate.findMany({ orderBy: { effectiveFrom: "desc" } }),
    db().professionalTaxSlab.findMany({ orderBy: [{ stateCode: "asc" }, { effectiveFrom: "desc" }, { gender: "asc" }, { fromPaise: "asc" }] }),
    db().incomeTaxSlab.findMany({ orderBy: [{ fy: "desc" }, { regime: "asc" }, { fromPaise: "asc" }] }),
    db().taxParameter.findMany({ orderBy: [{ fy: "desc" }, { regime: "asc" }, { key: "asc" }] }),
    db().stipendMinimum.findMany({ orderBy: [{ institute: "asc" }, { locationClass: "asc" }, { yearOfTraining: "asc" }] }),
  ]);
  return { pf, esi, pt, slabs, params, stipend };
}

const paise = z.coerce.number().int().min(0);
const bpInt = z.coerce.number().int().min(0).max(10_000);
const fyStr = z.string().regex(/^FY\d{4}-\d{2}$/, "Use FY2026-27");
const src = z.string().trim().min(3, "Give the source (notification / circular)");

const schemas = {
  PF: z.object({ effectiveFrom: zIsoDate, employeeBp: bpInt, employerEpfBp: bpInt, employerEpsBp: bpInt, epsWageCeilingPaise: paise, pfWageCeilingPaise: paise, adminBp: bpInt.default(0), edliBp: bpInt.default(0), source: src }),
  ESI: z.object({ effectiveFrom: zIsoDate, employeeBp: bpInt, employerBp: bpInt, wageCeilingPaise: paise, source: src }),
  PT: z.object({ stateCode: z.string().trim().toUpperCase().min(2).max(3), fromPaise: paise, toPaise: paise.nullable().default(null), amountPaise: paise, gender: z.enum(["ANY", "M", "F"]).default("ANY"), overrideMonth: z.coerce.number().int().min(1).max(12).nullable().default(null), overrideAmountPaise: paise.nullable().default(null), effectiveFrom: zIsoDate, source: src }),
  SLAB: z.object({ fy: fyStr, regime: z.enum(["NEW", "OLD"]), fromPaise: paise, toPaise: paise.nullable().default(null), rateBp: bpInt, source: src }),
  PARAM: z.object({ fy: fyStr, regime: z.enum(["ANY", "NEW", "OLD"]).default("ANY"), key: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]+$/, "Letters, digits and _"), valueInt: z.coerce.number().int(), unit: z.enum(["PAISE", "BP", "FLAG"]).default("PAISE"), source: src }),
  STIPEND: z.object({ institute: z.enum(["ICAI", "ICSI"]), locationClass: z.string().trim().min(1), yearOfTraining: z.coerce.number().int().min(1).max(5), amountPaise: paise, effectiveFrom: zIsoDate, source: src }),
} as const;

function canEditRates(actor: Actor) {
  return can(actor, "payroll.prepare") || can(actor, "payroll.approve");
}

/** Add a row (statutory values are never edited in place: a new effective-dated row supersedes). Unverified until a Partner checks it. */
export async function addRateRow(actor: Actor, table: RateTable, input: Record<string, unknown>) {
  if (!canEditRates(actor)) throw forbidden();
  const createdById = idOf(actor);
  return transaction(async (tx) => {
    let row: { id: string };
    switch (table) {
      case "PF": row = await tx.pfRate.create({ data: { ...parse(schemas.PF, input), createdById } }); break;
      case "ESI": row = await tx.esiRate.create({ data: { ...parse(schemas.ESI, input), createdById } }); break;
      case "PT": row = await tx.professionalTaxSlab.create({ data: { ...parse(schemas.PT, input), createdById } }); break;
      case "SLAB": row = await tx.incomeTaxSlab.create({ data: { ...parse(schemas.SLAB, input), createdById } }); break;
      case "STIPEND": row = await tx.stipendMinimum.create({ data: { ...parse(schemas.STIPEND, input), createdById } }); break;
      case "PARAM": {
        const d = parse(schemas.PARAM, input);
        const exists = await tx.taxParameter.findUnique({ where: { fy_regime_key: { fy: d.fy, regime: d.regime, key: d.key } } });
        if (exists) throw new DomainError("VALIDATION", `${d.key} already exists for ${d.fy} (${d.regime}). Change its value instead.`, { key: "Already exists" });
        row = await tx.taxParameter.create({ data: { ...d, createdById } });
        break;
      }
      default: throw notFound("Table");
    }
    await writeAudit(tx, actor, { entityType: `Rate:${table}`, entityId: row.id, action: "CREATE", after: row as Record<string, unknown> });
    return row;
  });
}

/** Change a tax parameter's value (it is unique per FY/regime/key); verification is cleared. */
export async function updateTaxParameter(actor: Actor, id: string, valueInt: number, source: string) {
  if (!canEditRates(actor)) throw forbidden();
  const before = await db().taxParameter.findUnique({ where: { id } });
  if (!before) throw notFound("Tax parameter");
  if (!Number.isInteger(valueInt)) throw new DomainError("VALIDATION", "Whole number required", { valueInt: "Whole number" });
  return transaction(async (tx) => {
    const row = await tx.taxParameter.update({ where: { id }, data: { valueInt, source: source || before.source, verifiedById: null, verifiedAt: null, updatedById: idOf(actor) } });
    await writeAudit(tx, actor, { entityType: "Rate:PARAM", entityId: id, action: "UPDATE", before, after: row });
    return row;
  });
}

/** A Partner marks a statutory row verified against the official notification (D-17). */
export async function verifyRateRow(actor: Actor, table: RateTable, id: string) {
  authorize(actor, "payroll.approve");
  const data = { verifiedById: idOf(actor), verifiedAt: new Date() };
  return transaction(async (tx) => {
    switch (table) {
      case "PF": await tx.pfRate.update({ where: { id }, data }); break;
      case "ESI": await tx.esiRate.update({ where: { id }, data }); break;
      case "PT": await tx.professionalTaxSlab.update({ where: { id }, data }); break;
      case "SLAB": await tx.incomeTaxSlab.update({ where: { id }, data }); break;
      case "PARAM": await tx.taxParameter.update({ where: { id }, data }); break;
      case "STIPEND": await tx.stipendMinimum.update({ where: { id }, data }); break;
      default: throw ruleViolation("Unknown table");
    }
    await writeAudit(tx, actor, { entityType: `Rate:${table}`, entityId: id, action: "VERIFY" });
  });
}

/** Count of statutory rows still unverified (shown on the HR dashboard). */
export async function unverifiedRateCount() {
  const w = { verifiedById: null };
  const counts = await Promise.all([db().pfRate.count({ where: w }), db().esiRate.count({ where: w }), db().professionalTaxSlab.count({ where: w }), db().incomeTaxSlab.count({ where: w }), db().taxParameter.count({ where: w }), db().stipendMinimum.count({ where: w })]);
  return counts.reduce((a, b) => a + b, 0);
}
