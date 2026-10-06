import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { db } from "@/server/lib/db";
import { can } from "@/server/permissions/guards";

/** Notification links point at /leave/<id>: send the approver to the approval card, the applicant to their list. */
export default async function LeaveRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const r = await db().leaveRequest.findUnique({ where: { id }, select: { userId: true, status: true } });
  if (r && r.userId !== actor.userId && can(actor, "leave.approve")) redirect(r.status === "PENDING" ? `/leave?tab=approvals#${id}` : "/leave?tab=team");
  redirect("/leave");
}
