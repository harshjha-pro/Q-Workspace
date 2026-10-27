import type { CategoryDef } from './types';

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'skin',
    name: 'Skin Care',
    short: 'Skin Care',
    description: 'Healthy skin, informed choices.',
    icon: 'droplet',
    subcategories: [
      { id: 'cleansers', name: 'Cleansers', description: 'Cleanse without stripping' },
      { id: 'moisturisers', name: 'Moisturisers', description: 'Support the skin barrier' },
      { id: 'sunscreens', name: 'Sunscreens', description: 'Everyday UV protection' },
      { id: 'serums', name: 'Serums', description: 'Targeted active ingredients' },
      { id: 'exfoliants', name: 'Exfoliants', description: 'Acids and scrubs, used carefully' },
      { id: 'face-masks', name: 'Face Masks', description: 'Clays and leave-on masks' },
    ],
  },
  {
    id: 'hair',
    name: 'Hair & Scalp Care',
    short: 'Hair & Scalp',
    description: 'Scalp health, hair breakage and everyday care.',
    icon: 'wind',
    subcategories: [
      { id: 'shampoos', name: 'Shampoos', description: 'Cleanse scalp and hair' },
      { id: 'conditioners', name: 'Conditioners', description: 'Reduce friction and tangles' },
      { id: 'hair-oils', name: 'Hair Oils', description: 'Pre-wash and leave-in oils' },
      { id: 'scalp-treatments', name: 'Scalp Treatments', description: 'Dandruff and scalp concerns' },
    ],
  },
  {
    id: 'oral',
    name: 'Dental & Oral Care',
    short: 'Dental & Oral',
    description: 'Teeth, gums and fresh breath.',
    icon: 'smile',
    subcategories: [
      { id: 'toothpastes', name: 'Toothpastes', description: 'Fluoride and specialty pastes' },
      { id: 'oral-rinses', name: 'Oral Rinses', description: 'Mouthwashes and rinses' },
      { id: 'oral-tools', name: 'Brushes & Floss', description: 'Mechanical cleaning' },
    ],
  },
  {
    id: 'body',
    name: 'Body Care & Hygiene',
    short: 'Body Care',
    description: 'Everyday hygiene for Indian weather.',
    icon: 'shower-head',
    subcategories: [
      { id: 'body-wash', name: 'Body Wash & Soaps', description: 'Cleansers for the body' },
      { id: 'deodorants', name: 'Deodorants', description: 'Odour and sweat control' },
      { id: 'body-moisturisers', name: 'Body Moisturisers', description: 'Lotions and creams' },
      { id: 'hand-hygiene', name: 'Hand Hygiene', description: 'Handwash and sanitisers' },
    ],
  },
  {
    id: 'ingredients',
    name: 'Ingredients',
    short: 'Ingredients',
    description: 'What the names on a label actually do.',
    icon: 'flask-conical',
    subcategories: [
      { id: 'actives', name: 'Actives', description: 'Ingredients with a targeted effect' },
      { id: 'humectants', name: 'Humectants & Emollients', description: 'Hydration and softness' },
      { id: 'uv-filters', name: 'UV Filters', description: 'Sunscreen filters' },
      { id: 'surfactants', name: 'Cleansing Agents', description: 'Surfactants and foaming agents' },
      { id: 'preservatives', name: 'Preservatives & Others', description: 'Keeping products stable' },
      { id: 'botanicals', name: 'Botanicals', description: 'Plant-derived ingredients' },
    ],
  },
  {
    id: 'ayurveda',
    name: 'Ayurvedic & Traditional Care',
    short: 'Ayurvedic & Traditional',
    description: 'Traditional practices, with evidence clearly separated from belief.',
    icon: 'leaf',
    subcategories: [
      { id: 'herbs', name: 'Herbs & Botanicals', description: 'Commonly used traditional ingredients' },
      { id: 'practices', name: 'Practices', description: 'Traditional routines and rituals' },
    ],
  },
  {
    id: 'home-remedies',
    name: 'Home Remedies',
    short: 'Home Remedies',
    description: 'Kitchen remedies — what is reasonable and what to avoid.',
    icon: 'home',
    subcategories: [
      { id: 'kitchen', name: 'Kitchen Ingredients', description: 'Common DIY ingredients' },
      { id: 'avoid', name: 'Remedies to Avoid', description: 'Popular but risky' },
    ],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle & Preventive Care',
    short: 'Lifestyle & Preventive',
    description: 'Habits that matter as much as products.',
    icon: 'heart-pulse',
    subcategories: [
      { id: 'sun', name: 'Sun Safety', description: 'Habits beyond sunscreen' },
      { id: 'seasonal', name: 'Seasonal Care', description: 'Summer, monsoon and winter' },
      { id: 'habits', name: 'Hygiene Habits', description: 'Everyday prevention' },
    ],
  },
];

export const CATEGORY_MAP: Record<string, CategoryDef> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
