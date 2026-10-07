import type { BadgeTone } from "@/components/ui/badge";

export const CATEGORY_LABELS: Record<string, string> = { BUG: "Bug", HOW_DO_I: "How do I…?", DATA_CORRECTION: "Data correction", ACCESS: "Access issue", HR_QUERY: "HR query", OTHER: "Other" };
export const HR_TOPIC_LABELS: Record<string, string> = { PAYSLIP: "Payslip", LEAVE_BALANCE: "Leave balance", REIMBURSEMENT: "Reimbursement", OTHER_HR: "Other HR matter" };
export const STATUS_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" };
export const STATUS_TONE: Record<string, BadgeTone> = { OPEN: "blue", IN_PROGRESS: "amber", RESOLVED: "green", CLOSED: "neutral" };
