/**
 * Rule-based reading of notice text (P4-06 →, D-85). Pure and dependency-free so it runs in the browser: the
 * pasted text is used to suggest field values and is not stored by this function. Every suggestion carries the
 * words it came from; the user confirms before saving. No guessing beyond explicit patterns — when nothing
 * matches, the field is left empty.
 */

export type Authority = "INCOME_TAX" | "GST" | "TDS_TRACES" | "MCA_ROC";
export type NoticeSuggestion = {
  authority?: Authority;
  section?: string;
  ayOrPeriod?: string;
  referenceNo?: string;
  noticeDate?: string; // YYYY-MM-DD
  responseDueDate?: string; // YYYY-MM-DD
  responseWithinDays?: number; // "within 15 days" when no date is given
  noticeType?: string;
  demandRupees?: number;
  evidence: Partial<Record<Exclude<keyof NoticeSuggestion, "evidence">, string>>;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Date patterns written in Indian notices: 15/11/2026, 15-11-2026, 15.11.2026, 15th November 2026, 15-Nov-2026, November 15, 2026, 2026-11-15. */
const DATE_RE = new RegExp(
  [
    String.raw`(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})`,
    String.raw`(\d{1,2})(?:st|nd|rd|th)?[\s\-]+(?:of\s+)?([A-Za-z]{3,9})[\s\-,]+(\d{4})`,
    String.raw`([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`,
    String.raw`(\d{4})-(\d{2})-(\d{2})`,
  ].join("|"),
  "g",
);

type Found = { iso: string; index: number; text: string };

export function findDates(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    let iso: string | null = null;
    if (m[1]) iso = validDate(+m[3]!, +m[2]!, +m[1]); // dd/mm/yyyy — Indian order, never mm/dd
    else if (m[4]) iso = MONTHS[m[5]!.toLowerCase()] ? validDate(+m[6]!, MONTHS[m[5]!.toLowerCase()]!, +m[4]) : null;
    else if (m[7]) iso = MONTHS[m[7].toLowerCase()] ? validDate(+m[9]!, MONTHS[m[7].toLowerCase()]!, +m[8]!) : null;
    else if (m[10]) iso = validDate(+m[10], +m[11]!, +m[12]!);
    if (iso) out.push({ iso, index: m.index!, text: m[0] });
  }
  return out;
}

/** The first date within `window` characters after a cue phrase. */
function dateAfter(text: string, dates: Found[], cue: RegExp, window = 60): Found | undefined {
  for (const c of text.matchAll(new RegExp(cue.source, cue.flags.includes("g") ? cue.flags : `${cue.flags}g`))) {
    const end = c.index! + c[0].length;
    const d = dates.find((x) => x.index >= end && x.index - end <= window);
    if (d) return d;
  }
  return undefined;
}

const AUTHORITY_RULES: [Authority, RegExp][] = [
  ["GST", /\b(CGST|SGST|IGST|GSTIN|Goods and Services Tax|DRC-0\d|ASMT-1\d|GST\s?REG-\d+|GSTR-\w+)\b/i],
  ["TDS_TRACES", /\b(TRACES|TDS|TCS|Centrali[sz]ed Processing Cell|CPC[\s-]?TDS|Form\s?(24Q|26Q|27Q|27EQ)|short deduction|late filing fee u\/s 234E)\b/i],
  ["MCA_ROC", /\b(Registrar of Companies|ROC|Ministry of Corporate Affairs|MCA|Companies Act,? 2013|LLP Act)\b/i],
  ["INCOME_TAX", /\b(Income[\s-]?tax|Assessment Year|A\.\s?Y\.|ITBA|Faceless Assessment|National Faceless|CPC Bengaluru|Income-tax Act|Income Tax Act)\b/i],
];

/** Section: "u/s 143(2)", "under section 148A(b)", "Section 73 of the CGST Act", "sec. 139(9)". */
const SECTION_RE = /\b(?:u\/s\.?|under\s+section|section|sec\.)\s*(\d{1,3}[A-Z]{0,3}(?:\s?\(\s?\d{1,2}[A-Za-z]?\s?\))*(?:\s?\(\s?[a-z]{1,3}\s?\))?)/i;
const RULE_RE = /\b(?:under\s+)?rule\s+(\d{1,3}[A-Z]{0,2}(?:\(\d+\))?)/i;

const TYPE_RULES: [RegExp, string][] = [
  [/\bDRC-01A\b/i, "DRC-01A (pre-show cause intimation)"],
  [/\bDRC-01\b/i, "DRC-01 (show cause notice)"],
  [/\bASMT-10\b/i, "ASMT-10 (scrutiny of return)"],
  [/\bREG-17\b/i, "REG-17 (cancellation show cause)"],
  [/\bREG-03\b/i, "REG-03 (registration clarification)"],
  [/\bshow[\s-]cause\b/i, "Show cause notice"],
  [/\bintimation\b[^.]{0,40}\b143\s?\(1\)/i, "Intimation u/s 143(1)"],
  [/\b143\s?\(2\)/i, "Scrutiny notice"],
  [/\b142\s?\(1\)/i, "Inquiry before assessment"],
  [/\b148A?\b/i, "Reassessment"],
  [/\b139\s?\(9\)/i, "Defective return"],
  [/\b245\b/i, "Adjustment of refund against demand"],
  [/\b156\b/i, "Demand notice"],
  [/\bshort deduction\b/i, "Short deduction default"],
  [/\b234E\b/i, "Late filing fee"],
  [/\bscrutiny\b/i, "Scrutiny"],
  [/\bdemand\b/i, "Demand"],
];

function money(s: string): number | undefined {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export function extractNoticeFields(text: string): NoticeSuggestion {
  const t = text.replace(/ /g, " ").replace(/[‐-–—]/g, "-");
  const out: NoticeSuggestion = { evidence: {} };
  if (!t.trim()) return out;

  for (const [a, re] of AUTHORITY_RULES) {
    const m = re.exec(t);
    if (m) {
      out.authority = a;
      out.evidence.authority = m[0];
      break;
    }
  }

  const sec = SECTION_RE.exec(t);
  if (sec) {
    out.section = sec[1]!.replace(/\s+/g, "");
    out.evidence.section = sec[0];
  } else {
    const rule = RULE_RE.exec(t);
    if (rule) {
      out.section = `Rule ${rule[1]}`;
      out.evidence.section = rule[0];
    }
  }

  // Assessment year / financial year / tax period.
  const ay = /\b(?:A\.?\s?Y\.?|Assessment\s+Year)\s*[:\-]?\s*(20\d{2})\s*[-\/]\s*(\d{2}|20\d{2})\b/i.exec(t);
  const fy = /\b(?:F\.?\s?Y\.?|Financial\s+Year)\s*[:\-]?\s*(20\d{2})\s*[-\/]\s*(\d{2}|20\d{2})\b/i.exec(t);
  const yr = (a: string, b: string) => `${a}-${b.slice(-2)}`;
  // A quarter is checked before the plain FY, which would otherwise swallow "Q3 FY 2025-26".
  const q = /\b(Q[1-4])\s*(?:of\s*)?(?:F\.?\s?Y\.?\s*)?(20\d{2})\s*[-\/]\s*(\d{2})\b/i.exec(t);
  if (ay) {
    out.ayOrPeriod = `AY ${yr(ay[1]!, ay[2]!)}`;
    out.evidence.ayOrPeriod = ay[0];
  } else if (q) {
    out.ayOrPeriod = `FY ${q[2]}-${q[3]} ${q[1]!.toUpperCase()}`;
    out.evidence.ayOrPeriod = q[0];
  } else if (fy) {
    out.ayOrPeriod = `FY ${yr(fy[1]!, fy[2]!)}`;
    out.evidence.ayOrPeriod = fy[0];
  } else {
    const period = /\b(?:tax\s+period|period)\s*[:\-]?\s*((?:[A-Za-z]{3,9}\s+20\d{2})(?:\s*(?:to|-)\s*[A-Za-z]{3,9}\s+20\d{2})?)/i.exec(t);
    if (period) {
      out.ayOrPeriod = period[1]!.replace(/\s+/g, " ");
      out.evidence.ayOrPeriod = period[0];
    }
  }

  // DIN / reference number.
  const ref =
    /\b(?:DIN|Document Identification Number)\s*(?:&|and)?\s*(?:Notice\s+No\.?)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-.()]{9,60})/i.exec(t) ??
    /\b(?:Reference|Ref\.?|Notice|Letter|ARN|Order)\s*(?:No\.?|Number|ID)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-.()]{5,60})/i.exec(t);
  if (ref) {
    let r = ref[1]!.replace(/[.\-\/]+$/, "");
    while (r.endsWith(")") && (r.match(/\(/g)?.length ?? 0) < (r.match(/\)/g)?.length ?? 0)) r = r.slice(0, -1);
    out.referenceNo = r;
    out.evidence.referenceNo = ref[0];
  }

  // Dates: notice date after "dated / date of notice / Date:"; reply-by after "on or before / by / due date / compliance".
  const dates = findDates(t);
  const noticeDate = dateAfter(t, dates, /\b(?:dated|date of (?:issue|notice)|notice date|issue date|date)\s*[:\-]?/i, 25);
  if (noticeDate) {
    out.noticeDate = noticeDate.iso;
    out.evidence.noticeDate = noticeDate.text;
  }
  const due = dateAfter(t, dates, /\b(?:on\s+or\s+before|not later than|latest by|by|due date(?: of (?:reply|response|compliance))?|last date(?: for (?:reply|response|compliance))?|compliance date|response date|hearing on)\s*[:\-]?/i, 25);
  if (due && due.iso !== out.noticeDate) {
    out.responseDueDate = due.iso;
    out.evidence.responseDueDate = due.text;
  }
  if (!out.noticeDate && dates.length && !due) {
    // Only one plain date in a short text is most often the notice date; with several, nothing is guessed.
    if (dates.length === 1) {
      out.noticeDate = dates[0]!.iso;
      out.evidence.noticeDate = dates[0]!.text;
    }
  }
  const within = /\bwithin\s+(\d{1,3})\s+days\b/i.exec(t);
  if (within && !out.responseDueDate) {
    out.responseWithinDays = Number(within[1]);
    out.evidence.responseWithinDays = within[0];
  }

  for (const [re, label] of TYPE_RULES) {
    const m = re.exec(t);
    if (m) {
      out.noticeType = label;
      out.evidence.noticeType = m[0];
      break;
    }
  }

  const dem = /\b(?:demand|outstanding|payable|amount)\b[^.₹]{0,40}?(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(t) ?? /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)[^.]{0,30}\b(?:demand|payable|outstanding)\b/i.exec(t);
  if (dem) {
    const v = money(dem[1]!);
    if (v) {
      out.demandRupees = v;
      out.evidence.demandRupees = dem[0];
    }
  }
  return out;
}

/** Suggested reply-by date: the explicit date, else "within N days" from the notice date (or the received date). */
export function suggestedDueDate(s: NoticeSuggestion, receivedDate: string): string | undefined {
  if (s.responseDueDate) return s.responseDueDate;
  if (!s.responseWithinDays) return undefined;
  const base = s.noticeDate ?? receivedDate;
  const [y, m, d] = base.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + s.responseWithinDays));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
