# QEPEX India Work Tracker — Architecture

Status: approved 6 Oct 2026; Phase 1 built. Amendments are marked *(Phase 1)*.

## 1. Runtime picture

One Node.js process on one computer. Users on the office LAN open it in a browser
(desktop or phone). Nothing leaves the machine.

```mermaid
flowchart LR
  subgraph Browser["Browser (staff / portal user)"]
    UI[Next.js React UI<br/>Tailwind + shadcn/ui]
    SW[Service worker<br/>+ IndexedDB work-entry queue]
  end
  subgraph Node["Single Node.js process (next start / next dev)"]
    RT[Routes: (staff) (portal) (admin) api/]
    SA[Server actions / route handlers<br/>Zod parse → actor → service]
    SVC[/server/services/*<br/>business logic per module/]
    PERM[/server/permissions<br/>matrix + guards + scope filters/]
    AUD[/server/audit<br/>AuditLog + SensitiveViewLog/]
    ENG[/server/compliance-engine<br/>pure functions, no I/O/]
    SCH[/server/scheduler<br/>node-cron + JobRun + Run now/]
    DOC[/server/pdf  /server/excel/]
    CRY[crypto: AES-256-GCM<br/>keys from .env/]
    FS[storage service]
  end
  DB[(SQLite file<br/>prisma/data/qepex.db<br/>WAL mode)]
  DISK[(/storage/&lt;client&gt;/&lt;engagement&gt;/…)]
  BK[(/backups/*.zip)]
  UI --> RT --> SA --> SVC
  SW -. sync when online .-> SA
  SVC --> PERM
  SVC --> AUD
  SVC --> ENG
  SVC --> DOC
  SVC --> CRY
  SVC --> FS --> DISK
  SVC --> DB
  SCH --> SVC
  SVC --> BK
```

## 2. Request lifecycle (every mutating or sensitive call)

1. **Route** (server action or route handler) receives input.
2. `requireStaff()` / `getSession()` (`server/context.ts`) resolve the Auth.js JWT to a `UserSession` row and
   re-check it on **every** request (revoked? expired? idle > 30 min? user still active?) → `Actor { userId, role,
   isSenior, displayName }`. Offboarding, role change and password reset revoke sessions immediately. *(Phase 1)*
3. **Zod** parses the input (schemas live beside each service, shared with React Hook Form).
4. **Service** method runs. First line is always `authorize(actor, 'capability', resource?)`.
   List queries use `scopeWhere(actor, 'entity')`, which returns a Prisma `where` fragment
   (e.g. "clients this actor may see"). UI hiding is cosmetic only.
5. Business invariants (maker ≠ checker, no Filed without acknowledgment, lock rules…)
   are checked in the service **and** backed by DB constraints where SQLite/Postgres both
   support them (unique keys, NOT NULL, check-by-trigger avoided for portability).
6. Writes happen in one `prisma.$transaction`, which also writes `AuditLog` rows
   (before/after JSON diff, actor, reason, lock state).
7. Sensitive reads (credentials, financial statements, notices, salary, billing) write
   `SensitiveViewLog` inside the same service call.
8. Errors are typed (`DomainError` with code + user message); routes map them to
   toasts/field errors. Nothing leaks stack traces to the client.

## 3. Modules and their service boundaries

| Service (`/server/services`) | Owns | Main consumers |
|---|---|---|
| `auth` | login, TOTP enrol/verify, session epoch, password reset by admin, portal invite redemption | all |
| `users`, `employees`, `teams` | User, EmployeeProfile, ClientTeam, offboarding | all |
| `clients` | Client, GSTIN, Director, Contact, ClientGroup, flags + flag history | engine, CRM, portal |
| `engagements`, `tasks`, `stages` | Engagement, Task, StageTemplate versions, assignments | everything |
| `compliance` | wraps the pure engine: generation, extensions, status evaluation, due-date master | tasks, scheduler |
| `work` | WorkEntry, weekly lock, corrections, timer, offline sync | attendance, analytics, billing |
| `pending` | checklists, pending records, reminder log, copy-message builder | portal |
| `review` | ReviewRequest, ReviewPoint, SignOff, EQR | tasks, UDIN |
| `registers` | Notice/Hearing, DSC, UDIN, Credential vault, Inward/Outward | tasks, offboarding |
| `billing` | Invoice, Receipt, Disbursement, WriteOff, ageing, retainer drafts | analytics, portal |
| `crm` | Lead → Proposal → EngagementLetter → onboarding, renewals, feedback, campaigns | clients, engagements |
| `hr` | attendance, leave, payroll, Form 16, recruitment, appraisal, CPE, expenses, assets, exits, articleship | work, compliance |
| `portal` | portal users, uploads, approvals, messages | pending, billing, crm |
| `dms`, `qc`, `templates`, `knowledge`, `meetings`, `comments` | as named | many |
| `notifications` | Notification rows, preferences, browser-push payloads (local only) | all |
| `analytics` | read-only aggregations, MIS, weekly summary | Partner/Manager |
| `system` | settings, backups, imports/exports, job runs, system log, demo reset | admin |

Rule: a service may call another service's **public functions**, never its tables directly.
This is the "one master per thing" principle in code, and it leaves clean seams for later
connectors (P4-05) — e.g. a future `AccountingConnector` would plug into `billing`'s export.

## 4. The compliance engine (pure core)

`/server/compliance-engine` has **no Prisma, no Date.now(), no I/O**. Every function takes
plain data and a `today` argument and returns plain data. The `compliance` service loads
inputs, calls the engine, and persists the returned plan in a transaction.

| Function | Input | Output |
|---|---|---|
| `applicableTypes(client, gstins, directors, flagsAt)` | client snapshot | list of `(typeCode, partyKey, startDate)` |
| `periodsBetween(type, from, to)` | frequency, FY end | `PeriodKey[]` (e.g. `2026-08`, `FY2026-27-Q2`, `FY2025-26`, `AY2026-27`, `EVT:AGM:2026-09-15`) |
| `computeDueDate(rule, period, eventDates, stateGroups)` | versioned rule valid on generation date | `{ date, isProvisional, basis }` |
| `applyHolidayPolicy(policy, date, holidays, workingSaturdays)` | per-type policy (default `NONE`) | `{ date, shifted: bool }` |
| `planGeneration(input, today)` | client + existing task keys | `TaskCreate[]` (idempotent: skips existing natural keys) |
| `planFlagChange(change, tasks)` | flag history entry | `TaskUpdate[]` (→ Not Applicable with reason) |
| `planFrequencyChange(...)` | GSTIN frequency change | NA + `supersededByKey` links + new tasks |
| `planExtension(ext, tasks, clients)` | extension + scope filter | preview count + `TaskUpdate[]` incl. Filed Late → Filed |
| `planEventCorrection(...)` | new event date | due-date recompute + reclassification |
| `evaluateStatus(task, facts)` | task facts | status (Rules Spec §8 / §11.3) |
| `canTransition(from, to, actor, facts)` | | `ok` or reason |
| `lateFeeExposure(task, rates, asOf)` | LateFeeRate rows | paise + days |
| `remindersDue(tasks, rules, today)` | | reminder/escalation events (§9) |

Natural key for a Task (see decisions D-05): `(clientId, complianceTypeCode, partyKey, periodKey)`
where `partyKey` is the GSTIN id for GST types, the Director id for DIR-3 KYC, and `"-"` otherwise.
The DB enforces it with a unique index.

Coverage gate: Vitest `coverage.thresholds` set to 100% branches for this folder only.

## 5. Scheduler

`node-cron` started once from Next.js `instrumentation.ts` (guarded with a `globalThis` flag
so dev hot-reload does not double-register). Every job:

- is a plain service function (`jobs.generateComplianceTasks()` etc.),
- writes a `JobRun` row (start, end, status, counts, error),
- has a **Run now** button on the admin Scheduled Jobs page (Partner / Practice Admin; HR jobs for HR Admin),
- is idempotent, so a missed run (laptop asleep) is caught up on next start: on boot, any job
  whose last success is older than its interval runs once.

Jobs: compliance generation (nightly 01:00 IST), status/overdue evaluation + reminders/escalations
(06:00), DSC expiry & UDIN-awaiting checks, missing-entry detection, weekly-lock (Sun 16:00),
pending-from-client follow-ups, reminder-due lists (client & payment), retainer invoice drafts,
renewal prompts (60 days), CPE shortfall, articleship completion, payroll statutory due dates,
monthly MIS build (5th), weekly summary (Mon 07:00), nightly local backup, retention purge proposals.

## 6. Security model (local, code-only)

| Concern | Approach |
|---|---|
| Passwords | bcrypt (cost 12); lockout after N failures; admin reset forces change at next login |
| 2FA | `otplib` TOTP; QR rendered locally (`qrcode` package, data URL); mandatory for Partner, Manager, Practice Admin, HR Admin; optional for Staff/Article; portal per Q-07 |
| Sessions | Auth.js v5 credentials + JWT (httpOnly, SameSite=Lax) carrying a `UserSession` id; idle timeout (default 30 min) and absolute timeout (12 h) are settings; lockout after 5 failures for 15 min *(Phase 1)* |
| Encryption at rest | AES-256-GCM, two keys in `.env`: `VAULT_KEY` (credentials) and `PII_KEY` (salary, bank account, Aadhaar, PAN of employees). Ciphertext format `v1:iv:tag:data` so keys can rotate. `npm run setup` generates keys if absent and never overwrites them |
| CSRF | server actions' built-in origin check; route handlers check `Origin` |
| Files | stored outside `/public`; served only through a route handler that authorizes and logs; extension allow-list + magic-byte sniff + size limit; random stored names |
| Audit | append-only `AuditLog` (no update/delete path in code); `SensitiveViewLog` |
| Logging | structured JSON logs (`pino`) to `/logs`, rotated; admin System Log page reads them; no secrets or decrypted values are ever logged |
| Backup | `VACUUM INTO` snapshot + `/storage` → zip in `/backups`; download by Partner; restore = request → Partner approval → automatic pre-restore backup → migrate the backup copy → copy rows into the live DB via `ATTACH` → swap storage (D-22, *Phase 1*) |

## 7. Offline (work entry only)

PWA via a hand-written service worker (precache app shell for `/work/add`) + `idb` IndexedDB queue.
Each offline entry gets a client UUID; sync calls `work.syncOffline(entries[])`, which is idempotent on that UUID.
Conflicts (week locked meanwhile, task closed) come back as per-entry errors shown in an "Unsynced" tray.
Credentials, billing, payroll and DSC pages send `Cache-Control: no-store` and are never cached.

## 8. Portability to PostgreSQL

- Prisma models only use types both providers support; status/enums are `String` columns validated by Zod
  and by TS `as const` unions (avoids SQLite enum differences).
- No raw SQL outside two isolated adapters: `backup` (`VACUUM INTO`) and `search` (token table, see D-11).
- Case-insensitive search uses stored `searchName` lower-cased columns rather than provider-specific modes.
- Money is `Int` paise; hours are `Int` minutes (15-minute steps → multiples of 15).
- Dates: `DateTime` stored UTC; all date-only business fields (due dates, entry dates) stored as `YYYY-MM-DD`
  strings to avoid IST/UTC off-by-one. All display/compute in IST (`Asia/Kolkata`).

## 9. Repository layout

As given in the brief (§6), plus:

```
/server/services/<module>/{service.ts, schemas.ts, queries.ts}
/server/permissions/{matrix.ts, guards.ts, scopes.ts}
/server/compliance-engine/{types.ts, periods.ts, due-dates.ts, applicability.ts,
                           generation.ts, extensions.ts, status.ts, reminders.ts}
/server/scheduler/{index.ts, jobs/*.ts}
/server/lib/{crypto.ts, storage.ts, money.ts, dates-ist.ts, logger.ts}
/prisma/{schema.prisma, migrations/, seed/*.ts}
/scripts/{setup.ts, reset-demo.ts}
/tests/{unit, integration, e2e, compliance-scenarios, permissions, payroll-golden, migration}
```

## 10. Dependencies (all npm, no services)

next, react, typescript, tailwindcss, shadcn/ui (Radix), @tanstack/react-table, react-hook-form, zod,
@prisma/client + prisma, next-auth (Auth.js v5), bcryptjs, otplib, qrcode, node-cron, @react-pdf/renderer,
exceljs, docx (Word output for the template library, spec §13.3), recharts, idb, pino, adm-zip
(backup zip), vitest + @vitest/coverage-v8, @playwright/test. Phase 1 pins: next 16.3, prisma 7.10 +
@prisma/adapter-libsql, next-auth 5 beta, otplib 13, zod 4, @tanstack/react-table 8, tailwindcss 4.
Each is MIT/Apache/ISC; versions pinned at Phase 1 start and listed in `docs/decisions.md`.
