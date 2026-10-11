# Release readiness

**Date:** 11 October 2026 · **After:** Phase 5 acceptance · **Branch:** `claude/blissful-ritchie-rg4ibm`

This was the check before go-live. It added no features. It covered three things: a clean-machine install, the
app at the size of a real firm, and a final review of the analytics code.

## 1. Clean machine

From a fresh clone, with only Node.js 22:

| Step | Result |
|---|---|
| `npm install` | 58 s, 1,060 packages |
| `npm run setup` | 1 min 21 s: keys, database, all migrations, reference data and the demo firm |
| Every menu page for Partner, Manager, Staff, HR and Practice Admin | 73, 49, 35, 31 and 56 pages; all load, no errors |
| `npm run setup` again | Safe: it backs up, applies nothing new and keeps the data. Row counts were identical before and after |

## 2. Real-firm scale

A copy of the demo was grown to:
- 353 clients;
- 2,244 engagements;
- 36,096 tasks;
- 83,292 work entries (three years, at the same hours per person);
- 8,520 invoices.

Every page was then timed in a production build (`npm run build && npm start`).

**Found and fixed:**
- **Lists of 1,000 or more ids failed** (D-95). The database adapter did not tell Prisma the real SQLite limit
  (32,766), so Prisma refused any query with more than 999 ids. A firm with over a thousand engagements would have
  lost the engagement portfolio, and the same pattern is used in about 200 queries.
- **Missing indexes on invoice lines and receipt allocations** (D-96). Every billing join scanned the whole table:
  one engagement's dashboard took 8 s and `/billing` took 70 s in development. An additive, index-only migration
  fixes this.
- **A query per person-month for cost rates; budget bands read per engagement; QC completeness per engagement,
  creating rows on a page view** (D-96). All now run in one batch.

**Result (production build, Partner and Manager, every menu page):**

| | Before the fixes | After |
|---|---|---|
| Median page | — | **0.1 s** |
| Slowest page | `/billing` 70 s (development); the engagement portfolio failed outright | `/billing` 2.4 s; profitability 1.8 s; weekly summary 0.9 s |
| Pages with errors | — | none |

The monthly MIS builds in about 3 s at this size. `npm run analytics:reconcile` takes about 3.5 s per period.

## 3. Review of the analytics code

The review found ten problems, and all ten were fixed with regression tests (D-97). The ones a user would notice:
- capacity suggestions could overload the colleague they suggested in the following week;
- "Waiting on client" counted superseded tasks;
- the overdue drill-down list could show more tasks than the count;
- unbilled work missed never-billed fixed fees with no hours yet.

## 4. Tests that depended on the day

Three test files, and one browser flow, failed only on Sunday evenings:
- the Monday–Saturday week locks at 16:00 on Sunday (Q-12);
- a leave date two weeks out fell on a Sunday;
- a client-site check-in on a Sunday stays a week off.

The product behaves as specified in each case. The tests now pass on any day. The check-in rule is raised as Q-46.

## 5. Results

| Check | Result |
|---|---|
| Vitest (54 files) | **473 passed** |
| Reconciliation on the demo data | 247/247 checks match (four periods) |
| Playwright, full suite on a fresh demo | **47 passed**, 12 skipped (desktop-only or mobile-only), 1 failed: the phone work-entry flow, run on a Sunday after the 16:00 lock. The e2e setup now keeps the current week open, as for the unit tests, and that flow passes on rerun |
| Typecheck / lint / production build | clean / clean (2 existing warnings) / passes |

## 6. Before go-live (unchanged)

Follow `docs/go-live.md`. Open business questions are in `docs/open-questions.md`, the newest being Q-43 to Q-46.
Statutory values are Unverified until the Practice Admin checks them (Q-29).
