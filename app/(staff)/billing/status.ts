import type { BadgeTone } from "@/components/ui/badge";

export function invoiceTone(status: string): BadgeTone {
  return ({ DRAFT: "neutral", RAISED: "blue", PARTLY_RECEIVED: "amber", FULLY_RECEIVED: "green", WRITTEN_OFF: "violet", CANCELLED: "red" } as Record<string, BadgeTone>)[status] ?? "neutral";
}
export function disbursementTone(status: string): BadgeTone {
  return ({ UNRECOVERED: "amber", ADDED_TO_INVOICE: "blue", RECOVERED: "green" } as Record<string, BadgeTone>)[status] ?? "neutral";
}
