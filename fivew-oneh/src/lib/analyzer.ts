import type { Ingredient } from '../data/types';
import { declaredConcentration, matchIngredient, splitIngredientList } from './ingredientMatch';

export interface AnalysedEntry {
  position: number;
  label: string;
  ingredient: Ingredient | null;
  matchType: 'exact' | 'contains' | 'fuzzy' | null;
  concentration?: string;
}

export interface Precaution {
  ingredientId: string;
  ingredientName: string;
  kind: 'fragrance_allergen' | 'potential_irritant' | 'photosensitising' | 'pregnancy_caution' | 'drying' | 'comedogenic_possible' | 'nut_derived';
  message: string;
}

export interface Analysis {
  entries: AnalysedEntry[];
  recognised: AnalysedEntry[];
  unrecognised: AnalysedEntry[];
  precautions: Precaution[];
  functionsSummary: { fn: string; count: number }[];
  notes: string[];
}

const FLAG_MESSAGE: Record<Precaution['kind'], string> = {
  fragrance_allergen: 'Fragrance or a fragrance component — a common cause of cosmetic contact allergy.',
  potential_irritant: 'Can irritate some people, especially sensitive skin or when combined with other actives.',
  photosensitising: 'May increase sun sensitivity — use sunscreen.',
  pregnancy_caution: 'Discuss with a doctor if pregnant or breastfeeding.',
  drying: 'Can be drying, particularly at higher amounts or with frequent use.',
  comedogenic_possible: 'May clog pores for some acne-prone people (depends on the full formula).',
  nut_derived: 'Nut-derived — check if you have a nut allergy.',
};

/**
 * Analyse a pasted ingredient list. Explains recognised ingredients and flags
 * precautions. It deliberately never returns an overall "safe/unsafe" verdict.
 */
export function analyseIngredientList(text: string): Analysis {
  const parts = splitIngredientList(text);
  const entries: AnalysedEntry[] = parts.map((label, i) => {
    const m = matchIngredient(label);
    return { position: i + 1, label, ingredient: m?.ingredient ?? null, matchType: m?.how ?? null, concentration: declaredConcentration(label) };
  });
  const recognised = entries.filter((e) => e.ingredient);
  const unrecognised = entries.filter((e) => !e.ingredient);

  const precautions: Precaution[] = [];
  const seen = new Set<string>();
  for (const e of recognised) {
    for (const flag of e.ingredient!.flags ?? []) {
      const key = `${e.ingredient!.id}:${flag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      precautions.push({ ingredientId: e.ingredient!.id, ingredientName: e.ingredient!.name, kind: flag, message: FLAG_MESSAGE[flag] });
    }
  }

  const fnCount = new Map<string, number>();
  for (const e of recognised) for (const fn of e.ingredient!.functions) fnCount.set(fn, (fnCount.get(fn) ?? 0) + 1);
  const functionsSummary = [...fnCount.entries()].map(([fn, count]) => ({ fn, count })).sort((a, b) => b.count - a.count);

  const notes = [
    'Ingredients present above about 1% are generally listed in descending order; below that, order can be arbitrary. Position does not reveal exact amounts.',
    'A list alone cannot tell you whether a product is safe or effective for you — concentration, formulation and your own skin or health matter.',
  ];
  if (unrecognised.length) notes.push(`${unrecognised.length} entr${unrecognised.length === 1 ? 'y was' : 'ies were'} not found in the CareLens database. That does not mean they are harmful — only that we have no verified record yet.`);
  const fuzzy = recognised.filter((e) => e.matchType === 'fuzzy');
  if (fuzzy.length) notes.push('Some entries were matched despite spelling differences — please check them.');
  return { entries, recognised, unrecognised, precautions, functionsSummary, notes };
}
