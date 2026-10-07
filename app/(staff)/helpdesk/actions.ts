"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import * as svc from "@/server/services/helpdesk/service";
import { toActionError, type ActionResult } from "@/lib/action";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function raiseTicketAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  let id: string;
  try {
    const file = f.get("screenshot");
    const shot = file instanceof File && file.size > 0 ? { name: file.name, data: Buffer.from(await file.arrayBuffer()) } : null;
    const hrTopic = s(f, "hrTopic");
    const t = await svc.raiseTicket(actor, { category: s(f, "category") as svc.Category, hrTopic: hrTopic ? (hrTopic as (typeof svc.HR_TOPICS)[number]) : undefined, subject: s(f, "subject"), description: s(f, "description") }, shot);
    id = t.id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/helpdesk/${id}`);
}

export async function replyAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    const internal = f.get("internal") === "on";
    await svc.replyToTicket(actor, id, { body: s(f, "body"), internal });
    revalidatePath(`/helpdesk/${id}`);
    return { ok: true, message: internal ? "Internal note added." : "Reply sent." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function statusAction(id: string, status: svc.TicketStatus): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.setTicketStatus(actor, id, status);
    revalidatePath(`/helpdesk/${id}`);
    return { ok: true, message: "Status updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function assignAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.assignTicket(actor, id, s(f, "assigneeId") || null);
    revalidatePath(`/helpdesk/${id}`);
    return { ok: true, message: "Assignment saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function faqAction(id: string, _: ActionResult, f: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await svc.convertToFaq(actor, id, { title: s(f, "title"), body: s(f, "body"), serviceLine: s(f, "serviceLine") || null });
    revalidatePath(`/helpdesk/${id}`);
    return { ok: true, message: "FAQ created in the knowledge base." };
  } catch (e) {
    return toActionError(e);
  }
}
