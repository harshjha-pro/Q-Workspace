// Core content model for CareLens. Mirrors db/migrations/001_schema.sql.

export type ReviewStatus = 'draft' | 'needs_verification' | 'reviewed' | 'published' | 'archived';

/**
 * Evidence levels used across the app.
 * - established: consistent evidence from regulators, guidelines or multiple good-quality trials
 * - moderate: some controlled studies, generally supportive, with gaps
 * - preliminary: small, early, lab or animal studies; promising but unconfirmed
 * - traditional: long-standing traditional use; not established by controlled research
 * - insufficient: little or no reliable evidence
 * - unsupported: evidence contradicts the claim, or the practice carries clear risk
 */
export type EvidenceLevel = 'established' | 'moderate' | 'preliminary' | 'traditional' | 'insufficient' | 'unsupported';

export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  kind: 'regulator' | 'guideline' | 'professional_body' | 'database' | 'government' | 'review' | 'editorial';
  note?: string;
}

export interface W1HSection {
  summary: string;
  points?: string[];
}

/** 5W1H explanation. A section may be omitted when it is not meaningful for the topic. */
export interface FiveW1H {
  what?: W1HSection;
  why?: W1HSection;
  when?: W1HSection;
  who?: W1HSection;
  where?: W1HSection;
  how?: W1HSection;
}

export type W1HKey = keyof FiveW1H;

export interface FAQ {
  q: string;
  a: string;
}

export interface Misconception {
  myth: string;
  fact: string;
}

/** Tags that personalisation uses to filter and contextualise records. */
export interface SuitabilityTags {
  skinTypes?: SkinType[];
  skinConcerns?: SkinConcern[];
  hairConcerns?: HairConcern[];
  scalp?: ScalpType[];
  oralConcerns?: OralConcern[];
  /** Users who should take extra care (shown as cautions, not prohibitions). */
  cautionFor?: CautionTag[];
  climates?: ClimateZone[];
}

export type SkinType = 'oily' | 'dry' | 'combination' | 'normal' | 'sensitive';
export type SkinConcern = 'acne' | 'dryness' | 'uneven_tone' | 'sun_protection' | 'texture' | 'irritation';
export type HairType = 'straight' | 'wavy' | 'curly' | 'coily';
export type ScalpType = 'dry_scalp' | 'oily_scalp';
export type HairConcern = 'dandruff' | 'frizz' | 'breakage' | 'hair_fall';
export type OralConcern = 'sensitive_teeth' | 'cavities' | 'gum_care' | 'bad_breath';
export type CautionTag = 'sensitive_skin' | 'pregnancy' | 'fragrance_sensitive' | 'nut_allergy' | 'children' | 'sun_exposure';
export type ClimateZone = 'hot_humid' | 'hot_dry' | 'moderate' | 'cold' | 'monsoon';

export interface CategoryDef {
  id: string;
  name: string;
  short: string;
  description: string;
  icon: string;
  subcategories: { id: string; name: string; description: string }[];
}

export interface IngredientForm {
  name: string;
  note: string;
}

export interface Ingredient {
  id: string;
  name: string;
  inci?: string;
  synonyms: string[];
  /** Ingredient-database category, e.g. "Vitamin / active ingredient". */
  kind: string;
  functions: string[];
  productTypes: string[];
  /** Categories in which the ingredient is relevant (category ids). */
  categories: string[];
  tier: 'full' | 'glossary';
  summary: string;
  benefits?: string[];
  evidence: { level: EvidenceLevel; summary: string };
  concentrations?: string;
  limitations?: string[];
  adverseEffects?: string[];
  precautions?: string[];
  compatibility?: string[];
  applications?: { skin?: string; hair?: string; oral?: string; body?: string };
  traditionalUse?: string;
  forms?: IngredientForm[];
  misconceptions?: Misconception[];
  faqs?: FAQ[];
  alternatives?: string[];
  fiveW?: FiveW1H;
  /** Flags an ingredient for analyser precaution highlighting. */
  flags?: ('fragrance_allergen' | 'potential_irritant' | 'photosensitising' | 'pregnancy_caution' | 'drying' | 'comedogenic_possible' | 'nut_derived')[];
  suitability?: SuitabilityTags;
  sources: string[];
  lastReviewed: string;
  status: ReviewStatus;
}

export interface ProductIngredient {
  /** Ingredient id if recognised in the database, otherwise null. */
  ingredientId: string | null;
  label: string;
  /** Concentration only when declared on the (demo) label. */
  concentration?: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  productType: string;
  intendedUse: string;
  description: string;
  ingredients: ProductIngredient[];
  ingredientListVerified: boolean;
  netQuantity: { value: number; unit: 'ml' | 'g' };
  price?: { amount: number; currency: 'INR'; verified: boolean };
  directions?: string;
  suitability?: SuitabilityTags;
  benefits?: string[];
  limitations?: string[];
  warnings?: string[];
  officialUrl?: string;
  sources: string[];
  /** True for fictional demonstration records. */
  demo: boolean;
  verification: 'unverified' | 'partially_verified' | 'verified';
  lastVerified: string;
  status: ReviewStatus;
}

export type TopicKind = 'practice' | 'ayurvedic' | 'home_remedy' | 'lifestyle' | 'concern';

export interface EvidenceClaim {
  claim: string;
  level: EvidenceLevel;
  note?: string;
}

export interface CareTopic {
  id: string;
  name: string;
  kind: TopicKind;
  categories: string[];
  subcategory?: string;
  summary: string;
  synonyms: string[];
  traditionalPurpose?: string;
  claims?: EvidenceClaim[];
  risks?: string[];
  hygiene?: string[];
  precautions?: string[];
  /** When to stop and seek professional care. */
  seeProfessional?: string[];
  fiveW: FiveW1H;
  relatedIngredients?: string[];
  relatedTopics?: string[];
  misconceptions?: Misconception[];
  faqs?: FAQ[];
  suitability?: SuitabilityTags;
  /** Not-recommended remedies are shown with a clear warning. */
  recommendation?: 'reasonable' | 'use_with_caution' | 'not_recommended';
  sources: string[];
  lastReviewed: string;
  status: ReviewStatus;
}

export type ArticleType =
  | 'beginner_guide'
  | 'ingredient_explainer'
  | 'label_literacy'
  | 'claim_literacy'
  | 'myths'
  | 'faq'
  | 'mistakes'
  | 'value'
  | 'safety'
  | 'evidence';

export interface ArticleSection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface Article {
  id: string;
  title: string;
  type: ArticleType;
  categories: string[];
  summary: string;
  takeaways: string[];
  sections: ArticleSection[];
  readMinutes: number;
  relatedIngredients?: string[];
  relatedTopics?: string[];
  relatedProducts?: string[];
  keywords: string[];
  author: string;
  published: string;
  lastReviewed: string;
  sources: string[];
  status: ReviewStatus;
  climates?: ClimateZone[];
  seasons?: Season[];
}

export type Season = 'winter' | 'summer' | 'monsoon' | 'post_monsoon';

export interface Region {
  id: string;
  name: string;
  state: string;
  climate: ClimateZone;
  lat: number;
  lon: number;
  note: string;
}

export interface SuggestedQuestion {
  q: string;
  categories: string[];
}
