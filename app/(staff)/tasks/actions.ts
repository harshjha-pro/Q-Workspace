"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import * as tasks from "@/server/services/tasks/service";
import * as review from "@/server/services/review/service";
import * as pending from "@/server/services/pending/service";
import { setManualDueDate } from "@/server/services/compliance/admin";
import { toActionError, type ActionResult } from "@/lib/action";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ids = (f: FormData) => f.getAll("ids").map(String).filter(Boolean);

function touched(taskId?: string) {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

/** Wrap a service call in the standard ActionResult shape. */
async function run(fn: () => Promise<unknown>, message: string, taskId?: string): Promise<ActionResult> {
  try {
    await fn();
    touched(taskId);
    return { ok: true, message };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------------------
// List: bulk actions and one-off tasks (task.bulk)
// ---------------------------------------------------------------------------
export async function bulkReassignAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => tasks.bulkReassign(actor, ids(f), s(f, "userId")), "Reassigned.");
}

export async function bulkCheckerAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => tasks.bulkChangeChecker(actor, ids(f), s(f, "userId")), "Checker changed.");
}

export async function bulkNotApplicableAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => tasks.bulkNotApplicable(actor, ids(f), s(f, "reason")), "Marked not applicable.");
}

export async function createOneOffAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id: string;
  try {
    const t = await tasks.createOneOffTask(actor, {
      clientId: s(f, "clientId"), engagementId: s(f, "engagementId") || null, title: s(f, "title"),
      dueDate: s(f, "dueDate") || null, assigneeId: s(f, "assigneeId") || null,
    });
    id = t.id;
    touched();
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/tasks/${id}`);
}

// ---------------------------------------------------------------------------
// Detail: stages, filing, NA, amendments, tax due, manual due date
// ---------------------------------------------------------------------------
export async function moveStageAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => tasks.moveStage(actor, taskId, Number(s(f, "toIndex")), s(f, "note")), "Stage updated.", taskId);
}

export async function submitForReviewAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.submitForReview(actor, taskId, s(f, "note")), "Sent to the checker.", taskId);
}

export async function recordFilingAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => tasks.recordFiling(actor, taskId, { ackType: s(f, "ackType") || undefined, ackNumber: s(f, "ackNumber"), filedDate: s(f, "filedDate") }), "Filing recorded.", taskId);
}

export async function notApplicableAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => tasks.markNotApplicable(actor, taskId, s(f, "reason")), "Marked not applicable.", taskId);
}

export async function amendmentAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id: string;
  try {
    const n = await tasks.createAmendment(actor, taskId, s(f, "dueDate") || null);
    id = n.id;
    touched(taskId);
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/tasks/${id}`);
}

export async function setTaxDueAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const raw = s(f, "rupees").replace(/,/g, "");
  if (raw && !Number.isFinite(Number(raw))) return { ok: false, error: "Enter the tax amount in rupees.", fieldErrors: { rupees: "Numbers only" } };
  return run(() => tasks.setTaxDue(actor, taskId, raw ? Number(raw) : null), "Tax due saved.", taskId);
}

export async function manualDueDateAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => setManualDueDate(actor, taskId, s(f, "date"), s(f, "reason")), "Due date set.", taskId);
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
export async function approveReviewAction(taskId: string, reviewId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.approveReview(actor, reviewId, s(f, "note")), "Approved.", taskId);
}

export async function returnReviewAction(taskId: string, reviewId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.returnReview(actor, reviewId, s(f, "points").split("\n")), "Returned to the maker.", taskId);
}

export async function respondPointAction(taskId: string, pointId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.respondToPoint(actor, pointId, s(f, "response")), "Response saved.", taskId);
}

export async function clearPointAction(taskId: string, pointId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.clearPoint(actor, pointId), "Cleared.", taskId);
}

export async function raisePointAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.raisePoint(actor, taskId, s(f, "text")), "Point raised.", taskId);
}

export async function signOffAction(taskId: string, level: "PARTNER" | "EQR", _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => review.signOff(actor, taskId, level, s(f, "note")), level === "EQR" ? "EQR recorded." : "Signed off.", taskId);
}

// ---------------------------------------------------------------------------
// Checklist and pending from client
// ---------------------------------------------------------------------------
export async function addChecklistItemAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => pending.addChecklistItem(actor, taskId, s(f, "label")), "Item added.", taskId);
}

export async function updateChecklistItemAction(taskId: string, itemId: string, input: { status?: "NOT_REQUESTED" | "REQUESTED" | "RECEIVED" | "NOT_APPLICABLE"; note?: string; confirm?: boolean }): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => pending.updateChecklistItem(actor, itemId, input), "Updated.", taskId);
}

export async function markAllRequestedAction(taskId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => pending.markAllRequested(actor, taskId), "All items marked requested.", taskId);
}

export async function setPendingAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => pending.setPending(actor, taskId, { what: s(f, "what"), itemIds: f.getAll("itemIds").map(String) }), "Marked pending from client.", taskId);
}

export async function clearPendingAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => pending.clearPending(actor, taskId, s(f, "reason")), "Work resumed.", taskId);
}

export async function logReminderAction(taskId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => pending.logReminder(actor, taskId, { channel: s(f, "channel") as "EMAIL", messageText: s(f, "messageText"), note: s(f, "note") }), "Reminder logged.", taskId);
}
