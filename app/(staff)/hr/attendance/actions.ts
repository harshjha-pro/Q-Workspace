"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as att from "@/server/services/attendance/service";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function checkInAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await att.checkIn(actor, { clientId: s(f, "clientId") || null, note: [s(f, "note"), s(f, "geo")].filter(Boolean).join(" · ") });
    revalidatePath("/hr/attendance");
    return { ok: true, message: "Checked in at client site for today." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestRegularisationAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await att.requestRegularisation(actor, { date: s(f, "date"), requestedStatus: s(f, "requestedStatus") as "PRESENT", reason: s(f, "reason") });
    revalidatePath("/hr/attendance");
    return { ok: true, message: "Sent to your manager." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideRegularisationAction(id: string, approve: boolean): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await att.decideRegularisation(actor, id, approve);
    revalidatePath("/hr/attendance");
    return { ok: true, message: approve ? "Approved." : "Rejected." };
  } catch (e) {
    return toActionError(e);
  }
}
