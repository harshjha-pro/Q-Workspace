/**
 * Every firm setting with its default. Settings are rows in `Setting`; a missing row means
 * the default applies. Statutory values are NOT here — they live in effective-dated tables.
 */
export const SETTING_DEFAULTS = {
  "session.idleMinutes": { value: 30, description: "Log out after this many idle minutes" },
  "session.absoluteHours": { value: 12, description: "Log out after this many hours regardless of activity" },
  "login.maxFailures": { value: 5, description: "Failed logins before the account is locked" },
  "login.lockMinutes": { value: 15, description: "Minutes an account stays locked" },
  "work.dailySoftWarnMinutes": { value: 720, description: "Soft warning when a day's total crosses this (spec 5.3)" },
  "work.weeklyLockDay": { value: 0, description: "Weekly lock day (0 = Sunday)" },
  "work.weeklyLockTime": { value: "16:00", description: "Weekly lock time (IST)" },
  "work.workingSaturdays": { value: true, description: "Saturdays are working days" },
  "upload.maxMegabytes": { value: 25, description: "Largest allowed upload" },
  "portal.inviteDays": { value: 7, description: "Days a portal invite link stays valid" },
  "portal.totpMandatory": { value: false, description: "Require TOTP for portal users (open-questions Q-07)" },
  "backup.keepAuto": { value: 14, description: "Automatic backups to keep" },
  "backup.nightlyTime": { value: "23:30", description: "Time of the nightly automatic backup (IST)" },
  "eqr.feeThresholdPaise": { value: 50_000_00, description: "Audit fee at or above which EQR is required" },
  "budget.bands": { value: [85, 100, 110], description: "Budget band thresholds in % (spec 5.3)" },
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
