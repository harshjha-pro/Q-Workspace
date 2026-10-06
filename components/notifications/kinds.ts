/** Every notification kind raised by the services, with a plain label for the preferences form. */
export const NOTIFICATION_KINDS: { kind: string; label: string }[] = [
  { kind: "DUE_SOON", label: "Task due soon" },
  { kind: "DUE_TODAY", label: "Task due today" },
  { kind: "OVERDUE", label: "Task overdue" },
  { kind: "ESCALATE_MANAGER", label: "Overdue escalation (manager)" },
  { kind: "ESCALATE_PARTNER", label: "Overdue escalation (partner)" },
  { kind: "PENDING_FOLLOW_UP", label: "Follow up with client" },
  { kind: "PENDING_ESCALATION", label: "Client pending escalation" },
  { kind: "REVIEW_SLA", label: "Review waiting" },
  { kind: "REVIEW_SLA_ESCALATION", label: "Review waiting escalation" },
  { kind: "ASSIGNED", label: "Task assigned to me" },
  { kind: "REVIEW_ASSIGNED", label: "Review assigned" },
  { kind: "REVIEW_APPROVED", label: "Review approved" },
  { kind: "REVIEW_RETURNED", label: "Review returned" },
  { kind: "EXTENSION", label: "Due date extended" },
  { kind: "NOTICE", label: "Notice" },
  { kind: "NOTICE_DUE", label: "Notice reply due" },
  { kind: "HEARING", label: "Hearing" },
  { kind: "DSC_EXPIRY", label: "DSC expiry" },
  { kind: "UDIN_DUE", label: "UDIN not recorded" },
  { kind: "CREDENTIAL_CHANGE", label: "Portal password change due" },
  { kind: "MISSING_ENTRIES", label: "Missing work entries" },
  { kind: "WEEK_LOCK", label: "Week lock reminder" },
  { kind: "LEAVE_APPROVAL", label: "Leave to approve" },
  { kind: "LEAVE_DECIDED", label: "Leave decided" },
  { kind: "CORRECTION", label: "Correction request" },
  { kind: "CORRECTION_DECIDED", label: "Correction decided" },
];

/** Mirrors savePreferences: escalations can never be muted (spec 9.2). */
export const isUnmutable = (kind: string) => kind.startsWith("ESCALATE") || kind.endsWith("ESCALATION");

export const kindLabel = (kind: string) => NOTIFICATION_KINDS.find((k) => k.kind === kind)?.label ?? kind.replace(/_/g, " ").toLowerCase();

/** "HH:MM" now in IST (the firm runs on one timezone). */
export function istClock(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** Quiet hours may wrap midnight (e.g. 21:00 → 08:00). Equal or missing bounds = no quiet hours. */
export function inQuietHours(from: string | null, to: string | null, clock: string): boolean {
  if (!from || !to || from === to) return false;
  return from < to ? clock >= from && clock < to : clock >= from || clock < to;
}
