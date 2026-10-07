# Going live with real data

QEPEX India is starting daily use after Phase 2 (Q-32). This checklist sets up the firm's own copy.
**Do not reuse the demo database.** Start from a clean install on the office computer that will run the app.

Plan about half a day: an hour for install and settings, the rest for preparing and importing the Excel files.

## 1. Install (Partner, at the office computer)

Requires Node.js 22 LTS (20.19 or newer).

```bash
git clone https://github.com/harshjha-pro/Q-Workspace.git qepex
cd qepex
npm install
cp .env.example .env
```

Open `.env` and set `DEMO_MODE="false"`. Leave the keys empty; setup generates them. Then:

```bash
npm run setup
```

Setup prints a **one-time password for the user `partner`**. Copy it now; it is shown only once.

**Back up `.env` straight away** (a USB drive kept in the office safe, plus one other place). It holds the
keys for the credentials vault, staff PII and the encrypted backups. Without it, no backup can be restored.

## 2. Start it for the office

```bash
npm run build
npm run start:lan:https
```

- Sign in as `partner` from this computer at `https://localhost:3443`, set your own password, and set up 2FA
  with an authenticator app.
- Trust `certs/qepex-lan.crt` once on every phone and PC (README, "Phones on the office Wi-Fi").
- To start the app automatically when the computer boots, add `npm run start:lan:https` (run inside the
  `qepex` folder) to Windows Task Scheduler "At startup", or a systemd/launchd service.
- Keep the computer awake during office hours. Jobs missed while it was off (backup, reminders, compliance
  generation) run when it starts again.

## 3. Settings to make **before** importing clients

Under **Admin → Settings**:

| Setting | Value | Why |
|---|---|---|
| `compliance.trackingFrom` | `2025-04-01` | So that FY 2025-26 annual work still due (ITR, tax audit, AOC-4, MGT-7…) is tracked |
| `compliance.createDueFrom` | your go-live date, e.g. `2026-10-08` | Work already due before go-live was handled outside the app, so it is not created as overdue tasks |
| `work.weeklyLockTime`, `work.workingSaturdays` | check | Weekly lock (Sunday 16:00) and working Saturdays |

The firm profile is created with **Rajasthan** as the office state (Q-31).

## 4. Holidays (Practice Admin)

Under **Admin → Due-date master → Holidays**:

- Check the national holidays for 2026 and 2027.
- Add the **Rajasthan** state holidays (kind *State*, state *Rajasthan*) from the Government of Rajasthan's
  official holiday list.
- Add any firm holidays (kind *Firm*).

Rajasthan holidays count as office holidays for leave, missing-entry checks, the week grid and the calendar.
They do **not** move statutory due dates; only national holidays do, as each due-date rule says.

## 5. Verify statutory values (Practice Admin) — Q-29

Under **Admin → Due-date master**, open each compliance type and late-fee rate. Compare it with the official
notification or circular, then press **Verify**. Unverified rows keep their badge, but the app still works
with them. Do this before relying on the reminders.

## 6. Import, in this order (Admin → Import)

Download each template from the Import page. Each import shows a row-by-row check before anything is saved.

| # | Import | Who | Notes |
|---|---|---|---|
| 1 | Users | Partner | Gives a one-time password per person; share each privately. Mark Seniors. Managers, Partners and Admins set up 2FA at first login |
| 2 | Client teams | Partner / Practice Admin | Team name, lead Manager, members |
| 3 | Employees | HR Admin | Joining date, PAN, Aadhaar, bank (stored encrypted), ICAI/ICSI numbers |
| 4 | Clients | Partner / Practice Admin | Constitution, PAN/TAN, GSTINs with frequency, directors with DIN, PT registrations, applicability flags, Partner/Manager/team. Compliance tasks are generated as each client is saved |
| 5 | Engagements | Partner | Fee basis, fee, budget, makers, checkers. A recurring row updates the engagement created automatically in step 4 (no duplicates), and its makers/checkers are copied to the open tasks |

Leave balances, receivables, salary structures and leads can wait for Phase 3.

After step 5, open **Home** as a Manager:

- **Allocations pending** lists open tasks with nobody assigned. Assign them from the task list (select the
  rows, then Reassign).
- Professional Tax due dates are typed per task (Q-02b). Rajasthan does not levy PT, so only clients
  registered in other states have PT tasks.

## 7. First week

- Everyone logs daily work on **Add work**. Phones can install it to the home screen.
- Managers watch **People with days not logged** and **Waiting for your review** on Home.
- Make the first backup by hand: **Admin → Backup & restore → Back up now**. The nightly backup runs at
  23:30 into the `backups/` folder; copy that folder off the computer every week.
- Problems: **Admin → System log** shows errors. The audit trail shows who changed what.

## 8. Updating to a new version later

```bash
git pull
npm install
npm run setup     # backs up the database, applies new migrations, keeps all data
npm run build
```

Then restart `npm run start:lan:https`.
