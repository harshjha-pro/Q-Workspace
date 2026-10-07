# Phase 3 report — Firm modules

**Date:** 7 October 2026 · **Branch:** `claude/blissful-ritchie-rg4ibm` · **Status:** built, integrated and tested. No
schema change: the data model stays frozen. Fields it lacks are kept as JSON in existing columns, listed in D-55
and proposed as one additive migration in Q-39.

## 1. How to run it

```bash
npm install && npm run setup && npm run dev     # http://localhost:3000
```

Logins are unchanged (README; password `Qepex@2026`; `npm run demo:totp` for the 2FA code). On an existing demo
install, run `npm run setup` and then **Reset demo data** to load the Phase 3 activity. The reset takes about
30 seconds. For a real install, follow `docs/go-live.md`, including the new section 6a, which covers what to set
before the first invoice and the first payroll.

**Where to look first:**
- as a Partner: Billing (dashboard → an invoice → PDF), Leads (pipeline → a lead → proposal → letter), HR → Payroll
  (the draft run of this month), Documents, Quality control;
- as staff: Payslips & tax, Expense claims, Goals, CPE & skills;
- as an article: My articleship.

## 2. What was built (by requirement ID)

| ID | Requirement | Where |
|---|---|---|
| P3-01 | Engagement completion report | `/archive/[id]` + PDF: hours by person and stage, dates, acknowledgments, UDINs, review points, billing status |
| P3-02 | Articleship tracking | `/hr/articleship`, `/me/articleship`: registration, leave vs entitlement (excess extends completion), exposure by service line, stipend (Partner/HR only), notes, completion alerts |
| P3-03 | Billing status and receivables | `/billing`: invoice statuses, ageing 0–30/31–60/61–90/90+ by client and Partner, unbilled-work alert, realization |
| P3-04 | Applause | `/applause`: six badges, immutable, no leaderboard; feeds appraisal evidence |
| P3-05 | Helpdesk | `/helpdesk`: tickets, queues (admin / HR queries), internal notes, convert to FAQ, long-open flag |
| P3-06 | Archive | Closing an engagement → read-only, searchable archive |
| P3-07 | Retention and purge | `/admin/retention`: rules start unset (purge disabled, Q-19); a Partner sets periods and approves each purge |
| P3-08 | Leads | `/crm/leads`: stages, follow-ups, activities, duplicate check on PAN/GSTIN/email/phone, business-development hours |
| P3-09 | Proposals | Service templates, budget suggested from past actuals, Partner approval (Manager limit setting), versions, PDF |
| P3-10 | Engagement letters | From the accepted proposal and the firm template (PDF/Word); the signed copy creates client + engagement + team |
| P3-11 | Onboarding | KYC checklist, conflict & independence check decided by a Partner, previous-auditor NOC with attachment |
| P3-12 | Contacts & communication log | `/crm/clients/[id]/communications`, categories A/B/C, tags, key dates |
| P3-13 | Cross-sell | Rule list → opportunities → one-click lead |
| P3-14 | Renewals & fee revision | Prompt 60 days ahead, fee suggestion from realization, Partner approval, renewal letter |
| P3-15 | Client feedback | Requested on close, rating recorded, low score alerts the Partner |
| P3-16 | Client communications | Segments, copy-ready text, CSV, mark as sent, opt-out respected |
| P3-17 | Attendance | Derived from work entries (no punch-in), client-site check-in, regularisation by the Manager |
| P3-18 | Payroll and stipend | Structures (Partner-approved), runs Draft → Reviewed → Approved → Paid → Locked, PF/ESI/PT/TDS, payslips, bank/PF ECR/ESI/PT/24Q files, declarations, Form 16 |
| P3-19 | Recruitment | Openings, pipeline, scorecards, offer letter, onboarding checklist |
| P3-20 | Appraisals | Cycles, goals, self → Manager → Partner moderation; evidence panel (filings on time, review points, feedback, applause, CPE, exposure); hours as context only |
| P3-21 | CPE, training, skills | CPE log vs requirement with shortfall alerts, training calendar, skill matrix |
| P3-22 | Expenses & conveyance | Claims (conveyance suggested from Client Site entries), Manager approval, client-recoverable → disbursements |
| P3-23 | Asset register | Assets, issue/return, in the exit custody check |
| P3-24 | Exit & F&F | Resignation → notice → handover checklist from custody → F&F (encrypted) → relieving/experience letters |
| P3-25 | HR letters & policies | Letters from templates, policy library with versions and acknowledgments |
| P3-26 | Documents | `/documents`: automatic folders, versions, check-out, tags, confidentiality, permission-aware search, audit file index |
| P3-27 | Quality control | `/qc`: SQC 1 checklists, independence declarations, EQR (different Partner), inspections, peer-review pack |
| P3-28 | Template library | `/admin/doc-templates`: 35 draft templates, merge fields, Partner approval, Word/PDF |
| P3-29 | Knowledge base | `/knowledge`: circulars, SOPs, FAQs by service line; links to due-date rules; "read by" from work entries |
| P3-30 | Disbursements | `/billing/disbursements`: Unrecovered → Added to invoice → Recovered, ageing |
| P3-31 | Firm's own compliance | `/firm-compliance`: the firm as internal client; firm-only items as typed-date tasks (D-71) |
| P3-32 | Comments & @mentions | On tasks, engagements, notices and leads |
| P3-33 | Client meetings | `/meetings`: agenda, minutes, action items that become tasks, `.ics` |
| P3-34 | GST invoices & e-invoice | GST-compliant PDF, CGST/SGST or IGST, SAC, manual IRN/Ack fields |
| P3-35 | Retainer invoices | Monthly drafts for Partner approval (job `RETAINER_DRAFTS`) |
| P3-36 | Leave policies | Quotas per category, accrual, carry-forward, encashment flag, balances; leave beyond balance → loss of pay |
| P4-01 → | Accounting export | Generic CSV/Excel of invoices, lines (with GST split) and receipts (Q-38) |
| P4-07 → | Manual payments | Receipts with UPI/NEFT/cheque reference and client TDS |

**Scheduled jobs:** RETAINER_DRAFTS (06:00), CRM_DAILY (07:15), HR_DAILY (07:45: leave accrual, articleship, CPE),
QC_FINDINGS (Mon–Sat 08:00), RETENTION_PROPOSALS (Sundays; proposes only, never deletes). Each has a Run now button.

## 3. Tests

| Suite | Result |
|---|---|
| Vitest: unit, integration, permissions, migration, compliance scenarios, payroll golden (35 files) | **347 passed** (348 including the letter test added at the end, §4 item 6) |
| Compliance engine coverage | **100%** statements, branches (469/469), functions, lines |
| Payroll golden tests | 6 fixed-input cases with hand-worked arithmetic: new regime with loss of pay, old regime with 80C/80D/HRA, ESI earner, mid-year joiner, PF capped vs full, stipend below minimum |
| Playwright e2e (new) | lead → proposal → Partner approval → letter → signed copy → client + engagement; payroll run Draft → Reviewed → Approved → Paid with payslip PDF; invoice → part receipt (NEFT) → final receipt with TDS → Fully received + PDF: **3 passed, twice in a row** from a fresh demo |
| Playwright e2e (smoke) | every menu page loads for all 6 staff roles, Phase 3 pages included: **6 passed** |
| Typecheck / lint / production build | clean / clean / passes |

Permission tests cover each module, for example:
- billing is never visible to Staff, Articles or HR, and Managers get read-only;
- salary is visible only to HR, Partners and the employee;
- HR cannot approve payroll and the preparer cannot approve their own run;
- an employee sees only their own appraisal;
- HR sees no client names in appraisal evidence;
- only a Partner can clear a conflict check or approve a purge.

## 4. Problems found and fixed while integrating

1. **EQR could be bypassed.** The same Partner could do the quality review and then the final sign-off. Also, the
   task-level and engagement-level EQR rules differed. There is now one rule, and the two Partners must differ in
   both orders (D-68).
2. **Archived engagements could still be edited or staffed.** They are now read-only everywhere (D-70).
3. **The engine crashed on an event-date change for a discontinued client.** Closure filings (GSTR-10, STK-2,
   Form 24) carry `CLOSE-<date>` period keys that the parser rejected. The parser now accepts them, with a test,
   and coverage is still 100%.
4. **HR letter templates and the HR screens used different merge-field names.** The demo seed stopped on this.
   The names now match (D-69).
5. **Leave approval** now shows the approver when part of a leave will be loss of pay.
6. **A letter for a new lead printed `[[client.name]]`.** Firm templates use client and engagement fields that
   don't exist until acceptance, so the lead and the proposal now fill them.
7. **PDFs had a blank last page.** Fixed in the shared PDF builder.
8. **The demo firm was in Mumbai.** It is now in Jaipur (Rajasthan, no Professional Tax), like the real firm.

## 5. Decisions

D-14 amended (`pdfkit`), D-53 to D-75 in `docs/decisions.md`. They cover:
- PDF builder, template merge fields, JSON-kept fields;
- invoice numbering and GST, receipts and TDS, retainers, realization;
- CRM approval and acceptance, renewal fees;
- the payroll engine and run rules, attendance, HR confidentiality;
- document visibility and search, the EQR rule, templates;
- archive and purge, firm-only obligations, applause, helpdesk queues, comments;
- the test template.

New dependencies, both MIT: `pdfkit` (PDFs) and `docx` (Word).

## 6. Known limits

- **Unverified statutory values:** GST rate, SAC codes, PF/ESI/PT, income-tax slabs and parameters, stipend
  minimums and CPE hours (Q-34, Q-35). The Income-tax Act, 2025 has been in force since 1 April 2026, so payroll
  TDS and the Form 16 label must be verified before the first real run.
- **Firm-only compliance items** (membership, CoP, PI insurance, licences) are typed in with due dates. The engine
  doesn't generate them yet (D-71).
- **Full-and-final** takes the monthly gross typed by HR. It doesn't prefill from the salary structure yet.
- **Portal steps are placeholders until Phase 4:** client-side letter acceptance, the feedback link, invoices in
  the portal and the portal invitation.
- **Old-regime surcharge** above about ₹2 crore can't be stored (Q-37).
- **Placeholder data:** leave policies, retention periods and cost rates are placeholders until the firm sets them.

## 7. Open questions

New: **Q-33** (may the Practice Admin accept engagement letters?), **Q-34** (who verifies payroll values under the
Income-tax Act, 2025, and what is Form 16 now called?), **Q-35** (SAC codes and GST rate), **Q-36** (firm GSTIN,
PAN, bank and UPI for invoices), **Q-37** (surcharge band limit), **Q-38** (Tally/Zoho export layout?), **Q-39**
(OK to add the JSON-kept fields as real columns in one additive migration at the start of Phase 4?). Still open
from before, built with my proposals: Q-09, Q-18 to Q-23.

**Next:** Phase 4 (client portal and rule-based helpers). It starts after you accept this report.
