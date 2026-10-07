# Q-Workspace — QEPEX India Work Tracker

Practice management for QEPEX India's CA & CS practice: work tracking, the statutory compliance
calendar, review and sign-off, registers, billing, CRM, HRMS and payroll, a client portal and analytics.

It runs on **one computer with only Node.js**. There is no cloud account, external database, API key or
paid service, and nothing leaves the machine.

> **Build status:** Phases 1 (Foundation), 2 (Core practice) and 3 (Firm modules) are complete. The data
> model is frozen. Phases 4–5 (client portal, analytics) are listed in [`docs/build-plan.md`](docs/build-plan.md).

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

The demo firm has 21 people, 3 client teams, 40 clients and about 170 engagements. The clients cover every
constitution, 8 family/promoter groups, multiple GSTINs, directors shared across companies, AGM dates and
Professional Tax registrations. On top of that the seed generates the compliance calendar for every client
(about 1,500 tasks, most past ones filed, some late, some overdue), about six months of daily work entries,
work pending from clients and under review, notices with a hearing, DSCs in every expiry band, UDINs,
portal credentials with grants, the inward/outward register, leave (including one request that clashes with
due dates) and today's reminders. Phase 3 adds about 45 invoices with receipts, write-offs and retainer drafts,
leads and proposals through to a won engagement, six months of payroll and stipend runs, appraisals,
articleship records, expenses, assets, an exit in progress, about 60 documents with QC checklists, knowledge
articles, helpdesk tickets, meetings and applause. Dates are relative to the day you run setup, so the demo always looks
current. All PAN, GSTIN, DIN, Aadhaar, UDIN and bank numbers are **fake** but correctly formatted.

**Reset demo data:** go to Settings → Demo data (Partner only), or run `npm run demo:reset`. Both refuse
unless `DEMO_MODE=true`.

## Using it for real

Follow **[`docs/go-live.md`](docs/go-live.md)**: install, settings before import, Rajasthan holidays,
verification of statutory values, the import order (users → teams → employees → clients → engagements) and
the first week. In short:

1. Copy `.env.example` to `.env` and set `DEMO_MODE="false"` **before** the first `npm run setup` on the firm's computer.
2. `npm run setup` prints a one-time password for the first Partner (`partner`). Sign in, set a password,
   and set up two-factor login.
3. Add people under **People**, or in bulk under **Import**. Then add clients the same way.
4. **Back up `.env` separately and safely.** It holds `VAULT_KEY`, `PII_KEY` and `BACKUP_KEY`. Without
   them, encrypted fields (credentials, salary, bank, Aadhaar, PAN of staff) cannot be read, and backup
   files (`.qbk`, encrypted) cannot be restored.
5. Before relying on due dates, a Partner opens **Admin → Due-date master** and verifies each rule and late
   fee against the official notification (unverified rows are flagged).

### Phones on the office Wi-Fi (HTTPS)

`npm run dev` and `npm start` listen only on this computer. To let phones on the office Wi-Fi in, use HTTPS:

```bash
npm run build
npm run start:lan:https    # https://<this-computer's-IP>:3443  (prints the addresses)
```

The first run creates a certificate for this computer in `certs/` (never committed). Each phone or PC must
trust it once: copy `certs/qepex-lan.crt` to the device and install it (Android: Settings → Security →
Install a certificate → CA certificate; iPhone: open the file, install the profile, then Settings → General →
About → Certificate Trust Settings → turn it on; Windows: double-click → Install → Trusted Root Certification
Authorities). After that the browser shows a padlock and **Add work** can be installed to the home screen
and used offline; entries made offline sync when the phone is back on the Wi-Fi.

`npm run dev:lan:https` does the same for development. Plain-HTTP `dev:lan` / `start:lan` still exist, but
browsers do not allow offline mode over plain HTTP on another device.

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Keys, folders, safe migration, reference data, then the demo firm (demo mode) or the first Partner login (real install) |
| `npm run dev` / `dev:lan` | Development server (local / office network) |
| `npm run build` then `npm start` / `start:lan:https` | Production server (this computer / office network over HTTPS) |
| `npm run lan:cert` | Create or refresh the office-network certificate only |
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
- **Import from Excel**: 9 import types (clients with GSTINs/directors/PT, engagements with makers/checkers, users, teams, employees,
  salary structures, leave balances, receivables, leads). Each has a template, a row-by-row validation
  report and an apply step.
- **Backup & restore**: nightly + on demand. Restore needs Partner approval and takes an automatic
  pre-restore backup. Download is Partner only.
- **Scheduler**: runs inside the app, with Run now buttons and a System Log page.
- **Data model**: 181 tables, frozen (see [`docs/data-model.md`](docs/data-model.md)).

## What Phase 2 delivers

- **Compliance calendar engine**: 31 compliance types (plus GSTR-10, Form 11 and STK-2 closure filings) with
  effective-dated, admin-editable rules, holidays, extensions with preview, AGM-based and provisional dates,
  late-fee and interest exposure. Every Rules Spec scenario and edge case is a test; 100% branch coverage.
- **Tasks**: generated per client, GSTIN, director or PT state; list grouped Overdue / This week / Next week /
  Later; This Week page; group view; manager bulk reassign / change checker / not applicable; one-off tasks.
- **Daily work entry** (phone-first): recent client pairs, Today / Yesterday / pick / multiple dates / whole
  week, 15-minute steps, soft warning above 12 hours, budget signals, outcome numbers (ARN, SRN…), location,
  copy entry/day/week, timer, week grid, missing-day banners, weekly lock with Partner extension and
  correction requests. Works offline and syncs later.
- **Pending from client**: checklists, mark-all-requested, client-waiting days kept apart from internal delay,
  "Copy pending list" text for WhatsApp/email and "Mark as sent" reminder log.
- **Review & sign-off**: maker ≠ checker, Articles never check, review points, filing blocked while points
  are open, Partner sign-off and EQR, UDIN awaiting list.
- **Registers**: notices and hearings (7/3/1-day alerts), DSC register with custody movements and expiry
  bands, UDIN register, credentials vault (grants, every reveal logged), inward/outward.
- **Notifications**: in-app centre with preferences and quiet hours, browser pop-ups while the app is open,
  daily reminders and escalations (due, overdue → Manager → Partner, pending follow-up, review waits, DSC,
  UDIN, password changes, missing entries, weekly lock).
- **Calendar** (mine / compliance) with `.ics` download; **leave** with a due-date clash check and reassign;
  scoped **CSV/Excel exports**; stage-template versioning with stage mapping; the home dashboard per role.
- **Encrypted backups** and **HTTPS on the office network**.

## What Phase 3 delivers

- **Billing**: firm profile, GST invoices (CGST/SGST or IGST, SAC, pure-agent reimbursements, manual IRN) with
  PDF, gapless FY numbering, manual receipts with client TDS and part-payments, write-offs, ageing, unbilled-work
  alerts, realization, monthly retainer drafts for Partner approval, payment-reminder text, disbursements,
  accounting export (CSV/Excel).
- **CRM**: leads with duplicate check, activities, proposals with versions and Partner approval, engagement
  letters (PDF/Word) whose signed copy creates the client and engagement, onboarding checklist and conflict
  check, communication log, cross-sell suggestions, renewals with fee suggestions, client feedback, client
  communications with opt-out.
- **HR & payroll**: attendance from work entries, leave policies and accrual, salary structures, monthly payroll
  and article stipend runs (PF, ESI, PT, TDS under either regime), payslips, bank / PF ECR / ESI / PT / 24Q files,
  investment declarations, Form 16, cost rates; recruitment, articleship, appraisals with an evidence panel, CPE
  and skills, expenses, assets, exit and full-and-final, HR letters and policy acknowledgments.
- **Documents & quality**: automatic folders, versions, check-out, permission-aware search, audit file index,
  SQC 1 checklists, independence declarations, EQR, file inspections, peer-review pack, document template
  library (Word/PDF with merge fields, Partner-approved).
- **Collaboration**: completion reports, archive, retention with Partner-approved purge, comments with
  @mentions, client meetings with action items, knowledge base, helpdesk, applause, the firm's own compliance.

Statutory values (GST rate, SAC codes, PF/ESI/PT, income-tax slabs, stipend minimums, CPE hours) are seeded
**Unverified**. The Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026, so payroll tax values and form
names must be verified before the first real run (docs/open-questions.md Q-34).

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
storage/ backups/ logs/ certs/   Local data (git-ignored)
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
- [`docs/phase-2-report.md`](docs/phase-2-report.md): Phase 2 report
- [`docs/phase-3-report.md`](docs/phase-3-report.md): Phase 3 report
- [`docs/go-live.md`](docs/go-live.md): going live with real data
