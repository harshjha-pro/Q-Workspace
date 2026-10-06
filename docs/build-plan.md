# QEPEX India Work Tracker — Build Plan (Phase 0, for approval)

Phases follow the brief §13. Requirement IDs are from Product Spec §15 (118 items).
Every commit message starts with the IDs it covers, e.g. `P2-11 P2-22: effective vs original due date`.
"→" marks a requirement built in its code-only replacement form (brief §4).

## Phase 1 — Foundation (data model frozen at the end) — ✅ built 6 Oct 2026 (see `phase-1-report.md`)

| # | Slice | IDs |
|---|---|---|
| 1.1 | Scaffold: Next.js App Router, TS strict, Tailwind, shadcn/ui, ESLint, Vitest, Playwright, `npm run setup/dev/test/e2e` scripts | P1-01 |
| 1.2 | **Full Prisma schema** for all ~165 tables (data-model.md) + first migration; SQLite WAL; migration test harness (upgrade a seeded DB, assert row counts/checksums) | P1-02, P1-03, P1-11 |
| 1.3 | `npm run setup`: generate `.env` keys if missing, `prisma migrate deploy`, seed demo firm; never destroys an existing non-demo DB | P1-07 |
| 1.4 | Login (username/password, bcrypt), lockout, **TOTP enrol/verify with local QR**, idle + absolute timeout, `sessionEpoch` force-logout | P1-08, P1-13→ |
| 1.5 | Permission matrix as code, `authorize`/`scopeWhere`/`shape`, seven roles, permission test suite (all roles × all capabilities) | P1-04, P1-12, P1-22 |
| 1.6 | Audit hook in the service transaction helper; SensitiveViewLog; audit list page (search/CSV in Phase 2) | P1-05, P1-09 |
| 1.7 | AES-256-GCM crypto lib (vault key, PII key, versioned ciphertext); local file storage service with type/size/magic-byte checks and authorised download route | P1-10, P1-14→ |
| 1.8 | Users, roles, designations, client teams, default location policy, **offboarding** (revoke, custody list, history kept) | P1-15, P1-17 |
| 1.9 | Employee profile (masked Aadhaar, encrypted bank/PAN, ICAI/ICSI no., reporting manager, cost rate restricted) + KYC document store | P1-21 |
| 1.10 | Client master: constitution, identifiers, group, **multiple GSTINs with own frequency**, **directors with DIN** (primary company for DIR-3 KYC), PT state registrations, contacts, all applicability flags + flag history, status, Partner/Manager/team | P1-18, P1-19 |
| 1.11 | Engagements (service line, recurring/one-time, **fee basis**, budget), stage templates v1 seeded | P1-20 |
| 1.12 | Excel import: clients (with flags, GSTINs, directors), users, client teams, employees, salary structures, opening leave balances, open receivables, leads; downloadable templates; validation report; dry-run preview | P1-16 |
| 1.13 | Backup now / scheduled nightly backup / download (Partner) / restore with Partner approval and pre-restore snapshot | P1-14→, P2-36 (pulled forward per brief) |
| 1.14 | Scheduler skeleton (node-cron, JobRun, Run now), structured logs + System Log page | infra for P2-34, P2-37→ |
| 1.15 | App shell, role-based navigation skeleton, Indian formatting utils (₹ lakh/crore, DD-MMM-YYYY, FY/AY), demo-mode banner + Reset demo data | P2-28 (shell only) |
| 1.16 | Seed: 2 Partners, 3 Managers, 8 Staff, 6 Articles, 1 Practice Admin, 1 HR Admin; 40 clients (all constitutions, groups, multi-GSTIN, directors, AGM dates); ~150 engagements (no tasks/entries yet) | P1-07 |

Exit: schema documented and frozen; migration test passes; permissions enforced server-side; 2FA working.

## Phase 2 — Core practice

| # | Slice | IDs |
|---|---|---|
| 2.1 | **Compliance engine** (pure): applicability, periods, due-date rules, holiday policy, generation, flag/frequency/status changes, extensions, event dates & provisional dates, status evaluation, late-fee/interest exposure; **all 15 Rules Spec scenarios + 14 edge cases as tests, 100% branch coverage** | P1-06, P2-11, P2-14, P2-19, P2-20, P2-21, P2-22, P2-23 |
| 2.2 | Due-Date Master admin (versioned rules, extensions with preview, holidays, late-fee rates, "Applies when" labels), knowledge-article link field | P2-20, P2-21, P2-22 |
| 2.3 | Generation job wired to scheduler + on-change triggers; Admin "Regenerate" | P2-20 |
| 2.4 | Stage-template versioning with "move open tasks" stage mapping | P2-24 |
| 2.5 | Home dashboard: snapshot, Due This Week strip, waiting-for-review, firm compliance strip, combined missing-day banner, clickable people-with-missing-days, Allocations Pending, role widgets | P2-01, P2-02, P2-03, P2-04, P2-41 |
| 2.6 | Task list (Overdue / This week / Next week / Later, sort, filters), This Week page (person's week, next-week toggle), Manager bulk actions, group view | P2-09, P2-10, P2-18, P2-25 |
| 2.7 | **Work entry**: mobile-first Add Work, recent pairs, date modes (Today/Yesterday/Select/Multiple/Week), 15-min steps, 12-h soft warning, budget bands, outcome fields, location, internal categories, Copy Entry/Day/Week, week grid with holidays/leave | P2-05, P2-06, P2-08 |
| 2.8 | Mobile timer; **offline PWA** queue + sync | P2-38, P2-42 |
| 2.9 | Pending from client: checklists, mark-all-Requested, notes, pending records, client-waiting days, reminder log, **Copy pending list + Mark as sent** | P2-16, P2-17 |
| 2.10 | Review & sign-off: review requests, review points, filing block, maker≠checker, article never final, sign-off + UDIN link, EQR step (threshold setting) | P2-12, P2-13 |
| 2.11 | Weekly lock, Partner extension, correction requests | P2-07 |
| 2.12 | Audit trail search (date, person, text) + CSV | P2-27 |
| 2.13 | Calendar (personal + compliance layers, filters, holidays) + **`.ics` download** | P2-26, P2-43→ |
| 2.14 | Notices + hearings (7/3/1 alerts), DSC register + movements + expiry flags on tasks, UDIN register + awaiting-UDIN, **credentials vault** (grants, view log), inward/outward | P2-15, P2-30, P2-31, P2-32, P2-33, P2-39 |
| 2.15 | **Notification centre** (bell, unread, deep links, quiet hours, preferences) + browser Notification API while app open; reminder/escalation jobs (Rules Spec §9) | P2-34, P2-37→, P2-40→ |
| 2.16 | Leave (apply, approve with task-conflict check + reassign shortcut, calendar/grid display) | P2-29 |
| 2.17 | Scoped CSV/Excel exports (entries, tasks, filings, registers) | P2-35 |
| 2.18 | Full role-based navigation | P2-28 |
| 2.19 | Seed: 6 months of tasks & work entries, notices, DSCs, UDINs, leave; e2e: mobile daily entry, maker-checker → filing, leave conflict check | — |

## Phase 3 — Firm modules

| # | Slice | IDs |
|---|---|---|
| 3.1 | Billing: invoice series, GST-compliant **invoice PDF** (manual IRN field), receipts (UPI/NEFT/cheque ref), part-payments, ageing, unbilled alert, realization, write-offs, **retainer drafts for Partner approval**, Excel/CSV export in documented columns | P3-03, P3-34→, P3-35, P4-01→ |
| 3.2 | Disbursements register (incl. client-recoverable expense flow) | P3-30 |
| 3.3 | Completion report PDF, archive (read-only), retention rules, Partner-approved purge | P3-01, P3-06, P3-07 |
| 3.4 | Applause & badges (immutable, no leaderboard) | P3-04 |
| 3.5 | Helpdesk (+ HR category routing, convert to FAQ) | P3-05 |
| 3.6 | CRM: leads (dup-check PAN/GSTIN/email/phone), activities, proposals (versioned, Partner approval, budget suggestion from past actuals), engagement letters (generated; signed-copy upload now, portal acceptance in Phase 4), onboarding (KYC, conflict check, previous-auditor NOC), contacts & communication log, cross-sell rules, renewals & fee revision, feedback, campaigns (copy text + recipient list, opt-out) | P3-08 … P3-16 |
| 3.7 | HRMS: attendance derived from entries + regularisation, leave policies/accrual/carry-forward/encashment, **payroll** (LOP → gross → PF/ESI/PT/TDS → net; stipend run with minimum check), payslip PDF, bank-transfer Excel, PF ECR / ESI / PT / 24Q data as Excel, investment declarations, **Form 16 PDF**, run statuses; recruitment; appraisals with evidence panel; CPE & skills; expenses & conveyance; assets; exit & F&F; HR letters & policy acks; articleship | P3-02, P3-17 … P3-25, P3-36 |
| 3.8 | DMS (auto folders, versions, check-in/out, tags, audit file index, permission-aware search), QC (SQC 1 checklists, independence declarations, EQR, inspections, peer-review pack export), templates (merge fields → Word/PDF, Partner approval), knowledge base, firm's own compliance (firm as internal client + firm-only compliance types), comments & @mentions, meetings & action items | P3-26 … P3-33 |
| 3.9 | Seed: invoices/receipts, leads, 6 months payroll, articleship, applause, tickets; e2e: lead → proposal → letter → engagement, payroll run, invoice → manual receipt; **payroll golden-file tests** | — |

## Phase 4 — Client portal and rule-based helpers

| # | Slice | IDs |
|---|---|---|
| 4.1 | Portal auth: admin-generated **invite link** (hashed one-time token, expiry), set password, TOTP per Q-07; multi-client (group) users | P4-02 |
| 4.2 | Portal dashboard, documents requested + uploads (mark Received pending staff confirmation, auto-log to inward register), filings & status in plain words, downloads (ARN/SRN, challans, certificates), client approvals with timestamp, engagement letter/proposal acceptance, invoices & receipts, feedback | P4-02 |
| 4.3 | Secure messaging per client/engagement, attachments to DMS, response-time tracking | P4-04 |
| 4.4 | **Reminder-due lists**: client document reminders (schedules per compliance type, escalation after N) and overdue-invoice reminders, each with ready-to-copy WhatsApp/email text, Copy + Mark as sent → ReminderLog; also shown in portal | P4-03→, P4-08→ |
| 4.5 | Rule-based helpers: notice-date/section extraction from typed fields, keyword upload tagging, template-based draft replies | P4-06→ |
| 4.6 | Manual payments already in 3.1; portal shows bank/UPI text | P4-07→ |
| 4.7 | Service boundaries documented for future connectors; internal security checklist + `npm audit` + authz test review in place of external pen test | P4-05→, P4-09→ (see Q-15) |
| 4.8 | Seed: 15 portal users; e2e: portal upload → checklist received | — |

## Phase 5 — Analytics

| # | Slice | IDs |
|---|---|---|
| 5.1 | Personal, Engagement, Compliance (incl. late-fee exposure), Firm dashboards | P5-01 |
| 5.2 | Timeline board (compliance, engagement, people), drill-down | P5-02 |
| 5.3 | Profitability & cash (cost rate per designation, WIP, realization, DSO, concentration) | P5-03 |
| 5.4 | Capacity & peak-season forecast with overload flags and suggested rebalancing | P5-04 |
| 5.5 | CRM and People dashboards | P5-05, P5-06 |
| 5.6 | Monthly Partner MIS (PDF + Excel), built on the 5th and announced in-app | P5-07→ |
| 5.7 | Rule-based weekly summary page + budget estimate from past actuals | P5-08→ |
| 5.8 | Reconciliation tests: every dashboard number matches a direct query on source data | — |

## Definition of done per phase (brief §14)

Tests pass (unit, integration, permissions for all 7 roles, e2e for the phase); `npm install && npm run setup && npm run dev`
works on a clean machine with only Node.js; demo data covers the phase; README and docs updated;
role walkthrough done; `open-questions.md` updated. At each phase end I stop and report.

## Requirement coverage check

All 118 IDs appear above: P1-01…P1-22 (22), P2-01…P2-43 (43), P3-01…P3-36 (36), P4-01…P4-09 (9), P5-01…P5-08 (8).
Moved between phases versus the spec: P1-06 (engine tests) → Phase 2 with the engine; P2-36 (backup) → Phase 1;
P4-01 (accounting export) → Phase 3 with billing; P4-07 (manual payments) → Phase 3 with billing.
