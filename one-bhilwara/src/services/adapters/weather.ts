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
