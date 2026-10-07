"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/doc-templates/service";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, bool } from "../../registers/_lib/form";

export async function createTemplateAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id: string;
  try {
    const t = await svc.createTemplate(actor, { code: str(f, "code"), name: str(f, "name"), category: str(f, "category") as "OTHER", outputFormat: (str(f, "outputFormat") || "PDF") as "PDF", body: str(f, "body") });
    id = t.id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/admin/doc-templates/${id}`);
}

export async function updateMetaAction(templateId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateTemplateMeta(actor, templateId, { name: str(f, "name"), outputFormat: str(f, "outputFormat") as "PDF", active: bool(f, "active") });
    revalidatePath(`/admin/doc-templates/${templateId}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveDraftAction(templateId: string, body: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const v = await svc.saveDraft(actor, templateId, body);
    revalidatePath(`/admin/doc-templates/${templateId}`);
    return { ok: true, message: `Draft version ${v.version} saved.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveAction(templateId: string, versionId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.approveVersion(actor, versionId);
    revalidatePath(`/admin/doc-templates/${templateId}`);
    return { ok: true, message: "Approved. Documents now use this version." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function retireAction(templateId: string, versionId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.retireVersion(actor, versionId, "Retired from the template library");
    revalidatePath(`/admin/doc-templates/${templateId}`);
    return { ok: true, message: "Retired." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function previewAction(input: { templateId: string; body: string; clientId?: string; engagementId?: string; userId?: string; extra?: Record<string, string> }): Promise<ActionResult<{ text: string; missing: string[] }>> {
  const actor = await requireStaff();
  try {
    const r = await svc.previewTemplate(actor, {
      templateId: input.templateId, body: input.body, clientId: input.clientId || null, engagementId: input.engagementId || null, userId: input.userId || null, extra: input.extra,
    });
    return { ok: true, data: r };
  } catch (e) {
    return toActionError(e);
  }
}
