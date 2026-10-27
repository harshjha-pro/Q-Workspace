import type { ClimateZone, Region, Season } from './types';

// Broad climate grouping for selected cities. Coordinates are approximate city
// centres, used only when an optional weather provider is configured.
export const REGIONS: Region[] = [
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', climate: 'moderate', lat: 12.97, lon: 77.59, note: 'Moderate temperatures most of the year; monsoon June–October.' },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', climate: 'hot_humid', lat: 19.08, lon: 72.88, note: 'Humid coastal climate with a heavy monsoon June–September.' },
  { id: 'delhi', name: 'Delhi', state: 'Delhi NCR', climate: 'hot_dry', lat: 28.61, lon: 77.21, note: 'Very hot, dry summers; humid monsoon; cold, dry winters.' },
  { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', climate: 'hot_humid', lat: 13.08, lon: 80.27, note: 'Hot and humid year-round; main rains Oct–Dec (northeast monsoon).' },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', climate: 'hot_humid', lat: 22.57, lon: 88.36, note: 'Hot, humid summers and monsoon; mild winters.' },
  { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', climate: 'hot_dry', lat: 17.39, lon: 78.49, note: 'Hot, dry summers; moderate monsoon.' },
  { id: 'pune', name: 'Pune', state: 'Maharashtra', climate: 'moderate', lat: 18.52, lon: 73.86, note: 'Warm summers, moderate monsoon, pleasant winters.' },
  { id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', climate: 'hot_dry', lat: 23.02, lon: 72.57, note: 'Very hot, dry summers.' },
  { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', climate: 'hot_dry', lat: 26.91, lon: 75.79, note: 'Arid; very hot summers and cool, dry winters.' },
  { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', climate: 'hot_dry', lat: 26.85, lon: 80.95, note: 'Hot summers, humid monsoon, cold winters.' },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', climate: 'hot_humid', lat: 9.93, lon: 76.27, note: 'Humid tropical; long, heavy monsoon.' },
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', climate: 'hot_humid', lat: 26.14, lon: 91.74, note: 'Humid subtropical; long monsoon.' },
  { id: 'shimla', name: 'Shimla', state: 'Himachal Pradesh', climate: 'cold', lat: 31.1, lon: 77.17, note: 'Cool summers and cold winters; higher UV at altitude.' },
  { id: 'srinagar', name: 'Srinagar', state: 'Jammu & Kashmir', climate: 'cold', lat: 34.08, lon: 74.8, note: 'Cold winters with very dry air.' },
];

export const REGION_MAP: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export const CLIMATE_LABEL: Record<ClimateZone, string> = {
  hot_humid: 'Hot & humid',
  hot_dry: 'Hot & dry',
  moderate: 'Moderate',
  cold: 'Cold',
  monsoon: 'Monsoon',
};

export const SEASON_LABEL: Record<Season, string> = {
  winter: 'Winter',
  summer: 'Summer (pre-monsoon)',
  monsoon: 'Southwest monsoon',
  post_monsoon: 'Post-monsoon',
};

/**
 * Broad season by month following the India Meteorological Department's four
 * seasons: winter (Jan–Feb), pre-monsoon/summer (Mar–May), southwest monsoon
 * (Jun–Sep) and post-monsoon (Oct–Dec). This is general guidance, not weather.
 */
export function seasonFor(date: Date): Season {
  const m = date.getMonth() + 1;
  if (m <= 2) return 'winter';
  if (m <= 5) return 'summer';
  if (m <= 9) return 'monsoon';
  return 'post_monsoon';
}

export interface SeasonalGuidance {
  season: Season;
  title: string;
  tips: string[];
  climates: ClimateZone[];
  topicIds: string[];
}

export function seasonalGuidance(season: Season, region?: Region): SeasonalGuidance {
  const chennaiLike = region && ['chennai'].includes(region.id);
  switch (season) {
    case 'winter':
      return {
        season,
        title: region?.climate === 'hot_humid' ? 'Mild winter: keep routines light' : 'Dry, cool air: protect your barrier',
        tips: ['Lukewarm rather than hot baths', 'Richer moisturiser on damp skin', 'Sunscreen still matters on clear winter days'],
        climates: ['cold', 'hot_dry'],
        topicIds: ['winter-dryness', 'sun-safety'],
      };
    case 'summer':
      return {
        season,
        title: 'Hot months: sweat and sun',
        tips: ['Broad-spectrum sunscreen, reapplied outdoors', 'Lighter textures if you feel greasy', 'Breathable cotton and daily bathing for sweat'],
        climates: ['hot_dry', 'hot_humid'],
        topicIds: ['sun-safety', 'sweat-hygiene'],
      };
    case 'monsoon':
      return {
        season,
        title: 'Monsoon: keep skin folds and feet dry',
        tips: ['Change out of damp clothes and footwear', 'Gel moisturisers suit many people in humidity', 'Avoid unprescribed steroid creams for itchy rashes'],
        climates: ['monsoon', 'hot_humid'],
        topicIds: ['monsoon-skin-care', 'dandruff'],
      };
    default:
      return {
        season,
        title: chennaiLike ? 'Northeast monsoon: humid and wet' : 'Post-monsoon: humidity eases',
        tips: chennaiLike
          ? ['Keep feet and skin folds dry', 'Lighter textures in humidity', 'Sunscreen between showers of rain']
          : ['Transition to slightly richer moisturisers as air dries', 'Keep up sunscreen', 'Watch for dandruff as weather changes'],
        climates: chennaiLike ? ['monsoon', 'hot_humid'] : ['moderate', 'hot_dry'],
        topicIds: chennaiLike ? ['monsoon-skin-care', 'sun-safety'] : ['sun-safety', 'winter-dryness'],
      };
  }
}
