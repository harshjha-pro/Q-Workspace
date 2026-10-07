"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { closeEngagement } from "@/server/services/lifecycle/archive";
import { toActionError, type ActionResult } from "@/lib/action";

export async function closeEngagementAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const reason = String(f.get("overrideReason") ?? "").trim();
    const r = await closeEngagement(actor, id, reason ? { overrideReason: reason } : {});
    revalidatePath(`/archive/${id}`);
    revalidatePath("/archive");
    const follow = [r.feedbackRequested ? "feedback request" : "", r.renewalReminder ? "renewal reminder" : ""].filter(Boolean).join(" and ");
    return { ok: true, message: `Engagement closed and archived.${follow ? ` A ${follow} was raised for the Manager and Partner.` : ""}` };
  } catch (e) {
    return toActionError(e);
  }
}
