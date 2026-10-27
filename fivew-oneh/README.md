# CareLens (`fivew-oneh`)

A mobile-first, installable PWA for **Indian personal-care intelligence**: search products and ingredients, analyse ingredient lists, compare products side by side, and understand any topic through a structured **5W1H** (What, Why, When, Who, Where, How) framework, with evidence levels and sources shown throughout.

The app sits entirely in this folder. It does not depend on, import from, or change anything else in the repository, and you can deploy it on its own by setting the deployment root directory to `fivew-oneh`.

> **Educational information, not medical advice.**
> **All product records are fictional demonstration data.** Their brand names start with "DemoLab" and their prices are illustrative. They exist so you can try search, comparison and the analyser without the app inventing facts about real brands.

---

## Features

| Area | What it does |
| --- | --- |
| **Universal search** | Local index covering products, brands, ingredients (INCI names and Hindi names such as *haldi* and *nariyal*), categories, concerns, Ayurvedic practices and articles. Supports case-insensitive, partial and fuzzy (typo-tolerant) matching, synonyms, type and category filters, suggestions, "Did you mean", search history you can clear, and helpful empty states. |
| **Intent classification** | Sorts each query into comparison, product/label analysis, alternatives, safety, suitability, usage, explanation or general education. It routes to the Compare page or the analyser, and opens the matching 5W1H section. |
| **Quick answers** | Pulled word-for-word from a reviewed record's FAQ or 5W1H section, with a link to that record. Nothing is generated and no AI API is used. |
| **5W1H** | Shown as an accordion on detail pages and as a full guide view (`/guide/:kind/:id`) for ingredients, topics and products. Product 5W1H is built only from fields on the product record. Sections that don't apply to a topic are marked "not applicable" instead of being filled with filler text. |
| **Ingredient database** | 72 ingredients: 17 full records (each with forms, evidence, concentrations where widely documented, precautions, compatibility, myths, FAQs, alternatives and sources) plus glossary entries for common formulation ingredients. |
| **Products** | Full ingredient lists linked to ingredient pages, price per unit, data completeness, verification status, warnings, and an "I own this" option. |
| **Ingredient-list analyser** | Paste any label. It recognises entries (including spelling variants and INCI names), lists unrecognised ones, flags precautions and explains what ingredient order can and cannot tell you. It never gives an overall safe/unsafe verdict. |
| **Compare** | Compare 2–4 products from the same category: add, remove or replace products, see ingredient differences, declared concentrations, price per ml/g, evidence and missing data. A rule-based summary covers where each product may suit you and what cannot be concluded. There are no rankings and no "best" product. Ingredient-vs-ingredient comparison is also supported. |
| **Personalisation** | Optional and stored on your device. Covers skin type and concerns, hair and scalp, oral care, age, region, climate, budget, ingredient preferences, sensitivities, current products and goals. It re-orders results and adds "relevant to you" and caution notes. It can be switched off or cleared at any time. |
| **Regional & seasonal context** | 14 cities, grouped by broad climate, plus guidance for the four IMD seasons. This is clearly labelled as general guidance, not live weather. Live weather is optional (see `VITE_WEATHER_PROVIDER`). |
| **Ayurveda & home remedies** | Separates traditional belief, established evidence, preliminary evidence and unsupported claims. Each entry covers hygiene and contamination, risks, when to see a professional, and flags such as "Not recommended". |
| **Learn** | Concise articles: beginner guides, label and claim literacy, myths, FAQ, mistakes, cost vs value, safety and evidence. Each shows author, published date, last-reviewed date and sources. |
| **Saved & optional routines** | Bookmarks, saved comparisons, "my products", and simple routines with in-app reminder times. All stored on the device; none of it is required. |
| **Content status** | A read-only dashboard (`/content`) showing every record's review status. |

## Tech stack

React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router 6 and Vitest. The content database is a set of typed modules in `src/data` (the source of truth). These export to PostgreSQL/Supabase SQL with row-level security (`db/`). Everything core works offline with no credentials.

## Getting started

```bash
cd fivew-oneh
npm install
npm run dev          # http://localhost:5180
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build to `dist/` (also writes `precache-manifest.json` and stamps `sw.js`) |
| `npm run preview` | Serve the production build at http://localhost:4173 (the service worker is active only here, not in dev) |
| `npm test` | Unit tests: search, intent, synonyms, analyser, comparison, personalisation |
| `npm run validate:content` | Checks references, sources, review dates and demo-data rules |
| `npm run db:seed-sql` | Regenerates `db/seed.sql` from `src/data` |
| `npm run db:test` | Applies migration and seed to a fresh in-memory Postgres (PGlite), then checks counts, constraints and RLS |
| `npm run icons` | Re-renders the PNG icons from the SVGs (needs Playwright installed) |
| `node scripts/e2e.cjs [url]` | Browser end-to-end smoke test against a running preview (needs Playwright installed) |

### Environment variables

Copy `.env.example` to `.env`. Every variable is optional.

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_BASE` | `/` | Serve the app from a sub-path, e.g. `/fivew-oneh/`. The manifest, service-worker scope and router all follow it. |
| `VITE_WEATHER_PROVIDER` | *(empty)* | Set to `open-meteo` to show live temperature, humidity and max UV from [Open-Meteo](https://open-meteo.com). It needs no API key. If it is empty or the request fails, the app shows labelled seasonal guidance only. |

Never put secrets in `VITE_*` variables, because they are embedded in the client bundle. The app needs no secrets.

## PWA & isolation

- **Manifest** (`public/manifest.json`): id `fivew-oneh-carelens`, name "CareLens — Personal Care Intelligence". `start_url` and `scope` are `./`, so they resolve to wherever the app is deployed.
- **Service worker** (`public/sw.js`):
  - Uses cache name `fivew-oneh-v1` and is registered with `scope` set to the app's base path.
  - Only handles same-scope `GET` requests. Cross-origin requests (such as weather) pass straight through.
  - On activation it deletes only stale caches whose names start with `fivew-oneh-`. Caches belonging to other apps are never touched.
- **Caching strategy:**
  - On install, the app shell and the hashed build assets listed in `precache-manifest.json` are precached.
  - Navigations use network-first, falling back to the cached shell and then to `offline.html`.
  - Static assets use cache-first.
- **Updates:** each build stamps a new build ID into `sw.js`. When a new version is waiting, the app shows a "Refresh" prompt.
- **Offline:** once the app has loaded online, every page works offline, including search, the analyser and comparison, because the database ships in the bundle. An offline banner is shown.

## Deployment

### Vercel
Import the repository, set **Root Directory** to `fivew-oneh` and deploy. `vercel.json` sets the build command, output directory, SPA rewrites and cache headers (`sw.js` is served with `no-cache`).

### Netlify
Set **Base directory** to `fivew-oneh`. `netlify.toml` builds into `dist`, and `public/_redirects` provides the SPA fallback.

### Other static hosts
Run `npm run build` and serve `dist/`, rewriting unknown paths to `index.html`. For a sub-path, build with `VITE_BASE=/your-path/`.

## Data architecture

```
src/data/
  types.ts        content model (mirrors db/migrations/001_schema.sql)
  sources.ts      organisation-level references
  categories.ts   8 categories with subcategories
  ingredients.ts  ingredient database (full + glossary tiers)
  products.ts     fictional demo products; ingredient lists parsed and linked automatically
  topics.ts       concerns, practices, Ayurvedic practices, home remedies, lifestyle
  articles.ts     learning library (includes one draft and one archived example)
  regions.ts      cities, climate zones, IMD seasons, seasonal guidance
src/lib/
  search.ts       index, ranking, synonyms, fuzzy matching, intents, comparisons, quick answers
  analyzer.ts     ingredient-list analysis
  compare.ts      differences, price per unit, rule-based summary
  personalise.ts  profile model and relevance scoring
  store.tsx       on-device user data (localStorage, namespaced "fivew-oneh:")
db/
  migrations/001_schema.sql  tables, enums, indexes, constraints, triggers, RLS
  local/000_auth_stub.sql    minimal auth schema for plain Postgres/PGlite (not for Supabase)
  seed.sql                   generated seed data
```

### Database setup (optional)

The app runs from its bundled data. To use a database for content management:

```bash
# Supabase (auth schema already exists)
psql "$DATABASE_URL" -f db/migrations/001_schema.sql
psql "$DATABASE_URL" -f db/seed.sql

# Plain PostgreSQL 15+
psql "$DATABASE_URL" -f db/local/000_auth_stub.sql -f db/migrations/001_schema.sql -f db/seed.sql
```

The schema includes:

- **Constraints:** published or reviewed content must have a last-reviewed date, and publishing requires at least one source (enforced by a deferred constraint trigger).
- **Audit trail:** every status change is logged to `content_reviews`.
- **Row-level security:**
  - The public can read published, reviewed and needs-verification content.
  - Only users listed in `editors` can read drafts and archived records, or write anything.
  - User tables (`user_profiles`, `saved_items`, `comparison_lists`, `owned_products`, `routines`) are visible and writable only by their owner.

`npm run db:test` checks all of this on a fresh database.

## Content workflow

Content follows a documented, database-driven workflow. There is no in-app editor.

1. **Draft:** add or edit a record in `src/data/*.ts` (or in the database). Drafts never appear on public pages.
2. **Needs verification:** set this status when the content still needs checking. It is shown publicly with an amber "Needs verification" badge.
3. **Reviewed / Published:** a reviewer checks the claims against the listed sources, attaches exact source pages, and updates `lastReviewed`. `npm run validate:content` must pass. It rejects missing sources, unknown references, bad dates, and unverified prices on non-demo products.
4. **Archived:** set this status to retire a record. It is hidden publicly but kept for history.
5. Run `npm run db:seed-sql` to sync the database, and check `/content` in the app.

Rules for real product data: set `demo: false` only when the ingredient list, price (`price.verified`) and official URL have been verified, and set `verification` and `lastVerified` to match. Never add ratings or reviews.

## Testing done

- `npm test`: 48 unit tests covering search, synonyms, typos, intent classification, comparison resolution, quick answers, the analyser, comparison logic and personalisation ranking.
- `npm run db:test`: migration and seed on a fresh database, plus constraint and RLS checks.
- `npm run validate:content`: 0 errors. The warnings list the needs-verification records and the demo ingredients that are not in the database.
- `node scripts/e2e.cjs` in headless Chromium against the production preview:
  - search suggestions, synonyms, did-you-mean and the empty state
  - category filters
  - ingredient detail and the 5W1H guide
  - product detail
  - the analyser
  - comparison add, remove and save
  - personalisation changing results
  - persistence of saved items and comparisons
  - manifest, service-worker cache name and offline navigation
  - desktop sidebar navigation

## Known limitations

- **Demo products only.** No real products, prices or availability are included. Adding real ones requires verified data through the workflow above.
- **Editorial seed content.** Ingredient, topic and article records are plain-language summaries. Their sources are organisation-level links (homepages or section pages) and should be pinned to exact pages by a qualified reviewer before production use. A few records are deliberately marked *Needs verification*.
- **No in-app CMS editor.** Content is managed through the typed files or the database plus the documented workflow. `/content` is read-only.
- **No accounts or sync.** User data stays in the browser's localStorage. The database's user tables and RLS are ready for Supabase Auth, but the app does not connect to them yet.
- **No image scanning in the analyser.** Text input only.
- **Reminders are in-app only.** No push notifications are sent.
- **No optional AI layer.** Search and answers are purely retrieval-based.
- **Install prompt not tested on a real device.** Installability depends on browser support; the install prompt itself was not exercised on a device during testing. Offline mode was tested in headless Chromium.
