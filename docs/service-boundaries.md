# Service boundaries for future connectors

**Phase 4, slice 4.7 (P4-05 →).** By design the system uses no external services: no email, SMS, WhatsApp, payment gateway, government portal API, e-sign, OCR or AI. Every place where a connector could later help already exists as one service function. Today that function is backed by a manual step.

This document names those seams, so that a connector can be added later behind the same function **without changing callers, permissions or the audit trail**.

## Rules for any future connector

1. **Behind the existing service function.** A connector is called from inside the function listed below, after its permission check and in or after its transaction, never from a page or a client component.
2. **Off by default.** It is switched on by a firm setting, and the manual path keeps working when it is off or fails.
3. **Secrets go in `.env`,** like the existing keys, never in the database or the code. If one must be stored, it is encrypted with a separate key.
4. **Outbound only from the server,** to an allowlisted host. The CSP keeps the browser on `'self'`; a connector never needs the browser to reach another site.
5. **Audit and minimise.** Each external call is audited (what was sent, to whom, the result id), and only the fields that service needs are sent. Client data leaving the office is a decision for the Partners, recorded in `docs/decisions.md`.
6. **Idempotent and retried by a scheduled job,** not inline in a user's click. Use the existing job runner (`server/scheduler/jobs.ts`) and dedupe keys.
7. **New permission rows,** if a connector adds a new kind of action, go into the matrix and are covered by `tests/permissions/authz-review.test.ts`.

## The seams

| Need | Today (manual) | Seam: the function a connector plugs into | Data that would leave | Notes |
|---|---|---|---|---|
| **Client reminders** (documents, payments) | Staff copy the text, send it themselves, then **Mark as sent** | `markReminderSent` / `runReminderDueLists` in `server/services/reminders/due-lists.ts` | Recipient contact, message text | A WhatsApp Business or email sender would run on "Mark as sent", or from the job. `ReminderLog.channel` already records the channel |
| **Pending-documents follow-up** from the task page | Copy text, then log the reminder | `pendingMessage`, `logReminder` in `server/services/pending/service.ts` | As above | Same sender as the row above |
| **Portal invites and password resets** | The Partner or Practice Admin copies the one-time link and sends it | `invitePortalUser`, `regeneratePortalInvite` in `server/services/portal/accounts.ts` | Invitee email, the link | An email sender would send the link instead of showing it. The token stays hashed in the database |
| **Portal message notifications** to clients | Client sees the unread badge on next sign-in | `postMessage` (`notifyOtherSide`) in `server/services/messages/service.ts` | "You have a new message", never the content | Notify only. Message bodies stay in the portal |
| **Staff notifications** (email or push) | In-app bell; browser notifications while the app is open | `notifyUsers` in `server/services/notifications/service.ts` | Title, link | Preferences and quiet hours already exist |
| **E-invoice (IRP) IRN / acknowledgment** | Generated on the portal; IRN, ack no. and date typed in | `issueInvoice`, `setEInvoiceDetails` in `server/services/billing/invoices.ts` | Invoice JSON (GSTINs, lines, values) | Q-39 columns `ackNo` and `ackDate` already exist. A GSP connector would fill them |
| **Payments received** (UPI, NEFT) | Receipt typed with UTR, then allocated | `recordReceipt` in `server/services/billing/receipts.ts` | Nothing outbound; inbound bank or UPI statements | A bank-statement import or payment-gateway webhook would create draft receipts for staff to confirm |
| **Accounting software** (Tally, Zoho) | Generic CSV/Excel export (Q-38) | `runBillingExport` in `server/services/billing/export.ts` | Invoices, lines, receipts | Add a Tally XML or Zoho format as a new export kind |
| **Government portals** (Income Tax, GST, TRACES, MCA): filing status, ack, notices | Staff record the filing, ack and notice by hand | `recordFiling` (tasks), `createNotice` (`server/services/registers/notices.ts`) | Client credentials (vault), PAN or GSTIN | Highest risk: it would use vault credentials. It would need per-client consent, a Partner decision and an external security review first |
| **Notice reading** (OCR or AI) | Rule-based "Fill from text" in the browser (D-85) | `extractNoticeFields` in `server/helpers/notice-extract.ts`, used by the New notice form | The notice text or scan | Any OCR or AI service must keep the same "suggest, user confirms" contract and must not store the text |
| **Upload classification** | Keyword tagging (D-85) | `suggestItem` / `suggestTags` in `server/helpers/upload-tagging.ts`, called by `portalUpload` | File contents | Same contract: a suggestion only, and staff link it |
| **E-sign / DSC signing** of letters and reports | Signed offline; signed copy uploaded | `acceptLetterWithSignedCopy` (`server/services/crm/letters.ts`); DMS `addVersion` | The document | Portal click-acceptance (Q-23) already covers engagement letters |
| **UDIN generation** | Generated on the ICAI portal, typed in | `recordUdin` in `server/services/registers/udin.ts` | Member number, document details | — |
| **Off-site backup** | Encrypted `.qbk` files in `./backups`; the firm copies them away | `automaticBackup` in `server/services/backup/service.ts` | Already-encrypted archives only | Upload only the encrypted file. The BACKUP key never leaves the office |
| **Exposing the portal to the internet** | LAN only (HTTPS, self-signed) | — (deployment) | — | Needs a reverse proxy with a real certificate, per-IP rate limiting and HSTS, plus an external penetration test (security checklist §6, Q-15) |

## What stays inside

These are never sent anywhere by design:
- the audit trail;
- work entries and hours;
- review points;
- salary and payroll data, except the statutory files the firm itself uploads;
- vault secrets, except by an explicitly approved government-portal connector;
- encryption keys.
