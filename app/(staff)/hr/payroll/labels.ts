import type { BadgeTone } from "@/components/ui/badge";
import { formatInr } from "@/server/lib/money";

export const RUN_STATUS_TONE: Record<string, BadgeTone> = { DRAFT: "amber", REVIEWED: "blue", APPROVED: "violet", PAID: "green", LOCKED: "neutral" };
export const RUN_KIND_LABEL: Record<string, string> = { SALARY: "Salary", STIPEND: "Article stipend" };
export const inr = (p: number) => formatInr(p, { forcePaise: false });
export const days = (halfDays: number) => (halfDays % 2 ? `${Math.floor(halfDays / 2)}½` : String(halfDays / 2));
/** Paise → rupee text for form defaults ("12500.5"). */
export const rupeeText = (p: number) => (p % 100 ? (p / 100).toFixed(2) : String(p / 100));
