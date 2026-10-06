# Phase 1 report — Foundation

**Date:** 6 October 2026 · **Branch:** `claude/blissful-ritchie-rg4ibm` · **Status:** built and tested; the data model is frozen.

## 1. How to run it

```bash
npm install && npm run setup && npm run dev     # http://localhost:3000
```

The demo logins are in the README. Every demo password is `Qepex@2026`. Partners, Managers and both Admins
need a 2FA code; run `npm run demo:totp` to print it.

I verified this on a **fresh clone** with Node.js 22 and nothing else installed for the app. `npm install` took
about 30 s and `npm run setup` about 15 s. Setup generated new keys, migrated the database and loaded the demo
firm. On first start the scheduler ran its catch-up backup. The full e2e suite then passed against that clone.

## 2. What was built (by requirement ID)

| ID | Requirement | Where |
|---|---|---|
| P1-01 | Version control, one build | Git repo; `npm run build` passes; ESLint clean (4 library warnings only) |
| P1-02 | Versioned migrations, no data loss | `prisma/migrations`; `tests/migration` (no destructive SQL, no drift, re-deploy keeps every row) |
| P1-03 / P1-11 | Shared database | SQLite (WAL) via Prisma 7 + libsql adapter; schema stays PostgreSQL-compatible |
| P1-04 / P1-12 | Central permission matrix, server-side, client-team scoping | `server/permissions/*`; checked in every service call |
| P1-05 | Audit hook on every action | `server/audit`; same transaction as the change; audit search + CSV export page |
| P1-06 | Compliance engine tests | **Moved to Phase 2 with the engine** (brief §13). The coverage gate (100% for `server/compliance-engine`) is already configured |
| P1-07 | Demo data | `prisma/seed/demo.ts` (21 people, 40 clients, 159 engagements); Reset demo data in demo mode only |
| P1-08 | Login, TOTP 2FA, session timeout | Two-step sign-in, local QR enrolment, mandatory for Partner/Manager/PA/HR, lockout, idle 30 min / absolute 12 h |
| P1-09 | Sensitive-view log | `SensitiveViewLog` written for employee PII and HR documents now; credentials, notices and billing write it from Phase 2/3 |
| P1-10 | File storage | `/storage` with type allow-list, magic-byte check, 25 MB limit, path-traversal guard, authorised + audited downloads |
| P1-13 → | (SSO replaced) | Password + TOTP |
| P1-14 → | (Hosting replaced) | Local; AES-256-GCM with separate VAULT/PII keys; backup/restore (also **P2-36**, moved forward per brief) |
| P1-15 | Users and offboarding | People pages; deactivation revokes sessions, teams, vault grants and portal threads at once, and lists DSCs, documents, assets and engagements for return |
| P1-16 | Bulk import | 8 Excel imports with templates, row-by-row validation report, preview, apply |
| P1-17 | Admin control of default location | Per person: default location + whether it can be changed |
| P1-18 | Multiple GSTINs; GST per GSTIN | GSTIN table with its own state/frequency/IFF/9/9C; checksum and PAN-match validation |
| P1-19 | Directors with DIN; DIR-3 KYC per director | One `Director` per DIN shared across companies; primary company holds the KYC task (Q-04) |
| P1-20 | Fee basis on engagement | Fixed / retainer / time-based with rate; fees hidden from Staff/Articles; changes Partner-only |
| P1-21 | Employee profile and documents | Encrypted PAN/Aadhaar/bank, masked Aadhaar, KYC/certificate uploads |
| P1-22 | Seven roles incl. HR Admin and Portal User | `Role` table + matrix; portal login comes in Phase 4 |

Brought forward from Phase 2 because the foundation needed them: the app shell with role-based navigation
(part of P2-28), plain-language "applies when" labels (part of P2-23), the audit search/CSV page (P2-27),
and the backup/restore UI (P2-36).

## 3. Tests

| Suite | Result |
|---|---|
| Vitest: unit, integration, permissions, migration (12 files) | **112 passed** |
| Playwright e2e: login/2FA, client master, **role walkthrough** (all 6 staff roles, every menu page, first record of each list, forbidden pages) — desktop + phone | **24 passed** |
| Permission tests | every capability × 7 roles against the matrix; record-level scoping for client, engagement, task, people and work entries per role |
| Clean-clone run | `npm install && npm run setup && npm run dev` + full e2e on a fresh clone: passed |
| `npm audit --omit=dev` | 0 vulnerabilities (3 transitive packages pinned with overrides, D-37) |

## 4. Problems found and fixed during the phase

1. **Partial updates were resetting fields.** Zod's `.partial()` still applies `.default()`, so renaming a
   client reset its books-by, KYC status and channel, and an employee import without PAN would have wiped the
   stored PAN. Fixed with `parsePartial()` (D-28); regression tests added.
2. **Restore locked the database.** Prisma's `$disconnect()` leaves the SQLite file open, so swapping the
   file underneath it failed. Restore now copies rows through SQLite `ATTACH` (D-22 amended).
3. **The walkthrough found three access gaps:** Staff could open a People page showing only themselves, HR got
   an error instead of "no access" on client pages, and the Practice Admin could not read their own employee
   record. All three are fixed (D-30).
4. **The clean-clone test found a missing page.** `.gitignore`'s `backups/` also hid the backup page and its
   download route. Ignore patterns are now anchored to the repo root.
5. **Next.js 16.3 wrote its own AGENTS.md/CLAUDE.md and turned on telemetry.** Both are now off (D-34).

## 5. Data model freeze

181 tables, migration `20261006144742_init_frozen_phase1`. From now on only additive migrations are allowed.
The migration test enforces this. Statutory values (due dates, rates, slabs) are not loaded yet; they arrive
with their modules as rows marked "Unverified".

## 6. Open questions (details in `open-questions.md`)

**Needed before or early in Phase 2:**
- **Q-26 HTTPS on the office Wi-Fi.** Phones currently use plain HTTP, and the offline work-entry app needs
  HTTPS on phones. Proposal: a self-signed certificate generated by setup.
- **Q-27 Encrypt backup files** with a passphrase from `.env`?
- **Q-02b Professional Tax due rules and slabs** for the 19 states (until then PT due dates are typed by hand).
- **Q-05 Flag switched off mid-year** — confirm the period-start-date rule.
- **Q-10 to Q-14:** the AGM ceiling, closure filings, weekly lock time, the default notice-response days, and
  review levels plus the EQR threshold.

**Still open from the plan:** Q-07 (portal 2FA), Q-09 (payroll parameters), Q-15 to Q-25.

## 7. Next: Phase 2 — Core practice

The compliance engine (pure functions, all 15 Rules Spec scenarios plus edge cases, 100% branch coverage),
the Due-Date Master with extensions and holidays, and task generation hooked to the client-change events
already in place. Then the home dashboard and task list, work entry with the week grid and offline PWA,
pending from client, review and sign-off, weekly lock and corrections, the calendar with `.ics`, the
registers (notices, DSC, UDIN, vault, inward/outward), notifications, leave and exports.
