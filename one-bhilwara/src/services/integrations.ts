/**
 * Integration registry. Each integration reports whether it is configured; anything that is
 * not configured runs in labelled demo mode. Secrets never appear here — only public config.
 */
const env = import.meta.env;

export interface Integration { id: string; name: string; configured: boolean; mode: string; needs: string }

export const integrations = (): Integration[] => [
  { id: 'auth', name: 'Authentication & database', configured: !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY), mode: 'Local demo database in this browser', needs: 'Supabase project URL + anon key (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), schema from supabase/schema.sql, RLS policies.' },
  { id: 'ai', name: 'AI assistant', configured: !!env.VITE_AI_ENDPOINT, mode: 'Rule-based demo assistant over sample data', needs: 'A server-side endpoint (see api/assistant.js) with ANTHROPIC_API_KEY set on the server; set VITE_AI_ENDPOINT to its URL.' },
  { id: 'weather', name: 'Weather', configured: env.VITE_WEATHER_PROVIDER === 'open-meteo', mode: 'Labelled demo weather', needs: 'Set VITE_WEATHER_PROVIDER=open-meteo (public API, no key) or connect another provider.' },
  { id: 'maps', name: 'Maps', configured: !!env.VITE_MAPS_KEY, mode: 'Address cards + external Google Maps search link', needs: 'Maps API key (VITE_MAPS_KEY) and verified coordinates for listings.' },
  { id: 'push', name: 'Push notifications', configured: !!env.VITE_VAPID_PUBLIC_KEY, mode: 'In-app notifications only', needs: 'VAPID key pair, a push server storing subscriptions, and server-side sending.' },
  { id: 'payments', name: 'Payments', configured: !!env.VITE_PAYMENT_KEY_ID, mode: 'Demo checkout — no money moves', needs: 'Payment gateway account (e.g. Razorpay), server-side order creation and webhook verification.' },
  { id: 'news', name: 'News feed', configured: false, mode: 'Admin-managed demo stories', needs: 'Licensed news API or newsroom CMS; NEWS_API_KEY on the server.' },
  { id: 'sports', name: 'Sports scores', configured: false, mode: 'Labelled demo scores', needs: 'Sports data API (SPORTS_API_KEY) via server proxy.' },
  { id: 'market', name: 'Fuel, bullion & mandi prices', configured: false, mode: 'Labelled sample prices', needs: 'Verified market-data source (e.g. Agmarknet/data.gov.in for mandi) via server job.' },
  { id: 'booking', name: 'Bus/train booking', configured: false, mode: 'Labelled demo search results; no tickets issued', needs: 'Authorised booking API or operator partnership.' },
  { id: 'courier', name: 'Courier tracking', configured: false, mode: 'Sample tracking numbers only', needs: 'Courier partner tracking APIs.' }
];

export const isConfigured = (id: string) => integrations().find((i) => i.id === id)?.configured ?? false;
