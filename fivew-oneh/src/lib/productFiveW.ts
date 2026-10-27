import { CATEGORY_MAP } from '../data/categories';
import { INGREDIENT_MAP } from '../data/ingredients';
import type { FiveW1H, Product } from '../data/types';
import { LABELS } from './personalise';

/** Derive a product's 5W1H strictly from fields on its record — nothing is invented. */
export function productFiveW(p: Product): FiveW1H {
  const actives = p.ingredients
    .filter((i) => i.ingredientId && INGREDIENT_MAP[i.ingredientId]?.tier === 'full')
    .map((i) => `${INGREDIENT_MAP[i.ingredientId!].name}${i.concentration ? ` (${i.concentration})` : ''}`);
  const s = p.suitability ?? {};
  const who = [
    ...(s.skinTypes ?? []).map((t) => `${LABELS.skinType[t]} skin`),
    ...(s.skinConcerns ?? []).map((c) => LABELS.skinConcerns[c]),
    ...(s.hairConcerns ?? []).map((c) => LABELS.hairConcerns[c]),
    ...(s.oralConcerns ?? []).map((c) => LABELS.oralConcerns[c]),
  ];
  const area = { skin: 'Face and/or body skin as directed on the label.', hair: 'Scalp and hair.', oral: 'Teeth, gums and mouth — not to be swallowed.', body: 'Body skin and underarms as directed.' }[p.category];
  const sub = CATEGORY_MAP[p.category]?.subcategories.find((x) => x.id === p.subcategory)?.name;
  return {
    what: { summary: p.description, points: [`${p.productType}${sub ? ` (${sub})` : ''}`, actives.length ? `Key ingredients: ${actives.join(', ')}` : 'No ingredients with a full CareLens guide identified'] },
    why: { summary: `Intended use: ${p.intendedUse}.`, points: p.benefits },
    when: p.directions ? { summary: p.directions } : undefined,
    who: who.length || s.cautionFor?.length
      ? { summary: who.length ? `Positioned for: ${who.join(', ')}.` : 'No specific positioning recorded.', points: (s.cautionFor ?? []).map((c) => `Take care: ${LABELS.sensitivities[c].toLowerCase()}`) }
      : undefined,
    where: area ? { summary: area } : undefined,
    how: p.directions ? { summary: p.directions, points: p.warnings } : undefined,
  };
}
