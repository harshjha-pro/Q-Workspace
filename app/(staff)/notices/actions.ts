"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/registers/notices";
import { toActionError, type ActionResult } from "@/lib/action";
import { parseInrToPaise } from "@/server/lib/money";
import { str, opt, bool } from "../registers/_lib/form";

/** "" → undefined; an unreadable amount → -1 so the service's min(0) check flags the field. */
function rupees(v: string): number | undefined {
  if (!v) return undefined;
  const p = parseInrToPaise(v);
  return p === null ? -1 : p / 100;
}

export async function createNoticeAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.createNotice(actor, {
      clientId: str(f, "clientId"), authority: str(f, "authority") as never, ayOrPeriod: str(f, "ayOrPeriod"), noticeType: str(f, "noticeType"),
      section: str(f, "section"), referenceNo: str(f, "referenceNo"), noticeDate: opt(f, "noticeDate"), receivedDate: str(f, "receivedDate"),
      responseDueDate: opt(f, "responseDueDate"), assigneeId: opt(f, "assigneeId"), reviewerId: opt(f, "reviewerId"),
      summary: str(f, "summary"), demandRupees: rupees(str(f, "demand")), createTask: bool(f, "createTask"),
    });
    revalidatePath("/notices");
    return { ok: true, message: "Notice recorded." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateNoticeAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const input: Parameters<typeof svc.updateNotice>[2] = {
      status: str(f, "status") as never, outcome: str(f, "outcome"), demandStatus: str(f, "demandStatus") as never,
      summary: str(f, "summary"), assigneeId: opt(f, "assigneeId"), reviewerId: opt(f, "reviewerId"),
    };
    const due = str(f, "responseDueDate");
    if (due) input.responseDueDate = due;
    const demand = rupees(str(f, "demand"));
    input.demandRupees = demand ?? 0;
    await svc.updateNotice(actor, id, input);
    revalidatePath(`/notices/${id}`);
    revalidatePath("/notices");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addHearingAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.addHearing(actor, id, { date: str(f, "date"), kind: str(f, "kind") as never, notes: str(f, "notes"), outcome: str(f, "outcome") });
    revalidatePath(`/notices/${id}`);
    revalidatePath("/notices");
    return { ok: true, message: "Hearing recorded." };
  } catch (e) {
    return toActionError(e);
  }
}
