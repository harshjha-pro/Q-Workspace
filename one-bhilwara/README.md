# One Bhilwara

**One City. Everything Connected.** — a hyperlocal, installable Progressive Web App for Bhilwara, Rajasthan: news and civic alerts, community and polls, local services, jobs, property, buy & sell, agriculture, government schemes, education, healthcare, weddings and events, transport, finance, business tools, rewards, an AI assistant and an admin panel.

> **This build runs in demo mode.** Every listing, price, news story, booking, verification and payment is sample or simulated data and is labelled as such in the UI. See [docs/QA.md](docs/QA.md) for exactly what is simulated.

This folder is a standalone app, independent of everything else in the repository: its own `package.json`, PWA manifest (`id: /one-bhilwara`), service worker (cache `one-bhilwara-v1`, only touches `one-bhilwara-*` caches), icons and `one-bhilwara:`-prefixed browser storage.

## Quick start

```bash
cd one-bhilwara
npm install
npm run dev          # http://localhost:5173  (service worker is disabled in dev)
npm run build        # type-check + production build to dist/
npm run preview      # http://localhost:4173  (production build, service worker on)
npm test             # unit tests (vitest)
```

Requirements: Node 20+ (tested with Node 22).

## Deploy

The app is a static build (`dist/`). Set the project **Root Directory to `one-bhilwara`**.

| Host | Settings |
|---|---|
| **Vercel** | Root Directory `one-bhilwara`. `vercel.json` sets build `npm run build`, output `dist`, SPA rewrites (except `/api/*`), no-cache for `sw.js`, immutable caching for `/assets/*`, security headers. `api/assistant.js` deploys as a serverless function automatically. |
| **Netlify** | Base directory `one-bhilwara`. `netlify.toml` sets build/publish/redirects/headers. (To use the AI endpoint on Netlify, move `api/assistant.js` to `netlify/functions/` and adapt the handler signature.) |

HTTPS is required for service workers and installation (both hosts provide it).

## Tech stack (and why)

- **React 19 + TypeScript (strict) + Vite 7** — fast builds, small runtime, strict types across the data model.
- **React Router 7** — path-based routes for every module (`/jobs/:id`, `/polls/:id`, …) with per-module code splitting.
- **Tailwind CSS 4** with design tokens (`src/index.css`) — consistent navy/teal/amber design system.
- **lucide-react** icons.
- **Hand-written service worker** (`src/sw/sw.js`) + a small Vite plugin that emits `asset-manifest.json` and stamps a build id, so the whole app shell (including lazy chunks) is precached and each deploy triggers an update prompt.
- **No backend needed for the demo** — a local data adapter seeded from `src/data/seed`; production swaps in Supabase (schema in `supabase/schema.sql`).

## Architecture

```
src/
  app/            App router (all routes), guards (RequireAuth/RequireRole), error boundary, PWA hooks
  layouts/        AppShell: header, desktop sidebar, mobile bottom nav, demo bar, role switcher, offline banner
  components/     ui/ (design system: buttons, badges, dialog, tabs, forms, skeletons, toasts)
                  shared.tsx (save/share/report/enquiry/reviews/comments/filters/charts), cards.tsx, inbox.tsx
  features/       one folder per module: home, news, community, discover, services, jobs, property, marketplace,
                  agriculture, government, education, healthcare, events, transport, finance, businesses,
                  ai, notifications, rewards, account, insights, admin
  services/       store.ts (repository over the data adapter), session.ts (demo session/prefs),
                  domain/ (polls, service matching, eligibility, search, common actions — unit tested),
                  adapters/ (ai, weather, payments, push), integrations.ts (what is configured)
  data/seed/      demo records (fictional businesses/people; real public portals only for schemes)
  types/          models.ts — the data model shared with supabase/schema.sql
  i18n/           English/Hindi UI dictionary (parity is unit-tested)
  config/         localities, categories, module registry
  sw/             service worker source
api/assistant.js  optional server-side AI endpoint (keeps the API key off the client)
supabase/         production database schema + starter RLS policies
docs/             integration guide, QA checklist, limitations, roadmap
```

Feature code reads and writes only through `repo`/`store` and the domain services, so replacing the local adapter with a real backend does not require rewriting screens.

## Demo mode

- **Seed & reset:** data lives in `localStorage` (`one-bhilwara:db:v1`) and is re-seeded with timestamps relative to "now". Reset any time from the **Demo** button → *Reset demo data*, or Settings.
- **Demo role switcher** (top banner → *Switch demo role*): Resident, Business owner, Service provider, Job seeker, Employer, Property owner, Administrator. It is **not authentication** — production must enforce roles server-side.
- **Demo sign-in:** any valid Indian mobile + any 6-digit code. No passwords are stored.
- **Simulations, always labelled:** provider responses to service requests, coordinator assignment, checkout/payments/invoices, ticket and travel bookings (`DEMO-XXXXX` references), courier tracking (`DEMO-TRK-1001`, `DEMO-TRK-1002`), weather, sports scores, fuel/gold/mandi prices, ad metrics, vouchers, AI answers.
- **Not stored:** passwords, ID documents, medical details, file contents (uploads keep only the file name).

## Environment variables

Copy `.env.example` to `.env.local`. Only `VITE_*` values reach the browser — never put secrets in them. Everything is optional; unset integrations stay in labelled demo mode. Full details: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Testing

- `npm test` — unit tests for poll reveal/one-vote rules, provider ranking and conflict prevention, eligibility screening, search filters/sorting, demo AI routing, Indian formatting and English/Hindi key parity.
- `npm run build` — strict TypeScript check + production build.
- End-to-end checks were run with Playwright against the production preview (route crawl at 390 px and 1280 px, key user flows, offline) — see [docs/QA.md](docs/QA.md).

## Documents

- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — required external APIs/credentials and how to connect auth, database, AI, maps, notifications, payments, news, sports and market data.
- [docs/QA.md](docs/QA.md) — QA checklist (what was tested), known limitations, what runs in demo mode, and a prioritised production roadmap.
- [supabase/schema.sql](supabase/schema.sql) — data model with constraints and starter RLS policies.

Legal pages (Privacy, Terms, Community Guidelines, Advertising, Refunds, Provider Terms, Listing Terms) are **drafts pending legal review**.
