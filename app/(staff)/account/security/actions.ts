"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { changeOwnPassword, beginTotpEnrolment, confirmTotpEnrolment } from "@/server/services/users/service";
import { toActionError, type ActionResult } from "@/lib/action";

export async function changePasswordAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff({ allowPending: true });
  try {
    if (form.get("next") !== form.get("confirm")) return { ok: false, error: "The two new passwords do not match.", fieldErrors: { confirm: "Does not match" } };
    await changeOwnPassword(actor, String(form.get("current") ?? ""), String(form.get("next") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Password changed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function beginTotpAction(): Promise<ActionResult<{ qr: string; secret: string }>> {
  const actor = await requireStaff({ allowPending: true });
  try {
    const r = await beginTotpEnrolment(actor);
    return { ok: true, data: { qr: r.qrDataUrl, secret: r.secret } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmTotpAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff({ allowPending: true });
  try {
    await confirmTotpEnrolment(actor, String(form.get("code") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Two-factor login is on." };
  } catch (e) {
    return toActionError(e);
  }
}
