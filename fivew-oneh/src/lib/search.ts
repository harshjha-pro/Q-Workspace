import { CATEGORIES } from '../data/categories';
import { PUBLIC_ARTICLES, PUBLIC_INGREDIENTS, PUBLIC_PRODUCTS, PUBLIC_TOPICS, SUGGESTED_QUESTIONS } from '../data/index';
import type { FAQ, FiveW1H, SuitabilityTags, W1HKey } from '../data/types';
import { editDistance, normalize } from './ingredientMatch';
import { type Profile, productRelevance, relevance } from './personalise';

export type DocType = 'ingredient' | 'product' | 'topic' | 'article' | 'category';

export interface SearchDoc {
  key: string;
  type: DocType;
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  href: string;
  categories: string[];
  suitability?: SuitabilityTags;
  fiveW?: FiveW1H;
  faqs?: FAQ[];
  /** Tokenised fields, prepared once. */
  t: { title: Set<string>; alias: Set<string>; keyword: Set<string>; body: Set<string>; phrases: string[] };
}

// ---------- Text processing ----------

const STOPWORDS = new Set(
  'a an the is are was be been am do does did what whats which who whom where when why how can could should would will shall may might must i me my we our you your it its this that these those to of in on at for from by with about into over under and or but if then than so very really much many more most some any all good best better bad use used using get make there their them they he she his her as not no yes also just like ok okay please tell know explain any one'.split(
    ' ',
  ),
);

/** Phrase-level synonyms and common spelling variants applied before tokenising. */
export const QUERY_SYNONYMS: [RegExp, string][] = [
  [/\bvit(?:amin)?\.?\s*c\b/g, 'vitamin c'],
  [/\bvitc\b/g, 'vitamin c'],
  [/\bvit(?:amin)?\.?\s*b3\b/g, 'niacinamide'],
  [/\bvit(?:amin)?\.?\s*e\b/g, 'tocopherol'],
  [/\bvit(?:amin)?\.?\s*a\b/g, 'retinoids'],
  [/\bsun\s*block\b/g, 'sunscreen'],
  [/\bsun\s*screen\b/g, 'sunscreen'],
  [/\bspf\b/g, 'sunscreen spf'],
  [/\bface\s*wash\b/g, 'cleanser face wash'],
  [/\bmoisturi[sz]ers?\b/g, 'moisturiser'],
  [/\bmoisturi[sz]ing\b/g, 'moisturiser'],
  [/\bhair\s*fall\b/g, 'hair fall'],
  [/\bhairfall\b/g, 'hair fall'],
  [/\bhair\s*loss\b/g, 'hair fall'],
  [/\btooth\s*paste\b/g, 'toothpaste'],
  [/\bmouth\s*wash\b/g, 'mouthwash'],
  [/\bdeo\b/g, 'deodorant'],
  [/\bpimples?\b/g, 'acne pimples'],
  [/\bbreakouts?\b/g, 'acne'],
  [/\bdark\s*spots?\b/g, 'pigmentation dark spots'],
  [/\btan(ning)?\b/g, 'tan pigmentation'],
  [/\bcolou?r\b/g, 'colour'],
  [/\bflavou?r\b/g, 'flavour'],
  [/\bayurved(a|ic)\b/g, 'ayurveda ayurvedic'],
  [/\bhome\s*remed(y|ies)\b/g, 'home remedies'],
  [/\bteeth\b/g, 'teeth tooth'],
  [/\bbha\b/g, 'salicylic acid'],
  [/\bbpo\b/g, 'benzoyl peroxide'],
  [/\bha\b/g, 'hyaluronic acid'],
  [/\bsls\b/g, 'sodium lauryl sulfate'],
  [/\bsulphates?\b/g, 'sulfate'],
  [/\bfragrance\s*free\b/g, 'fragrance'],
  [/\bhaldi\b/g, 'turmeric haldi'],
  [/\bnariyal\b/g, 'coconut'],
];

function stem(tok: string): string {
  if (tok.length > 4 && tok.endsWith('ies')) return tok.slice(0, -3) + 'y';
  if (tok.length > 4 && tok.endsWith('es') && /(ss|sh|ch|x)es$/.test(tok)) return tok.slice(0, -2);
  if (tok.length > 3 && tok.endsWith('s') && !tok.endsWith('ss') && !tok.endsWith('us') && !tok.endsWith('is')) return tok.slice(0, -1);
  return tok;
}

export function tokenize(text: string, dropStop = true): string[] {
  return normalize(text)
    .replace(/[/%-]/g, ' ')
    .split(' ')
    .filter((t) => t && (!dropStop || !STOPWORDS.has(t)))
    .map(stem);
}

export function expandQuery(q: string): string {
  let s = ` ${normalize(q)} `;
  for (const [re, rep] of QUERY_SYNONYMS) s = s.replace(re, rep);
  return s.trim();
}

const toSet = (parts: (string | undefined)[]) => new Set(parts.filter(Boolean).flatMap((p) => tokenize(p as string)));

function makeDoc(d: Omit<SearchDoc, 't'> & { aliases: string[]; keywords: string[]; body: string }): SearchDoc {
  const { aliases, keywords, body, ...rest } = d;
  return {
    ...rest,
    t: {
      title: toSet([d.title]),
      alias: toSet(aliases),
      keyword: toSet(keywords),
      body: toSet([body]),
      phrases: [d.title, ...aliases].map((x) => tokenize(x).join(' ')).filter(Boolean),
    },
  };
}

const fiveText = (f?: FiveW1H) => (f ? Object.values(f).map((s) => `${s.summary} ${(s.points ?? []).join(' ')}`).join(' ') : '');

// ---------- Index ----------

export function buildIndex(): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const c of CATEGORIES) {
    docs.push(
      makeDoc({
        key: `category:${c.id}`, type: 'category', id: c.id, title: c.name, subtitle: 'Category', snippet: c.description,
        href: `/category/${c.id}`, categories: [c.id], aliases: [c.short], keywords: c.subcategories.map((s) => s.name), body: c.description,
      }),
    );
  }
  for (const i of PUBLIC_INGREDIENTS) {
    docs.push(
      makeDoc({
        key: `ingredient:${i.id}`, type: 'ingredient', id: i.id, title: i.name, subtitle: `Ingredient · ${i.kind}`, snippet: i.summary,
        href: `/ingredient/${i.id}`, categories: i.categories, suitability: i.suitability, fiveW: i.fiveW, faqs: i.faqs,
        aliases: [i.inci ?? '', ...i.synonyms], keywords: [...i.functions, ...i.productTypes, i.kind],
        body: [i.summary, ...(i.benefits ?? []), ...(i.faqs ?? []).map((f) => f.q), fiveText(i.fiveW), i.traditionalUse ?? ''].join(' '),
      }),
    );
  }
  for (const p of PUBLIC_PRODUCTS) {
    const cat = CATEGORIES.find((c) => c.id === p.category);
    const sub = cat?.subcategories.find((s) => s.id === p.subcategory);
    docs.push(
      makeDoc({
        key: `product:${p.id}`, type: 'product', id: p.id, title: p.name, subtitle: `Product · ${p.brand}${p.demo ? ' · Demo record' : ''}`, snippet: p.description,
        href: `/product/${p.id}`, categories: [p.category], suitability: p.suitability,
        aliases: [p.brand, `${p.brand} ${p.name}`], keywords: [p.productType, sub?.name ?? '', cat?.name ?? '', p.intendedUse],
        body: [p.description, p.ingredients.map((x) => x.label).join(' '), (p.benefits ?? []).join(' ')].join(' '),
      }),
    );
  }
  for (const t of PUBLIC_TOPICS) {
    const kindLabel = { practice: 'Practice', ayurvedic: 'Ayurvedic & traditional', home_remedy: 'Home remedy', lifestyle: 'Lifestyle', concern: 'Concern' }[t.kind];
    docs.push(
      makeDoc({
        key: `topic:${t.id}`, type: 'topic', id: t.id, title: t.name, subtitle: kindLabel, snippet: t.summary,
        href: `/topic/${t.id}`, categories: t.categories, suitability: t.suitability, fiveW: t.fiveW, faqs: t.faqs,
        aliases: t.synonyms, keywords: [kindLabel, ...(t.claims ?? []).map((c) => c.claim)],
        body: [t.summary, t.traditionalPurpose ?? '', fiveText(t.fiveW)].join(' '),
      }),
    );
  }
  for (const a of PUBLIC_ARTICLES) {
    docs.push(
      makeDoc({
        key: `article:${a.id}`, type: 'article', id: a.id, title: a.title, subtitle: `Article · ${a.readMinutes} min read`, snippet: a.summary,
        href: `/learn/${a.id}`, categories: a.categories,
        aliases: [], keywords: a.keywords,
        body: [a.summary, ...a.takeaways, ...a.sections.map((s) => `${s.heading} ${s.body.join(' ')} ${(s.bullets ?? []).join(' ')}`)].join(' '),
      }),
    );
  }
  return docs;
}

let INDEX: SearchDoc[] | null = null;
export function getIndex(): SearchDoc[] {
  return (INDEX ??= buildIndex());
}

let VOCAB: string[] | null = null;
function vocabulary(): string[] {
  if (!VOCAB) {
    const v = new Set<string>();
    for (const d of getIndex()) for (const set of [d.t.title, d.t.alias, d.t.keyword]) set.forEach((t) => t.length >= 3 && v.add(t));
    VOCAB = [...v];
  }
  return VOCAB;
}

// ---------- Intent ----------

export type Intent =
  | 'comparison'
  | 'product_analysis'
  | 'alternatives'
  | 'safety'
  | 'suitability'
  | 'usage'
  | 'ingredient_explanation'
  | 'general_education';

export const INTENT_LABEL: Record<Intent, string> = {
  comparison: 'Comparison',
  product_analysis: 'Product / label analysis',
  alternatives: 'Alternatives',
  safety: 'Safety',
  suitability: 'Suitability',
  usage: 'How & when to use',
  ingredient_explanation: 'Explanation',
  general_education: 'General education',
};

export interface IntentResult {
  intent: Intent;
  section?: W1HKey;
}

export function classifyIntent(query: string): IntentResult {
  const q = ` ${normalize(query)} `;
  if (/\s(vs|versus|compare|comparison|compared)\s|difference between|better than/.test(q)) return { intent: 'comparison' };
  if (/what do (these|this|the) .*ingredients?|ingredient list|analy[sz]e|these ingredients|label mean|worth (it|its|the)|value for money|price/.test(q))
    return { intent: 'product_analysis' };
  if (/alternative|instead of|substitute|replace|swap/.test(q)) return { intent: 'alternatives' };
  if (/\ssafe|side effect|harmful|danger|toxic|pregnan|breastfeed|allerg|irritat|\srisk|cancer|poison/.test(q)) return { intent: 'safety', section: 'who' };
  if (/good for|suitable|\ssuit|right for|ok for|work for|works for|can i use|which .* for|best .* for|for (oily|dry|sensitive|combination|normal|acne|kids|children|men|women)/.test(q))
    return { intent: 'suitability', section: 'who' };
  if (/\swhen\s/.test(q)) return { intent: 'usage', section: 'when' };
  if (/\swhere\s/.test(q)) return { intent: 'usage', section: 'where' };
  if (/how (to|do|much|often|should|many|long)|apply|routine|frequency|\bsteps?\b/.test(q)) return { intent: 'usage', section: 'how' };
  if (/\swhy\s/.test(q)) return { intent: 'ingredient_explanation', section: 'why' };
  if (/what (is|are|does)|meaning|explain|tell me about|define/.test(q)) return { intent: 'ingredient_explanation', section: 'what' };
  return { intent: 'general_education' };
}

// ---------- Ranking ----------

export interface SearchOptions {
  types?: DocType[];
  category?: string;
  profile?: Profile | null;
  /** Climates relevant to the current season/region; matching docs get a small boost. */
  contextClimates?: string[];
  limit?: number;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  matched: string[];
  reasons: string[];
  cautions: string[];
}

const TYPE_WEIGHT: Record<DocType, number> = { category: 1.05, ingredient: 1.15, topic: 1.1, article: 1, product: 0.95 };

function fuzzyHit(tok: string, set: Set<string>): boolean {
  if (tok.length < 5) return false;
  const max = tok.length >= 8 ? 2 : 1;
  for (const s of set) if (Math.abs(s.length - tok.length) <= max && editDistance(tok, s, max) <= max) return true;
  return false;
}

function prefixHit(tok: string, set: Set<string>): boolean {
  if (tok.length < 3) return false;
  for (const s of set) if (s.startsWith(tok)) return true;
  return false;
}

function scoreDoc(doc: SearchDoc, tokens: string[], phrase: string): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  for (const tok of tokens) {
    let s = 0;
    const { title, alias, keyword, body } = doc.t;
    if (title.has(tok)) s = 10;
    else if (alias.has(tok)) s = 7;
    else if (prefixHit(tok, title)) s = 6;
    else if (keyword.has(tok)) s = 4;
    else if (prefixHit(tok, alias)) s = 4;
    else if (fuzzyHit(tok, title) || fuzzyHit(tok, alias)) s = 4;
    else if (prefixHit(tok, keyword)) s = 2;
    else if (body.has(tok)) s = 1.5;
    else if (tok.length >= 4 && prefixHit(tok, body)) s = 0.75;
    if (s > 0) matched.push(tok);
    score += s;
  }
  if (!matched.length) return { score: 0, matched };
  if (phrase && doc.t.phrases.some((p) => p === phrase)) score += 25;
  else if (phrase.includes(' ') && doc.t.phrases.some((p) => p.includes(phrase) || (p.length > 3 && phrase.includes(p)))) score += 10;
  else if (doc.t.phrases.some((p) => p.length > 3 && ` ${phrase} `.includes(` ${p} `))) score += 8;
  const coverage = matched.length / tokens.length;
  return { score: score * (0.35 + 0.65 * coverage) * TYPE_WEIGHT[doc.type], matched };
}

export function search(query: string, opts: SearchOptions = {}): SearchHit[] {
  const expanded = expandQuery(query);
  const tokens = [...new Set(tokenize(expanded))];
  if (!tokens.length) return [];
  const phrase = tokens.join(' ');
  const hits: SearchHit[] = [];
  for (const doc of getIndex()) {
    if (opts.types && !opts.types.includes(doc.type)) continue;
    if (opts.category && !doc.categories.includes(opts.category)) continue;
    const { score, matched } = scoreDoc(doc, tokens, phrase);
    if (score <= 0) continue;
    // With 3+ query words, drop weak matches that only hit one incidental body word.
    if (tokens.length >= 3 && matched.length === 1 && score < 6) continue;
    let final = score;
    let reasons: string[] = [];
    let cautions: string[] = [];
    if (opts.profile) {
      const rel = doc.type === 'product' ? productRelevance(opts.profile, PUBLIC_PRODUCTS.find((p) => p.id === doc.id)!) : relevance(opts.profile, doc.suitability);
      final = final * (1 + Math.min(rel.score, 4) * 0.12) + Math.min(rel.score, 4) * 1.5;
      reasons = rel.reasons;
      cautions = rel.cautions;
    }
    if (opts.contextClimates?.length && doc.suitability?.climates?.some((c) => opts.contextClimates!.includes(c))) final *= 1.04;
    hits.push({ doc, score: final, matched, reasons, cautions });
  }
  hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

// ---------- Did you mean / suggestions ----------

/** Suggest a corrected query when some words match nothing in the vocabulary. */
export function didYouMean(query: string): string | null {
  const words = normalize(query).split(' ').filter(Boolean);
  const vocab = vocabulary();
  const vocabSet = new Set(vocab);
  let changed = false;
  const fixed = words.map((w) => {
    if (STOPWORDS.has(w) || w.length < 4 || vocabSet.has(stem(w)) || vocab.some((v) => v.startsWith(w))) return w;
    let best = w;
    let bestD = w.length >= 8 ? 3 : 2;
    for (const v of vocab) {
      const d = editDistance(w, v, bestD);
      if (d < bestD) { best = v; bestD = d; }
    }
    if (best !== w) changed = true;
    return best;
  });
  return changed ? fixed.join(' ') : null;
}

export interface Suggestion {
  label: string;
  href?: string;
  kind: DocType | 'question';
}

export function suggest(prefix: string, limit = 7): Suggestion[] {
  const p = normalize(prefix);
  if (p.length < 2) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const docs = getIndex();
  const push = (s: Suggestion) => { if (!seen.has(s.label.toLowerCase())) { seen.add(s.label.toLowerCase()); out.push(s); } };
  for (const d of docs) if (normalize(d.title).startsWith(p)) push({ label: d.title, href: d.href, kind: d.type });
  for (const d of docs) if (d.type !== 'product' && d.t.phrases.some((ph) => ph.startsWith(p)) && !normalize(d.title).startsWith(p)) push({ label: d.title, href: d.href, kind: d.type });
  for (const q of SUGGESTED_QUESTIONS) if (normalize(q.q).includes(p)) push({ label: q.q, kind: 'question' });
  if (out.length < limit) for (const h of search(prefix, { limit })) push({ label: h.doc.title, href: h.doc.href, kind: h.doc.type });
  return out.slice(0, limit);
}

// ---------- Comparison queries ----------

export interface ComparisonResolution {
  kind: 'products' | 'ingredients' | 'category';
  ids: string[];
  href: string;
  label: string;
}

export function resolveComparison(query: string): ComparisonResolution | null {
  const q = normalize(query).replace(/^(compare|comparison of|difference between)\s+/, '');
  const parts = q.split(/\s+(?:vs|versus|or|and|compared to|compared with|with)\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const sides = parts.slice(0, 4).map((part) => search(part, { types: ['product', 'ingredient'], limit: 3 })[0]);
  if (sides.every((s) => s?.doc.type === 'ingredient')) {
    const ids = [...new Set(sides.map((s) => s!.doc.id))];
    if (ids.length >= 2) return { kind: 'ingredients', ids, href: `/compare?mode=ingredients&i=${ids.join(',')}`, label: sides.map((s) => s!.doc.title).join(' vs ') };
  }
  // Mixed or product sides: resolve every side against products only.
  const products = parts.slice(0, 4).map((part) => search(part, { types: ['product'], limit: 1 })[0]?.doc.id).filter(Boolean) as string[];
  const uniq = [...new Set(products)];
  if (uniq.length >= 2) return { kind: 'products', ids: uniq, href: `/compare?p=${uniq.join(',')}`, label: sides.map((s) => s!.doc.title).join(' vs ') };
  // Generic "sunscreen A vs sunscreen B": open comparison within that subcategory.
  const first = PUBLIC_PRODUCTS.find((p) => p.id === products[0]) ?? null;
  if (first) {
    const peers = PUBLIC_PRODUCTS.filter((p) => p.subcategory === first.subcategory).slice(0, 2).map((p) => p.id);
    return { kind: 'category', ids: peers, href: `/compare?p=${peers.join(',')}`, label: `Compare ${first.subcategory.replace('-', ' ')}` };
  }
  return null;
}

// ---------- Retrieved quick answer ----------

export interface QuickAnswer {
  doc: SearchDoc;
  heading: string;
  text: string;
  points: string[];
  section?: W1HKey;
}

/** Retrieve (never generate) a short answer from the top entity's FAQ or 5W1H. */
export function quickAnswer(query: string, hits: SearchHit[], intent: IntentResult): QuickAnswer | null {
  const top = hits.find((h) => h.doc.type === 'ingredient' || h.doc.type === 'topic');
  if (!top || top.score < 8) return null;
  const qTokens = new Set(tokenize(expandQuery(query)));
  for (const f of top.doc.faqs ?? []) {
    const ft = tokenize(expandQuery(f.q));
    const shared = ft.filter((t) => qTokens.has(t)).length;
    if (shared / Math.max(ft.length, 1) >= 0.75 && shared / Math.max(qTokens.size, 1) >= 0.75) return { doc: top.doc, heading: f.q, text: f.a, points: [] };
  }
  const section = intent.section ?? (intent.intent === 'general_education' ? 'what' : undefined);
  const s = section && top.doc.fiveW?.[section];
  if (!s) return null;
  const title = { what: 'What is it?', why: 'Why is it used?', when: 'When should it be used?', who: 'Who is it for?', where: 'Where is it used?', how: 'How is it used?' }[section!];
  return { doc: top.doc, heading: `${top.doc.title}: ${title}`, text: s.summary, points: s.points ?? [], section };
}
