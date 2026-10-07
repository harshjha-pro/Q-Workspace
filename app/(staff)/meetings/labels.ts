import type { BadgeTone } from "@/components/ui/badge";

export const MEETING_STATUS_LABELS: Record<string, string> = { SCHEDULED: "Scheduled", HELD: "Held", CANCELLED: "Cancelled" };
export const MEETING_STATUS_TONE: Record<string, BadgeTone> = { SCHEDULED: "blue", HELD: "green", CANCELLED: "neutral" };
