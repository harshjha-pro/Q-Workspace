# Web deployment (Vercel + Hostinger MySQL)

The office install (`npm run setup && npm run dev` on one computer, SQLite) is unchanged. This guide covers running
the same app as a web app: the code runs on **Vercel**, the data is in the firm's **Hostinger MySQL** database and
uploaded files are in **Vercel Blob**. Background: D-98, D-99 in `decisions.md`.

## What lives where

| Part | Where | Notes |
|---|---|---|
| App (pages, API, jobs) | Vercel project, region Mumbai (`bom1`) | Builds from this repository |
| Database | Hostinger MySQL | Must allow remote connections |
| Files (documents, PDFs, uploads) | Vercel Blob, private store | Served only through the app's checked download routes |
| Background jobs | Vercel Cron, once a day at 06:00 IST | Runs all jobs due that day |
| Backups | Hostinger (database), Vercel Blob (files) | The in-app backup screens are office-only |

## 1. Hostinger: create the database

1. hPanel → **Databases → MySQL Databases**: create a database and a user with a strong password. Note the
   database name and user (Hostinger prefixes both, e.g. `u123456789_qepex`).
2. hPanel → **Databases → Remote MySQL**: add **Any Host** (`%`). Vercel's servers have no fixed IP address on Hobby,
   so a specific IP cannot be listed.
3. Note the **host name** shown on the Remote MySQL page (e.g. `srv123.hstgr.io`, or an IP address).

## 2. Vercel: environment variables

Project → Settings → Environment Variables (Production and Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DATABASE`. Percent-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`) |
| `VAULT_KEY`, `PII_KEY`, `BACKUP_KEY` | 32-byte base64 keys. **Keep a copy offline.** Losing them makes encrypted fields unreadable |
| `AUTH_SECRET` | Random secret that signs logins |
| `CRON_SECRET` | Random secret; Vercel Cron sends it automatically |
| `AUTH_TRUST_HOST` | `true` |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when the Blob store is connected to the project |
| `DB_POOL_SIZE` | `3` (raise only if Hostinger allows more connections per user) |
| `DEMO_MODE` | `true` for the demo firm only; `false` before any real data |

## 3. Deploy

Each push builds. `npm run build:web` checks the MySQL schema, applies pending migrations to the Hostinger database
(`migrate deploy`, never a reset), then builds the app. If `DATABASE_URL` is missing the build stops with a message.
Crons run only on the **production** deployment: promote the deployment, or set the production branch.

## 4. Loading the demo firm

The demo is generated locally against MariaDB, using the same keys as Vercel, so that its encrypted fields can be
read. It is then imported:

1. phpMyAdmin (hPanel → Databases → phpMyAdmin) → select the database → **Import** the `.sql` dump.
2. Demo files: with `DEMO_FILE_IMPORT=true` set, POST each stored file to `/api/setup/demo-files` with
   `Authorization: Bearer CRON_SECRET` and `x-storage-path`. Then delete `DEMO_FILE_IMPORT` and the route.

## Before real firm use

- **Vercel Pro.** Hobby is for non-commercial use, and its cron runs once a day: hourly jobs such as reminders and
  notifications run daily on Hobby.
- **Turn off the demo.** Set `DEMO_MODE=false` and start from an empty database (`migrate deploy`), then import the
  firm's data.
- **Internet exposure.** The app is now reachable from anywhere. Require TOTP for Partners and admins, use strong
  passwords, and review `security-checklist.md`. Consider Vercel Deployment Protection or a firewall rule for staff
  pages if the firm wants office-only access.
- **Data location.** The database is wherever the Hostinger plan is hosted, functions run in Mumbai, and Blob files
  are stored by Vercel. Confirm this is acceptable for client data (DPDP Act obligations rest with the firm).
- **Database traffic.** Every page queries Hostinger over the internet. Shared-hosting MySQL is fine for a demo and a
  small firm. Watch the connection limit (`max_user_connections`) and move to a managed MySQL if pages get slow.
- **Backups.** Turn on Hostinger's daily backups and download a copy regularly. Blob files are not backed up by the
  app in hosted mode.
