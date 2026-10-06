/** Display words for notice values (pure module: safe for server and client). */
import type { BadgeTone } from "@/components/ui/badge";

export const AUTHORITY_LABELS: Record<string, string> = {
  INCOME_TAX: "Income Tax", GST: "GST", TDS_TRACES: "TDS / TRACES", MCA_ROC: "MCA / ROC", OTHER: "Other",
};
export const NOTICE_STATUS_LABELS: Record<string, string> = { OPEN: "Open", RESPONDED: "Responded", HEARING: "Hearing", CLOSED: "Closed" };
export const NOTICE_STATUS_TONE: Record<string, BadgeTone> = { OPEN: "amber", RESPONDED: "blue", HEARING: "violet", CLOSED: "neutral" };
export const DEMAND_STATUSES = ["NONE", "RAISED", "DROPPED", "REDUCED", "PAID"] as const;
export const DEMAND_LABELS: Record<string, string> = { NONE: "No demand", RAISED: "Raised", DROPPED: "Dropped", REDUCED: "Reduced", PAID: "Paid" };

/** Response-due colour: red once past, amber within 3 days. `days` = due − today. */
export function dueTone(days: number | null): "red" | "amber" | null {
  if (days === null) return null;
  return days < 0 ? "red" : days <= 3 ? "amber" : null;
}
