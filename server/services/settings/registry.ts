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
  "work.weeklyLockTime": { value: "16:00", description: "Weekly lock time on Sunday (IST) — Q-12" },
  "work.workingSaturdays": { value: true, description: "Saturdays are working days" },
  "upload.maxMegabytes": { value: 25, description: "Largest allowed upload" },
  "portal.inviteDays": { value: 7, description: "Days a portal invite link stays valid" },
  "portal.totpMandatory": { value: false, description: "Require TOTP for portal users (open-questions Q-07)" },
  "backup.keepAuto": { value: 14, description: "Automatic backups to keep" },
  "backup.nightlyTime": { value: "23:30", description: "Time of the nightly automatic backup (IST)" },
  "eqr.feeThresholdPaise": { value: 50_000_00, description: "Audit fee at or above which EQR is required" },
  "budget.bands": { value: [85, 100, 110], description: "Budget band thresholds in % (spec 5.3)" },
  "compliance.trackingFrom": { value: "2026-04-01", description: "Compliance tasks are generated from this date (no older periods are created)" },
  "compliance.agmCeilingMonths": { value: 6, description: "AGM deadline used for provisional dates: months after FY end (Q-10)" },
  "compliance.firstAgmCeilingMonths": { value: 9, description: "First AGM deadline: months after the first FY end (Q-10)" },
  "notice.defaultResponseDays": { value: 15, description: "Notice response due = received + days, when the notice gives no date (Q-13)" },
  "udin.awaitingDays": { value: 7, description: "Signed document shows 'Awaiting UDIN' after this many days" },
  "dsc.expiryAlertDays": { value: [30, 7], description: "DSC expiry alerts (days before expiry)" },
  "credentials.changeAfterDays": { value: 90, description: "Flag 'change periodically' credentials older than this" },
  "work.missingEntryLookbackDays": { value: 14, description: "Days checked for missing work entries" },
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
