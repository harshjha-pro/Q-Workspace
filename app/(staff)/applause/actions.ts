"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { giveApplause, type BadgeCode } from "@/server/services/applause/service";
import { toActionError, type ActionResult } from "@/lib/action";

export async function giveApplauseAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await giveApplause(actor, { toUserId: String(f.get("toUserId") ?? ""), badgeCode: String(f.get("badgeCode") ?? "") as BadgeCode, message: String(f.get("message") ?? "") });
    revalidatePath("/applause");
    return { ok: true, message: "Applause sent." };
  } catch (e) {
    return toActionError(e);
  }
}
