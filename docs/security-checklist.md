# Internal security checklist

**Phase 4, slice 4.7 (P4-09 →, Q-15).** This replaces an external penetration test for now.

**How to use it:**
- Each line gives the control, where it lives, and how it is verified.
- "Test" means an automated test that runs with `npm test`.
- Re-check the whole list before go-live and after any change to authentication, permissions, uploads or headers.

**Last reviewed:** 8 October 2026 (Phase 4).

## 1. Identity and sessions

| # | Control | Where | Verified by |
|---|---|---|---|
| S-01 | Passwords are hashed with bcrypt (cost 12, `BCRYPT_COST`), minimum 10 characters with a letter and a digit, and never logged | `server/services/auth/password.ts`, logger redaction | `tests/integration/auth.test.ts` |
| S-02 | Lockout after `login.maxFailures` (5) bad attempts for `login.lockMinutes` (15), for staff and portal. Unknown user and wrong password give the same "INVALID". Every attempt is recorded in `LoginAttempt` | `server/services/auth/login.ts` | auth and portal-auth tests |
| S-03 | TOTP is mandatory for Partner, Manager, Practice Admin and HR Admin, and enforced on every request until enrolled. It is optional for portal users unless `portal.totpMandatory` is set. Secrets are AES-256-GCM encrypted (VAULT key) | `sessions.ts`, `context.ts` | auth and portal-auth tests |
| S-04 | Sessions are server-side rows. They are checked on every request for revocation, idle time (30 minutes), absolute expiry (12 hours) and an active user. Deactivation and offboarding take effect at once (D-09) | `server/services/auth/sessions.ts` | auth, users and portal-auth tests |
| S-05 | Portal invites: 256-bit random token, only the SHA-256 is stored, one use, expiry, and a newer link revokes older ones. Setting a password signs out other sessions | `server/services/portal/accounts.ts` | portal-auth test (token never in DB or audit) |
| S-06 | The staff and portal realms are separated. `requireStaff` refuses portal sessions and `requirePortal` refuses staff sessions | `server/context.ts` | e2e check (portal session sent away from staff pages); authz review |

## 2. Requests and browser

| # | Control | Where | Verified by |
|---|---|---|---|
| S-07 | Cross-site request forgery: server actions get Next.js's origin check. POST API routes call `crossSiteRefused`. The session cookie is SameSite=Lax | `lib/same-origin.ts` | authz-review test (every mutating route); manual: cross-site POST → 403 |
| S-08 | Security headers on every response: CSP (`'self'` only, no third-party origins), `X-Frame-Options: DENY` with `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin` (invite tokens never leave the site), Permissions-Policy (only geolocation, for attendance), COOP | `next.config.ts` | Manual header check, plus a browser run of staff and portal pages on the production build with no CSP violations (8 Oct 2026) |
| S-09 | No `dangerouslySetInnerHTML`, `eval` or `new Function` anywhere. React escapes all output | code | grep (8 Oct 2026): none |
| S-10 | SQL: Prisma only. The only raw SQL is two fixed `PRAGMA` lines at connect time. Migrations are hand-checked to be additive | `server/lib/db.ts`, `tests/migration` | grep; migration test |
| S-11 | All input is validated server-side with Zod before use. Form values are never trusted for IDs that cross clients: services re-check ownership | `server/services/**` | unit and integration tests |

## 3. Authorization

| # | Control | Where | Verified by |
|---|---|---|---|
| S-12 | Every service function that takes an actor checks access: capability, scope, record loader, or self-scope. UI hiding is cosmetic | `server/permissions/*`, services | **`tests/permissions/authz-review.test.ts`**: a static scan of 580+ functions. It fails on any unguarded one (exceptions listed with reasons) |
| S-13 | Every API route checks the session; every server action resolves the user; every staff page calls `requireStaff` and every portal page `requirePortal` | `app/**` | same test. It was proved to catch planted unguarded code (8 Oct 2026) |
| S-14 | Portal isolation: portal users get portal DTOs only, with no hours, staff notes, review state, codes or other clients. Staff services refuse portal actors or return only their own clients' records | `server/services/portal/*` | `tests/permissions/portal-isolation.test.ts`, portal-client and messages leak checks |
| S-15 | Sensitive reads (salary, credentials, notices, payroll) are logged with who, when and what (`logSensitiveView`). Every change writes the audit trail in the same transaction | `server/audit` | storage-audit, registers and payroll tests |

## 4. Data and files

| # | Control | Where | Verified by |
|---|---|---|---|
| S-16 | Uploads: type allowlist, content (magic-byte) check, size limit (`upload.maxMegabytes`), random stored names, and paths kept inside storage (`resolveInside`) | `server/lib/storage.ts` | dms and storage tests |
| S-17 | Downloads: access re-checked per request, `Content-Disposition: attachment`, `nosniff`, `no-store`; every download is audited | `app/api/dms`, `app/api/portal` | dms and portal-client tests |
| S-18 | Encryption at rest with AES-256-GCM for vault credentials, TOTP secrets, PII and salary fields, and backups (separate VAULT, PII and BACKUP keys in `.env`, never committed) | `server/lib/crypto.ts`, `backup/archive.ts` | crypto and backup tests; `.gitignore` |
| S-19 | Logs never contain passwords, TOTP codes, secrets or tokens (pino redaction) | `server/lib/logger.ts` | code review |
| S-20 | Backups are encrypted. Restore needs Partner approval and first takes an automatic pre-restore backup; setup takes a pre-migration backup | `server/services/backup` | backup test |
| S-21 | Retention: nothing is purged without a Partner's approval, and the audit trail is never purged | `server/services/lifecycle` | collab-lifecycle test |

## 5. Dependencies and operations

| # | Control | Where | Verified by |
|---|---|---|---|
| S-22 | `npm audit --omit=dev`: **0 vulnerabilities** (8 Oct 2026) | `package.json` | Run before each release |
| S-23 | `npm audit` with dev dependencies: 5 "high" findings, all one chain (`eslint-config-next` → `fast-glob` → `micromatch` → `braces`, GHSA-vfj7-8cjw-p6xm, denial of service on crafted glob patterns). Dev-only lint tooling that runs on the repo's own config, so it is not reachable from the app. No fixed `braces` exists, and npm's suggested "fix" is a major downgrade. **Accepted**; re-check when a fix is published | — | Recorded in D-86 |
| S-24 | No external services, CDNs or telemetry. Next.js telemetry is disabled by setup, and the CSP allows only `'self'` | `scripts/setup.ts`, `next.config.ts` | header check |
| S-25 | HTTPS on the LAN with a self-signed certificate (`npm run start:lan:https`). HSTS is deliberately **not** sent: a certificate problem would lock users out of a LAN-only app | `scripts/lan-https.ts` | go-live guide |

## 6. Known limits and follow-ups

- **No per-IP rate limit.** Lockout is per account. On an office LAN this is acceptable. Exposing the portal to the internet would need a reverse proxy with rate limiting in front (see `docs/service-boundaries.md`).
- **CSP allows `'unsafe-inline'` scripts and styles,** because Next.js hydration needs them. A nonce-based CSP via middleware is possible later. There is no third-party origin, so injected script would still have to come from our own pages, and React escaping (S-09) is the primary defence.
- **The invite page uses Next.js's dynamic-page cache header** (`no-cache, must-revalidate`) rather than `no-store`. The token works once and the page shows only the invitee's name and email.
- **An external penetration test** is still recommended before the portal is reachable from outside the office network (Q-15).
