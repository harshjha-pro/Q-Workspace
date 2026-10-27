import type { SourceRef } from './types';

// Sources are organisation-level references. URLs point to the publisher's
// official site; editors should attach the exact page before publishing to
// production (see README → Content workflow). No study citations are invented.
export const SOURCES: SourceRef[] = [
  { id: 'cdsco', title: 'Cosmetics regulation in India (Drugs and Cosmetics Act; Cosmetics Rules, 2020)', publisher: 'Central Drugs Standard Control Organisation (CDSCO)', url: 'https://cdsco.gov.in', kind: 'regulator' },
  { id: 'bis', title: 'Indian Standards for cosmetics and oral-care products', publisher: 'Bureau of Indian Standards (BIS)', url: 'https://www.bis.gov.in', kind: 'regulator' },
  { id: 'fda-sunscreen', title: 'Sunscreen drug products (OTC monograph) and consumer guidance', publisher: 'U.S. Food and Drug Administration', url: 'https://www.fda.gov', kind: 'regulator' },
  { id: 'fda-acne', title: 'Topical acne drug products (OTC monograph)', publisher: 'U.S. Food and Drug Administration', url: 'https://www.fda.gov', kind: 'regulator' },
  { id: 'fda-cosmetics', title: 'Cosmetics labelling and ingredient guidance', publisher: 'U.S. Food and Drug Administration', url: 'https://www.fda.gov/cosmetics', kind: 'regulator' },
  { id: 'cosing', title: 'CosIng — cosmetic ingredient database (INCI names and functions)', publisher: 'European Commission', url: 'https://ec.europa.eu/growth/tools-databases/cosing/', kind: 'database' },
  { id: 'eu-sccs', title: 'Scientific Committee on Consumer Safety opinions', publisher: 'European Commission', url: 'https://health.ec.europa.eu/scientific-committees/scientific-committee-consumer-safety-sccs_en', kind: 'regulator' },
  { id: 'aad', title: 'Public education on skin, hair and nail care', publisher: 'American Academy of Dermatology', url: 'https://www.aad.org', kind: 'professional_body' },
  { id: 'iadvl', title: 'Indian Association of Dermatologists, Venereologists and Leprologists', publisher: 'IADVL', url: 'https://iadvl.org', kind: 'professional_body' },
  { id: 'who-oral', title: 'Oral health fact sheet and fluoride guidance', publisher: 'World Health Organization', url: 'https://www.who.int/health-topics/oral-health', kind: 'guideline' },
  { id: 'ada', title: 'Oral health topics (fluoride, toothpaste, flossing, dentin hypersensitivity)', publisher: 'American Dental Association', url: 'https://www.ada.org', kind: 'professional_body' },
  { id: 'ida', title: 'Indian Dental Association public resources', publisher: 'Indian Dental Association', url: 'https://www.ida.org.in', kind: 'professional_body' },
  { id: 'nccih', title: 'Herbs at a Glance (aloe vera, turmeric and other botanicals)', publisher: 'U.S. National Center for Complementary and Integrative Health', url: 'https://www.nccih.nih.gov/health/herbsataglance', kind: 'government' },
  { id: 'ayush', title: 'Ministry of AYUSH — traditional systems of medicine', publisher: 'Government of India, Ministry of AYUSH', url: 'https://ayush.gov.in', kind: 'government' },
  { id: 'imd', title: 'Seasons and climate information for India', publisher: 'India Meteorological Department', url: 'https://mausam.imd.gov.in', kind: 'government' },
  { id: 'nhs', title: 'Health A–Z (acne, dandruff, sensitive teeth, sunburn)', publisher: 'NHS (UK)', url: 'https://www.nhs.uk', kind: 'government' },
  { id: 'carelens-editorial', title: 'CareLens editorial summary', publisher: 'CareLens editorial team', kind: 'editorial', note: 'Plain-language synthesis of the organisation-level sources listed alongside it. Not independent evidence on its own.' },
];

export const SOURCE_MAP: Record<string, SourceRef> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
