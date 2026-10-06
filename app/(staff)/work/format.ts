/** Client-safe display helpers for the work pages. Hours are effort only: "6 hrs logged", never "6/8". */
export { formatMinutes } from "@/server/lib/money";
export { formatDate } from "@/server/lib/dates";

export const OUTCOME_TYPES = ["ARN", "SRN", "ITR_ACK", "CIN", "TOKEN"] as const;
export const OUTCOME_LABELS: Record<(typeof OUTCOME_TYPES)[number], string> = {
  ARN: "ARN", SRN: "SRN (MCA)", ITR_ACK: "ITR acknowledgement", CIN: "CIN (challan)", TOKEN: "Token number",
};

/** 15 min … 12 hrs in 15-minute steps, for edit/correction pickers. */
export const MINUTE_STEPS = Array.from({ length: 48 }, (_, i) => (i + 1) * 15);

/** "Mon 5 Oct" for compact day chips. */
export function shortDay(d: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
}
