"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/registers/udin";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, opt } from "../_lib/form";

export async function recordUdinAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.recordUdin(actor, id, { udin: str(f, "udin"), generatedOn: str(f, "generatedOn"), signedDocumentId: opt(f, "signedDocumentId") });
    revalidatePath("/registers/udin");
    return { ok: true, message: "UDIN recorded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeUdinAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.revokeUdin(actor, id, str(f, "reason"));
    revalidatePath("/registers/udin");
    return { ok: true, message: "UDIN marked revoked." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reconcileUdinsAction(ids: string[]): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    if (!ids.length) return { ok: false, error: "Select at least one UDIN." };
    await svc.reconcileUdins(actor, ids);
    revalidatePath("/registers/udin");
    return { ok: true, message: "Marked as reconciled." };
  } catch (e) {
    return toActionError(e);
  }
}
