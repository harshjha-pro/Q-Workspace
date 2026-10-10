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
| 4 | Clients | Partner / Practice Admin | Constitution, PAN/TAN, GSTINs with frequency, directors with DIN, PT registrations, applicability flags, Partner/Manager/team. **Leave "Onboarding date" blank for existing clients** (fill it only for a client taken on after the tracking date). Compliance tasks are generated as each client is saved |
| 5 | Engagements | Partner | Name the client by code, PAN or exact name. Fee basis, fee, budget, makers, checkers. A recurring row updates the engagement created automatically in step 4 (no duplicates), and its makers/checkers are copied to the open tasks |

Leave balances, receivables, salary structures and leads can wait for Phase 3.

After step 5, open **Home** as a Manager:

- **Allocations pending** lists open tasks with nobody assigned, typically from engagement types not in your
  engagements file. Assign them from the task list (select the
  rows, then Reassign).
- Professional Tax due dates are typed per task (Q-02b). Rajasthan does not levy PT, so only clients
  registered in other states have PT tasks.

## 6a. Before the first invoice and the first payroll (Phase 3)

- **Admin → Firm profile**: GSTIN, PAN, address, bank and UPI details (printed on invoices).
- **Settings**: confirm `billing.gstRateBp` and `billing.sacByServiceLine` (Q-35).
- **HR → Payroll → Rates**: the Partner verifies PF, ESI, income-tax slabs and parameters, and stipend
  minimums for FY 2026-27 under the Income-tax Act, 2025 (Q-34). Set `payroll.form16Label` to the new form name.
- **HR → Leave policies**: replace the placeholder quotas with the firm's policy (Q-20).
- **HR → Cost rates**: ₹/hour per designation, so realization works (Q-22).
- **People → each person → profile**: salary structures (HR proposes, a Partner approves), UAN / ESI numbers.

## 6b. Before inviting the first client to the portal (Phase 4)

- **Admin → Firm profile**: bank account and UPI ID. The portal's Invoices page shows them (Q-36).
- **Settings**: `portal.inviteDays` (link validity, 7 days), `portal.totpMandatory` (Q-07), and
  `messages.responseHours` (reply target, 24 hours).
- **Reminders due → Schedules**: replace the two placeholder schedules (3rd and 12th, escalate after 3) with
  the firm's own, per compliance type if needed.
- **Admin → Document templates**: a Partner approves the notice-reply templates the firm will use (Income
  Tax, GST, TRACES, MCA/ROC); **Draft reply** only offers approved ones.
- **Admin → Portal users → Invite portal user**: copy the one-time link and send it to the client yourself
  (WhatsApp or email). The client sets a password from it. A new link also serves as a password reset.
- The portal is for the **office network** (HTTPS on the LAN). Before it is reachable from the internet, read
  `docs/security-checklist.md` §6: you need a reverse proxy with a real certificate and rate limiting, plus an
  external penetration test (Q-15).

## 6c. Before relying on analytics (Phase 5)

- **HR → Cost rates**: ₹/hour per designation, effective-dated (Q-22). Without them, profitability and
  realization are understated, and the page says how many hours have no rate.
- **Settings**: `capacity.hoursPerDay` (8, Q-24), `capacity.leadDays`, `capacity.bands`,
  `capacity.historyMonths` and `capacity.minSamples` (the forecast), and `budget.bands` (budget health).
- **Partner MIS**: the MONTHLY_MIS job builds last month's report on the 5th. To build a month by hand, open
  **Analytics → Partner MIS → Build now**.
- After importing history, run `npm run analytics:reconcile` once. It should end with every check matching.

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
