"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/engagements/service";
import { toActionError, type ActionResult } from "@/lib/action";
import { parseInrToPaise } from "@/server/lib/money";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const rupees = (v: string) => (v ? parseInrToPaise(v) ?? -1 : 0);
const hours = (v: string) => Math.round(Number(v || 0) * 60);

export async function createEngagementAction(_: ActionResult<{ id: string }>, f: FormData): Promise<ActionResult<{ id: string }>> {
  const actor = await requireStaff();
  try {
    const e = await svc.createEngagement(actor, {
      clientId: s(f, "clientId"), name: s(f, "name"), serviceLine: s(f, "serviceLine") as never, engagementType: s(f, "engagementType"),
      recurrence: s(f, "recurrence") as never, feeBasis: s(f, "feeBasis") as never, feePaise: rupees(s(f, "fee")), ratePaisePerHour: rupees(s(f, "rate")),
      budgetMinutes: hours(s(f, "budgetHours")), chargeable: f.get("chargeable") === "on", startDate: s(f, "startDate"), endDate: s(f, "endDate"),
      eqrRequired: f.get("eqrRequired") === "on",
    });
    revalidatePath("/engagements");
    return { ok: true, data: { id: e.id }, message: "Created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateEngagementAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const input: Record<string, unknown> = { name: s(f, "name"), status: s(f, "status"), budgetMinutes: hours(s(f, "budgetHours")), endDate: s(f, "endDate"), eqrRequired: f.get("eqrRequired") === "on" };
    if (f.has("fee")) Object.assign(input, { feeBasis: s(f, "feeBasis"), feePaise: rupees(s(f, "fee")), ratePaisePerHour: rupees(s(f, "rate")), chargeable: f.get("chargeable") === "on" });
    await svc.updateEngagement(actor, id, input as never);
    revalidatePath(`/engagements/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function assignAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.assignToEngagement(actor, id, { userId: s(f, "userId"), role: s(f, "role") as never });
    revalidatePath(`/engagements/${id}`);
    return { ok: true, message: "Assigned." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function endAssignmentAction(engagementId: string, assignmentId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.endEngagementAssignment(actor, assignmentId);
    revalidatePath(`/engagements/${engagementId}`);
    return { ok: true, message: "Removed." };
  } catch (e) {
    return toActionError(e);
  }
}
