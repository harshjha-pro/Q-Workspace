# Phase 5 report: Analytics

**Date:** 10 October 2026 · **Branch:** `claude/blissful-ritchie-rg4ibm` · **Status:** built, integrated and tested.

**Schema:** no migration. Phase 5 reads the frozen data model. Its two stored outputs reuse existing tables:
the MIS files are firm-level documents, and the notices are notifications.

## 1. How to run it

```bash
npm install && npm run setup && npm run dev     # http://localhost:3000
```

**Existing install:** there are no migrations this phase, so pull and restart. **Reset demo data** (about a
minute) loads the Phase 5 history:
- last year's completed engagements, with hours and invoices;
- last year's cost rates;
- last month's Partner MIS;
- this week's summary notices.

**Real install:** follow `docs/go-live.md`, including the new section 6c (cost rates and the capacity settings).
Run `npm run analytics:reconcile` once after importing history.

**Logins:** unchanged. The password is `Qepex@2026`, and `npm run demo:totp` prints the 2FA code.

**Where to look first:** the **Analytics** section of the menu.
- **As Partner** (`arvind.mehta`): Firm, Profitability, Capacity, Partner MIS (download the PDF and Excel),
  Timeline (click a cell), Weekly summary.
- **As Manager** (`rohan.iyer`): Compliance, Engagements, Timeline → By person, Weekly summary, all for the team.
- **As Staff** (`neha.gupta`): My dashboard only.
- **As HR** (`lakshmi.narayanan`): People.
- **As Practice Admin** (`suresh.pillai`): Compliance, Engagements and Timeline, firm-wide.

## 2. What was built (by requirement ID)

| ID | Requirement | Where |
|---|---|---|
| P5-01 | Personal, Engagement, Compliance (with late-fee exposure) and Firm dashboards | `/analytics/me` (self: effort, tasks, filing record, review points, CPE); `/analytics/compliance` (due, on time, late, overdue; by type; 12-month trend; client delay; late-fee exposure from the effective-dated rate table); `/analytics/engagements` and `/[id]` (budget burn, stages, people for Managers/Partners, billing with billing.view); `/analytics/firm` (Partner). Task list gained an "Overdue only" filter for drill-down |
| P5-02 | Timeline board with drill-down | `/analytics/timeline`: by client, engagement (span by budget health) or person (alphabetical, leave days); 2–13 weeks plus an Earlier column; colour = most urgent derived state, with a label; every cell opens its tasks |
| P5-03 | Profitability and cash | `/analytics/profitability` (Partner): cost rate per designation, realization by service line and lowest to date, unbilled work (WIP) aged at cost and billable value, receivable ageing, DSO, days to collect, client concentration; logged as sensitive |
| P5-04 | Capacity and peak-season forecast | `/analytics/capacity` (Partner, Q-24): 13 weeks or 6 months; available hours = 8 h × working days less leave; forecast from the median actuals per compliance type (else task budget); load per person and period; overload flags; same-level rebalancing suggestions (never applied automatically) |
| P5-05 | CRM dashboard | `/analytics/crm` (Partner): funnel, conversion, sources, lost reasons, proposal pipeline and acceptance, follow-ups, renewals, feedback, cross-sell, new clients by month |
| P5-06 | People dashboard | `/analytics/people` (Partner, HR): headcount, attrition, tenure, leave, recruitment, appraisals, articleship, CPE shortfall; no client data (checked by a test) |
| P5-07 → | Monthly Partner MIS | `/analytics/mis` and the MONTHLY_MIS job (5th, 06:00): PDF + Excel filed as Partner-only firm documents (`_firm/mis`), versioned rebuilds, in-app notice to Partners |
| P5-08 → | Rule-based weekly summary + budget estimate | `/analytics/weekly` and the WEEKLY_SUMMARY job (Monday 07:00, Q-25): fixed-rule lines with links. Budget estimate (median and range of similar engagements, same client first, usual split by stage) on the new-engagement form, edit dialog and engagement dashboard; CRM proposals use the same source |
| 5.8 | Reconciliation | `server/services/analytics/reconcile.ts`: SQL written independently of the services checks every dashboard number. It runs in tests on generated data, and on live data with `npm run analytics:reconcile` |

**Scheduled jobs added:**
- **MONTHLY_MIS:** on the 5th, at 06:00. It catches up after 32 days if the computer was off.
- **WEEKLY_SUMMARY:** Mondays at 07:00.

**Charts:** plain server-rendered SVG/HTML (no chart library, no new dependency), following the data-viz guide:
- stat tiles, thin bars and columns with rounded data ends, one axis;
- three validated categorical hues;
- reserved status colours, always with a label;
- hover titles, and "Show as table" on every chart.

## 3. Tests

| Suite | Result |
|---|---|
| Vitest: unit, integration, permissions, migration, compliance scenarios, payroll golden (52 files) | **465 passed** (Phase 4: 423) |
| New in Phase 5 | Dashboards (8), timeline (7), profitability (4), capacity (3), CRM and People (4), MIS (4), weekly summary and estimates (5), reconciliation (7) |
| Reconciliation | 6 periods on a generated dataset (fixed seed): every number matches direct SQL. Shown to catch planted bugs (a wrong late-filing rule; reversed receipts counted). On the demo data: 247/247 checks match for this month, last month, FY to date and last FY |
| Compliance engine coverage | **100%**, unchanged |
| Playwright e2e (new) | Partner opens every analytics page, drills into the timeline, downloads the MIS PDF and reads the weekly summary. A Manager sees the team views and is refused the firm pages. Staff see only My dashboard; HR sees only People. Desktop and mobile: **6 passed** |
| Playwright e2e (full suite, fresh demo reset) | running at the time of writing; result added on completion |
| Typecheck / lint | clean / clean (2 existing warnings) |
| `npm audit --omit=dev` | **0 vulnerabilities** |

## 4. Problems found and fixed while building

1. **"This month" stopped at today,** so filings due later in the month were missing from "due". It now runs to month end.
2. **Interest-only late fees showed ₹0** when the task had no tax due. They now say "Tax due not entered", and an alert counts them.
3. **Personal open tasks counted ended assignments.** They now count current ones only.
4. **The timeline counted Not Applicable tasks,** which the compliance dashboard leaves out. Reconciliation
   found this. They are now excluded everywhere.
5. **Rebalancing suggested a Senior Manager for Article work.** Suggestions now stay at the same level.
6. **Demo data:**
   - Budgets were far below the hours logged (101 of 155 engagements over 110%). The seed now fits budgets to a
     realistic spread.
   - Only about 25 engagements were invoiced. Billing now covers about three quarters.
   - There was no history before this year. Last year's completed engagements, invoices and cost rates were added.
7. **Small things:** "1 invoices" / "1 days" plurals; GSTR-1 monthly and quarterly sharing one name in the
   capacity table; a forced page break leaving a near-empty MIS page.

## 5. Decisions

D-87 to D-94 are in `docs/decisions.md`:
- analytics conventions;
- the timeline;
- profitability definitions;
- the capacity model;
- CRM and People;
- the MIS;
- the weekly summary and budget estimate;
- reconciliation.

New settings: `capacity.hoursPerDay` (Q-24), `capacity.leadDays`, `capacity.bands`, `capacity.historyMonths`
and `capacity.minSamples`. No new dependencies.

## 6. Known limits

- **Demo realization is low (about 30% this year) because of the demo's scale, not the formula.** The demo has
  about 40 clients for 21 people, so each client carries several times the hours a real practice would log,
  while fees are realistic per engagement. Real data will read differently. Reconciliation confirms the
  arithmetic.
- **Balances in the MIS are as on the build date,** not reconstructed for the month end (the cover says so).
  Flow figures cover the month.
- **The forecast is an estimate.** Work is spread evenly before each due date; tasks with no history and no
  budget are listed, not guessed; rebalancing is only a suggestion.
- **Q-16 (no AI ask-the-data):** every dashboard state (period, view, weeks, service line) is a URL that can be
  bookmarked or shared. There are no stored, named "saved filters". Say if you want those.
- **Cost rates are placeholders** until HR sets them (go-live §6c). Without them, profitability is understated
  and the page says by how many hours.

## 7. Open questions

**New (built with my proposal):**
- **Q-43:** MIS contents.
- **Q-44:** who counts as capacity (Partners; Articles in exam months).
- **Q-45:** extra lines for the weekly summary.

**Answered by the build, please confirm:**
- **Q-16:** shareable dashboard URLs instead of AI.
- **Q-24:** 8 h × working days, Partners only.
- **Q-25:** Managers for their team, Partners for the firm.

**Still open from before:**
- Q-07, Q-23, Q-36 to Q-38, Q-40 to Q-42;
- statutory values remain Unverified until checked (Q-29, Q-34).

**Next:** this was the last phase in the build plan. After you accept it, the remaining work is go-live
(`docs/go-live.md`) and the open questions above.
