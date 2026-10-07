# Open questions (business rules — need your answer)

"Blocks" = the earliest phase that cannot finish without an answer. Where I give a
proposal, I will build that unless you say otherwise.

## Answered (6 Oct 2026)

| # | Question | Answer | Effect on the plan |
|---|---|---|---|
| Q-01 | Where should the app live? | `harshjha-pro/Q-Workspace` | Plan docs moved here; app is built here |
| Q-02 | How many compliance types? | **31** (29 from the Rules Spec + MSME Form 1 + Professional Tax). PT is levied in 19 states/UTs: Andhra Pradesh, Assam, Bihar, Gujarat, Jharkhand, Karnataka, Kerala, Madhya Pradesh, Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Puducherry (UT), Sikkim, Tamil Nadu, Telangana, Tripura, West Bengal | `State.ptLevied` seeded true for these 19 only. PT tasks generate per (client, PT state registration), only for those states. Due rules and slabs per state still needed (Q-02b) |
| Q-03 | DPT-3 | Agreed: not for LLPs; companies get a `dpt3_applicable` flag | Applicability rule updated |
| Q-04 | DIR-3 KYC | **One per director** (DIN), not per company | Task `partyKey` = director; the task sits on the director's primary company and shows on every linked company (D-05) |
| Q-06 | Staff/Article client visibility | **Only clients they are assigned to** (through an engagement or task) | `assigned` scope = assignment only, no team-wide view for Seniors |
| Q-08 | Income-tax year labels | **Keep AY labels**; the current year is **AY 2027-28** (FY 2026-27) | Period labels use FY/AY as in the specs; form names stay as in the specs (editable data) |

## Still open before or during Phase 1 (my proposal applies unless you say otherwise)

| # | Question | Proposal | Blocks |
|---|---|---|---|
| Q-02b | **Professional Tax due rules and slabs** for each of the 19 states (employer return/payment frequency and due day; enrolment fee date; employee deduction slabs) | PT tasks use a `MANUAL` due-date rule (date typed per period) until you send rules; slabs seeded empty and marked Unverified. **MSME Form 1** seeded as half-yearly, 30 Apr / 31 Oct, Unverified | Phase 2 (seed), Phase 3 (payroll) |
| Q-05 | **Flag switched off mid-year**: is the cut-over test the period start date (my reading of scenario 7 + the tax-audit edge case), so an In-Progress task for a period starting after the off date still goes to Not Applicable? | Yes, period start date decides; work entries on it are kept | Phase 2 |
| Q-07 | **Portal 2FA**: the spec makes OTP mandatory for portal users; the brief makes TOTP optional. Mandatory TOTP for portal users? | Optional per brief, with a firm setting to make it mandatory | Phase 4 |

## Accepted on 6 Oct 2026 ("accepted — recommendations")

The proposals below were accepted as answers and are what Phase 2 builds:
Q-02b (PT due dates entered manually until state rules are supplied; MSME Form 1 30 Apr / 31 Oct, Unverified),
Q-05 (period start date decides when a flag is switched off), Q-07 (portal TOTP optional with a firm setting),
Q-10 (AGM ceiling 6 months after FY end; first AGM 9 months after first FY end), Q-11 (closure filings as
manual-due-date tasks), Q-12 (Mon–Sat week, lock Sunday 16:00 IST), Q-13 (notice response default = received + 15 days),
Q-14 (review levels as proposed; EQR when audit fee ≥ setting or entity is public interest), Q-26 (HTTPS for LAN
with a locally generated certificate), Q-27 (backups encrypted with a key in .env), Q-28 (keep as built).

## New from Phase 1 (answered — see above)

| # | Question | Proposal | Blocks |
|---|---|---|---|
| Q-26 | **HTTPS on the office network.** On one computer the app uses `localhost`, which is safe. Phones on the office Wi-Fi (`npm run dev:lan` / `start:lan`) talk plain HTTP, so passwords and data cross the Wi-Fi unencrypted. Also, phones only allow the offline work-entry app (PWA) over HTTPS. | Phase 2 adds `npm run start:lan` over HTTPS with a certificate generated on the machine by `npm run setup` (pure-JS `selfsigned` package; each phone accepts it once). The alternative is to use the app on the main computer only. | Phase 2 (offline entry on phones) |
| Q-27 | **Encrypted backups.** Backups hold the full database. Vault, salary and PII fields stay encrypted inside them, but client names, PANs and work data are readable by anyone who gets the .zip. | Encrypt each backup zip with a `BACKUP_PASSPHRASE` from `.env` (AES-256-GCM), required to restore. | Phase 2 |
| Q-28 | Can a Manager create new clients for their team, or only Partners and the Practice Admin? (The spec matrix lets Managers manage their own clients; today a Manager-created client is placed under that Manager.) | Keep as built | — |

## Needed during Phase 2 (accepted 6 Oct 2026 — built as proposed)

| # | Question | Proposal |
|---|---|---|
| Q-10 | AGM ceiling for provisional dates: 6 months from FY end, and 9 months from first FY end for a company's first AGM — confirm as defaults? | Yes, both as editable rules |
| Q-11 | **Closure tasks for Discontinued clients** (GSTR-10, final TDS return, ROC strike-off STK-2, LLP Form 24): which ones, and their due rules? | Create as `MANUAL` due-date types until rules are given |
| Q-12 | Weekly lock: week = Monday–Saturday, lock Sunday 16:00 IST, working Saturdays all year? | Yes, as settings |
| Q-13 | Notice response default when the notice gives no date: received + N days — what N? Alert schedule 7/3/1 confirmed | N = 15, setting |
| Q-14 | Review level per engagement type (spec gives examples): GST/TDS → Senior or Manager; ITR non-audit → Manager; ITR audit, audit reports, certificates → Partner; ROC → Manager prepares, Partner approves before DSC signing. EQR threshold: by fee, by entity type (listed/public interest), or both? | As listed; EQR threshold = fee ≥ setting OR entity flagged "public interest" |

## New from Phase 2 (answered 7 Oct 2026)

| # | Question | Answer | Effect |
|---|---|---|---|
| Q-29 | Who verifies statutory values? | **The Practice Admin** | Practice Admin (and Partners) can press Verify in the Due-date master (D-52) |
| Q-30 | UDIN reminder after 7 days? | **Yes** | Kept at 7 days (`udin.awaitingDays`) |
| Q-31 | Office state for holidays | **Rajasthan** | Firm profile state RJ; Rajasthan holidays count as office holidays (D-50). The holiday list itself is entered by the Practice Admin |
| Q-32 | Start daily use now? | **Yes, now, with real data** | Go-live cut-off (D-49), opening flag dates (D-48), engagements import (D-51) and [`go-live.md`](go-live.md) |

## New from Phase 3 (my proposal applies unless you say otherwise)

| # | Question | Proposal | Blocks |
|---|---|---|---|
| Q-33 | The Practice Admin can manage leads and proposals but cannot accept an engagement letter, because accepting creates engagements (only Partners and Managers may). Should the Practice Admin be able to? | Keep Partner/Manager only | — |
| Q-34 | **Payroll statutory values** for FY 2026-27 (PF, ESI, income-tax slabs, rebate, standard deduction, 80C/80D limits, ICAI stipend minimums, CPE hours) are seeded Unverified from the Finance Act 2025 and older ICAI figures. Who verifies them under the Income-tax Act, 2025, and what is the new name of Form 16? ICSI stipend minimums are not seeded. | HR Admin prepares, a Partner verifies on Payroll → Rates before the first real run | First real payroll |
| Q-35 | **SAC codes and GST rate** on fees: seeded 998221 (audit), 998222 (accounting), 998231 (tax, GST), 998216 (company law — least certain), 998311 (advisory), 18%. | Partner confirms in Settings before the first invoice | First invoice |
| Q-36 | The firm's GSTIN, PAN, bank and UPI details for invoices | Enter under Admin → Firm profile | First invoice |
| Q-37 | Above ₹2 crore of salary income the old-regime surcharge bands cannot be stored (the rate table holds amounts up to about ₹2.1 crore). | Accept for now (no staff near it); widen the column with an additive migration if needed | — |
| Q-38 | Accounting export: generic CSV/Excel columns now. Do you want a Tally- or Zoho-specific layout? (Spec §16.1 decision 4) | Generic until you name one | — |
| Q-39 | Some fields are kept as JSON in text columns because the data model is frozen (invoice IRN/Ack, receipt TDS, letter lead link, service-template engagement type and budget, Form 16 Part A). | Add them as real columns in one additive migration at the start of Phase 4 | — |

## Needed during Phase 3 (proposals applied, still open for confirmation)

| # | Question | Proposal |
|---|---|---|
| Q-09 | **Payroll**: (a) firm's state(s) for PT; (b) default tax regime; (c) PF on full basic or capped wage; adopted Labour Code wage definition; (d) LWF needed? (e) ICAI/ICSI stipend minimums and CPE hours to seed; (f) is the bank-transfer file a generic Excel or a specific bank's format? | Every value configurable, seeded "Unverified"; generic Excel bank file |
| Q-18 | **Invoices**: firm GSTIN/state, SAC codes per service line, invoice number format (GST allows ≤16 characters, unique per FY), GST rate on fees, whether reimbursements are billed as pure agent (no GST) | Prefix per FY, e.g. `QI/26-27/0001`; reimbursements as pure-agent lines |
| Q-19 | Retention periods per record type (audit files, working papers, payroll, portal uploads) | Seed "TODO verify" with purge disabled until set |
| Q-20 | Leave policy: categories (staff/article/partner), quotas, accrual, carry-forward, encashment; articleship leave entitlement rule | Configurable; seed placeholders marked Unverified |
| Q-21 | Conveyance rate per km / per visit for client-site claims | Setting, default blank (claim amount typed) |
| Q-22 | Cost rate per designation: who sets it and is it monthly cost ÷ standard hours? | Partner/HR set ₹/hour per designation, effective-dated |
| Q-23 | Engagement letter acceptance: is a logged-in portal click enough, or must the client also upload a signed copy for audit appointments? | Click (with timestamp, IP) for all; signed copy optional |

## Needed during Phase 4–5

| # | Question | Proposal |
|---|---|---|
| Q-15 | P4-09 external penetration test is not in the brief's replacement table. OK to treat it as out of scope for this build (you arrange it before go-live)? | Yes; I deliver a security checklist + automated authz tests |
| Q-16 | AI "ask-the-data" (§13.10) has no code-only replacement in the brief. Omit? | Omit; saved filters on dashboards instead |
| Q-17 | Spec lets Articles see billing "if granted"; brief says never. Never? | Never (brief is stricter) |
| Q-24 | Capacity forecast: hours per task type come from past actuals — what standard working hours/day for available capacity? | 8 h × working days, setting (used only in Partner analytics, never shown to staff) |
| Q-25 | Weekly summary audience: every Manager for their team + every Partner for the firm? | Yes |

## Decisions from Product Spec §16.1 that are yours (not answerable by me)

1. Start daily use after Phase 2, or single go-live after Phase 5.
2. Build payroll in-house (this plan) vs integrate — the brief says build; confirmed unless you say otherwise.
3. Hosting budget — not applicable (local).
4. Accounting software — Excel/CSV export column layout: Tally, Zoho, or generic?
5. Who holds the HR / Payroll Admin role (must differ from Practice Admin).
6. Verification of all statutory values (every seeded value ships "Unverified").
7. Change control: new ideas after the Phase 1 freeze go to `docs/backlog.md`.
