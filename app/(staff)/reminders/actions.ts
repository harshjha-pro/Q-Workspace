"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as lists from "@/server/services/reminders/due-lists";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function run(fn: () => Promise<unknown>, message: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/reminders");
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markSentAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => lists.markReminderSent(actor, id, { channel: s(f, "channel") as "WHATSAPP", messageText: s(f, "messageText") }), "Marked as sent and logged.");
}

export async function skipAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => lists.skipReminder(actor, id, s(f, "reason")), "Skipped.");
}

export async function saveScheduleAction(id: string | null, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await lists.saveSchedule(actor, {
      name: s(f, "name"), complianceTypeCode: s(f, "complianceTypeCode") || null, dayOfMonth: Number(s(f, "dayOfMonth")), monthsCsv: s(f, "monthsCsv").replace(/\s/g, ""),
      messageText: s(f, "messageText"), escalateAfter: Number(s(f, "escalateAfter") || "3"), active: id ? f.get("active") === "on" : true,
    }, id ?? undefined);
    revalidatePath("/reminders/schedules");
    return { ok: true, message: "Schedule saved." };
  } catch (e) {
    return toActionError(e);
  }
}
