import type { Region } from '../data/types';

// Optional live weather. Disabled unless VITE_WEATHER_PROVIDER=open-meteo.
// Open-Meteo needs no API key, so no secret is ever shipped to the browser.

export interface Weather {
  temperatureC: number;
  humidity?: number;
  uvIndexMax?: number;
  observedAt: string;
  provider: string;
}

export const weatherProvider = (import.meta.env.VITE_WEATHER_PROVIDER as string | undefined)?.trim() || '';
export const weatherEnabled = weatherProvider === 'open-meteo';

export async function fetchWeather(region: Region, signal?: AbortSignal): Promise<Weather> {
  if (!weatherEnabled) throw new Error('Weather provider not configured');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lon}&current=temperature_2m,relative_humidity_2m&daily=uv_index_max&timezone=Asia%2FKolkata&forecast_days=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const data = await res.json();
  if (typeof data?.current?.temperature_2m !== 'number') throw new Error('Unexpected weather response');
  return {
    temperatureC: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    uvIndexMax: data.daily?.uv_index_max?.[0],
    observedAt: data.current.time,
    provider: 'Open-Meteo',
  };
}
