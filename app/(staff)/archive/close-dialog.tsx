"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Textarea } from "@/components/ui/input";
import { closeEngagementAction } from "./actions";

export function CloseEngagementDialog({ id, openTasks, isPartner }: { id: string; openTasks: number; isPartner: boolean }) {
  const blocked = openTasks > 0 && !isPartner;
  return (
    <FormDialog
      trigger="Close & archive"
      triggerVariant={openTasks ? "secondary" : "default"}
      title="Close and archive this engagement"
      description={openTasks
        ? blocked ? `${openTasks} task(s) are still open. Close them first, or ask a Partner to close the engagement with a reason.` : `${openTasks} task(s) are still open. As a Partner you can close anyway — give the reason; it is kept in the audit trail.`
        : "All tasks are closed. The engagement becomes read-only in the Archive. A client feedback request (and a renewal reminder for recurring work) is raised."}
      action={closeEngagementAction.bind(null, id)}
      submitLabel="Close & archive"
      danger={openTasks > 0}
    >
      {(err) => (openTasks > 0 && isPartner ? <Field label="Reason for closing with open tasks *" error={err("overrideReason")}><Textarea name="overrideReason" required rows={3} /></Field> : <></>)}
    </FormDialog>
  );
}
