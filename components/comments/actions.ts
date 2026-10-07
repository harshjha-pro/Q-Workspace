"use server";
import { requireStaff } from "@/server/context";
import { addComment, editComment, deleteComment, type CommentEntity } from "@/server/services/comments/service";
import { toActionError, type ActionResult } from "@/lib/action";

export async function addCommentAction(entityType: CommentEntity, entityId: string, body: string): Promise<ActionResult<{ notNotified: string[] }>> {
  const actor = await requireStaff();
  try {
    const r = await addComment(actor, { entityType, entityId, body });
    const msg = r.notNotified.length ? `Comment added. Not notified (cannot see this record): ${r.notNotified.map((u) => `@${u}`).join(", ")}.` : "Comment added.";
    return { ok: true, message: msg, data: { notNotified: r.notNotified } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function editCommentAction(id: string, body: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await editComment(actor, id, body);
    return { ok: true, message: "Comment updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteCommentAction(id: string): Promise<ActionResult> {
  const actor = await requireStaff();
  try {
    await deleteComment(actor, id);
    return { ok: true, message: "Comment deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
