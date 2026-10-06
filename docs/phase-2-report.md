# Phase 2 report — Core practice

**Date:** 6 October 2026 · **Branch:** `claude/blissful-ritchie-rg4ibm` · **Status:** built and tested. No schema
change beyond one additive migration (`20261006160123_phase2_task_fields`); the data model stays frozen.

## 1. How to run it

```bash
npm install && npm run setup && npm run dev     # http://localhost:3000
```

Logins are unchanged (README; password `Qepex@2026`; `npm run demo:totp` for the 2FA code). An existing
Phase 1 install picks up Phase 2 with `npm run setup` (adds `BACKUP_KEY`, applies the migration, keeps data);
press **Reset demo data** to get the Phase 2 demo activity.

For phones on the office Wi-Fi: `npm run build && npm run start:lan:https`, then trust `certs/qepex-lan.crt`
on each phone once (README, "Phones on the office Wi-Fi"). Add Work then installs to the home screen and works
offline.

I checked a **fresh clone**: `npm install` took about 20 s, `npm run setup` about 27 s (keys incl. `BACKUP_KEY`,
migrations, demo firm with six months of activity). `npm run build` passed and `start:lan:https` served the
login page, manifest and service worker over HTTPS.

**Where to look first:** Home (each role sees a different dashboard) → Add work on a phone → Tasks → open a task
→ Leave → To approve (Priya's request clashes with due dates) → Admin → Due-date master.

## 2. What was built (by requirement ID)

| ID | Requirement | Where |
|---|---|---|
| P2-01 | Home snapshot and Due This Week strip | `/` — hours shown as "x hrs logged", never against a target; overdue, due this week, pending from client, under review |
| P2-02 | People with missing days (clickable) | Home for Managers/Partners → `/work/week?user=` |
| P2-03 | Missing-day banner | Home and Add work, with one-tap "fill this day" links |
| P2-04 | Firm compliance strip | Home: due this month, filed on time, filed late, open, overdue (scoped) |
| P2-05 | Daily work entry in 30–60 s | `/work`: recent pairs, client search, engagement/task/stage, Today/Yesterday/pick/multiple/whole week, 15/30/60/120/240-min buttons + 15-min stepper, chips, location, outcome numbers, copy entry/day/week |
| P2-06 | Soft 12-hour warning, budget bands | Warning never blocks; budget signal Normal/Approaching/Reached/Significant overrun (settings) |
| P2-07 | Weekly lock and corrections | Lock Sunday 16:00 IST (Q-12); Partner extension (firm or one person); correction requests, never self-approved (D-19) |
| P2-08 | Week grid | `/work/week`: rows × days, totals, holidays, leave, lock time |
| P2-09 / P2-10 | Task list and bulk actions | `/tasks`: Overdue / This week / Next week / Later / No date; filters; Manager reassign, change checker, not applicable; one-off tasks |
| P2-11, P2-14, P2-19–P2-22 | Compliance engine and calendar generation | `server/compliance-engine` (pure, 100% coverage) + `server/services/compliance` (nightly job, on-change sync, Regenerate) |
| P2-12 / P2-13 | Review and sign-off | Maker ≠ checker, Articles never check, review points block filing, Partner sign-off and EQR, UDIN record created at sign-off |
| P2-15 / P2-32 | DSC register and DSC flags on tasks | `/registers/dsc`: custody movements, expiry bands (30/7 days, settings); tasks at a DSC stage warn about expiring DSCs |
| P2-16 / P2-17 | Pending from client | Checklists, mark all requested, client-waiting days kept apart from internal delay, "Copy pending list" + "Mark as sent" reminder log |
| P2-18 | Group view | `/groups/[id]` |
| P2-23 | "Applies when" labels | Due-date master and task detail (due basis explained) |
| P2-24 | Stage-template versioning | `/admin/templates`: draft → Partner publishes; open tasks stay or move with a per-stage mapping (D-47) |
| P2-25 | This Week page | `/this-week` (next-week toggle, Managers can pick a person) |
| P2-26 / P2-43 | Calendar and `.ics` | `/calendar` (Mine / Compliance, agenda view on phones) and `/api/calendar/ics` (next 90 days) |
| P2-27 | Audit search + CSV | From Phase 1; CSV now formula-injection safe |
| P2-28 | Role-based navigation | Full menu per role, built from the permission matrix |
| P2-29 | Leave | `/leave`: apply, approve/reject, clash check with tasks due during the leave and a reassign shortcut that replaces the clashing role |
| P2-30 | UDIN register | `/registers/udin`: awaiting (overdue highlighted), record, revoke, reconcile |
| P2-31 | DSC movements | Every hand-over logged |
| P2-33 | Inward / outward register | `/registers/inward` |
| P2-34, P2-37, P2-40 | Notifications, reminders, escalations | Bell + `/notifications` (preferences, quiet hours, browser pop-ups while open); daily 07:30 job: 7/3/1-day reminders, overdue → Manager (1 day) → Partner (3 days), pending follow-up, review SLA, notices/hearings, DSC, UDIN, password changes, missing entries, weekly lock (deduplicated) |
| P2-35 | Exports | `/exports`: entries, tasks, filings, notices, DSC, UDIN, inward/outward as CSV or Excel, using the screen's scope |
| P2-36 | Backup | From Phase 1; now encrypted (Q-27) |
| P2-38 | Offline work entry | PWA: service worker, IndexedDB queue, idempotent sync by client UUID |
| P2-39 | Credentials vault | `/clients/[id]/vault`: grants only to assigned Staff/Articles (Q-06), every reveal logged, change-due flags |
| P2-41 | Allocations pending | Home for Managers/Partners/PA; empty-state message for unassigned Staff/Articles |
| P2-42 | Mobile timer | Add work: start/stop, rounded to 15 minutes |

Also built from the accepted answers: **HTTPS on the office network** (Q-26, D-40) and **encrypted backups**
(Q-27, D-39).

## 3. Tests

| Suite | Result |
|---|---|
| Vitest: unit, integration, permissions, migration, compliance scenarios (20 files) | **206 passed** |
| Compliance engine coverage | **100%** statements, branches (467/467), functions and lines |
| Rules Spec scenarios and edge cases | all 15 scenarios + 14 edge cases as named tests |
| Playwright e2e, desktop + phone | **33 passed**, 9 skipped by design (desktop-only or phone-only flows). The full run had 2 failures, both in Phase 1 tests that checked the old home page and the old role label; I updated them and they pass when re-run on their own. |
| New e2e flows | mobile daily entry; maker → checker → filing; leave clash with reassign; every menu page renders for all 6 staff roles |
| Typecheck / lint / build | clean / clean / passes |
| Clean clone | install + setup + build + HTTPS start: passed |

Each run starts from a fresh demo firm (`tests/e2e/global-setup.ts`), because the flows change data.

## 4. Problems found and fixed during the phase

1. **Leave reassign moved the wrong role.** When a Senior was on leave as *checker*, the shortcut made the new
   person the maker and left the Senior as checker. It now replaces the role that clashes, and an e2e test covers it.
2. **Lock extension deadlocked.** It read a setting inside its own SQLite write transaction; the read now
   happens first.
3. **Tasks generated before their recurring engagement existed** had no people; generation now adopts them
   when the engagement is created and copies its maker/checker to open tasks.
4. **Flag changes back-dated before the previous change** would have rewritten history; they are refused.
5. **`.ics` semicolons were not escaped**, which some calendar apps reject; fixed and tested.
6. **The UI build exposed service gaps** that I fixed:
   - a notice's people now flow to its response task;
   - DSC movement history is scoped to visible clients;
   - exports respect their filters and show client names;
   - an extension preview lists sample tasks;
   - stage-template publish can move tasks still on retired versions;
   - HR Admin is kept out of stage templates;
   - quiet hours are validated;
   - cached pages are cleared at the login screen on shared phones.

## 5. Decisions taken (details in `docs/decisions.md`)

D-38 vault visibility · D-39 encrypted backups · D-40 HTTPS certificate · D-41 extension "all open periods" ·
D-42 period inclusion rule · D-43 no creation notifications for generated tasks · D-44 lock evaluated at read
time · D-45 reminder cadence as settings · D-46 scoped, injection-safe exports · D-47 template versioning;
D-13 amended (no `idb` package needed). One new dependency: `selfsigned` (MIT) for the LAN certificate (Q-26).

## 6. Known limits

- Statutory rules and late fees are seeded **Unverified** until a Partner verifies them (Q-29).
- PT due dates are typed per task until state rules are supplied (Q-02b); the demo shows them as "No date".
- State holidays are not loaded yet (Q-31); national and firm holidays are.
- Leave balances display but have no entitlements until the leave policy is set (Q-20, Phase 3).
- Browser pop-ups need the app open in a tab; there is no push server (by design, brief §4).
- On phones, offline mode needs the HTTPS start and the certificate trusted once.

## 7. Open questions

New: **Q-29** (who verifies statutory values, and before daily use?), **Q-30** (UDIN reminder after 7 days?),
**Q-31** (office state(s) for holidays), **Q-32** (start daily use now, or one go-live after Phase 5?). Phase 3
needs Q-09, Q-18 to Q-23 (payroll, invoices, retention, leave policy, conveyance, cost rates, engagement
letters). All are in `docs/open-questions.md` with a proposal for each.

**Next:** Phase 3 (Firm modules: billing, CRM, HRMS and payroll). It starts after you accept this report.
