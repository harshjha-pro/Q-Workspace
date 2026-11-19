# Installation & maintenance guide

## 1. Requirements

* Node.js 20 or newer (22 LTS recommended). Native modules (`better-sqlite3`, `@node-rs/argon2`) ship
  prebuilt binaries for Linux, macOS and Windows.
* HTTPS for any deployment reached over a network. Service workers, installability and secure cookies all
  require it. `localhost` is exempt.

## 2. Choose a storage mode

| Mode | Where data lives | Who can connect | Typical setup |
|---|---|---|---|
| **Local-only** | This computer (`data/`) | Only this device. The server rejects non-loopback connections | `PPM_HOST=127.0.0.1`, open `http://localhost:8787` |
| **Self-hosted** | Your server's disk (`/data` volume) | All your devices over HTTPS | VPS or home server + Docker + Caddy/nginx |
| **Private cloud** | Database on your server, files in your S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) | All your devices over HTTPS | As self-hosted, plus the `PPM_S3_*` variables |

You can switch modes later in **Settings → Storage**. When the file location changes, every file is copied
to the new location and verified by checksum *before* the switch happens. Nothing is ever deleted from
the old location. If any file fails, the active storage stays unchanged and you can retry.

## 3. Local-only installation

```bash
cd apps/prompt-manager
npm install
npm run build
npm run setup               # username defaults to ayushporwal; choose a temporary password
npm start                   # serves http://127.0.0.1:8787
```

Open the URL, sign in, set your permanent password, then install the app from the browser menu
(**Settings → About & install** has the button and iOS instructions).

To start it automatically, use your OS service manager. For example, with systemd:

```ini
[Unit]
Description=Prompt Manager
After=network.target
[Service]
WorkingDirectory=/opt/q-workspace/apps/prompt-manager
Environment=NODE_ENV=production PPM_HOST=127.0.0.1
ExecStart=/usr/bin/node dist/server/server/index.mjs
Restart=on-failure
User=ppm
[Install]
WantedBy=multi-user.target
```

## 4. Self-hosted (Docker + HTTPS)

```bash
cd apps/prompt-manager
docker compose build
docker compose run --rm prompt-manager node dist/server/scripts/setup.mjs --mode self_hosted
docker compose up -d
```

Put an HTTPS reverse proxy in front. Example `Caddyfile` (certificates are automatic):

```
prompts.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

The compose file already sets `PPM_TRUST_PROXY=true` and `PPM_COOKIE_SECURE=true`.

**Hosting under a sub-path** (e.g. `https://example.com/prompt-manager/`, next to other apps): build with
`docker compose build --build-arg PPM_BASE_PATH=/prompt-manager/` and set `PPM_BASE_PATH=/prompt-manager/`
at runtime. The service worker scope, manifest and cookie path then follow that path, so other apps on the
same domain are unaffected.

## 5. Private cloud (S3-compatible)

Add these to the environment and restart:

| Variable | Example |
|---|---|
| `PPM_S3_BUCKET` | `my-private-prompts` |
| `PPM_S3_REGION` | `eu-central-1` (or `auto` for R2) |
| `PPM_S3_ENDPOINT` | empty for AWS. `https://<acct>.r2.cloudflarestorage.com` for R2. `http://minio:9000` for MinIO |
| `PPM_S3_ACCESS_KEY_ID` / `PPM_S3_SECRET_ACCESS_KEY` | credentials limited to that bucket |
| `PPM_S3_PREFIX` | `prompt-manager/` (default) |
| `PPM_S3_FORCE_PATH_STYLE` | `true` (default; needed for MinIO) |

Then open **Settings → Storage → Private cloud → Use**. Files are encrypted by the app *before* upload,
and also requested with S3 server-side encryption. Backups are copied to `<prefix>backups/`.
Keep the bucket private, with block-public-access on.

## 6. Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PPM_HOST` | `127.0.0.1` | Interface to listen on (`0.0.0.0` in Docker) |
| `PPM_PORT` | `8787` | Port |
| `PPM_DATA_DIR` | `./data` | Database, encrypted files, keys, backups |
| `PPM_BASE_PATH` | `/` | URL sub-path (build-time and run-time) |
| `PPM_TRUST_PROXY` | `false` | Trust `X-Forwarded-*` from your reverse proxy |
| `PPM_COOKIE_SECURE` | `auto` | `true` behind HTTPS proxies; `auto` = secure when the request is HTTPS |
| `PPM_ALLOWED_ORIGINS` | – | Extra allowed origins for state-changing requests (rarely needed) |
| `PPM_MASTER_KEY` | – | 32-byte key (hex/base64) for file encryption; otherwise `data/keys/master.key` is generated |
| `PPM_LOCAL_TRUSTED_IPS` | – | Extra IPs treated as "this device" in Local-only mode (e.g. Docker bridge gateway) |
| `PPM_CLAMD_HOST` / `PPM_CLAMD_PORT` | – / `3310` | Enable malware scanning through a ClamAV daemon |

Session timeout, upload size limit, sync interval, backup schedule, trash retention and OCR are set in the app
under **Settings**.

## 7. Backups and recovery

* **Manual:** Settings → Backup & restore → *Create backup*. With a passphrase, the archive is encrypted
  (scrypt + AES-256-GCM) and can be restored on any server. Without one, it is encrypted with the server key.
* **Scheduled:** daily or weekly, keeping the latest *N*. Stored in `data/backups/` (and in the bucket in
  Private cloud mode).
* **Restore:** choose a stored backup or upload a `.ppmbak` / `.zip`. Every file is checked against its
  checksum first, the current state is saved as a `pre-restore-…` backup, and then data is replaced. Your
  current password is kept. Every device re-downloads its local copy automatically.
* **Also back up** `data/keys/master.key` (or your `PPM_MASTER_KEY`). Without it, server-key-encrypted
  backups and stored files cannot be decrypted.
* **Export:** *Export all data (JSON)* gives a readable copy of all records. Each project's menu also
  exports its prompts in the bulk-import format (CSV/JSON).

## 8. Maintenance

* **Upgrade:** `git pull && npm install && npm run build`, then restart (or `docker compose build && docker compose up -d`).
  Database changes are additive and applied automatically on start. Installed apps show a "new version
  available" prompt.
* **Forgotten password:** on the server, run `npm run setup -- --reset` (Docker:
  `docker compose run --rm prompt-manager node dist/server/scripts/setup.mjs --reset`). This sets a temporary
  password, signs out every session, and forces a change at next sign-in.
* **Logs:** JSON logs go to stdout. Request bodies, cookies and CSRF tokens are never logged.
* **Disk usage:** see Settings → Storage. Empty the trash to free space. Items are purged automatically
  after the retention period.
* **Text extraction:** runs in the background after upload. Use *Re-run text extraction* on a file if needed.
* **OCR (optional):** `npm install tesseract.js` on the server, then enable *OCR for scanned images* in
  Settings → Application. The first run downloads the English language data.

## 9. Security notes

* Only one account exists; there is no registration endpoint. All API routes require a valid session, and
  state-changing requests also need the CSRF token and a same-origin `Origin` header.
* Passwords use Argon2id (64 MiB, 3 iterations). Sign-in is rate-limited per IP and per username with
  exponential lockout (up to 60 minutes).
* Sessions are random 256-bit tokens. Only their SHA-256 hash is stored. They expire on inactivity and at a
  maximum age, are bound to the browser's user agent, and are all revoked when the password changes.
* Uploads are checked for an allowed extension *and* matching file content (magic bytes / UTF-8). They are
  stored under random names, encrypted at rest (AES-256-GCM), and served with `nosniff`, a restrictive
  CSP and attachment disposition.
* On each device, the offline copy is encrypted with a random key. That key is only stored wrapped by your
  password (PBKDF2-SHA256, 310k iterations) and by a per-session server key. Locking or signing out removes
  it from memory. The service worker caches only the static app shell, never API responses or files.
* The SQLite database itself is not encrypted by the app. Use full-disk or volume encryption on the server
  (LUKS, BitLocker, FileVault, or your cloud provider's encrypted volumes).

## 10. Known limitations

* Legacy `.xls` and `.ppt` files can be stored, versioned and downloaded but not previewed or text-searched.
  Save them as `.xlsx` / `.pptx` to get previews.
* Text comparison works for text-based formats (TXT, MD, CSV, JSON, DOCX, DOC, PDF, XLSX, PPTX). Images are
  shown side by side. Other formats show version details and downloads.
* Scanned PDFs are searchable only through image OCR (optional). PDFs with a text layer are indexed automatically.
* Bulk import, backups, storage migration, tag renaming and the trash need a connection. Everything else
  works offline.
