# Phase 4 report: Client portal and rule-based helpers

**Date:** 8 October 2026 · **Branch:** `claude/blissful-ritchie-rg4ibm` · **Status:** built, integrated and tested.

**Schema:** two additive migrations, and nothing was dropped or redefined:
- Q-39 promotes the fields Phase 3 kept as JSON to real columns, with backfill;
- one new table, `ClientApprovalRequest`.

## 1. How to run it

```bash
npm install && npm run setup && npm run dev     # http://localhost:3000 (staff), http://localhost:3000/portal (clients)
```

**Existing install:** `npm run setup` applies the two migrations. It takes a backup first, and now releases that
backup's database connection before migrating (a bug found in this phase). Then **Reset demo data** loads the
Phase 4 activity, which takes about a minute.

**Real install:** follow `docs/go-live.md`, including the new section 6b, before inviting the first client.

**Logins:** staff logins are unchanged (password `Qepex@2026`; `npm run demo:totp` prints the 2FA code). At `/portal/login`:
- `cfo@kulkarnigroup.example.com`: a group CFO who sees 3 entities;
- `accounts@sharmatextiles.example.com`: one entity.

Both use the same password, `Qepex@2026`.

**Where to look first**
- **As a client:** Home, Send documents, Messages, Approvals, Invoices.
- **As a Partner:**
  - Work → Client uploads, Client messages, Reminders due;
  - Admin → Portal users;
  - a notice → Draft reply;
  - Notices → New notice → Fill from text;
  - a task → Client approval.

## 2. What was built (by requirement ID)

| ID | Requirement | Where |
|---|---|---|
| P4-02 | Client portal | `/portal`: invite link with a hashed one-time token and expiry, set password, optional 2FA (Q-07 setting), group users, sign-ins logged. Client-safe pages: home, send documents, filings in plain words, documents, approvals, proposals and letters (Q-23 click acceptance), invoices with bank/UPI, feedback, messages, reminders sent. Staff: Admin → Portal users; Work → Client uploads; Client approval on the task page |
| P4-02 | Uploads → checklist | Received, pending staff confirmation, so the task stays pending (D-08); DMS (source PORTAL); inward register; the team is told |
| P4-03 → | Client document reminders | Reminders due: schedules per compliance type, escalation after N, copy text, Mark as sent → reminder log; also shown in the portal |
| P4-04 | Secure messaging | Threads per client or engagement, attachments filed in the DMS, response-time tracking (median, slowest, within target), hourly MESSAGES_UNANSWERED job |
| P4-05 → | Integrations | `docs/service-boundaries.md`: the seam for every future connector, and the rules any connector must follow |
| P4-06 → | Rule-based helpers | Notice fields from pasted text; keyword tagging of uploads; draft replies from approved templates (D-85) |
| P4-07 → | Manual payments | Receipts as in Phase 3; the portal shows bank/UPI details and payments received |
| P4-08 → | Overdue-invoice reminders | Reminders due → Payments at the `billing.reminderDays` points (15/30/60); the last one is flagged to the Partner |
| P4-09 → | Security instead of an external penetration test | `docs/security-checklist.md`, security headers and CSP, cross-site guard, `npm audit`, an authorization review that runs as a test, and a portal-isolation test (Q-15, D-86) |
| Q-39 | JSON-kept fields as columns | Invoice IRN/ack/GSTIN/cancel/retainer period, receipt TDS and reversal, letter lead, proposal template, template engagement type and effort |

**Scheduled jobs added:**
- **REMINDER_DUE_LISTS:** daily at 07:00. It builds the lists and sends nothing.
- **MESSAGES_UNANSWERED:** hourly, 09:15–19:15, Monday to Saturday.

## 3. Tests

| Suite | Result |
|---|---|
| Vitest: unit, integration, permissions, migration, compliance scenarios, payroll golden (44 files) | **423 passed** (Phase 3: 347) |
| New in Phase 4 | Portal sign-in (13), portal client self-service (14), messages (9), reminder lists (12), notice reading (8), upload tagging (6), helpers (6), authorization review (5), portal isolation (2) |
| Authorization review | A static scan of 580+ service functions, every API route, every server action and every page. It fails on any unguarded entry point, and it was shown to catch planted unguarded code |
| Compliance engine coverage | **100%** statements (439/439), branches (469/469), functions (83/83) and lines |
| Playwright e2e (new) | The client uploads against a request, a Partner confirms it on the task, and the item is received and leaves the portal. An invite link sets the password once, the client signs in, and a portal session can't open staff pages. A client message gets a staff reply that the client sees. Desktop and mobile: **6 passed** |
| Playwright e2e (full suite, fresh demo reset) | **42 passed**: every menu page for every role, including the new pages, and all Phase 2–4 flows |
| Typecheck / lint / production build | clean / clean (2 existing warnings) / passes |
| `npm audit --omit=dev` | **0 vulnerabilities** (5 dev-only findings in the lint toolchain accepted, D-86) |

## 4. Problems found and fixed while building

1. **`npm run setup` could not migrate an existing install.** The pre-migration backup left its database
   connection open, so `migrate deploy` failed with "SQLite database error". Any upgrade would have hit this.
   I reproduced it on a rolled-back copy, then fixed and verified it, including the backfill of real-style JSON notes.
2. **Two schedules on the same day** gave a task two reminders, one replacing the other. It is now one per task per day.
3. **The staff menu highlighted the wrong item.** It matched by prefix, so "My profile" (`/me`) lit up on every
   `/messages` page. It now matches whole path segments.
4. **The portal unread badge stayed on** after a message was read. It now refreshes.
5. **A client reply did not mark the firm's earlier messages as read,** unlike a staff reply. It now does.
6. **Notice reading:** Income Tax DINs containing "(2)" and "(1)" were cut short; "Q3 FY 2025-26" lost the quarter;
   a bank statement named "HDFC_Stmt" was not recognised, because the name never says "bank".
7. **Found by the authorization review:**
   - `evidencePanel` relied on its caller to check access;
   - `listCredentials` only refused a client once credentials existed.

   Both now refuse up front.
8. **Security headers were missing.** CSP, framing, nosniff, referrer and permissions policies were added and checked
   in a browser on the production build. The service worker, 2FA QR code and attendance location still work.

## 5. Decisions

D-77 to D-86 are in `docs/decisions.md`; D-55 is marked as superseded by D-77. They cover:
- the promoted columns;
- the invite links and portal sign-in;
- client approvals (one new table);
- what the portal may show;
- portal acceptance of letters;
- messaging and response time;
- reminder-due lists;
- the rule-based helpers;
- the security slice.

No new dependencies.

## 6. Known limits

- **Office network only.** The portal is designed for the office LAN. Opening it to the internet needs a
  reverse proxy, a real certificate, rate limiting and an external penetration test (Q-42, security checklist §6).
- **No sending service, by design.** The firm sends invite links, reminders and replies itself. `docs/service-boundaries.md`
  shows where connectors would go later.
- **Draft replies need approved templates.** In the demo only the Income Tax reply template is approved; a Partner
  approves the GST, TRACES and ROC ones.
- **The helpers only suggest.** They are rule-based, not AI. Notice reading needs the text pasted, since there is no OCR of scans.
- **Seeded placeholders:** the reminder schedules (Q-40), leave policies, retention periods and cost rates are
  placeholders until the firm sets them. Statutory values remain Unverified until checked (Q-34).

## 7. Open questions

**New (built with my proposal):**
- **Q-40:** the firm's reminder schedule days and escalation count.
- **Q-41:** whether clients see the replying staff member's name.
- **Q-42:** office network only, or the internet.

**Still open from before:**
- **Q-07:** portal 2FA is optional, with a setting to make it mandatory.
- **Q-23:** a portal click is enough to accept a letter.
- **Q-36:** firm GSTIN, PAN, bank and UPI, now also shown in the portal.
- **Q-37 and Q-38.**
- **Q-09 and Q-18 to Q-22,** built with my proposals.
- **For Phase 5:** Q-16, Q-24 and Q-25.

**Next:** Phase 5 (analytics). It starts after you accept this report.
