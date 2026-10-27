import { describe, expect, it } from 'vitest';
import { analyseIngredientList } from '../lib/analyzer';
import { matchIngredient, splitIngredientList } from '../lib/ingredientMatch';

describe('ingredient matching', () => {
  it.each([
    ['Aqua', 'water'],
    ['Aqua/Water', 'water'],
    ['Niacinamide (10%)', 'niacinamide'],
    ['Cocos Nucifera (Coconut) Oil', 'coconut-oil'],
    ['Sodium Monofluorophosphate (1000 ppm F)', 'fluoride'],
    ['Butyl Methoxydibenzoylmethane', 'avobenzone'],
    ['Ceramide NP', 'ceramides'],
    ['CI 77891', 'titanium-dioxide'],
    ['Glycerine', 'glycerin'],
    ['Parfum', 'fragrance'],
    ['Aloe Barbadensis Leaf Juice Powder', 'aloe-vera'],
  ])('%s → %s', (label, id) => {
    expect(matchIngredient(label)?.ingredient.id).toBe(id);
  });

  it('does not match generic words inside unrelated names', () => {
    expect(matchIngredient('Benzyl Alcohol')).toBeNull();
    expect(matchIngredient('Pentylene Glycol')).toBeNull();
  });

  it('splits lists without breaking parentheses', () => {
    expect(splitIngredientList('Ingredients: Aqua, Niacinamide (10%, w/w), Zinc PCA.')).toEqual(['Aqua', 'Niacinamide (10%, w/w)', 'Zinc PCA']);
  });
});

describe('ingredient-list analyser', () => {
  const list = 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Zinc Pyrithione (1%), Unobtainium Extract, Fragrance, Limonene, Sodium Benzoate';
  const a = analyseIngredientList(list);

  it('identifies recognised and unrecognised entries', () => {
    expect(a.entries).toHaveLength(8);
    expect(a.unrecognised.map((e) => e.label)).toEqual(['Unobtainium Extract']);
    expect(a.recognised.find((e) => e.ingredient?.id === 'zinc-pyrithione')?.concentration).toBe('1%');
  });

  it('highlights precautions', () => {
    expect(a.precautions.some((p) => p.kind === 'fragrance_allergen')).toBe(true);
  });

  it('explains ordering limitations and never gives a safety verdict', () => {
    expect(a.notes.join(' ')).toMatch(/descending order/);
    expect(a.notes.join(' ')).toMatch(/cannot tell you whether a product is safe/);
    expect(Object.keys(a)).not.toContain('verdict');
  });
});
