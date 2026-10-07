"use server";
import { acceptPortalInvite } from "@/server/services/portal/accounts";
import { toActionError, type ActionResult } from "@/lib/action";

export async function acceptInviteAction(token: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    await acceptPortalInvite(token, String(form.get("password") ?? ""), String(form.get("confirm") ?? ""));
    return { ok: true, message: "Password saved. You can sign in now." };
  } catch (e) {
    return toActionError(e);
  }
}
