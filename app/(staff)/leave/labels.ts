import type { BadgeTone } from "@/components/ui/badge";

export const LEAVE_TYPE_LABELS: Record<string, string> = { PERSONAL: "Personal leave", SICK: "Sick leave", EXAM_STUDY: "Exam / study leave", OTHER: "Other" };
export const LEAVE_REASON_LABELS: Record<string, string> = { PERSONAL: "Personal", SICK: "Sick", HOLIDAY: "Holiday / travel", EXAM_STUDY: "Exam / study", OTHER: "Other" };
export const LEAVE_STATUS_TONE: Record<string, BadgeTone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "neutral" };

/** 3 half-days → "1½ days". */
export function halfDaysLabel(h: number) {
  const whole = Math.floor(h / 2);
  const half = h % 2 === 1;
  if (whole === 0 && half) return "½ day";
  return `${whole}${half ? "½" : ""} day${whole === 1 && !half ? "" : "s"}`;
}
