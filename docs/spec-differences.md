# Differences found between the brief, the Product Spec and the Rules Spec

Precedence (from the brief): **brief wins on integrations; Product Spec wins on everything else;
Rules Spec is the source of truth for due-date logic.** Items marked ❓ need your answer
(cross-referenced to `open-questions.md`).

## A. Brief vs Product Spec (brief wins — replacement noted)

| # | Spec says | Brief says / what I will build |
|---|---|---|
| A1 | PostgreSQL server DB (§2, P1-03) | SQLite via Prisma, schema kept Postgres-compatible |
| A2 | Google/Microsoft SSO (P1-13) | Password + TOTP |
| A3 | India hosting, KMS, daily cloud backups (P1-14) | Local; AES-256-GCM keys in `.env`; one-click backup/restore |
| A4 | Email/SMS/WhatsApp alerts (P2-37, P2-40, §9.2 channels) | In-app bell + browser notifications while open; channel preferences reduce to these two |
| A5 | Calendar sync (P2-43) | `.ics` download |
| A6 | E-invoice IRN (P3-34) | Invoice PDF; IRN typed in manually |
| A7 | Tally/Zoho integration (P4-01) | Excel/CSV export, documented columns |
| A8 | Automated client & payment reminders (P4-03, P4-08, §12.2) | Reminder-due lists, copy text, Mark as sent |
| A9 | Payment gateway (P4-07) | Manual receipt entry; bank/UPI text on invoice |
| A10 | Claude API AI assist (P4-06, §13.10), AI insights (P5-08) | Rule-based helpers and weekly summary |
| A11 | Portal login by OTP, **mandatory** (§3.9, §12.1, §14.4) | Invite link + password + **optional** TOTP. This lowers portal security below the spec ❓ Q-07 |
| A12 | Virus scan, object storage | Type/size/magic-byte checks, local disk |
| A13 | Separate Dev/Staging/Prod environments, "no real client data outside Production" (§2, P1-07) | One install with a demo mode flag and Reset demo data. I will refuse Reset when demo mode is off |
| A14 | "GST/MCA master data fetched" at onboarding (§10.4) | Entered manually |
| A15 | MIS "emailed on the 5th" (§8) | Generated on the 5th, announced in-app, downloaded |
| A16 | Client communications by email/WhatsApp (§10.9) | Campaign = message text + recipient list to copy |
| A17 | AI "ask-the-data" (§13.10) and AI document auto-sort (§12.1) | Brief's replacement list covers notice extraction, upload tagging and draft replies but **not ask-the-data**. I plan to omit it (analytics filters already cover it) ❓ Q-16 |
| A18 | External penetration test (P4-09) | Not in brief's table. Plan: internal security checklist, `npm audit`, authz test review; external test left to you ❓ Q-15 |
| A19 | Spec §3.4: Articles have no billing "unless granted" | Brief §7: billing **never** shown to Staff or Articles. I will follow the brief (stricter) ❓ Q-17 |
| A20 | Spec phases: engine tests P1-06 in Phase 1; backup P2-36 in Phase 2 | Brief puts engine in Phase 2 and backup in Phase 1; I follow the brief |
| A21 | Template output to Word/PDF (§13.3) | Needs the `docx` npm package (not in brief's stack list); technical decision D-14 |

## B. Product Spec vs Rules Spec (due-date logic: Rules Spec wins)

| # | Product Spec | Rules Spec | Resolution |
|---|---|---|---|
| B1 | §4.3: "29 compliance types, **including** Form 3CEB, separate TCS return, ADT-1, **MSME Form 1 and state Professional Tax**" | The 29-type catalogue (§2.2) has **no MSME Form 1 and no Professional Tax** | **Answered:** 31 types; PT for 19 states (open-questions Q-02) |
| B2 | TDS/TCS returns 31 Jul / 31 Oct / 31 Jan / 31 May | 27EQ (TCS) on **15th** of those months | Rules Spec wins (15th for 27EQ); flagged for verification |
| B3 | Form 3CEB "As notified"; ITR-audit 31 Oct | 3CEB 31 Oct; ITR-A 30 Nov where 3CEB applies | Rules Spec wins |
| B4 | GSTIN carries **its own filing frequency**; GST tasks per GSTIN (§4.1, P1-18) | `gst_registered`, `gst_frequency`, `iff_opted` are **client-level** flags; Task natural key `(client, type, period)` has no GSTIN | Product Spec wins on data model: GST flags live on GSTIN; natural key adds `partyKey` (D-05) |
| B5 | DIR-3 KYC per director (§4.1) | Agrees, but natural key `(client, type, period)` cannot hold 3 directors | Same `partyKey` fix (D-05). **Answered:** one obligation per director, shown on each linked company |
| B6 | Product Spec flags: PF/ESI, **PT by state**, **MSME**, books maintained by firm/client | Rules Spec adds `gst_annual_return_applicable`, `gst_9c_applicable`, `tds_salary/non_salary/non_resident`, `tcs_applicable`, `advance_tax_applicable`, `iff_opted`, `financial_year_end` | Union of both sets |
| B7 | Statuses: 7 listed | Same 7; "Overdue", "At Risk" used in §8.1 timeline colours are not statuses | Overdue/At Risk are **derived display states**, not stored statuses (D-07) |
| B8 | Firm's own compliance (§13.6): COP renewal, ICAI/ICSI membership, PI insurance, peer-review certificate, office licences | No compliance types for these | Add firm-only types with `MANUAL` due-date rule (date typed per instance) — technical, D-16 |
| B9 | Discontinued closure (Rules §7.5) needs GSTR-10, final TDS return, ROC strike-off, LLP closure | Not in the 29 seeded types; no due-date rules given | ❓ Q-11 |

## C. Inconsistencies inside the Rules Spec

| # | Issue | Proposal |
|---|---|---|
| C1 | §1.2 LLP row creates **DPT-3** "if the LLP has accepted loans/deposits". DPT-3 is a Companies Act form; LLPs do not file it | **Answered:** dropped for LLPs |
| C2 | §1.2 Company row lists DPT-3 twice and makes it automatic; DPT-3 applies only to companies with outstanding loans/money received | **Answered:** `dpt3_applicable` flag (default Yes for companies) |
| C3 | §7.2 says tasks "that already have recorded progress" are left alone, but also that open **In Progress** tasks for periods starting on/after the off date go to Not Applicable; §11.4 says an In-Progress tax audit must be left alone | ❓ Q-05. Proposal: the test is the **period start date**, not progress: periods starting on/after the off date → NA (even if In Progress, with the work entries kept); periods that started before → untouched. This satisfies scenario 7 and the tax-audit edge case |
| C4 | Cross-references to "base spec" Sections 9, 10, 11, 25, 26, 27, 30, 35 don't exist in Product Spec V1 (which has 16 sections). The Rules Spec says itself it was written from an earlier overview document | Mapped by topic: 9→§4.4, 10→§5.4, 11→§6.1, 25→§6.2, 26→§6.3, 27→§6.4, 30→§7.2, 35→§9.2 |
| C5 | Status "Upcoming" requires due date in the future, but no rule says what an untouched task becomes after its due date | Remains Upcoming + derived Overdue flag (D-07) |
| C6 | "Pending from Client reverts when **the relevant** checklist item is Received" — which item is relevant is not defined | Pending record links the specific items; reverts when all linked items are Received **and staff-confirmed** (portal uploads need confirmation per Product Spec §5.4) — D-08 |
| C7 | GSTR-3B QRMP "22nd/24th per notified state group" — no state list given | State→group table seeded as data, marked "verify" ❓ Q-02 |
| C8 | AGM ceiling "6 months after FY end" for provisional dates; first AGM has a different window (9 months from first FY end) | Ceiling stored as a rule with a first-AGM variant, both data ❓ Q-10 |
| C9 | Advance tax: "15%/45%/75%/100% cumulative" — percentages are informational; engine only needs dates | Store %s as rule params for display only |

## D. Law changes to check (my own flags — please verify; I may be wrong)

| # | Point |
|---|---|
| D1 | The **Income-tax Act, 2025** is due to replace the 1961 Act from 1 April 2026, introducing "tax year" in place of previous year/AY and renumbering many forms and sections (Form 16, 24Q/26Q/27Q, 3CA/3CB/3CD, 3CEB, sections such as 143(2), 148). Both specs use 1961 Act names. Since form names, period labels and notice sections are all data in my design, switching is cheap — **Answered:** keep AY labels (current AY 2027-28); form names as in the specs, editable |
| D2 | The **Labour Codes** (Code on Wages, Code on Social Security) notified in late 2025 change the wage definition used for PF/ESI. Payroll rules are configurable; I need the firm's adopted treatment ❓ Q-09 |
