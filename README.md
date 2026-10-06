# Q-Workspace — QEPEX India Work Tracker

Practice management for QEPEX India's CA & CS practice: work tracking, the statutory compliance
calendar, review and sign-off, registers, billing, CRM, HRMS and payroll, a client portal and analytics.

It runs on **one computer with only Node.js**. There is no cloud account, external database, API key or
paid service, and nothing leaves the machine.

> **Build status:** Phase 1 (Foundation) is complete. The data model is frozen. Phases 2–5 add the
> modules listed in [`docs/build-plan.md`](docs/build-plan.md).

## Quick start

Requires **Node.js 20.19 or newer** (22 LTS recommended). Nothing else.

```bash
npm install
npm run setup    # creates .env with fresh keys, the database, migrations and the demo firm
npm run dev      # http://localhost:3000
```

`npm run setup` is safe to run again: it never resets data. It backs up an existing database, applies
any new migrations (`prisma migrate deploy`), and reloads reference data. Demo data is loaded only into an
empty database in demo mode.

### Demo logins

Every demo user's password is **`Qepex@2026`**.

| Role | Username | Notes |
|---|---|---|
| Partner | `arvind.mehta` (also `kavita.rao`) | 2FA required |
| Manager | `rohan.iyer` (also `sneha.kulkarni`, `imran.shaikh`) | 2FA required |
| Staff / Senior | `priya.nair` (Senior); `neha.gupta` (Staff) | 2FA optional |
| Article Assistant | `aditya.kumar` | 2FA optional |
| Practice Admin | `suresh.pillai` | 2FA required |
| HR / Payroll Admin | `lakshmi.narayanan` | 2FA required |
| Client Portal User | — | portal arrives in Phase 4 |

**Two-factor codes for the demo.** Demo users who need 2FA share one authenticator secret,
`JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`. You can add it to an authenticator app, or run
`npm run demo:totp` to print the current 6-digit code. Real users scan their own QR code under
**My profile → Password & two-factor login**.

The demo firm has 21 people, 3 client teams, 40 clients and 159 engagements. The clients cover every
constitution, 8 family/promoter groups, multiple GSTINs, directors shared across companies, AGM dates and
Professional Tax registrations. All PAN, GSTIN, DIN, Aadhaar and bank numbers are **fake** but correctly
formatted.

**Reset demo data:** go to Settings → Demo data (Partner only), or run `npm run demo:reset`. Both refuse
unless `DEMO_MODE=true`.

## Using it for real

1. Set `DEMO_MODE="false"` in `.env` **before** the first `npm run setup` on the firm's computer.
2. `npm run setup` prints a one-time password for the first Partner (`partner`). Sign in, set a password,
   and set up two-factor login.
3. Add people under **People**, or in bulk under **Import**. Then add clients the same way.
4. **Back up `.env` separately and safely.** It holds `VAULT_KEY` and `PII_KEY`. Without them, encrypted
   fields (credentials, salary, bank, Aadhaar, PAN of staff) cannot be read, even from a backup.

### Phones on the office Wi-Fi

`npm run dev` and `npm start` listen only on this computer. `npm run dev:lan` / `npm run start:lan`
let phones on the same Wi-Fi connect. Traffic is plain HTTP for now; HTTPS for LAN use is open question
Q-26.

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Keys, folders, safe migration, reference + demo data |
| `npm run dev` / `dev:lan` | Development server (local / office network) |
| `npm run build` then `npm start` / `start:lan` | Production server |
| `npm test` | Unit, integration, permission and migration tests (Vitest) |
| `npm run test:coverage` | Same with coverage (compliance engine must be 100% from Phase 2) |
| `npm run e2e` | Browser tests (Playwright, desktop + phone) — starts its own dev server |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:stats` | Row counts of the main tables |
| `npm run demo:totp` | Current 2FA code for demo users |
| `npm run demo:reset` | Reload demo data (demo mode only) |

The e2e tests need a Chromium for Playwright (`npx playwright install chromium` once). Everything else
needs only Node.js.

## What Phase 1 delivers

- **Login**: username + password, mandatory TOTP 2FA for Partner/Manager/Practice Admin/HR Admin (QR made
  locally), lockout, idle and absolute session timeout, forced logout on offboarding/role change/password reset.
- **Permissions**: a central matrix for 7 roles × 85 capabilities, enforced in every service call, with
  record-level scoping. Staff and Articles see only clients they are assigned to. Managers see their team.
  HR has no client data. Billing is never shown to Staff or Articles.
- **Audit**: an append-only audit trail of every change (search + CSV export) and a log of every sensitive
  view.
- **Encryption**: AES-256-GCM with two separate keys (vault, PII) for 2FA secrets, staff PAN/Aadhaar/bank,
  director PAN and salary.
- **Client master**: constitution, identifiers, groups, multiple GSTINs (each with its own state and
  frequency), directors (one DIN record shared across companies), contacts, PT registrations (19 states),
  and applicability flags with effective-dated history.
- **Engagements**: fee basis, budgets, versioned stage templates, maker/checker/EQR assignment rules.
- **People**: users and roles, client teams, offboarding with a custody list, employee records and
  documents.
- **Import from Excel**: 8 import types (clients with GSTINs/directors/PT, users, teams, employees,
  salary structures, leave balances, receivables, leads). Each has a template, a row-by-row validation
  report and an apply step.
- **Backup & restore**: nightly + on demand. Restore needs Partner approval and takes an automatic
  pre-restore backup. Download is Partner only.
- **Scheduler**: runs inside the app, with Run now buttons and a System Log page.
- **Data model**: 181 tables, frozen (see [`docs/data-model.md`](docs/data-model.md)).

## Project layout

```
app/                 Next.js routes: (staff) pages, api/ route handlers, login
components/          UI components (shadcn-style primitives, tables, forms, shell)
server/
  services/          Business logic per module (every call checks permissions)
  permissions/       Matrix, guards, record-level scopes
  audit/             Audit trail and sensitive-view log
  scheduler/         node-cron jobs + JobRun log
  compliance-engine/ Pure due-date logic (Phase 2)
  excel/  pdf/       Import/export and document generation
  lib/               db, crypto, storage, dates (IST), money (paise), logger
prisma/schema/       Multi-file Prisma schema (SQLite now, PostgreSQL-compatible)
prisma/migrations/   Versioned migrations — never reset
prisma/seed/         Reference data + demo firm
tests/               unit, integration, permissions, migration, e2e
docs/                architecture, data model, permissions, decisions, open questions, build plan, reports
storage/ backups/ logs/   Local data (git-ignored)
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md): how it fits together
- [`docs/data-model.md`](docs/data-model.md): entities and ERDs (frozen)
- [`docs/permissions.md`](docs/permissions.md): the permission matrix and invariants
- [`docs/decisions.md`](docs/decisions.md): technical decisions
- [`docs/open-questions.md`](docs/open-questions.md): business rules and statutory values to confirm
- [`docs/spec-differences.md`](docs/spec-differences.md): where the brief and the specs differ
- [`docs/build-plan.md`](docs/build-plan.md): phases mapped to requirement IDs
- [`docs/phase-1-report.md`](docs/phase-1-report.md): Phase 1 report
