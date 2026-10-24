# QA report, limitations and roadmap

## What was tested (and how)

All checks were run against the **production build** (`npm run build && npm run preview`) in Chromium via Playwright.

| Check | Result |
|---|---|
| `tsc -b` strict type-check and `vite build` | Pass |
| Unit tests (`npm test`): poll reveal/one-vote, provider ranking & single confirmation, eligibility, search filters/sort/suggestions, demo AI routing, INR/mobile formatting, EN/HI key parity | 15/15 pass |
| Route crawl — every route incl. detail pages and role-gated dashboards (121 visits) at **390 px** | 0 console errors, 0 error boundaries, 0 broken routes, 0 horizontal overflow |
| Same crawl at **1280 px** | Same: 0 problems |
| Role-gated pages as admin / business / employer / provider / owner | Accessible with the right role, "Access restricted" otherwise |
| Flow: service request → simulated responses → confirm provider (others closed) → complete → review | Pass |
| Flow: job application → "Applied" state → shows in job-seeker dashboard; duplicate blocked | Pass |
| Flow: poll vote → results (immediate-reveal poll); vote form removed; delayed poll keeps results hidden | Pass |
| Flow: event booking → demo payment → DEMO reference → listed in profile bookings | Pass |
| Flow: save article → in profile; comment → appears in thread | Pass |
| Flow: search with result count; no-results screen with next steps | Pass |
| Flow: create marketplace listing → detail page | Pass |
| Form validation messages on empty submit | Pass |
| AI assistant (demo) returns provider cards | Pass |
| Notification deep link opens the target page | Pass |
| Admin approves verification → audit log entry | Pass |
| Language switch to Hindi updates navigation | Pass |
| PWA: service worker controls the page; `one-bhilwara-v1` precaches the shell and all lazy chunks (46 files) | Pass |
| PWA: offline navigation to a route renders from cache with the offline banner | Pass (fixed a `Vary: Origin` cache-match bug found by this test) |

Not tested automatically: real installs on Android/iOS devices, screen-reader passes (NVDA/TalkBack/VoiceOver), slow-3G performance profiling, cross-browser (Firefox/Safari). Do these before launch.

## Known limitations / what runs in demo mode

- **All data is demo data** stored in the browser. Nothing is shared between users or devices.
- **Authentication is simulated** (any 6-digit code). The role switcher is a demo feature, not security.
- **Simulated:** provider responses and coordinator assignment, payments/invoices/subscriptions/refunds, ticket and bus/train bookings, courier tracking, weather (unless Open-Meteo is enabled), sports scores, fuel/gold/mandi prices, ad impressions/clicks, business analytics counters, voucher redemption, AI answers (unless the endpoint is configured).
- **Not implemented without a backend:** real push notifications, real file uploads (names only), email/SMS delivery, server-side rate limiting, scheduled publishing jobs (scheduled articles appear when their time passes on the client), cross-user moderation.
- **Hindi:** navigation, shell and key labels are translated (parity-tested); most module body text and content are English. Translate remaining strings before a Hindi-first launch.
- **Maps:** no embedded maps or distances; links open a Google Maps search.
- **Images:** gradient placeholders; no photos are fabricated.
- **Government schemes:** real schemes with official portal links, but summaries are general and **not yet verified** by staff (shown on each page).
- **Legal pages** are drafts pending legal review.
- Main JS bundle is ~137 KB gzipped (React, router, icons, seed data); module pages are split into separate chunks.

## Prioritised roadmap to production

1. **Backend & auth (P0):** Supabase project from `supabase/schema.sql`; phone OTP; complete RLS for every table; server functions for votes, confirmations and admin actions; audit logging.
2. **Trust & safety (P0):** moderation tooling on the server, rate limits, spam detection, reporting SLAs, verified-badge process with document storage and review.
3. **Legal & compliance (P0):** lawyer-reviewed policies; consent logging; data retention/deletion; recruitment and finance referral agreements; GST invoicing.
4. **Content sources (P1):** newsroom CMS or licensed feed; verified mandi data (Agmarknet/data.gov.in); verified scheme summaries with last-verified dates.
5. **Payments (P1):** gateway integration with server-side order creation and webhook verification; subscription billing; refunds.
6. **Notifications (P1):** VAPID push server, SMS/WhatsApp for critical updates.
7. **AI (P1):** deploy `api/assistant.js` with auth + rate limits; add tool use over real listings.
8. **Real listings onboarding (P1):** business/provider onboarding drive; claim & verification workflow staffed.
9. **Localisation (P2):** complete Hindi; consider Mewari/Rajasthani labels.
10. **Maps & distance (P2):** verified coordinates, embedded maps, distance filters with consent-based location.
11. **Booking partners (P2):** authorised bus/rail/courier APIs.
12. **QA (ongoing):** device lab tests, accessibility audits, performance budgets, Playwright suite in CI.
