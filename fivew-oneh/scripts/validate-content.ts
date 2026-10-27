// Validates the content database: references, review metadata and honesty rules.
// Usage: npm run validate:content  (exits non-zero on errors)
import { ARTICLES } from '../src/data/articles';
import { CATEGORY_MAP } from '../src/data/categories';
import { INGREDIENT_MAP, INGREDIENTS } from '../src/data/ingredients';
import { PRODUCT_MAP, PRODUCTS } from '../src/data/products';
import { SOURCE_MAP } from '../src/data/sources';
import { TOPIC_MAP, TOPICS } from '../src/data/topics';
import type { ReviewStatus } from '../src/data/types';

const errors: string[] = [];
const warnings: string[] = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const err = (m: string) => errors.push(m);

function common(kind: string, id: string, status: ReviewStatus, sources: string[], date: string) {
  if (!isoDate.test(date)) err(`${kind} ${id}: invalid date "${date}"`);
  for (const s of sources) if (!SOURCE_MAP[s]) err(`${kind} ${id}: unknown source "${s}"`);
  if ((status === 'published' || status === 'reviewed') && sources.length === 0) err(`${kind} ${id}: ${status} without sources`);
  if (status === 'needs_verification') warnings.push(`${kind} ${id}: needs verification`);
}

const ids = new Set<string>();
for (const list of [INGREDIENTS, PRODUCTS, TOPICS, ARTICLES]) for (const x of list) {
  if (!/^[a-z0-9-]+$/.test(x.id)) err(`invalid id "${x.id}"`);
}
for (const i of INGREDIENTS) {
  if (ids.has(`i:${i.id}`)) err(`duplicate ingredient ${i.id}`);
  ids.add(`i:${i.id}`);
  common('ingredient', i.id, i.status, i.sources, i.lastReviewed);
  for (const c of i.categories) if (!CATEGORY_MAP[c]) err(`ingredient ${i.id}: unknown category ${c}`);
  for (const a of i.alternatives ?? []) if (!INGREDIENT_MAP[a]) err(`ingredient ${i.id}: unknown alternative ${a}`);
  if (i.tier === 'full' && !i.fiveW) err(`ingredient ${i.id}: full record missing 5W1H`);
}
for (const p of PRODUCTS) {
  common('product', p.id, p.status, p.sources, p.lastVerified);
  const cat = CATEGORY_MAP[p.category];
  if (!cat) err(`product ${p.id}: unknown category`);
  else if (!cat.subcategories.some((s) => s.id === p.subcategory)) err(`product ${p.id}: unknown subcategory ${p.subcategory}`);
  if (!p.demo && p.verification === 'unverified' && p.status === 'published') err(`product ${p.id}: real product published without verification`);
  if (p.price && !p.price.verified && !p.demo) err(`product ${p.id}: unverified price on a non-demo product`);
  const unrec = p.ingredients.filter((x) => !x.ingredientId).map((x) => x.label);
  if (unrec.length) warnings.push(`product ${p.id}: unrecognised ingredients: ${unrec.join(', ')}`);
}
for (const t of TOPICS) {
  common('topic', t.id, t.status, t.sources, t.lastReviewed);
  for (const r of t.relatedIngredients ?? []) if (!INGREDIENT_MAP[r]) err(`topic ${t.id}: unknown ingredient ${r}`);
  for (const r of t.relatedTopics ?? []) if (!TOPIC_MAP[r]) err(`topic ${t.id}: unknown topic ${r}`);
  for (const c of t.categories) if (!CATEGORY_MAP[c]) err(`topic ${t.id}: unknown category ${c}`);
}
for (const a of ARTICLES) {
  common('article', a.id, a.status, a.sources, a.lastReviewed);
  for (const r of a.relatedIngredients ?? []) if (!INGREDIENT_MAP[r]) err(`article ${a.id}: unknown ingredient ${r}`);
  for (const r of a.relatedTopics ?? []) if (!TOPIC_MAP[r]) err(`article ${a.id}: unknown topic ${r}`);
  for (const r of a.relatedProducts ?? []) if (!PRODUCT_MAP[r]) err(`article ${a.id}: unknown product ${r}`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`\n${INGREDIENTS.length} ingredients, ${PRODUCTS.length} products, ${TOPICS.length} topics, ${ARTICLES.length} articles — ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
