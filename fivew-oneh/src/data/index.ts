import { ARTICLES } from './articles';
import { INGREDIENTS } from './ingredients';
import { PRODUCTS } from './products';
import { TOPICS } from './topics';
import type { ReviewStatus, SuggestedQuestion } from './types';

export * from './types';
export { CATEGORIES, CATEGORY_MAP } from './categories';
export { SOURCES, SOURCE_MAP } from './sources';
export { INGREDIENT_MAP } from './ingredients';
export { PRODUCT_MAP, unitPrice, completeness } from './products';
export { TOPIC_MAP } from './topics';
export { ARTICLE_MAP } from './articles';
export { REGIONS, REGION_MAP, CLIMATE_LABEL, SEASON_LABEL, seasonFor, seasonalGuidance } from './regions';

/** Draft and archived records never reach public pages; they stay visible in the content dashboard. */
export function isPublic(status: ReviewStatus): boolean {
  return status === 'published' || status === 'reviewed' || status === 'needs_verification';
}

export const ALL = { ARTICLES, INGREDIENTS, PRODUCTS, TOPICS };

export const PUBLIC_INGREDIENTS = INGREDIENTS.filter((i) => isPublic(i.status));
export const PUBLIC_PRODUCTS = PRODUCTS.filter((p) => isPublic(p.status));
export const PUBLIC_TOPICS = TOPICS.filter((t) => isPublic(t.status));
export const PUBLIC_ARTICLES = ARTICLES.filter((a) => isPublic(a.status));

export const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { q: 'Is niacinamide good for oily skin?', categories: ['skin'] },
  { q: 'Mineral sunscreen vs gel sunscreen', categories: ['skin'] },
  { q: 'What do these shampoo ingredients do?', categories: ['hair'] },
  { q: 'Is coconut oil good for hair?', categories: ['hair', 'ayurveda'] },
  { q: 'Which toothpaste is suitable for sensitive teeth?', categories: ['oral'] },
  { q: 'Is this product worth its price?', categories: ['skin', 'hair', 'body', 'oral'] },
  { q: 'Are Ayurvedic alternatives effective?', categories: ['ayurveda'] },
  { q: 'Niacinamide vs vitamin C', categories: ['skin'] },
  { q: 'How to use salicylic acid?', categories: ['skin'] },
  { q: 'Is retinol safe during pregnancy?', categories: ['skin'] },
  { q: 'How to reduce dandruff?', categories: ['hair'] },
  { q: 'Is lemon good for dark spots?', categories: ['home-remedies'] },
];

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: 'Draft',
  needs_verification: 'Needs verification',
  reviewed: 'Reviewed',
  published: 'Published',
  archived: 'Archived',
};
