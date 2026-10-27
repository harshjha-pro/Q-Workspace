import { normalize } from './ingredientMatch';
import type { Article, CareTopic, Ingredient, Product } from '../data/types';

/** Subcategory of the "Ingredients" category, derived from the ingredient kind. */
export function ingredientGroup(i: Ingredient): string {
  const k = i.kind.toLowerCase();
  if (k.includes('uv filter')) return 'uv-filters';
  if (/botanical|plant oil|clay/.test(k)) return 'botanicals';
  if (/surfactant|cleanser/.test(k)) return 'surfactants';
  if (/humectant|emollient|occlusive|barrier lipid|fatty alcohol|silicone|butter/.test(k)) return 'humectants';
  if (/preservative|ph adjuster|thickener|chelating|solvent|fragrance|sweetener|abrasive|antioxidant$|conditioning|cooling|flavour/.test(k)) return 'preservatives';
  return 'actives';
}

const stemName = (s: string) => normalize(s).replace(/s$/, '').replace(/ & .*$/, '');

/** Whether a record belongs to a subcategory within a category page. */
export function inSubcategory(
  categoryId: string,
  sub: string,
  rec: { type: 'product'; v: Product } | { type: 'ingredient'; v: Ingredient } | { type: 'topic'; v: CareTopic } | { type: 'article'; v: Article },
  subName: string,
): boolean {
  if (sub === 'all') return true;
  switch (rec.type) {
    case 'product':
      return rec.v.subcategory === sub;
    case 'ingredient':
      if (categoryId === 'ingredients') return ingredientGroup(rec.v) === sub;
      if (categoryId === 'ayurveda') return sub === 'herbs';
      return rec.v.productTypes.some((pt) => stemName(pt).startsWith(stemName(subName)) || stemName(subName).startsWith(stemName(pt)));
    case 'topic':
      if (categoryId === 'ayurveda') return sub === 'practices';
      return rec.v.subcategory === sub;
    case 'article':
      return rec.v.keywords.some((k) => stemName(k).includes(stemName(subName)));
  }
}
