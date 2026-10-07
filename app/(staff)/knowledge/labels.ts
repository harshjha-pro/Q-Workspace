import type { BadgeTone } from "@/components/ui/badge";

export const KIND_LABELS: Record<string, string> = { CIRCULAR: "Circular", NOTIFICATION: "Notification", EXTENSION: "Due-date extension", SOP: "Internal SOP", FAQ: "FAQ" };
export const KIND_TONE: Record<string, BadgeTone> = { CIRCULAR: "blue", NOTIFICATION: "violet", EXTENSION: "amber", SOP: "green", FAQ: "brand" };
export const SERVICE_LINE_LABELS: Record<string, string> = { ACCOUNTING: "Accounting", AUDIT: "Audit", DIRECT_TAX: "Direct tax", GST: "GST", COMPANY_LAW: "Company law", ADVISORY: "Advisory" };
