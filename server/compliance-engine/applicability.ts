import type { ClientSnapshot, FlagTimeline, GstinSnapshot, Obligation } from "./types";

/**
 * Applicability (Rules Spec 1): which compliance types a client owes, per party, over which
 * date windows. Windows come from the flag timelines, so switching a flag on starts obligations
 * from its effective date (no back-filling) and switching it off ends them (Rules Spec 7.1–7.2).
 */
type Window = { start: string; end: string | null };

const isCompany = (c: string) => c === "PRIVATE_COMPANY" || c === "PUBLIC_COMPANY";

export function valueAt(tl: FlagTimeline | undefined, date: string): boolean {
  let v = false;
  for (const p of tl ?? []) {
    if (p.from <= date) v = p.value;
    else break;
  }
  return v;
}

/** Windows (from floor onwards) in which `pred` is true, evaluated at every change point. */
export function windowsWhere(timelines: FlagTimeline[], floor: string, pred: (at: string) => boolean): Window[] {
  const points = [...new Set([floor, ...timelines.flatMap((t) => t.map((p) => p.from)).filter((d) => d > floor)])].sort();
  const out: Window[] = [];
  let open: string | null = null;
  for (const at of points) {
    const on = pred(at);
    if (on && open === null) open = at;
    if (!on && open !== null) {
      out.push({ start: open, end: at });
      open = null;
    }
  }
  if (open !== null) out.push({ start: open, end: null });
  return out;
}

/** Clip a window to [start, end). Returns null when nothing is left. */
function clip(w: Window, start: string, end: string | null | undefined): Window | null {
  const s = w.start > start ? w.start : start;
  const e = end && (!w.end || end < w.end) ? end : w.end;
  return e && e <= s ? null : { start: s, end: e };
}

function gstinObligations(g: GstinSnapshot, floor: string): Obligation[] {
  const regStart = g.registrationDate && g.registrationDate > floor ? g.registrationDate : floor;
  const regEnd = g.status === "CANCELLED" && g.cancellationDate ? g.cancellationDate : null;
  const out: Obligation[] = [];
  const base = { partyKey: g.id, gstinId: g.id };
  g.frequencies.forEach((seg, i) => {
    const w = clip({ start: seg.from, end: g.frequencies[i + 1]?.from ?? null }, regStart, regEnd);
    if (!w) return;
    const types =
      seg.frequency === "MONTHLY" ? ["GST-R1-M", "GST-3B-M"]
        : seg.frequency === "QRMP" ? ["GST-R1-Q", "GST-3B-Q", ...(seg.iffOpted ? ["GST-IFF"] : [])]
          : ["GST-CMP08", "GST-R4"];
    for (const typeCode of types) out.push({ ...base, typeCode, start: w.start, end: w.end, endReason: w.end === regEnd && regEnd ? "GST registration cancelled" : w.end ? "GST frequency changed" : undefined });
  });
  if (g.annualReturnApplicable) out.push({ ...base, typeCode: "GST-R9", start: regStart, end: regEnd });
  if (g.gstr9cApplicable) out.push({ ...base, typeCode: "GST-R9C", start: regStart, end: regEnd });
  if (regEnd) out.push({ ...base, typeCode: "GST-R10", start: regEnd, end: null });
  return out;
}

/** Every obligation for a client (Rules Spec 1.2 mapping, with Q-02/Q-03/Q-04 answers). */
export function obligationsFor(c: ClientSnapshot): Obligation[] {
  const floor = c.trackingFrom;
  const tl = (f: string) => c.flags[f] ?? [];
  const on = (f: string) => (at: string) => valueAt(tl(f), at);
  const out: Obligation[] = [];
  const fromFlags = (typeCode: string, flags: string[], pred: (at: string) => boolean, extra: Partial<Obligation> = {}) => {
    for (const w of windowsWhere(flags.map(tl), floor, pred)) {
      out.push({ typeCode, partyKey: "-", start: w.start, end: w.end, endReason: w.end ? `Applicability flag removed effective ${w.end}` : undefined, ...extra });
    }
  };
  const always = (typeCode: string) => out.push({ typeCode, partyKey: "-", start: floor, end: null });

  // GST, per GSTIN.
  for (const g of c.gstins) out.push(...gstinObligations(g, floor));

  // TDS / TCS. Payment is monthly whenever TDS or TCS applies.
  fromFlags("TDS-PAY", ["tdsApplicable", "tcsApplicable"], (at) => on("tdsApplicable")(at) || on("tcsApplicable")(at));
  fromFlags("TDS-24Q", ["tdsApplicable", "tdsSalary"], (at) => on("tdsApplicable")(at) && on("tdsSalary")(at));
  fromFlags("TDS-26Q", ["tdsApplicable", "tdsNonSalary"], (at) => on("tdsApplicable")(at) && on("tdsNonSalary")(at));
  fromFlags("TDS-27Q", ["tdsApplicable", "tdsNonResident"], (at) => on("tdsApplicable")(at) && on("tdsNonResident")(at));
  fromFlags("TCS-27EQ", ["tcsApplicable"], on("tcsApplicable"));

  // Income tax: companies are always on the audit-case track; others follow the tax-audit flag.
  if (isCompany(c.constitution)) always("ITR-A");
  else {
    fromFlags("ITR-A", ["taxAuditApplicable"], on("taxAuditApplicable"));
    fromFlags("ITR-NA", ["taxAuditApplicable"], (at) => !on("taxAuditApplicable")(at));
  }
  fromFlags("TAR", ["taxAuditApplicable"], on("taxAuditApplicable"));
  fromFlags("TP-3CEB", ["transferPricingApplicable"], on("transferPricingApplicable"));
  fromFlags("ADV-TAX", ["advanceTaxApplicable"], on("advanceTaxApplicable"));
  if (isCompany(c.constitution)) always("STAT-AUDIT");
  else fromFlags("STAT-AUDIT", ["statutoryAuditApplicable"], on("statutoryAuditApplicable"));

  // ROC / LLP.
  if (isCompany(c.constitution)) {
    always("AOC-4");
    always("MGT-7");
    always("ADT-1"); // created only when an auditor-appointment / AGM date is recorded (rules.ts skip)
    fromFlags("DPT-3", ["dpt3Applicable"], on("dpt3Applicable"));
    fromFlags("MSME-1", ["msmeApplicable"], on("msmeApplicable"));
  }
  if (c.constitution === "LLP") {
    always("LLP-F11");
    always("LLP-F8");
  }
  // DIR-3 KYC: one per director, held by the director's primary company (Q-04).
  if (isCompany(c.constitution) || c.constitution === "LLP") {
    for (const d of c.directors.filter((x) => x.isPrimaryHere)) {
      const start = d.appointedOn && d.appointedOn > floor ? d.appointedOn : floor;
      out.push({ typeCode: "DIR3-KYC", partyKey: d.directorId, directorId: d.directorId, start, end: d.ceasedOn ?? null, endReason: d.ceasedOn ? "Director ceased" : undefined });
    }
  }

  // Payroll statutory.
  fromFlags("PF-ECR", ["pfApplicable"], on("pfApplicable"));
  fromFlags("ESI-RET", ["esiApplicable"], on("esiApplicable"));
  for (const pt of c.ptRegistrations.filter((r) => r.kind === "EMPLOYER")) {
    const basisOverride = pt.frequency === "QUARTERLY" ? "FY_QUARTER" : pt.frequency === "HALF_YEARLY" ? "FY_HALF" : pt.frequency === "ANNUAL" ? "FY" : "MONTH";
    out.push({ typeCode: "PT-RET", partyKey: pt.stateCode, start: pt.effectiveFrom > floor ? pt.effectiveFrom : floor, end: pt.effectiveTo ?? null, basisOverride, endReason: pt.effectiveTo ? "PT registration ended" : undefined });
  }

  // Client discontinued: no new recurring periods after the date (Rules Spec 7.5) + one-time closure filings.
  if ((c.status === "DISCONTINUED" || c.status === "DISCONTINUED_CLOSED") && c.statusEffectiveFrom) {
    const cut = c.statusEffectiveFrom;
    for (const o of out) {
      if (o.typeCode === "GST-R10") continue;
      if (!o.end || o.end > cut) {
        o.end = cut;
        o.endReason = "Client discontinued";
      }
    }
    if (isCompany(c.constitution)) out.push({ typeCode: "ROC-STK2", partyKey: "-", start: cut, end: null });
    if (c.constitution === "LLP") out.push({ typeCode: "LLP-F24", partyKey: "-", start: cut, end: null });
  }
  return out.filter((o) => !o.end || o.end > o.start);
}
