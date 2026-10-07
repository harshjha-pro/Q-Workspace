"use server";
import { revalidatePath } from "next/cache";
import { requirePortal } from "@/server/context";
import { beginPortalTotp, confirmPortalTotp, disablePortalTotp } from "@/server/services/portal/accounts";
import { toActionError, type ActionResult } from "@/lib/action";

export async function beginPortalTotpAction(): Promise<ActionResult<{ qr: string; secret: string }>> {
  const actor = await requirePortal({ allowPending: true });
  try {
    const r = await beginPortalTotp(actor);
    return { ok: true, data: { qr: r.qrDataUrl, secret: r.secret } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmPortalTotpAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requirePortal({ allowPending: true });
  try {
    await confirmPortalTotp(actor, String(form.get("code") ?? ""));
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Two-factor login is on." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function disablePortalTotpAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requirePortal({ allowPending: true });
  try {
    await disablePortalTotp(actor, String(form.get("code") ?? ""));
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Two-factor login is off." };
  } catch (e) {
    return toActionError(e);
  }
}
