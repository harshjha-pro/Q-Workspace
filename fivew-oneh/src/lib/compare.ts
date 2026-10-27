import { CATEGORY_MAP } from '../data/categories';
import { INGREDIENT_MAP } from '../data/ingredients';
import { completeness, unitPrice } from '../data/products';
import type { EvidenceLevel, Ingredient, Product } from '../data/types';
import { type Profile, productRelevance } from './personalise';

/** Products are comparable when they share a category (e.g. two skin products). */
export function areComparable(products: Product[]): boolean {
  return new Set(products.map((p) => p.category)).size <= 1;
}

export interface IngredientDiff {
  shared: Ingredient[];
  unique: Record<string, Ingredient[]>;
  /** Notable actives: ingredients with a non-glossary record. */
  keyActives: Record<string, { ingredient: Ingredient; concentration?: string }[]>;
}

export function ingredientDiff(products: Product[]): IngredientDiff {
  const sets = products.map((p) => new Set(p.ingredients.map((i) => i.ingredientId).filter(Boolean) as string[]));
  const all = new Set(sets.flatMap((s) => [...s]));
  const shared = [...all].filter((id) => sets.every((s) => s.has(id))).map((id) => INGREDIENT_MAP[id]).filter(Boolean);
  const unique: Record<string, Ingredient[]> = {};
  const keyActives: IngredientDiff['keyActives'] = {};
  products.forEach((p, idx) => {
    unique[p.id] = [...sets[idx]].filter((id) => sets.every((s, j) => j === idx || !s.has(id))).map((id) => INGREDIENT_MAP[id]).filter(Boolean);
    keyActives[p.id] = p.ingredients
      .filter((i) => i.ingredientId && INGREDIENT_MAP[i.ingredientId]?.tier === 'full' && i.ingredientId !== 'glycerin')
      .map((i) => ({ ingredient: INGREDIENT_MAP[i.ingredientId!], concentration: i.concentration }));
  });
  return { shared, unique, keyActives };
}

const EVIDENCE_RANK: Record<EvidenceLevel, number> = { established: 5, moderate: 4, preliminary: 3, traditional: 2, insufficient: 1, unsupported: 0 };

export function strongestEvidence(p: Product): EvidenceLevel | null {
  let best: EvidenceLevel | null = null;
  for (const i of p.ingredients) {
    const ing = i.ingredientId ? INGREDIENT_MAP[i.ingredientId] : null;
    if (!ing || ing.tier !== 'full') continue;
    if (!best || EVIDENCE_RANK[ing.evidence.level] > EVIDENCE_RANK[best]) best = ing.evidence.level;
  }
  return best;
}

export interface ComparisonSummary {
  points: string[];
  preferable: { productId: string; text: string }[];
  cannotConclude: string[];
}

/**
 * Build a transparent, rule-based summary. It describes differences and where
 * each product may suit, and never declares a universal winner.
 */
export function summarise(products: Product[], profile?: Profile | null): ComparisonSummary {
  const points: string[] = [];
  const preferable: ComparisonSummary['preferable'] = [];
  const cannotConclude: string[] = [];
  if (products.length < 2) return { points, preferable, cannotConclude };
  const diff = ingredientDiff(products);

  // Price per unit
  const units = products.map((p) => ({ p, u: unitPrice(p) })).filter((x) => x.u);
  if (units.length === products.length && new Set(products.map((p) => p.netQuantity.unit)).size === 1) {
    const sorted = [...units].sort((a, b) => a.u!.perUnit - b.u!.perUnit);
    const cheapest = sorted[0];
    const dearest = sorted[sorted.length - 1];
    if (dearest.u!.perUnit > cheapest.u!.perUnit * 1.05) {
      points.push(`${cheapest.p.name} costs less per ${cheapest.u!.unit} (₹${cheapest.u!.perUnit.toFixed(1)}) than ${dearest.p.name} (₹${dearest.u!.perUnit.toFixed(1)}).`);
    } else points.push('Price per unit is similar.');
  }

  // Declared concentrations of shared actives
  // Only targeted actives — supporting humectants like glycerin aren't a meaningful difference.
  for (const ing of diff.shared.filter((i) => i.tier === 'full' && i.kind !== 'Humectant')) {
    const decl = products.map((p) => ({ p, c: p.ingredients.find((i) => i.ingredientId === ing.id)?.concentration }));
    if (decl.every((d) => d.c)) {
      points.push(`Both contain ${ing.name}: ${decl.map((d) => `${d.c} in ${d.p.name}`).join(', ')}.${ing.concentrations ? ` ${ing.concentrations}` : ''}`);
    } else {
      points.push(`${ing.name} appears in ${products.length === 2 ? 'both' : 'all'}, but not every product declares its strength.`);
      cannotConclude.push(`Whether ${ing.name} amounts are similar — strength is not declared on every label.`);
    }
  }

  products.forEach((p) => {
    const actives = diff.keyActives[p.id].filter((a) => !diff.shared.includes(a.ingredient));
    const fragrance = p.ingredients.some((i) => i.ingredientId && INGREDIENT_MAP[i.ingredientId]?.flags?.includes('fragrance_allergen'));
    const parts: string[] = [];
    if (actives.length) parts.push(`contains ${actives.map((a) => a.ingredient.name + (a.concentration ? ` (${a.concentration})` : '')).join(', ')} which the other${products.length > 2 ? 's do' : ' does'} not`);
    if (!fragrance && products.some((o) => o !== p && o.ingredients.some((i) => i.ingredientId && INGREDIENT_MAP[i.ingredientId]?.flags?.includes('fragrance_allergen')))) parts.push('is fragrance-free');
    if (p.suitability?.skinTypes?.length) parts.push(`is positioned for ${p.suitability.skinTypes.join(', ')} skin`);
    if (parts.length) preferable.push({ productId: p.id, text: `${p.name} may be preferable if you want a product that ${parts.join('; ')}.` });
  });

  if (profile) {
    const rel = products.map((p) => ({ p, r: productRelevance(profile, p) }));
    rel.forEach(({ p, r }) => {
      if (r.cautions.length) points.push(`For your preferences, ${p.name}: ${r.cautions.join('; ').toLowerCase()}.`);
    });
  }

  if (products.some((p) => !p.ingredientListVerified)) cannotConclude.push('Formulation details beyond the label — ingredient lists here are not independently verified.');
  if (products.some((p) => p.demo)) cannotConclude.push('Real-world performance: these are fictional demonstration records.');
  cannotConclude.push('Which product will work best for you — individual skin, hair and health differ, and no head-to-head study exists for these products.');
  if (products.some((p) => !p.price?.verified)) cannotConclude.push('Current market price — prices shown are not verified.');

  return { points, preferable, cannotConclude };
}

export function productRows(p: Product) {
  const u = unitPrice(p);
  const c = completeness(p);
  return {
    category: `${CATEGORY_MAP[p.category]?.name ?? p.category} · ${CATEGORY_MAP[p.category]?.subcategories.find((s) => s.id === p.subcategory)?.name ?? p.subcategory}`,
    unitPrice: u ? `₹${u.perUnit.toFixed(1)} / ${u.unit} (₹${Math.round(u.per100)} per 100 ${u.unit})` : 'Not available',
    completeness: c,
    evidence: strongestEvidence(p),
  };
}
