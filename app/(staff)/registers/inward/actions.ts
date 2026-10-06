"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/registers/inward";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, opt } from "../_lib/form";

export async function recordInwardAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.recordInwardOutward(actor, {
      clientId: str(f, "clientId"), direction: str(f, "direction") as never, documentDesc: str(f, "documentDesc"), date: str(f, "date"),
      currentLocation: str(f, "currentLocation"), custodianUserId: opt(f, "custodianUserId"), notes: str(f, "notes"),
    });
    revalidatePath("/registers/inward");
    return { ok: true, message: "Recorded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveDocumentAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.moveDocument(actor, id, { currentLocation: str(f, "currentLocation"), custodianUserId: opt(f, "custodianUserId") });
    revalidatePath("/registers/inward");
    return { ok: true, message: "Location updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markReturnedAction(id: string, _: ActionResult, _f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.markReturned(actor, id);
    revalidatePath("/registers/inward");
    return { ok: true, message: "Marked returned." };
  } catch (e) {
    return toActionError(e);
  }
}
