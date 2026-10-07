"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { recordFirmObligation } from "@/server/services/firm-compliance/service";
import { toActionError, type ActionResult } from "@/lib/action";

export async function recordFirmObligationAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const s = (k: string) => String(f.get(k) ?? "").trim();
    await recordFirmObligation(actor, { typeCode: s("typeCode"), periodLabel: s("periodLabel"), dueDate: s("dueDate"), ownerId: s("ownerId") || null, note: s("note") });
    revalidatePath("/firm-compliance");
    return { ok: true, message: "Obligation added to the firm's calendar." };
  } catch (e) {
    return toActionError(e);
  }
}
