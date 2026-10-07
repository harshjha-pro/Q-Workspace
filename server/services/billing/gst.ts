/**
 * Pure GST helpers for invoices (no DB). Rates come in as basis points from settings, never constants.
 */
export type TaxLine = { kind: "FEE" | "REIMBURSEMENT"; amountPaise: number; gstRateBp: number };
export type TaxTotals = { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; reimbursementPaise: number; totalPaise: number };

/** Line amount from quantity (thousandths) × rate, rounded to the paisa. */
export const lineAmount = (quantityMilli: number, ratePaise: number) => Math.round((quantityMilli * ratePaise) / 1000);

/**
 * Totals for an invoice. Intra-state supply → CGST + SGST, each half the rate; inter-state → IGST.
 * Tax is computed per rate on the summed taxable value (one rounding per head per rate).
 * Reimbursements are pure-agent recoveries: no GST (Q-18 proposal).
 */
export function computeTotals(lines: TaxLine[], intraState: boolean): TaxTotals {
  let taxable = 0;
  let reimb = 0;
  const byRate = new Map<number, number>();
  for (const l of lines) {
    if (l.kind === "REIMBURSEMENT") {
      reimb += l.amountPaise;
      continue;
    }
    taxable += l.amountPaise;
    byRate.set(l.gstRateBp, (byRate.get(l.gstRateBp) ?? 0) + l.amountPaise);
  }
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const [bp, base] of byRate) {
    if (intraState) {
      const half = Math.round((base * bp) / 20000);
      cgst += half;
      sgst += half;
    } else {
      igst += Math.round((base * bp) / 10000);
    }
  }
  return { taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, reimbursementPaise: reimb, totalPaise: taxable + cgst + sgst + igst + reimb };
}

/**
 * Place of supply (state code, e.g. "RJ"): the state of the recipient's GSTIN when registered,
 * otherwise the recipient's state on record, otherwise the supplier's state (IGST Act s.12(2)).
 */
export function placeOfSupply(opts: { firmState: string; clientState?: string | null; recipientGstinState?: string | null }): string {
  return opts.recipientGstinState || opts.clientState || opts.firmState;
}

export const isIntraState = (firmState: string, pos: string) => !!firmState && firmState === pos;

/** "18%" / "9%" for basis points. */
export const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

/** Invoice number: prefix + 4-digit running number. GST allows at most 16 characters (Rule 46). */
export function formatInvoiceNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, "0")}`;
}
export const MAX_INVOICE_NUMBER_LENGTH = 16;

/** Series prefix for a financial year, e.g. "QI/26-27/". */
export function seriesPrefix(code: string, fyStart: number): string {
  const a = String(fyStart % 100).padStart(2, "0");
  const b = String((fyStart + 1) % 100).padStart(2, "0");
  return `${code}/${a}-${b}/`;
}
