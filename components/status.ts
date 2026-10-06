import type { BadgeTone } from "./ui/badge";

/**
 * The one status → colour map used everywhere (brief §10). Pure module: safe for server and client.
 * Task statuses (Phase 2) use the --color-st-* tokens in globals.css with the same meaning.
 */
export function clientStatusTone(status: string): BadgeTone {
  return status === "ACTIVE" ? "green" : status === "DORMANT" ? "amber" : "neutral";
}

export function engagementStatusTone(status: string): BadgeTone {
  return status === "ACTIVE" ? "green" : status === "ON_HOLD" ? "amber" : status === "COMPLETED" ? "blue" : "neutral";
}

export const TASK_STATUS_TONE: Record<string, BadgeTone> = {
  UPCOMING: "neutral", IN_PROGRESS: "blue", PENDING_FROM_CLIENT: "amber", UNDER_REVIEW: "violet", FILED: "green", FILED_LATE: "red", NOT_APPLICABLE: "neutral",
};
