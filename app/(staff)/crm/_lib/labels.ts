import type { BadgeTone } from "@/components/ui/badge";

/** Status words and colours for CRM screens (pure; safe for client components). */
export const STAGE_TONE: Record<string, BadgeTone> = {
  NEW: "neutral", CONTACTED: "blue", MEETING: "violet", PROPOSAL_SENT: "amber", WON: "green", LOST: "red", ON_HOLD: "neutral",
};
export const PROPOSAL_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral", APPROVED: "blue", SENT: "amber", ACCEPTED: "green", REJECTED: "red", EXPIRED: "neutral", SUPERSEDED: "neutral",
};
export const LETTER_TONE: Record<string, BadgeTone> = { DRAFT: "neutral", ISSUED: "amber", ACCEPTED: "green", SIGNED_UPLOADED: "green", WITHDRAWN: "neutral" };
export const RENEWAL_TONE: Record<string, BadgeTone> = { DUE: "amber", PROPOSED: "blue", APPROVED: "green", LETTER_ISSUED: "green", DECLINED: "neutral" };
export const words = (v: string) => {
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const STAGES = [
  ["NEW", "New"], ["CONTACTED", "Contacted"], ["MEETING", "Meeting"], ["PROPOSAL_SENT", "Proposal sent"], ["WON", "Won"], ["LOST", "Lost"], ["ON_HOLD", "On hold"],
] as const;
export const SOURCES = [["REFERRAL", "Referral"], ["EXISTING_CLIENT", "Existing client"], ["WEBSITE", "Website"], ["EVENT", "Event"], ["OTHER", "Other"]] as const;
export const ACTIVITY_KINDS = [["CALL", "Call"], ["MEETING", "Meeting"], ["EMAIL", "Email"], ["WHATSAPP", "WhatsApp"], ["NOTE", "Note"]] as const;
export const SERVICE_LINES = [
  ["ACCOUNTING", "Accounting"], ["AUDIT", "Audit & Assurance"], ["DIRECT_TAX", "Direct Tax"], ["GST", "Indirect Tax (GST)"], ["COMPANY_LAW", "Company Law & Secretarial"], ["ADVISORY", "Advisory & Other"],
] as const;
export const CONSTITUTIONS = [
  ["INDIVIDUAL", "Individual"], ["HUF", "HUF"], ["PROPRIETORSHIP", "Proprietorship"], ["PARTNERSHIP", "Partnership Firm"], ["LLP", "LLP"], ["PRIVATE_COMPANY", "Private Company"],
  ["PUBLIC_COMPANY", "Public Company"], ["TRUST", "Trust"], ["SOCIETY", "Society"], ["OTHER", "Other"],
] as const;
export const FEE_BASES = [["FIXED", "Fixed"], ["RETAINER", "Recurring retainer"], ["TIME", "Time-based"]] as const;
/** Paise → "125000.5" for an input's defaultValue. */
export const rupeesInput = (p: number) => (p ? String(p / 100) : "");
