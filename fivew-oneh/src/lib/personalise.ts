import { INGREDIENT_MAP } from '../data/ingredients';
import { REGION_MAP } from '../data/regions';
import type {
  CautionTag,
  ClimateZone,
  HairConcern,
  HairType,
  OralConcern,
  Product,
  ScalpType,
  SkinConcern,
  SkinType,
  SuitabilityTags,
} from '../data/types';

export type Budget = 'any' | 'under_300' | '300_700' | '700_1500' | 'over_1500';
export type IngredientPref = 'fragrance_free' | 'alcohol_free' | 'ayurvedic' | 'minimal';
export type Goal = 'learn' | 'compare' | 'save_money' | 'check_safety' | 'traditional';

export interface Profile {
  skinType?: SkinType | 'unsure';
  skinConcerns: SkinConcern[];
  hairType?: HairType | 'unsure';
  scalp?: ScalpType | 'unsure';
  hairConcerns: HairConcern[];
  oralConcerns: OralConcern[];
  ageRange?: string;
  regionId?: string;
  climate?: ClimateZone;
  budget: Budget;
  ingredientPrefs: IngredientPref[];
  sensitivities: CautionTag[];
  currentProducts: string[];
  goals: Goal[];
}

export const EMPTY_PROFILE: Profile = {
  skinConcerns: [],
  hairConcerns: [],
  oralConcerns: [],
  budget: 'any',
  ingredientPrefs: [],
  sensitivities: [],
  currentProducts: [],
  goals: [],
};

export function hasPreferences(p: Profile | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    (p.skinType && p.skinType !== 'unsure') ||
      p.skinConcerns.length ||
      (p.hairType && p.hairType !== 'unsure') ||
      (p.scalp && p.scalp !== 'unsure') ||
      p.hairConcerns.length ||
      p.oralConcerns.length ||
      p.regionId ||
      p.climate ||
      p.budget !== 'any' ||
      p.ingredientPrefs.length ||
      p.sensitivities.length,
  );
}

export const BUDGET_MAX: Record<Budget, number> = { any: Infinity, under_300: 300, '300_700': 700, '700_1500': 1500, over_1500: Infinity };
export const BUDGET_LABEL: Record<Budget, string> = { any: 'Any', under_300: 'Under ₹300', '300_700': '₹300 – ₹700', '700_1500': '₹700 – ₹1,500', over_1500: '₹1,500+' };

export const LABELS = {
  skinType: { oily: 'Oily', dry: 'Dry', combination: 'Combination', normal: 'Normal', sensitive: 'Sensitive', unsure: 'Not sure' },
  skinConcerns: { acne: 'Acne', dryness: 'Dryness', uneven_tone: 'Uneven tone', sun_protection: 'Sun protection', texture: 'Texture', irritation: 'Irritation' },
  hairType: { straight: 'Straight', wavy: 'Wavy', curly: 'Curly', coily: 'Coily', unsure: 'Not sure' },
  scalp: { dry_scalp: 'Dry scalp', oily_scalp: 'Oily scalp', unsure: 'Not sure' },
  hairConcerns: { dandruff: 'Dandruff', frizz: 'Frizz', breakage: 'Breakage', hair_fall: 'Hair fall' },
  oralConcerns: { sensitive_teeth: 'Sensitive teeth', cavities: 'Cavity prevention', gum_care: 'Gum care', bad_breath: 'Bad breath' },
  sensitivities: { sensitive_skin: 'Easily irritated skin', fragrance_sensitive: 'Fragrance sensitivity', pregnancy: 'Pregnant / breastfeeding', nut_allergy: 'Nut allergy', children: 'Choosing for a child', sun_exposure: 'Lots of sun exposure' },
  ingredientPrefs: { fragrance_free: 'Fragrance-free', alcohol_free: 'Alcohol-free', ayurvedic: 'Ayurvedic / traditional', minimal: 'Short ingredient lists' },
  goals: { learn: 'Learn about ingredients', compare: 'Compare products', save_money: 'Get better value', check_safety: 'Check safety', traditional: 'Explore traditional care' },
  ageRange: { under_18: 'Under 18', '18_25': '18–25', '26_35': '26–35', '36_50': '36–50', over_50: '50+' },
  climate: { hot_humid: 'Hot & humid', hot_dry: 'Hot & dry', moderate: 'Moderate', cold: 'Cold', monsoon: 'Monsoon' },
} as const;

export interface Relevance {
  score: number;
  reasons: string[];
  cautions: string[];
}

/** The climate in effect: explicit choice, else the region's broad climate. */
export function effectiveClimate(p: Profile): ClimateZone | undefined {
  return p.climate ?? (p.regionId ? REGION_MAP[p.regionId]?.climate : undefined);
}

function cautionTags(p: Profile): Set<CautionTag> {
  const tags = new Set<CautionTag>(p.sensitivities);
  if (p.skinType === 'sensitive') tags.add('sensitive_skin');
  if (p.ingredientPrefs.includes('fragrance_free')) tags.add('fragrance_sensitive');
  return tags;
}

/**
 * Score how relevant a record's suitability tags are to a profile. This only
 * filters and contextualises information; it never diagnoses.
 */
export function relevance(p: Profile | null | undefined, s: SuitabilityTags | undefined): Relevance {
  const out: Relevance = { score: 0, reasons: [], cautions: [] };
  if (!p || !s) return out;
  if (p.skinType && p.skinType !== 'unsure' && s.skinTypes?.includes(p.skinType)) {
    out.score += 1;
    out.reasons.push(`Relevant to ${LABELS.skinType[p.skinType].toLowerCase()} skin`);
  }
  for (const c of p.skinConcerns) if (s.skinConcerns?.includes(c)) { out.score += 1.5; out.reasons.push(`Addresses ${LABELS.skinConcerns[c].toLowerCase()}`); }
  for (const c of p.hairConcerns) if (s.hairConcerns?.includes(c)) { out.score += 1.5; out.reasons.push(`Addresses ${LABELS.hairConcerns[c].toLowerCase()}`); }
  for (const c of p.oralConcerns) if (s.oralConcerns?.includes(c)) { out.score += 1.5; out.reasons.push(`For ${LABELS.oralConcerns[c].toLowerCase()}`); }
  if (p.scalp && p.scalp !== 'unsure' && s.scalp?.includes(p.scalp)) { out.score += 1; out.reasons.push(`Relevant to ${LABELS.scalp[p.scalp].toLowerCase()}`); }
  const climate = effectiveClimate(p);
  if (climate && s.climates?.includes(climate)) { out.score += 0.5; out.reasons.push(`Suits ${LABELS.climate[climate].toLowerCase()} conditions`); }
  const tags = cautionTags(p);
  for (const t of s.cautionFor ?? []) if (tags.has(t)) out.cautions.push(`Take care: ${LABELS.sensitivities[t].toLowerCase()}`);
  return out;
}

/** Product relevance adds ingredient-level and budget checks. */
export function productRelevance(p: Profile | null | undefined, product: Product): Relevance {
  const r = relevance(p, product.suitability);
  if (!p) return r;
  const ids = product.ingredients.map((i) => i.ingredientId).filter(Boolean) as string[];
  const ings = ids.map((id) => INGREDIENT_MAP[id]).filter(Boolean);
  const tags = cautionTags(p);
  if (tags.has('fragrance_sensitive') && ings.some((i) => i.flags?.includes('fragrance_allergen'))) {
    if (!r.cautions.some((c) => c.includes('fragrance'))) r.cautions.push('Contains fragrance or fragrance allergens');
  }
  if (p.ingredientPrefs.includes('alcohol_free') && ids.includes('alcohol-denat')) r.cautions.push('Contains drying alcohol');
  if (tags.has('pregnancy') && ings.some((i) => i.flags?.includes('pregnancy_caution'))) {
    if (!r.cautions.some((c) => c.includes('pregnan'))) r.cautions.push('Contains an ingredient to discuss with a doctor during pregnancy');
  }
  if (tags.has('sensitive_skin') && ings.some((i) => i.flags?.includes('potential_irritant')) && !r.cautions.some((c) => c.includes('irritated'))) {
    r.cautions.push('Contains a potentially irritating ingredient');
  }
  if (p.ingredientPrefs.includes('minimal') && product.ingredients.length <= 8) { r.score += 0.5; r.reasons.push('Short ingredient list'); }
  if (p.budget !== 'any' && product.price) {
    const max = BUDGET_MAX[p.budget];
    if (product.price.amount <= max) { r.score += 0.5; r.reasons.push('Within your budget'); }
    else r.cautions.push('Above your budget');
  }
  return r;
}
