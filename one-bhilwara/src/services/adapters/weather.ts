import { isConfigured } from '@/services/integrations';

export interface Weather { tempC: number; humidity: number; code: number; label: string; live: boolean; source: string; at: string }

const LABELS: Record<number, string> = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 51: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 95: 'Thunderstorm' };

const DEMO: Weather = { tempC: 31, humidity: 38, code: 1, label: 'Mostly clear', live: false, source: 'Demo weather — not a forecast', at: new Date().toISOString() };

/** Bhilwara city centre (approx.). */
const LAT = 25.3463;
const LON = 74.6364;

export async function getWeather(signal?: AbortSignal): Promise<Weather> {
  if (!isConfigured('weather')) return DEMO;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FKolkata`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Weather service error ${res.status}`);
  const j = (await res.json()) as { current: { temperature_2m: number; relative_humidity_2m: number; weather_code: number; time: string } };
  return { tempC: j.current.temperature_2m, humidity: j.current.relative_humidity_2m, code: j.current.weather_code, label: LABELS[j.current.weather_code] ?? 'Weather', live: true, source: 'Open-Meteo', at: j.current.time };
}

/** Current conditions for the Civic updates panel: weather plus air quality. */
export interface Conditions {
  tempC: number; feelsC: number; humidity: number; label: string; maxC: number; minC: number; uv: number;
  aqi: number | null; pm25: number | null; pm10: number | null;
  live: boolean; source: string; at: string;
}

const DEMO_CONDITIONS: Conditions = { tempC: 29, feelsC: 30, humidity: 35, label: 'Mostly clear', maxC: 32, minC: 17, uv: 6, aqi: 112, pm25: 39, pm10: 88, live: false, source: 'Demo values — not a reading', at: new Date().toISOString() };

export async function getConditions(signal?: AbortSignal): Promise<Conditions> {
  if (!isConfigured('weather')) return DEMO_CONDITIONS;
  const tz = 'timezone=Asia%2FKolkata';
  const [w, a] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,uv_index_max&forecast_days=1&${tz}`, { signal }),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=us_aqi,pm2_5,pm10&${tz}`, { signal }).catch(() => null)
  ]);
  if (!w.ok) throw new Error(`Weather service error ${w.status}`);
  const wj = (await w.json()) as { current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; time: string }; daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; uv_index_max: number[] } };
  const aj = a && a.ok ? ((await a.json()) as { current: { us_aqi: number | null; pm2_5: number | null; pm10: number | null } }) : null;
  return {
    tempC: wj.current.temperature_2m, feelsC: wj.current.apparent_temperature, humidity: wj.current.relative_humidity_2m,
    label: LABELS[wj.current.weather_code] ?? 'Weather', maxC: wj.daily.temperature_2m_max[0], minC: wj.daily.temperature_2m_min[0], uv: wj.daily.uv_index_max[0],
    aqi: aj?.current.us_aqi ?? null, pm25: aj?.current.pm2_5 ?? null, pm10: aj?.current.pm10 ?? null,
    live: true, source: 'Open-Meteo (model data for Bhilwara)', at: wj.current.time
  };
}

/** US EPA AQI bands. */
export function aqiBand(aqi: number) {
  if (aqi <= 50) return { label: 'Good', tone: 'bg-emerald-500', text: 'text-emerald-700', tip: 'Air quality is fine for outdoor activity.' };
  if (aqi <= 100) return { label: 'Moderate', tone: 'bg-yellow-400', text: 'text-yellow-700', tip: 'Unusually sensitive people should limit long outdoor exertion.' };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', tone: 'bg-orange-500', text: 'text-orange-700', tip: 'Children, elders and people with asthma should reduce outdoor exertion.' };
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'bg-red-500', text: 'text-red-700', tip: 'Everyone should reduce prolonged outdoor exertion; consider a mask.' };
  if (aqi <= 300) return { label: 'Very unhealthy', tone: 'bg-purple-600', text: 'text-purple-700', tip: 'Avoid outdoor exertion. Keep windows closed.' };
  return { label: 'Hazardous', tone: 'bg-rose-900', text: 'text-rose-900', tip: 'Stay indoors and follow health advisories.' };
}
