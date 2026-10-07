"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/meetings/service";
import { toActionError, type ActionResult } from "@/lib/action";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const all = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

export async function scheduleMeetingAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id: string;
  try {
    const m = await svc.scheduleMeeting(actor, {
      clientId: s(f, "clientId"), engagementId: s(f, "engagementId") || null, title: s(f, "title"), scheduledAt: `${s(f, "date")}T${s(f, "time")}`,
      durationMinutes: Number(s(f, "durationMinutes") || 60), location: s(f, "location"), agenda: s(f, "agenda"), userIds: all(f, "userIds"), contactIds: all(f, "contactIds"),
    });
    id = m.id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/meetings/${id}`);
}

export async function saveMinutesAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateMeeting(actor, id, { notes: String(f.get("notes") ?? ""), ...(f.get("markHeld") === "on" ? { status: "HELD" as const } : {}) });
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: "Minutes saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rescheduleAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateMeeting(actor, id, { title: s(f, "title"), scheduledAt: `${s(f, "date")}T${s(f, "time")}`, durationMinutes: Number(s(f, "durationMinutes") || 60), location: s(f, "location"), agenda: String(f.get("agenda") ?? "") });
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: "Meeting updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setMeetingStatusAction(id: string, status: "SCHEDULED" | "HELD" | "CANCELLED"): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.updateMeeting(actor, id, { status });
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: "Status updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addActionItemAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.addActionItem(actor, id, { title: s(f, "title"), ownerId: s(f, "ownerId"), dueDate: s(f, "dueDate") });
    revalidatePath(`/meetings/${id}`);
    return { ok: true, message: "Action item added and a task created." };
  } catch (e) {
    return toActionError(e);
  }
}
