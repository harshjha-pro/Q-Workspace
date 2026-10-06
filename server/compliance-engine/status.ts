import type { TaskStatus } from "./types";
import { diffDays } from "../lib/dates";

/** Facts the status rules read (Rules Spec 8 / 11.3). */
export type StatusFacts = {
  status: TaskStatus;
  stageIndex: number;
  workEntryCount: number;
  pendingFromClient: boolean;
  underReview: boolean;
};

/**
 * Status is computed, not freely set (Rules Spec 8). Terminal statuses only change through the
 * filing / extension / event paths below.
 */
export function evaluateStatus(f: StatusFacts): TaskStatus {
  if (f.status === "FILED" || f.status === "FILED_LATE" || f.status === "NOT_APPLICABLE") return f.status;
  if (f.pendingFromClient) return "PENDING_FROM_CLIENT";
  if (f.underReview) return "UNDER_REVIEW";
  if (f.workEntryCount > 0 || f.stageIndex > 0) return "IN_PROGRESS";
  return "UPCOMING";
}

export type FilingFacts = {
  status: TaskStatus;
  ackNumber: string | null | undefined;
  filedDate: string | null | undefined;
  effectiveDueDate: string | null;
  requiresSignoff: boolean;
  signoffRecorded: boolean;
  requiresUdin: boolean;
  udin: string | null | undefined;
  openReviewPoints: number;
  /** A stage that needs a checker has not been approved yet. */
  reviewOutstanding: boolean;
};

export type Check = { ok: true; status: TaskStatus } | { ok: false; reason: string };

/**
 * Recording a filing (Rules Spec 8, Product Spec 6.1). Hard rules: acknowledgment number and filed date
 * are required; open review points or an outstanding checker approval block filing; sign-off and UDIN
 * where the family requires them. Filed vs Filed Late compares with the effective due date.
 */
export function checkFiling(f: FilingFacts): Check {
  if (f.status === "FILED" || f.status === "FILED_LATE") return { ok: false, reason: "Already filed. Record an amendment as a new linked task." };
  if (f.status === "NOT_APPLICABLE") return { ok: false, reason: "This task is Not Applicable." };
  if (!f.ackNumber || !f.ackNumber.trim()) return { ok: false, reason: "Enter the acknowledgment number (ARN / SRN / ack / CIN / token) — a task cannot be Filed without it." };
  if (!f.filedDate) return { ok: false, reason: "Enter the filing date." };
  if (f.openReviewPoints > 0) return { ok: false, reason: `${f.openReviewPoints} review point(s) are still open.` };
  if (f.reviewOutstanding) return { ok: false, reason: "The required checker has not approved this task yet." };
  if (f.requiresSignoff && !f.signoffRecorded) return { ok: false, reason: "Partner sign-off is required before filing." };
  if (f.requiresUdin && !f.udin) return { ok: false, reason: "Record the UDIN before closing this task." };
  return { ok: true, status: f.effectiveDueDate && f.filedDate > f.effectiveDueDate ? "FILED_LATE" : "FILED" };
}

/** Not Applicable: Manager/Partner/Admin only (checked by the service), always with a reason, never on a filed task. */
export function checkNotApplicable(status: TaskStatus, reason: string): Check {
  if (status === "FILED" || status === "FILED_LATE") return { ok: false, reason: "A filed task cannot be marked Not Applicable." };
  if (status === "NOT_APPLICABLE") return { ok: false, reason: "Already Not Applicable." };
  if (!reason.trim()) return { ok: false, reason: "Give a reason." };
  return { ok: true, status: "NOT_APPLICABLE" };
}

export type DisplayState = "FILED" | "FILED_LATE" | "NOT_APPLICABLE" | "OVERDUE" | "DUE_TODAY" | "AT_RISK" | "PENDING_FROM_CLIENT" | "ON_TRACK" | "NO_DATE";

/**
 * Derived, never stored (decisions D-07): what the timeline/board colours mean.
 * At risk = due within `riskDays` and not yet under review or later.
 */
export function displayState(status: TaskStatus, effectiveDueDate: string | null, today: string, riskDays = 3): DisplayState {
  if (status === "FILED" || status === "FILED_LATE" || status === "NOT_APPLICABLE") return status;
  if (!effectiveDueDate) return "NO_DATE";
  const days = diffDays(today, effectiveDueDate);
  if (days < 0) return "OVERDUE";
  if (days === 0) return "DUE_TODAY";
  if (status === "PENDING_FROM_CLIENT") return "PENDING_FROM_CLIENT";
  if (days <= riskDays && status !== "UNDER_REVIEW") return "AT_RISK";
  return "ON_TRACK";
}
