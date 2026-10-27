import { describe, expect, it } from 'vitest';
import { PRODUCT_MAP, unitPrice } from '../data/products';
import { areComparable, ingredientDiff, summarise } from '../lib/compare';
import { EMPTY_PROFILE } from '../lib/personalise';

const a = PRODUCT_MAP['demo-niacinamide-10-zinc'];
const b = PRODUCT_MAP['demo-niacinamide-5-ha'];

describe('comparison', () => {
  it('computes price per unit', () => {
    expect(unitPrice(a)?.perUnit).toBeCloseTo(25);
    expect(unitPrice(b)?.perUnit).toBeCloseTo(19.97, 1);
  });

  it('checks category compatibility', () => {
    expect(areComparable([a, b])).toBe(true);
    expect(areComparable([a, PRODUCT_MAP['demo-fluoride-toothpaste']])).toBe(false);
  });

  it('finds shared and unique ingredients', () => {
    const d = ingredientDiff([a, b]);
    expect(d.shared.map((i) => i.id)).toContain('niacinamide');
    expect(d.unique[a.id].map((i) => i.id)).toContain('zinc-pca');
    expect(d.unique[b.id].map((i) => i.id)).toContain('hyaluronic-acid');
  });

  it('summarises differences without naming a universal winner', () => {
    const s = summarise([a, b]);
    const text = [...s.points, ...s.preferable.map((p) => p.text)].join(' ');
    expect(text).toMatch(/10% in/);
    expect(text).toMatch(/costs less per ml/);
    expect(text.toLowerCase()).not.toMatch(/\bbest\b|\bwinner\b/);
    expect(s.cannotConclude.length).toBeGreaterThan(0);
  });

  it('adds personal cautions when a profile is supplied', () => {
    const s = summarise([PRODUCT_MAP['demo-mineral-sunscreen'], PRODUCT_MAP['demo-chemical-sunscreen']], { ...EMPTY_PROFILE, ingredientPrefs: ['fragrance_free'] });
    expect(s.points.join(' ')).toMatch(/fragrance/i);
  });

  it('handles three products', () => {
    const s = summarise([a, b, PRODUCT_MAP['demo-vitamin-c-serum']]);
    expect(s.preferable.length).toBeGreaterThan(0);
  });
});
