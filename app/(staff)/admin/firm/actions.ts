"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { updateFirmProfile } from "@/server/services/billing/service";
import { toActionError, type ActionResult } from "@/lib/action";

const FIELDS = ["name", "address", "stateCode", "gstin", "pan", "email", "phone", "bankName", "bankAccount", "bankIfsc", "upiId", "invoiceNote"] as const;

export async function saveFirmProfileAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const input = Object.fromEntries(FIELDS.map((k) => [k, String(f.get(k) ?? "")])) as Record<(typeof FIELDS)[number], string>;
    await updateFirmProfile(actor, input);
    revalidatePath("/admin/firm");
    return { ok: true, message: "Firm profile saved." };
  } catch (e) {
    return toActionError(e);
  }
}
