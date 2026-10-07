"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as dms from "@/server/services/dms/service";
import { generateFromTemplate } from "@/server/services/doc-templates/service";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, opt, bool } from "../registers/_lib/form";

async function fileFrom(f: FormData, key = "file") {
  const file = f.get(key);
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, data: Buffer.from(await file.arrayBuffer()) };
}

export async function uploadAction(ctx: { clientId: string; engagementId?: string | null; periodKey?: string | null }, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const file = await fileFrom(f);
    if (!file) return { ok: false, error: "Choose a file.", fieldErrors: { file: "Required" } };
    await dms.uploadDocument(actor, {
      clientId: ctx.clientId, engagementId: ctx.engagementId ?? null, periodKey: opt(f, "periodKey") ?? ctx.periodKey ?? null,
      name: opt(f, "name"), kind: str(f, "kind") || "OTHER", confidentiality: (str(f, "confidentiality") || "NORMAL") as "NORMAL",
      tags: str(f, "tags"), auditSectionCode: opt(f, "auditSectionCode"), note: str(f, "note"),
    }, file);
    revalidatePath("/documents");
    return { ok: true, message: "Uploaded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function newVersionAction(docId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const file = await fileFrom(f);
    if (!file) return { ok: false, error: "Choose a file.", fieldErrors: { file: "Required" } };
    if (bool(f, "checkIn")) await dms.checkIn(actor, docId, file, str(f, "note"));
    else await dms.addVersion(actor, docId, file, str(f, "note"));
    revalidatePath(`/documents/${docId}`);
    return { ok: true, message: "New version saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function checkOutAction(docId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await dms.checkOut(actor, docId);
    revalidatePath(`/documents/${docId}`);
    return { ok: true, message: "Checked out to you." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function checkInAction(docId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await dms.checkIn(actor, docId, null);
    revalidatePath(`/documents/${docId}`);
    return { ok: true, message: "Checked in." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function forceReleaseAction(docId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await dms.forceRelease(actor, docId, str(f, "reason"));
    revalidatePath(`/documents/${docId}`);
    return { ok: true, message: "Check-out released." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateDocumentAction(docId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const input: Parameters<typeof dms.updateDocument>[2] = { name: str(f, "name"), kind: str(f, "kind"), tags: str(f, "tags") };
    if (f.has("confidentiality")) input.confidentiality = str(f, "confidentiality") as "NORMAL";
    if (f.has("auditSectionCode")) input.auditSectionCode = opt(f, "auditSectionCode");
    if (f.has("sharedWithClientField")) input.sharedWithClient = bool(f, "sharedWithClient");
    await dms.updateDocument(actor, docId, input);
    revalidatePath(`/documents/${docId}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveDocumentAction(docId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await dms.archiveDocument(actor, docId, str(f, "reason"));
    revalidatePath("/documents");
    return { ok: true, message: "Archived." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function auditSectionAction(sectionId: string, input: { complete?: boolean; required?: boolean }): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await dms.updateAuditSection(actor, sectionId, input);
    revalidatePath("/documents");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function generateAction(ctx: { clientId: string; engagementId?: string | null }, _: ActionResult<{ documentId: string | null; missing: string[] }>, f: FormData): Promise<ActionResult<{ documentId: string | null; missing: string[] }>> {
  const actor = await requireStaff();
  try {
    const extra: Record<string, string> = {};
    for (const [k, v] of f.entries()) if (k.startsWith("extra_") && typeof v === "string" && v.trim()) extra[k.slice(6)] = v.trim();
    const format = str(f, "format");
    const out = await generateFromTemplate(actor, {
      code: str(f, "code"), clientId: ctx.clientId, engagementId: ctx.engagementId ?? null, format: format === "PDF" || format === "DOCX" ? format : undefined,
      fileName: opt(f, "fileName") ?? undefined, extra, tags: str(f, "tags") || "draft",
    });
    revalidatePath("/documents");
    return {
      ok: true,
      data: { documentId: out.documentId, missing: out.missing },
      message: out.missing.length ? `Generated and filed. Fill these gaps before sending: ${out.missing.join(", ")}` : "Generated and filed.",
    };
  } catch (e) {
    return toActionError(e);
  }
}
