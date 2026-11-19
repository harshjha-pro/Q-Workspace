# Prompt & Project Manager

A private, single-user, installable PWA for managing projects, subprojects, AI prompts, reusable templates,
reference files, AI outputs (with full version history), tasks and notes. It works offline and syncs securely.

This app is fully self-contained in `apps/prompt-manager/`. It has its own server, database, service worker
scope, IndexedDB database (`ppm-workspace-v1`), cache names (`ppm-*`) and cookie (`ppm_sid`), so it does not
interfere with any other app in this repository or on the same domain.

## Quick start (local)

```bash
cd apps/prompt-manager
npm install
npm run build
npm run setup                 # creates the owner account; asks for a temporary password
npm start                     # http://127.0.0.1:8787
```

Sign in as `ayushporwal` with the temporary password. You'll be asked to choose a permanent one straight away.
No password is ever stored in code or configuration; only its Argon2id hash is saved.

For development, run `npm run dev`. This starts the API on :8787 and Vite on :5173 with hot reload.

## What's inside

| Area | Highlights |
|---|---|
| Auth | Single account, no registration, Argon2id, forced first-login password change, rate limiting with progressive lockout, HttpOnly SameSite=Strict cookie bound to the browser, CSRF token, idle timeout, session list and revoke |
| Projects | Projects and one level of subprojects, each with its own Overview, Prompts, Collections, Reference / Additional / AI Output files, Tasks, Notes and Activity. Status, tags, favourites, pins, archive, duplicate, trash with restore |
| Prompts | Mandatory and Optional types, variables (`{like_this}`) with required/optional and descriptions, fill-in forms with live preview, copy completed prompt, version history with compare and restore, reorder, move, save as template |
| Bulk import | CSV, XLSX and JSON files, or pasted text. Simple and Advanced downloadable templates, default classification, preview, validation, duplicate handling (skip / import / rename), collections and sequences, downloadable error report |
| Templates | Global library, tag filters, favourites, "Use template" creates an independent project copy |
| Collections | Ordered workflows with per-step instructions, a step-by-step runner, progress tracking and resume |
| Prompt packs | Mandatory prompts are always included (locked), optional ones are selectable, variables are filled, sequence is editable. Copy, TXT or Markdown |
| Files | Three independent categories, multi-file upload (also offline), magic-byte validation, encryption at rest, optional ClamAV scan, versions (minor/major), downloads, in-app preview (PDF, DOCX, XLSX/CSV, PPTX, images, TXT/MD) and side-by-side text comparison |
| Search | SQLite FTS5 across names, prompts, templates, notes and the extracted text of documents and AI outputs, with filters. Falls back to on-device search when offline |
| Offline | Encrypted local replica (AES-256-GCM), outbox sync, field-level conflict detection with a resolver, offline unlock with your password, offline file cache |
| Storage | Local-only, self-hosted or private cloud (S3-compatible), with verified migration between them |
| Backup | Passphrase-encrypted backups, scheduled backups, checksum-verified restore with an automatic safety backup, JSON export |

Deploy it on your own machine or server (SQLite), or on **Vercel with a MySQL database such as Hostinger**
(see section 4b of the guide). See [`docs/INSTALL.md`](docs/INSTALL.md) for deployment, configuration, storage modes and maintenance,
and [`docs/DESIGN.md`](docs/DESIGN.md) for the screen inventory and design system.

## Tests

```bash
npm test          # API test suite: auth, sync and conflicts, files, import, templates, backup and restore
PPM_TEST_DATABASE_URL=mysql://user:pass@127.0.0.1/testdb npm test   # same suite on MySQL/MariaDB
PPM_TEST_SERVERLESS=1 npm test                                      # Vercel code paths
npm run typecheck
```
