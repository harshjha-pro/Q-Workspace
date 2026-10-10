"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { buildMis } from "@/server/services/analytics/mis";
import { toActionError, type ActionResult } from "@/lib/action";

export async function buildMisAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await buildMis(actor, String(f.get("month") ?? ""));
    revalidatePath("/analytics/mis");
    return { ok: true, message: `MIS for ${r.label} built${r.version > 1 ? ` (version ${r.version})` : ""}.` };
  } catch (e) {
    return toActionError(e);
  }
}
