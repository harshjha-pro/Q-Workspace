"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/work/service";
import { toActionError, type ActionResult } from "@/lib/action";
import { addDays, weekStart, formatDate } from "@/server/lib/dates";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export type WorkTarget = Awaited<ReturnType<typeof svc.workTargets>>[number];

/** Engagements, stages and open tasks for the chosen client (Add Work picker). */
export async function workTargetsAction(clientId: string): Promise<ActionResult<WorkTarget[]>> {
  const actor = await requireStaff();
  try {
    return { ok: true, data: await svc.workTargets(actor, clientId) };
  } catch (e) {
    return toActionError(e);
  }
}

export type SaveResult = { created: number; warnings: string[]; budget: svc.BudgetInfo | null };

export async function saveWorkAction(input: svc.EntryInput): Promise<ActionResult<SaveResult>> {
  const actor = await requireStaff();
  try {
    const r = await svc.createEntries(actor, { ...input, source: "WEB" });
    revalidatePath("/work");
    return { ok: true, data: r, message: r.created ? `Saved ${r.created} entr${r.created === 1 ? "y" : "ies"}.` : r.warnings[0] ?? "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateEntryAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateEntry(actor, id, { minutes: Number(s(f, "minutes")), description: s(f, "description") });
    revalidatePath("/work");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteEntryAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.deleteEntry(actor, id);
    revalidatePath("/work");
    return { ok: true, message: "Deleted." };
  } catch (e) {
    return toActionError(e);
  }
}

function copyMessage(r: { created: number; skipped: string[] }) {
  const skipped = r.skipped.length ? ` Skipped (locked, Sunday or future): ${r.skipped.map(formatDate).join(", ")}.` : "";
  return `Copied ${r.created} entr${r.created === 1 ? "y" : "ies"}.${skipped}`;
}

export async function copyEntryAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await svc.copyEntries(actor, "ENTRY", id, [s(f, "to")]);
    revalidatePath("/work");
    return { ok: true, message: copyMessage(r) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function copyDayAction(from: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await svc.copyEntries(actor, "DAY", from, s(f, "to"));
    revalidatePath("/work");
    return { ok: true, message: copyMessage(r) };
  } catch (e) {
    return toActionError(e);
  }
}

/** Copy the week containing `from` into the following week. */
export async function copyWeekAction(from: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const r = await svc.copyEntries(actor, "WEEK", from, addDays(weekStart(from), 7));
    revalidatePath("/work");
    return { ok: true, message: copyMessage(r) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestCorrectionAction(entryId: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const minutes = s(f, "minutes");
    const description = s(f, "description");
    await svc.requestCorrection(actor, entryId, {
      minutes: minutes === "" ? undefined : Number(minutes),
      description: description === "" ? undefined : description,
      reason: s(f, "reason"),
    });
    revalidatePath("/work");
    revalidatePath("/work/corrections");
    return { ok: true, message: "Correction requested. Your approver has been notified." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideCorrectionAction(id: string, approve: boolean, note: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.decideCorrection(actor, id, approve, note);
    revalidatePath("/work/corrections");
    return { ok: true, message: approve ? "Approved." : "Rejected." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function startTimerAction(target: { clientId: string | null; engagementId: string | null; taskId: string | null }): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.startTimer(actor, target);
    revalidatePath("/work");
    return { ok: true, message: "Timer started." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function stopTimerAction(description: string): Promise<ActionResult<SaveResult & { minutes: number }>> {
  const actor = await requireStaff();
  try {
    const r = await svc.stopTimer(actor, description);
    revalidatePath("/work");
    return { ok: true, data: r, message: "Timer stopped and entry saved." };
  } catch (e) {
    return toActionError(e);
  }
}
