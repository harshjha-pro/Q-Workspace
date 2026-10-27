import { INGREDIENTS } from '../data/ingredients';
import type { Ingredient } from '../data/types';

/** Lower-case, strip accents and punctuation (keeps letters, digits, spaces, %, -, /). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9%\-/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

interface NameEntry {
  key: string;
  ingredient: Ingredient;
}

// Every name an ingredient can appear under on a label, longest first so that
// "sodium monofluorophosphate" wins over "fluoride".
const NAME_ENTRIES: NameEntry[] = (() => {
  const entries: NameEntry[] = [];
  const seen = new Set<string>();
  for (const ing of INGREDIENTS) {
    const names = [ing.name, ing.inci ?? '', ...ing.synonyms];
    // INCI strings like "Ceramide NP / AP / EOP" also contribute their parts.
    if (ing.inci?.includes('/')) names.push(...ing.inci.split('/'));
    for (const n of names) {
      const key = normalize(n.replace(/\(.*?\)/g, ' '));
      if (key.length < 2 || seen.has(key)) continue;
      seen.add(key);
      entries.push({ key, ingredient: ing });
    }
  }
  return entries.sort((a, b) => b.key.length - a.key.length);
})();

const EXACT = new Map(NAME_ENTRIES.map((e) => [e.key, e.ingredient]));

export interface IngredientMatch {
  ingredient: Ingredient;
  how: 'exact' | 'contains' | 'fuzzy';
}

/**
 * Match a single label entry (e.g. "Niacinamide (10%)", "Aqua/Water",
 * "Cocos Nucifera (Coconut) Oil") to a database ingredient.
 */
export function matchIngredient(raw: string): IngredientMatch | null {
  const cleaned = normalize(raw.replace(/\(\s*[\d.,]+\s*%?\s*(w\/w|w\/v)?\s*\)/gi, ' ').replace(/[\d.,]+\s*%/g, ' '));
  if (!cleaned) return null;
  const exact = EXACT.get(cleaned) ?? EXACT.get(normalize(raw.replace(/\(.*?\)/g, ' ')));
  if (exact) return { ingredient: exact, how: 'exact' };

  // Label entry contains a known multi-word name (e.g. "aloe barbadensis leaf juice powder").
  for (const e of NAME_ENTRIES) {
    // Single generic words ("alcohol", "water") are too ambiguous to match inside longer names.
    const specific = (e.key.includes(' ') && e.key.length >= 6) || e.key.length >= 9;
    if (specific && (` ${cleaned} `).includes(` ${e.key} `)) return { ingredient: e.ingredient, how: 'contains' };
  }

  // Tolerate small spelling variations ("niacinimide", "glycerine").
  if (cleaned.length >= 6) {
    let best: NameEntry | null = null;
    let bestD = 99;
    const max = cleaned.length >= 10 ? 2 : 1;
    for (const e of NAME_ENTRIES) {
      const d = editDistance(cleaned, e.key, max);
      if (d <= max && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best) return { ingredient: best.ingredient, how: 'fuzzy' };
  }
  return null;
}

/** Split a pasted ingredient list into entries, respecting parentheses. */
export function splitIngredientList(text: string): string[] {
  const body = text.replace(/^\s*(ingredients?|composition|contains)\s*[:\-]/i, '');
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n' || ch === '•' || ch === '·')) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map((p) => p.replace(/\s+/g, ' ').replace(/^[\s.*\-–]+|[\s.*]+$/g, '').trim())
    .filter((p) => p.length > 0 && !/^(and|may contain|\+\/-)$/i.test(p));
}

/** Extract a declared percentage such as "Niacinamide (10%)" → "10%". */
export function declaredConcentration(raw: string): string | undefined {
  const m = raw.match(/([\d.]+)\s*%/) ?? raw.match(/([\d.]+)\s*ppm/i);
  if (!m) return undefined;
  return /ppm/i.test(m[0]) ? `${m[1]} ppm` : `${m[1]}%`;
}
