# Integration guide

Every external dependency sits behind an adapter. When an integration is not configured the app stays in **labelled demo mode** — it never pretends a live service is connected. Current status is shown in-app under **Settings → Integrations status** and **Admin → Settings → API configuration status** (`src/services/integrations.ts`).

| Integration | Needed for | Credentials (where they live) | Code to change |
|---|---|---|---|
| Authentication & database | Real accounts, shared data, moderation, server-side rules | Supabase URL + anon key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, public); service-role key **server only** (`SUPABASE_SERVICE_ROLE_KEY`) | `services/store.ts` (repository), `services/session.ts` |
| AI assistant | Live answers | `ANTHROPIC_API_KEY` **server only**; `VITE_AI_ENDPOINT=/api/assistant` | `api/assistant.js`, `services/adapters/ai.ts` |
| Weather | Live weather widget | none for Open-Meteo (`VITE_WEATHER_PROVIDER=open-meteo`) | `services/adapters/weather.ts` |
| Maps | Embedded maps, distances | Maps key (`VITE_MAPS_KEY`) + verified coordinates per listing | `components/shared.tsx` (`DirectionsButton`) |
| Push notifications | Alerts when app is closed | VAPID public key (`VITE_VAPID_PUBLIC_KEY`), private key **server only**; push server | `services/adapters/push.ts`, `src/sw/sw.js` (push handlers exist) |
| Payments | Subscriptions, job/ad packages, paid bookings | Gateway key id (`VITE_PAYMENT_KEY_ID`), secret **server only** | `services/adapters/payments.ts` |
| News | Real news | Licensed news API or newsroom CMS (`NEWS_API_KEY`, server) | server job → `articles` table; admin news manager already works |
| Sports | Live scores | Sports data API (`SPORTS_API_KEY`, server) | replace `matches()` seed in `features/news/pages.tsx` with a fetch |
| Market data | Fuel, bullion, mandi prices | Verified source, e.g. Agmarknet / data.gov.in (`MARKET_DATA_API_KEY`, server) | server job → `agri_price_records`; replace `mandi()`/`prices()` seeds |
| Bus/train booking | Real tickets | Authorised booking API or operator partnership | `features/transport/pages.tsx` (`demoResults`) |
| Courier | Real tracking | Courier partner APIs | `features/transport/pages.tsx` (`SAMPLE_SHIPMENTS`) |

## 1. Authentication & database (Supabase)

1. Create a Supabase project. Run `supabase/schema.sql` (SQL editor or `supabase db push`).
2. **Review and complete the RLS policies** — the file enables RLS on every table and adds starter policies; every remaining table needs policies before launch.
3. Enable Phone (OTP) auth. Store roles in `user_roles` (only admins can write it). Check roles in RLS with `is_admin()` and equivalent helpers — never trust the client role switcher.
4. Implement a `SupabaseAdapter` with the same shape as `repo` (`list/get/insert/patch/at().mutate/remove`) and switch on `VITE_SUPABASE_URL`. Use server functions for multi-row logic: `confirm_provider()` (one confirmed provider per request), `poll_results()` (results only after `reveal_at`), the unique `(poll_id, user_id)` vote constraint, and job-application uniqueness.
5. Store uploads in **private** storage buckets; validate MIME type and size server-side and scan files before making them available.
6. Add rate limiting (e.g. per user/IP on enquiries, votes, comments, reports) at the API gateway or edge functions.

## 2. AI assistant

`api/assistant.js` is a Vercel serverless function that calls Claude through the official `@anthropic-ai/sdk` package, with a system prompt containing the safety rules (no live-data claims, emergency first, professional-advice limits, not a government authority). It uses safeguard fallbacks (`fallbacks: "default"`) and handles refusals and rate limits.

1. In your host's environment settings (not in a `VITE_` variable) set `ANTHROPIC_API_KEY`.
2. Build the frontend with `VITE_AI_ENDPOINT=/api/assistant`.
3. Add authentication and per-user rate limiting to the endpoint before public launch.
4. Optionally let the model call app data through tool use (search listings server-side) so answers can include real listing cards — the frontend already renders `cards`, `actions` and `sources` from the response.

If the endpoint fails, the client falls back to the demo assistant and says so.

## 3. Maps

Listings currently link to a Google Maps **search** for the address or locality (no coordinates are fabricated). To embed maps, store verified coordinates per listing, load the provider's JS SDK, and compute distances server-side.

## 4. Push notifications

In-app notifications work now. The service worker already has `push` and `notificationclick` handlers. To enable push: generate VAPID keys, add a server endpoint that stores `PushSubscription`s (`push_subscriptions` table), call `registration.pushManager.subscribe()` after the user opts in (Settings → Notifications already asks for permission only on tap), and send pushes server-side.

## 5. Payments

`demoCheckout()` simulates payments and records `DEMO-INV-…` invoices. A real flow must: create the order on the server, open the gateway checkout, verify the payment signature/webhook on the server, then mark the payment and create the invoice. Never mark anything paid from the client. Keep fees configurable (Admin → Settings → Fees). No fees may be charged for job applications, essential government information or emergency services.

## 6. News, sports, market data

Run server-side jobs that fetch from licensed or official sources, store records with **source and timestamp**, and expose them read-only. Keep the existing UI labels: anything not from a verified source must stay marked as sample/demo.

## Security checklist for production

- Server-side authorisation for every privileged action (admin, verification, moderation, role changes) + audit log rows.
- Secrets only in server environment variables; `.env*` files are git-ignored.
- Input validation on the server (the client `sanitize()` is defence in depth only); React escapes output — never use `dangerouslySetInnerHTML` for user content.
- Rate limiting and spam detection on all write endpoints.
- Consent records for every enquiry/lead that shares contact details (`consent` is required by schema constraints).
- Data retention and deletion workflow (deletion requests currently go to the admin queue).
- HTTPS only; security headers are set in `vercel.json` / `netlify.toml`.
