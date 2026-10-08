/**
 * Keyword tagging of uploads (P4-06 →, D-85). Pure: given a file name and a sample of its text, suggest
 * (a) which open requested item it most likely answers and (b) document tags from a fixed dictionary.
 * Suggestions only: staff link or confirm. A match must be clear — a weak or tied score suggests nothing.
 */

const STOP = new Set(["of", "and", "the", "if", "applicable", "for", "to", "a", "an", "in", "on", "with", "details", "data", "copy", "file", "doc", "scan", "final", "new"]);

/** Abbreviations common in Indian office file names. */
const SYNONYMS: Record<string, string[]> = {
  stmt: ["statement"], statment: ["statement"], stmnt: ["statement"], inv: ["invoice"], invoices: ["invoice"], reg: ["register"],
  purch: ["purchase"], pur: ["purchase"], purchases: ["purchase"], sales: ["sale", "sales"], tb: ["trial", "balance"], bs: ["balance", "sheet"],
  pl: ["profit", "loss"], gstr2b: ["gstr", "2b"], form16: ["form", "16"], form16a: ["form", "16a"], ais: ["ais"], tis: ["tis"], "26as": ["26as"],
  acct: ["account"], ac: ["account"], bank: ["bank"], ledger: ["ledger"], ledgers: ["ledger"], payslips: ["payroll"], salary: ["payroll", "salary"],
  // Bank names stand in for the word "bank" in file names ("HDFC_Stmt_Sep.pdf").
  ...Object.fromEntries(["hdfc", "icici", "sbi", "axis", "kotak", "pnb", "bob", "idfc", "indusind", "canara", "yesbank", "rbl", "federal", "idbi", "boi", "uco", "aubank", "bandhan"].map((b) => [b, ["bank"]])),
  ewb: ["e", "way", "bill"], ewaybill: ["e", "way", "bill"], challans: ["challan"], minutes: ["minutes"], resolutions: ["resolution"],
};

function stem(w: string) {
  return w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

/** Lower-cased word tokens with abbreviations expanded and simple plurals folded. */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  const words = text.toLowerCase().replace(/([a-z])(\d)/g, "$1 $2").split(/[^a-z0-9]+/).filter(Boolean);
  for (const raw of words) {
    const joined = raw;
    for (const w of [joined, ...(SYNONYMS[joined] ?? [])]) {
      if (!STOP.has(w)) out.add(stem(w));
    }
  }
  // Re-join digit splits such as "form16" → "form", "16"; also keep the compact form.
  for (const m of text.toLowerCase().matchAll(/[a-z]+\d+[a-z]*/g)) {
    const compact = m[0];
    out.add(compact);
    for (const s of SYNONYMS[compact] ?? []) out.add(stem(s));
  }
  return out;
}

export type Candidate = { id: string; label: string; keywords?: string | null };
export type ItemSuggestion = { id: string; label: string; score: number; matched: string[] };

/** Score one candidate: the share of its key words present in the file's tokens (best of its phrases). */
export function scoreCandidate(fileTokens: Set<string>, c: Candidate): { score: number; matched: string[] } {
  const phrases = (c.keywords?.trim() ? c.keywords : c.label).split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  let best = { score: 0, matched: [] as string[] };
  for (const p of phrases) {
    const words = [...tokens(p)];
    if (!words.length) continue;
    const matched = words.filter((w) => fileTokens.has(w));
    const score = matched.length / words.length;
    if (score > best.score) best = { score, matched };
  }
  return best;
}

/** The requested item this file most likely answers, or null when no candidate is clearly ahead. */
export function suggestItem(fileName: string, textSample: string, candidates: Candidate[], opts: { min?: number; margin?: number } = {}): ItemSuggestion | null {
  const min = opts.min ?? 0.6;
  const margin = opts.margin ?? 0.2;
  const ft = tokens(`${fileName.replace(/\.[a-z0-9]{1,5}$/i, "")} ${textSample.slice(0, 5000)}`);
  const scored = candidates.map((c) => ({ c, ...scoreCandidate(ft, c) })).sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  if (!first || first.score < min) return null;
  if (second && first.score - second.score < margin) return null;
  return { id: first.c.id, label: first.c.label, score: Math.round(first.score * 100) / 100, matched: first.matched };
}

/** Fixed tag dictionary for documents (tag → phrases; any phrase fully present adds the tag). */
export const TAG_DICTIONARY: [string, string[]][] = [
  ["bank-statement", ["bank statement", "statement of account", "account statement", "passbook"]],
  ["invoice", ["invoice", "tax invoice", "bill of supply"]],
  ["sales-register", ["sales register", "sale register", "outward supplies"]],
  ["purchase-register", ["purchase register", "inward supplies"]],
  ["gstr-2b", ["gstr 2b", "gstr2b"]],
  ["e-way-bill", ["e way bill"]],
  ["form-16", ["form 16"]],
  ["form-16a", ["form 16a"]],
  ["ais-tis", ["ais", "tis", "annual information statement"]],
  ["26as", ["26as"]],
  ["challan", ["challan"]],
  ["trial-balance", ["trial balance"]],
  ["ledger", ["ledger"]],
  ["financial-statements", ["balance sheet", "profit loss", "financial statement"]],
  ["payroll", ["payroll", "salary register", "wage register"]],
  ["minutes", ["minutes", "board resolution", "resolution"]],
  ["investment-proof", ["investment proof", "80c", "lic premium", "elss"]],
  ["capital-gains", ["capital gain"]],
];

export function suggestTags(fileName: string, textSample: string): string[] {
  const ft = tokens(`${fileName.replace(/\.[a-z0-9]{1,5}$/i, "")} ${textSample.slice(0, 5000)}`);
  const out: string[] = [];
  for (const [tag, phrases] of TAG_DICTIONARY) {
    if (phrases.some((p) => [...tokens(p)].every((w) => ft.has(w)))) out.push(tag);
  }
  // "form 16a" also contains "form 16": keep the more specific one.
  return out.includes("form-16a") ? out.filter((t) => t !== "form-16") : out;
}
