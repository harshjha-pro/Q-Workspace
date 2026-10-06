import { db } from "../lib/db";
import { automaticBackup } from "../services/backup/service";
import { syncAllClients } from "../services/compliance/sync";
import { runReminders } from "../services/reminders/service";

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
