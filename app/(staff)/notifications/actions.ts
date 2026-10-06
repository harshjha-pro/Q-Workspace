"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import { markRead, savePreferences } from "@/server/services/notifications/service";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function markAllReadAction(): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await markRead(actor);
    revalidatePath("/", "layout");
    return { ok: true, message: "All marked as read." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function savePreferencesAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const quietFrom = String(f.get("quietFrom") ?? "").trim();
    const quietTo = String(f.get("quietTo") ?? "").trim();
    const fieldErrors: Record<string, string> = {};
    if (quietFrom && !HHMM.test(quietFrom)) fieldErrors.quietFrom = "Use HH:MM (24-hour)";
    if (quietTo && !HHMM.test(quietTo)) fieldErrors.quietTo = "Use HH:MM (24-hour)";
    if (Boolean(quietFrom) !== Boolean(quietTo)) fieldErrors[quietFrom ? "quietTo" : "quietFrom"] = "Give both times, or leave both empty";
    if (Object.keys(fieldErrors).length) return { ok: false, error: "Check the quiet hours.", fieldErrors };
    await savePreferences(actor, {
      quietFrom: quietFrom || null,
      quietTo: quietTo || null,
      browserEnabled: f.get("browserEnabled") === "on",
      mutedKinds: f.getAll("muted").map(String),
    });
    revalidatePath("/notifications");
    return { ok: true, message: "Preferences saved." };
  } catch (e) {
    return toActionError(e);
  }
}
