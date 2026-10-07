"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as qc from "@/server/services/qc/service";
import * as insp from "@/server/services/qc/inspections";
import { buildPeerReviewPack } from "@/server/services/qc/peer-review";
import { toActionError, type ActionResult } from "@/lib/action";
import { str, opt, bool } from "../registers/_lib/form";

async function run(fn: () => Promise<unknown>, message: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/qc");
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function startChecklistAction(engagementId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => qc.startChecklist(actor, engagementId), "Checklist started.");
}

export async function answerItemAction(itemId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => qc.answerChecklistItem(actor, itemId, { response: str(f, "response") as "YES", note: str(f, "note") }), "Saved.");
}

export async function completeChecklistAction(checklistId: string, reopen: boolean): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => qc.completeChecklist(actor, checklistId, reopen), reopen ? "Checklist reopened." : "Checklist complete.");
}

export async function assignEqrAction(engagementId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => qc.assignEqrReviewer(actor, engagementId, str(f, "reviewerId")), "EQR reviewer named.");
}

export async function declareAction(engagementId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => qc.declareIndependence(actor, engagementId, { hasConflict: bool(f, "hasConflict"), note: str(f, "note") }), "Declaration recorded.");
}

export async function createInspectionAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const size = str(f, "sampleSize");
  return run(() => insp.createInspection(actor, { name: str(f, "name"), periodFrom: str(f, "periodFrom"), periodTo: str(f, "periodTo"), sampleSize: size ? Number(size) : undefined }), "Inspection created with a random sample.");
}

export async function addFindingAction(inspectionId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => insp.addFinding(actor, inspectionId, {
    engagementId: opt(f, "engagementId"), finding: str(f, "finding"), severity: (str(f, "severity") || "MEDIUM") as "MEDIUM",
    correctiveAction: str(f, "correctiveAction"), ownerId: opt(f, "ownerId"), dueDate: opt(f, "dueDate"),
  }), "Finding recorded.");
}

export async function closeFindingAction(findingId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => insp.closeFinding(actor, findingId, str(f, "note")), "Corrective action closed.");
}

export async function closeInspectionAction(inspectionId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => insp.closeInspection(actor, inspectionId), "Inspection closed.");
}

export async function buildPackAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const pack = await buildPeerReviewPack(actor, { periodFrom: str(f, "from"), periodTo: str(f, "to") });
    revalidatePath("/qc");
    return { ok: true, message: `Pack built: ${pack.engagements} engagement(s), ${pack.files} document(s)${pack.missing.length ? `, ${pack.missing.length} file(s) missing from storage` : ""}.` };
  } catch (e) {
    return toActionError(e);
  }
}
