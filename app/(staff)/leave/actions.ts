"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/leave/service";
import { bulkReassign, bulkChangeChecker } from "@/server/services/tasks/service";
import { toActionError, type ActionResult } from "@/lib/action";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function applyLeaveAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.applyLeave(actor, {
      leaveType: s(f, "leaveType") as never, reason: s(f, "reason") as never, note: s(f, "note"),
      fromDate: s(f, "fromDate"), toDate: s(f, "toDate") || s(f, "fromDate"),
      halfDayStart: f.get("halfDayStart") === "on", halfDayEnd: f.get("halfDayEnd") === "on",
    });
    revalidatePath("/leave");
    return { ok: true, message: "Leave applied. Your approver has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelLeaveAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.cancelLeave(actor, id);
    revalidatePath("/leave");
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideLeaveAction(id: string, approve: boolean, note: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.decideLeave(actor, id, approve, note);
    revalidatePath("/leave");
    return { ok: true, message: approve ? "Approved." : "Rejected." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Reassign one task that falls due during the leave (spec 11.3 shortcut on the approval screen). */
export async function reassignTaskAction(taskId: string, userId: string, role: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    if (!userId) return { ok: false, error: "Choose a person." };
    // Replace the role that clashes with the leave: the checker stays maker-independent (maker ≠ checker).
    const roles = role.split(",").map((r) => r.trim());
    if (roles.some((r) => r === "ASSIGNEE" || r === "MAKER")) await bulkReassign(actor, [taskId], userId);
    if (roles.includes("CHECKER")) await bulkChangeChecker(actor, [taskId], userId);
    revalidatePath("/leave");
    return { ok: true, message: "Reassigned." };
  } catch (e) {
    return toActionError(e);
  }
}
