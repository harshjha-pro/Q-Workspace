import { describe, expect, it } from 'vitest';
import { classifyIntent, didYouMean, expandQuery, quickAnswer, resolveComparison, search, suggest } from '../lib/search';
import { EMPTY_PROFILE } from '../lib/personalise';

const top = (q: string, opts = {}) => search(q, opts)[0]?.doc;

describe('search', () => {
  it('finds ingredients case-insensitively and by partial match', () => {
    expect(top('NIACINAMIDE')?.id).toBe('niacinamide');
    expect(top('niacin')?.id).toBe('niacinamide');
    expect(top('salicy')?.id).toBe('salicylic-acid');
  });

  it('resolves synonyms and spelling variations', () => {
    expect(top('vitamin b3')?.id).toBe('niacinamide');
    expect(top('vit c')?.id).toBe('vitamin-c');
    expect(top('niacinimide')?.id).toBe('niacinamide');
    expect(top('haldi')?.id).toBe('turmeric');
    expect(top('nariyal tel')?.id).toBe('coconut-oil');
    expect(top('sodium hyaluronate')?.id).toBe('hyaluronic-acid');
  });

  it('finds concerns, products, brands, categories and articles', () => {
    expect(top('pimples')?.id).toBe('acne');
    expect(top('hairfall')?.id).toBe('hair-fall');
    expect(search('DemoLab Dental').every((h, i) => i > 3 || h.doc.type === 'product')).toBe(true);
    expect(search('sunscreen', { types: ['product'] }).length).toBeGreaterThanOrEqual(3);
    expect(top('oral care')?.id).toBe('oral');
    expect(search('marketing claims', { types: ['article'] })[0]?.doc.id).toBe('marketing-claims-decoded');
  });

  it('answers natural-language questions with relevant records', () => {
    expect(top('Is niacinamide good for oily skin?')?.id).toBe('niacinamide');
    expect(top('Is coconut oil good for hair?')?.id).toBe('coconut-oil');
    const teeth = search('Which toothpaste is suitable for sensitive teeth?').slice(0, 5).map((h) => h.doc.id);
    expect(teeth).toContain('sensitive-teeth');
    expect(teeth).toContain('demo-sensitive-toothpaste');
    expect(top('Are Ayurvedic alternatives effective?')?.id).toBe('natural-vs-synthetic');
  });

  it('filters by type and category', () => {
    const hits = search('oil', { types: ['ingredient'], category: 'hair' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.doc.type === 'ingredient' && h.doc.categories.includes('hair'))).toBe(true);
  });

  it('never returns draft or archived content', () => {
    expect(search('monsoon hair care draft').some((h) => h.doc.id === 'monsoon-hair-care-draft')).toBe(false);
    expect(search('sunscreen guide 2024').some((h) => h.doc.id === 'old-sunscreen-guide')).toBe(false);
  });

  it('returns nothing for gibberish, with a did-you-mean for typos', () => {
    expect(search('qwxzv')).toHaveLength(0);
    expect(didYouMean('niacinmide serum')).toContain('niacinamide');
    expect(didYouMean('niacinamide')).toBeNull();
  });

  it('personalisation boosts relevant records', () => {
    const profile = { ...EMPTY_PROFILE, skinType: 'dry' as const, skinConcerns: ['dryness' as const] };
    const plain = search('moisturiser', { types: ['product'] }).map((h) => h.doc.id);
    const personal = search('moisturiser', { types: ['product'], profile });
    const rank = (ids: string[]) => ids.indexOf('demo-ceramide-cream');
    expect(rank(personal.map((h) => h.doc.id))).toBeLessThan(rank(plain));
    expect(personal.find((h) => h.doc.id === 'demo-ceramide-cream')!.reasons.length).toBeGreaterThan(0);
    expect(plain.length).toBe(personal.length);
  });

  it('suggests completions', () => {
    const s = suggest('nia');
    expect(s[0].label).toBe('Niacinamide');
  });
});

describe('intent classification', () => {
  it.each([
    ['Sunscreen A vs Sunscreen B', 'comparison'],
    ['niacinamide versus vitamin c', 'comparison'],
    ['What do these shampoo ingredients do?', 'product_analysis'],
    ['Is this product worth its price?', 'product_analysis'],
    ['Are there alternatives to retinol', 'alternatives'],
    ['Is retinol safe during pregnancy?', 'safety'],
    ['Is niacinamide good for oily skin?', 'suitability'],
    ['How to use salicylic acid', 'usage'],
    ['What is niacinamide', 'ingredient_explanation'],
    ['ceramides', 'general_education'],
  ])('%s → %s', (q, intent) => {
    expect(classifyIntent(q).intent).toBe(intent);
  });

  it('maps question words to 5W1H sections', () => {
    expect(classifyIntent('when should I apply vitamin c').section).toBe('when');
    expect(classifyIntent('how to use retinol').section).toBe('how');
  });
});

describe('comparison resolution', () => {
  it('resolves ingredient comparisons', () => {
    const r = resolveComparison('Niacinamide vs Vitamin C');
    expect(r?.kind).toBe('ingredients');
    expect(r?.ids).toEqual(['niacinamide', 'vitamin-c']);
  });
  it('resolves product comparisons', () => {
    const r = resolveComparison('mineral sunscreen vs ultra-light sunscreen gel');
    expect(r?.kind).toBe('products');
    expect(r?.ids).toEqual(['demo-mineral-sunscreen', 'demo-chemical-sunscreen']);
  });
  it('falls back to a subcategory comparison for generic names', () => {
    const r = resolveComparison('Sunscreen A vs Sunscreen B');
    expect(r).not.toBeNull();
    expect(r!.ids.length).toBe(2);
  });
});

describe('quick answers', () => {
  it('retrieves an FAQ answer when the question matches', () => {
    const q = 'Is coconut oil good for hair?';
    const a = quickAnswer(q, search(q), classifyIntent(q));
    expect(a?.doc.id).toBe('coconut-oil');
    expect(a?.text).toMatch(/not proven to grow hair/);
  });
  it('retrieves a 5W1H section for usage questions', () => {
    const q = 'how to use salicylic acid';
    const a = quickAnswer(q, search(q), classifyIntent(q));
    expect(a?.section).toBe('how');
  });
  it('expands queries', () => {
    expect(expandQuery('SPF 50')).toContain('sunscreen');
  });
});
