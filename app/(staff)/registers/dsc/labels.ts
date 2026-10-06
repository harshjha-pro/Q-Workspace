/** Display words for the DSC register (pure module: safe for server and client). */
import type { BadgeTone } from "@/components/ui/badge";

export const HOLDER_TYPES = ["DIRECTOR", "PARTNER", "INDIVIDUAL", "AUTHORISED_SIGNATORY"] as const;
export const DSC_TYPES = ["SIGNING", "ENCRYPTION", "COMBO"] as const;
export const CUSTODY_LABELS: Record<string, string> = { OFFICE: "Office", CLIENT: "With client", STAFF: "With staff" };
export const DSC_TYPE_LABELS: Record<string, string> = { SIGNING: "Signing", ENCRYPTION: "Encryption", COMBO: "Signing + encryption" };
export const HOLDER_TYPE_LABELS: Record<string, string> = { DIRECTOR: "Director", PARTNER: "Partner", INDIVIDUAL: "Individual", AUTHORISED_SIGNATORY: "Authorised signatory" };

export function expiryBadge(state: string, days: number): { tone: BadgeTone; text: string } {
  if (state === "EXPIRED") return { tone: "red", text: `Expired ${-days} days ago` };
  if (state === "CRITICAL") return { tone: "red", text: days === 0 ? "Expires today" : `Expires in ${days} days` };
  if (state === "SOON") return { tone: "amber", text: `Expires in ${days} days` };
  return { tone: "green", text: "Valid" };
}
