import { db } from "../lib/db";
import { todayIst } from "../lib/dates";
import { automaticBackup } from "../services/backup/service";
import { syncAllClients } from "../services/compliance/sync";
import { runReminders } from "../services/reminders/service";
import { runRetainerDrafts } from "../services/billing/retainer";
import { runCrmDaily } from "../services/crm/jobs";
import { runQcFindingReminders } from "../services/qc/inspections";
import { runRetentionPurgeProposals } from "../services/lifecycle/retention";
import { runArticleshipCompletion } from "../services/hr/articleship";
import { runCpeShortfall } from "../services/hr/growth";
import { runLeaveAccrual } from "../services/attendance/leave-policies";
import { runUnansweredMessageReminders } from "../services/messages/service";
import { runReminderDueLists } from "../services/reminders/due-lists";
import { runMonthlyMis } from "../services/analytics/mis";

export type JobDef = {
  code: string;
  name: string;
  description: string;
  cron: string; // IST
  scheduleLabel: string;
  catchUpAfterHours: number;
  roles: string[]; // roles that may press "Run now"
  run: () => Promise<Record<string, unknown> | void>;
};

/** Jobs by phase: backup + sessions (1), compliance generation + reminders (2); payroll prep etc. later. */
export const JOBS: JobDef[] = [
  {
    code: "COMPLIANCE_GENERATION",
    name: "Compliance calendar generation",
    description: "Creates the next periods for every client (idempotent), closes tasks that no longer apply and refreshes provisional dates.",
    cron: "0 1 * * *",
    scheduleLabel: "Daily 01:00 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => syncAllClients(),
  },
  {
    code: "REMINDERS",
    name: "Reminders and escalations",
    description: "Due-date reminders (7/3/1 days), overdue escalation to manager and partner, pending-from-client follow-ups, review waits, notices and hearings, DSC expiry, UDINs, password changes, missing work entries and the weekly lock warning.",
    cron: "30 7 * * *",
    scheduleLabel: "Daily 07:30 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runReminders(),
  },
  {
    code: "RETAINER_DRAFTS",
    name: "Retainer invoice drafts",
    description: "Creates this month's draft invoice for each recurring retainer engagement, for Partner approval (P3-35). Never issues anything.",
    cron: "0 6 * * *",
    scheduleLabel: "Daily 06:00 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runRetainerDrafts() as unknown as Record<string, unknown>,
  },
  {
    code: "CRM_DAILY",
    name: "Leads, proposals, renewals and feedback",
    description: "Lead follow-up reminders, proposal expiry, renewal prompts (60 days ahead), feedback requests for closed engagements and cross-sell suggestions.",
    cron: "15 7 * * *",
    scheduleLabel: "Daily 07:15 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runCrmDaily() as unknown as Record<string, unknown>,
  },
  {
    code: "HR_DAILY",
    name: "Leave accrual, articleship and CPE alerts",
    description: "Leave accrual by policy (idempotent); articleship completion dates (excess leave) and approaching completions; CPE shortfall warnings before the year or block ends.",
    cron: "45 7 * * *",
    scheduleLabel: "Daily 07:45 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "HR_ADMIN"],
    run: async () => ({ leaveAccrual: await runLeaveAccrual(todayIst()), articleship: await runArticleshipCompletion(), cpe: await runCpeShortfall() }) as unknown as Record<string, unknown>,
  },
  {
    code: "REMINDER_DUE_LISTS",
    name: "Reminder-due lists",
    description: "Builds the day's client-document reminders (per schedule, escalation after N) and overdue-invoice reminders with ready-to-copy text. Sends nothing: staff copy and mark as sent (P4-03, P4-08).",
    cron: "0 7 * * *",
    scheduleLabel: "Daily 07:00 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runReminderDueLists(),
  },
  {
    code: "MONTHLY_MIS",
    name: "Monthly Partner MIS",
    description: "On the 5th, builds last month's Partner MIS (PDF + Excel), files it under firm documents (Partner only) and notifies the Partners. Skips a month already built (P5-07).",
    cron: "0 6 5 * *",
    scheduleLabel: "5th of each month, 06:00 IST",
    catchUpAfterHours: 24 * 32,
    roles: ["PARTNER"],
    run: async () => runMonthlyMis(),
  },
  {
    code: "MESSAGES_UNANSWERED",
    name: "Unanswered client messages",
    description: "Reminds the team (and the client's Manager) once per waiting spell when a portal message has had no reply for longer than the response target (P4-04).",
    cron: "15 9-19 * * 1-6",
    scheduleLabel: "Hourly 09:15–19:15 IST, Mon–Sat",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runUnansweredMessageReminders(),
  },
  {
    code: "QC_FINDINGS",
    name: "Quality-control corrective actions",
    description: "Reminds owners and inspectors of overdue corrective actions from file inspections.",
    cron: "0 8 * * 1-6",
    scheduleLabel: "Mon–Sat 08:00 IST",
    catchUpAfterHours: 50,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runQcFindingReminders() as unknown as Record<string, unknown>,
  },
  {
    code: "RETENTION_PROPOSALS",
    name: "Retention: purge proposals",
    description: "Lists records past their retention period (only for rules a Partner has enabled) and asks a Partner to approve. Never deletes anything itself.",
    cron: "30 2 * * 0",
    scheduleLabel: "Sundays 02:30 IST",
    catchUpAfterHours: 24 * 8,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => runRetentionPurgeProposals() as unknown as Record<string, unknown>,
  },
  {
    code: "AUTO_BACKUP",
    name: "Nightly backup",
    description: "Database + uploaded files to /backups; keeps the newest automatic backups (setting).",
    cron: "30 23 * * *",
    scheduleLabel: "Daily 23:30 IST",
    catchUpAfterHours: 26,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => {
      const rec = await automaticBackup();
      return { fileName: rec.fileName, sizeBytes: rec.sizeBytes };
    },
  },
  {
    code: "SESSION_CLEANUP",
    name: "Expire old sessions",
    description: "Marks sessions past their absolute expiry as revoked (they are already refused on use).",
    cron: "15 3 * * *",
    scheduleLabel: "Daily 03:15 IST",
    catchUpAfterHours: 48,
    roles: ["PARTNER", "PRACTICE_ADMIN"],
    run: async () => {
      const r = await db().userSession.updateMany({ where: { revokedAt: null, expiresAt: { lt: new Date() } }, data: { revokedAt: new Date(), revokeReason: "EXPIRED" } });
      return { expired: r.count };
    },
  },
];
