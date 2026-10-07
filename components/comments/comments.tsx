import { requireStaff } from "@/server/context";
import { isDomainError } from "@/server/lib/errors";
import { commentsVisibleFor, listComments, mentionCandidates, type CommentEntity } from "@/server/services/comments/service";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentThread } from "./comments-client";

/**
 * Comment thread for a task, engagement, notice or lead (spec 13.7, P3-32). Server component: loads the thread and
 * the @mention list for the signed-in person; renders nothing when they cannot see the record.
 * Usage: <Comments entityType="TASK" entityId={task.id} />
 */
export async function Comments({ entityType, entityId, title = "Comments" }: { entityType: CommentEntity; entityId: string; title?: string }) {
  const actor = await requireStaff();
  if (!commentsVisibleFor(actor, entityType)) return null;
  let data: Awaited<ReturnType<typeof listComments>>;
  let people: Awaited<ReturnType<typeof mentionCandidates>> = [];
  try {
    data = await listComments(actor, entityType, entityId);
    if (!data.readOnly) people = (await mentionCandidates(actor, entityType, entityId)).filter((p) => p.id !== actor.userId);
  } catch (e) {
    if (isDomainError(e)) return null;
    throw e;
  }
  const comments = data.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), editedAt: c.editedAt ? c.editedAt.toISOString() : null }));
  return (
    <Card id="comments">
      <CardHeader>
        <CardTitle>{title} ({comments.filter((c) => !c.deleted).length})</CardTitle>
        <span className="text-xs text-muted">Type @ to mention a colleague who can see this record.</span>
      </CardHeader>
      <CommentThread entityType={entityType} entityId={entityId} comments={comments} people={people} readOnly={data.readOnly} editWindowMinutes={data.editWindowMinutes} />
    </Card>
  );
}
