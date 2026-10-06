import { db } from "../lib/db";
import { automaticBackup } from "../services/backup/service";

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

/** Phase 1 jobs. Compliance generation, reminders, payroll prep etc. are added in their phases. */
export const JOBS: JobDef[] = [
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
