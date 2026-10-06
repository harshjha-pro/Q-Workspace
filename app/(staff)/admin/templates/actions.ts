"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as templates from "@/server/services/templates/service";

const PATH = "/admin/templates";

export type StageDraft = { name: string; reviewLevel: "NONE" | "SENIOR" | "MANAGER" | "PARTNER"; isClientApproval: boolean; isFiling: boolean; requiresUdin: boolean; requiresDsc: boolean };

export async function createDraftAction(templateId: string, input: { stages: StageDraft[]; note: string }): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const v = await templates.createDraft(actor, templateId, input);
    revalidatePath(PATH);
    return { ok: true, message: `Draft v${v.version} saved. A Partner must publish it.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function discardDraftAction(versionId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await templates.discardDraft(actor, versionId);
    revalidatePath(PATH);
    return { ok: true, message: "Draft discarded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishVersionAction(versionId: string, opts: { moveOpenTasks: boolean; mapping: Record<number, number> }): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await templates.publishVersion(actor, versionId, opts.moveOpenTasks ? opts : { moveOpenTasks: false });
    revalidatePath(PATH);
    return { ok: true, message: opts.moveOpenTasks ? `Published. ${r.moved} open task(s) moved to the new version.` : "Published. Open tasks stay on their current version." };
  } catch (e) {
    return toActionError(e);
  }
}
