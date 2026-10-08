"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/context";
import { toActionError, type ActionResult } from "@/lib/action";
import * as messages from "@/server/services/messages/service";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
async function fileOf(f: FormData) {
  const file = f.get("file");
  return file instanceof File && file.size > 0 ? { name: file.name, data: Buffer.from(await file.arrayBuffer()) } : null;
}

export async function startThreadAction(_: ActionResult<{ id: string }>, f: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const t = await messages.startThread(await requireStaff(), { clientId: s(f, "clientId"), engagementId: s(f, "engagementId"), subject: s(f, "subject"), body: s(f, "body") }, await fileOf(f));
    revalidatePath("/messages");
    return { ok: true, data: { id: t.id }, message: "Sent." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function replyAction(threadId: string, _: ActionResult<{ id: string }>, f: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    await messages.postMessage(await requireStaff(), threadId, { body: s(f, "body") }, await fileOf(f));
    revalidatePath(`/messages/${threadId}`);
    revalidatePath("/messages");
    return { ok: true, message: "Sent." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function closeThreadAction(threadId: string, closed: boolean, _: ActionResult): Promise<ActionResult> {
  try {
    await messages.setThreadClosed(await requireStaff(), threadId, closed);
    revalidatePath(`/messages/${threadId}`);
    revalidatePath("/messages");
    return { ok: true, message: closed ? "Closed." : "Reopened." };
  } catch (e) {
    return toActionError(e);
  }
}
