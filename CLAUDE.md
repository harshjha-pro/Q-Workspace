# QEPEX Work Tracker — notes for coding agents

Read `README.md` and `docs/` first (architecture, data-model, permissions, decisions, open-questions, build-plan).

## Non-negotiables (from the product brief)
- Code only: no external services, API keys, cloud, Docker or Redis. Runs with `npm install && npm run setup && npm run dev`.
- No hard-coded statutory values (due dates, rates, slabs, minimums): they live in effective-dated tables, seeded "Unverified".
- Permissions are enforced server-side in every service call (`authorize` / `assert*Access` / `scopeWhere`); UI hiding is cosmetic.
- Migrations only (`prisma migrate dev` to create, `migrate deploy` to apply). Never reset real data. The data model is frozen:
  later changes must be additive; `tests/migration` enforces this.
- Every mutation writes the audit trail in the same transaction; sensitive reads call `logSensitiveView`.
- Hours are effort only ("6 hrs logged"), never "6/8". Money = integer paise; durations = minutes; business dates = `YYYY-MM-DD` IST.
- Ask about business rules; decide technical details and record them in `docs/decisions.md`.
- Commits reference requirement IDs (e.g. `P2-11`).

## Conventions
- Services: `server/services/<module>/service.ts`; Zod input schemas, `parse()` for creates and `parsePartial()` for updates
  (Zod `.partial()` keeps `.default()`s — see D-28).
- Pages call services; server actions return `ActionResult` via `toActionError`.
- Next.js 16: `params`/`searchParams` are Promises; check `node_modules/next/dist/docs/` for API changes.
- Tests: `npm test` (Vitest; each file gets its own SQLite copy via `tests/helpers/db.ts`), `npm run e2e` (Playwright).
