"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import { parseInrToPaise } from "@/server/lib/money";
import { setCostRate } from "@/server/services/payroll/cost-rates";

export async function setCostRateAction(designationId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const rate = parseInrToPaise(String(f.get("rate") ?? ""));
    await setCostRate(actor, { designationId, ratePaisePerHour: rate ?? -1, effectiveFrom: String(f.get("effectiveFrom") ?? "") });
    revalidatePath("/hr/cost-rates");
    return { ok: true, message: "Rate saved." };
  } catch (e) {
    return toActionError(e);
  }
}
