/**
 * Payroll engine types. The engine is pure (no Prisma, no clock, no settings): every statutory value
 * arrives as data rows picked by effective date (decisions D-17), so the golden tests can pin them.
 * Money is integer paise; rates are basis points (1 bp = 0.01 %).
 */

/** Monthly salary structure (paise). Same shape the SALARY_STRUCTURES import writes. */
export type SalaryComponents = { basic: number; hra: number; special: number; other: number; variable: number };

export type PfRateRow = {
  effectiveFrom: string;
  employeeBp: number;
  employerEpfBp: number;
  employerEpsBp: number;
  epsWageCeilingPaise: number;
  pfWageCeilingPaise: number;
  adminBp: number;
  edliBp: number;
};

export type EsiRateRow = { effectiveFrom: string; employeeBp: number; employerBp: number; wageCeilingPaise: number };

export type PtSlabRow = {
  stateCode: string;
  fromPaise: number;
  toPaise: number | null;
  amountPaise: number;
  gender: string; // ANY | M | F
  overrideMonth: number | null;
  overrideAmountPaise: number | null;
  effectiveFrom: string;
};

export type TaxSlabRow = { fromPaise: number; toPaise: number | null; rateBp: number };

/** TaxParameter rows flattened to key → value for one FY and regime (regime rows win over ANY). */
export type TaxParams = Record<string, number>;

export type Regime = "NEW" | "OLD";
export type PfWageBasis = "CAPPED" | "FULL";
export type DaysBasis = "CALENDAR" | "FIXED_30" | "FIXED_26";

export type Line = { code: string; label: string; amount: number };

/** Old-regime declaration (amounts in paise, annual). */
export type DeclarationItems = Record<string, number>;
export type Declaration = { regime: Regime; items: DeclarationItems; metro: boolean };
