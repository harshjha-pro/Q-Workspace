"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePortal } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import { DomainError } from "@/server/lib/errors";
import * as portal from "@/server/services/portal/actions";
import { recordFeedback } from "@/server/services/crm/feedback";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** The client's IP, recorded with approvals and acceptances (Q-23). */
async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

async function run(fn: () => Promise<unknown>, message: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/portal", "layout");
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

export async function uploadAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requirePortal();
  const file = f.get("file");
  return run(async () => {
    if (!(file instanceof File) || file.size === 0) throw new DomainError("VALIDATION", "Choose a file.", { file: "Required" });
    await portal.portalUpload(actor, { clientId: s(f, "clientId"), checklistItemId: s(f, "checklistItemId"), description: s(f, "description") }, { name: file.name, data: Buffer.from(await file.arrayBuffer()) });
  }, "Uploaded. The firm will check it and confirm.");
}

export async function decideApprovalAction(requestId: string, decision: "APPROVED" | "REJECTED", _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requirePortal();
  const ip = await clientIp();
  return run(() => portal.decideClientApproval(actor, requestId, { decision, comment: s(f, "comment") }, { ip }), decision === "APPROVED" ? "Approved. The firm has been told." : "Sent back to the firm with your comment.");
}

export async function decideProposalAction(proposalId: string, decision: "ACCEPTED" | "REJECTED", _: ActionResult): Promise<ActionResult> {
  const actor = await requirePortal();
  const ip = await clientIp();
  return run(() => portal.portalDecideProposal(actor, proposalId, decision, { ip }), decision === "ACCEPTED" ? "Proposal accepted." : "Proposal declined.");
}

export async function acceptLetterAction(letterId: string, _: ActionResult): Promise<ActionResult> {
  const actor = await requirePortal();
  const ip = await clientIp();
  return run(() => portal.portalAcceptLetter(actor, letterId, { ip }), "Engagement letter accepted.");
}

export async function feedbackAction(feedbackId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requirePortal();
  return run(() => recordFeedback(actor, feedbackId, { rating: Number(s(f, "rating")), comment: s(f, "comment") }), "Thank you for your feedback.");
}
