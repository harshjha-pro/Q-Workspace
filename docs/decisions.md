# Technical decisions (brief rule 9: decided by the engineer, recorded here)

Status: proposed in Phase 0; each becomes "accepted" when the plan is approved.

| ID | Decision | Why |
|---|---|---|
| D-01 | Single Next.js process serves staff, admin and portal route groups; no separate API server | Zero-setup; one `npm run dev` |
| D-02 | SQLite in WAL mode, file at `prisma/data/qepex.db`; `busy_timeout` 5 s | Concurrent readers + one writer is ample for a ~25-person firm on a LAN |
| D-03 | Enums stored as `String` + Zod/TS unions; no Prisma `enum`, no `Json` columns (JSON stored as validated `String`) | Identical behaviour on SQLite and PostgreSQL |
| D-04 | Money in integer paise; hours in integer minutes; business dates as `YYYY-MM-DD` strings in IST | No float errors; no timezone off-by-one on due dates |
| D-05 | Task natural key = `(clientId, complianceTypeCode, partyKey, periodKey)`, unique index. `partyKey` = GSTIN id (GST types), Director id (DIR-3 KYC — one task per director, attached to `Director.primaryClientId` and listed on every linked company), PT state code (Professional Tax), `-` otherwise | Supports per-GSTIN and per-director obligations (Spec §4.1) while keeping Rules Spec §3.3 idempotency |
| D-06 | Compliance engine is pure (no Prisma, no clock); `today` injected; service layer persists plans in one transaction | 100% branch coverage is practical; scenario tests run in milliseconds |
| D-07 | Stored statuses are exactly the 7 in the spec. "Overdue", "At Risk", "Due today" are derived at read time from status + effective due date + budget band | Rules Spec §8 says status is computed; avoids a status the spec does not define |
| D-08 | A PendingRecord links specific checklist items; the task reverts to In Progress when all linked items are Received *and confirmed*, or when manually cleared | Makes "the relevant item" (Rules §8) precise; respects staff confirmation of portal uploads |
| D-09 | Auth.js v5 credentials provider with JWT session + per-request DB check of `active` and `sessionEpoch` | Credentials provider needs JWT; DB check gives immediate revocation at offboarding |
| D-10 | Two AES-256-GCM keys: `VAULT_KEY` (credentials) and `PII_KEY` (salary, bank, Aadhaar, employee PAN); ciphertext prefixed with key version | Spec §14.4 asks for separate keys; versioning allows rotation |
| D-11 | Full-text search via a portable `DocumentSearchToken` table (tokenised on upload for text/PDF text/Office text) behind a `SearchService` interface | SQLite FTS5 is not portable to PostgreSQL |
| D-12 | node-cron started from `instrumentation.ts` with a global guard; every job idempotent, logged to `JobRun`, with Run now and catch-up on boot | Laptop may sleep through a schedule |
| D-13 | Service worker hand-written (no Workbox/Serwist) with `idb` queue; offline entries carry a client UUID for idempotent sync | Small surface; only one offline flow |
| D-14 | `docx` npm package for Word output of templates/letters; `@react-pdf/renderer` for all PDFs; `exceljs` for all Excel | Spec §13.3 requires Word output; all pure JS, no services |
| D-15 | Phone-friendly LAN use: `npm run dev` binds `0.0.0.0` only when `LAN=1`; default `localhost` | Safe by default |
| D-16 | Firm's own one-off obligations (COP, PI insurance, peer review, licences) use compliance types with a `MANUAL` due-date rule (date typed per instance) | Reuses the engine (Spec §13.6) without inventing statutory dates |
| D-17 | Statutory values (due dates, late fees, interest, PF/ESI/PT, tax slabs, stipend minimums, CPE hours) are seeded as rows with `source`, `effectiveFrom`, `verifiedBy = null`. The Due-Date Master and Statutory Settings pages show an "Unverified" badge until a Partner marks each row verified | Brief rule 5; specs mark every value illustrative |
| D-18 | Review levels per stage come from the stage template (`reviewLevel: NONE|SENIOR|MANAGER|PARTNER`); "Senior" = Staff user with `isSenior` (not an eighth role) | Spec has seven roles; §3.3 says Seniors may review |
| D-19 | Correction requests on a Manager's own entries go to their reporting Partner; on a Partner's own entries to any other Partner | Nobody approves their own correction |
| D-20 | Audit log is append-only at the code level (no update/delete functions exported); before/after stored as JSON diff | Spec §5.7 |
| D-21 | Portal invite tokens: 32 random bytes, stored as SHA-256 hash, single use, 7-day expiry (setting) | Invite link replaces OTP delivery |
| D-22 | Backup = `VACUUM INTO` snapshot + `/storage` zipped with SHA-256 manifest; restore validates manifest + schema version before swapping | Consistent snapshot of a live DB |
| D-23 | Uploads: allow-list (pdf, jpg, png, xlsx, xls, csv, docx, doc, zip, txt, json, xml), magic-byte check, 25 MB default (setting), stored under random names | Replaces virus scanning (brief §4) |
| D-24 | UI: shadcn/ui on Tailwind with one status-colour map shared by every list, calendar and board | Brief §10 "same status colours everywhere" |
| D-25 | Fake identifiers in seed follow real formats with valid check characters where one exists (GSTIN checksum), PAN pattern `AAAAA9999A`, DIN 8 digits, UDIN 18 characters | Brief §12 |
