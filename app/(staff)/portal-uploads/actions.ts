"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import { linkPortalUpload } from "@/server/services/portal/uploads";

export async function linkUploadAction(uploadId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    await linkPortalUpload(await requireStaff(), uploadId, String(f.get("checklistItemId") ?? ""));
    revalidatePath("/portal-uploads");
    return { ok: true, message: "Linked. Confirm it on the task once checked." };
  } catch (e) {
    return toActionError(e);
  }
}
