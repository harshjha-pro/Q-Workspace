"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { ActButton } from "../act-button";
import {
  moveStageAction, submitForReviewAction, recordFilingAction, notApplicableAction, amendmentAction, setTaxDueAction, manualDueDateAction,
  approveReviewAction, returnReviewAction, respondPointAction, clearPointAction, raisePointAction, signOffAction,
  addChecklistItemAction, markAllRequestedAction, setPendingAction, clearPendingAction,
} from "../actions";

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
export function MoveStageDialog({ taskId, current, stages }: { taskId: string; current: number; stages: { index: number; name: string; note: string }[] }) {
  return (
    <FormDialog trigger="Move stage" title="Move to stage" description="Moving back needs a reason. A client-approval stage needs a note on how the client approved." action={moveStageAction.bind(null, taskId)} submitLabel="Move">
      {(err) => (
        <>
          <Field label="Stage" error={err("toIndex")}>
            <Select name="toIndex" defaultValue={String(Math.min(current + 1, stages.length - 1))}>
              {stages.map((s) => <option key={s.index} value={s.index}>{s.index + 1}. {s.name}{s.index === current ? " (current)" : ""}{s.note ? ` · ${s.note}` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Note" error={err("note")}><Textarea name="note" placeholder="Reason for moving back, or how the client approved" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function SubmitForReviewDialog({ taskId, stage, level }: { taskId: string; stage: string; level: string }) {
  return (
    <FormDialog trigger="Submit for review" triggerVariant="default" title="Submit for review" description={`"${stage}" needs ${level.toLowerCase()}-level review. It goes to the task's checker.`} action={submitForReviewAction.bind(null, taskId)} submitLabel="Submit">
      {() => <Field label="Note for the checker (optional)"><Textarea name="note" /></Field>}
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Outcome: filing, NA, amendment
// ---------------------------------------------------------------------------
const ACK_TYPES = ["ARN", "SRN", "ITR_ACK", "CIN", "TOKEN", "CHALLAN", "ACK"];

export function RecordFilingDialog({ taskId, ackType, today }: { taskId: string; ackType: string; today: string }) {
  return (
    <FormDialog trigger="Record filing" triggerVariant="default" title="Record filing" description="Filed late is decided from the filing date and the due date. The service checks review, sign-off and UDIN first." action={recordFilingAction.bind(null, taskId)} submitLabel="Record filing">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Acknowledgment type" error={err("ackType")}>
              <Select name="ackType" defaultValue={ackType}>{ACK_TYPES.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}</Select>
            </Field>
            <Field label="Filing date" error={err("filedDate")}><Input type="date" name="filedDate" defaultValue={today} max={today} required /></Field>
          </div>
          <Field label="Acknowledgment number" error={err("ackNumber")}><Input name="ackNumber" required autoComplete="off" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function NotApplicableDialog({ taskId }: { taskId: string }) {
  return (
    <FormDialog trigger="Not applicable" triggerVariant="ghost" title="Mark not applicable" description="Closes the task without filing. The reason is kept on the history." action={notApplicableAction.bind(null, taskId)} submitLabel="Mark not applicable" danger>
      {(err) => <Field label="Reason" error={err("reason")}><Textarea name="reason" required /></Field>}
    </FormDialog>
  );
}

export function AmendmentDialog({ taskId }: { taskId: string }) {
  return (
    <FormDialog trigger="Create amendment" title="Create amendment" description="A revised return is a new linked task; this filing stays as recorded." action={amendmentAction.bind(null, taskId)} submitLabel="Create">
      {(err) => <Field label="Due date (optional)" error={err("dueDate")}><Input type="date" name="dueDate" /></Field>}
    </FormDialog>
  );
}

export function TaxDueDialog({ taskId, rupees }: { taskId: string; rupees: number | null }) {
  return (
    <FormDialog trigger={rupees === null ? "Add tax due" : "Edit tax due"} triggerVariant="ghost" title="Tax due" description="Used only to estimate interest exposure. Leave blank to clear." action={setTaxDueAction.bind(null, taskId)}>
      {(err) => <Field label="Tax due (₹)" error={err("rupees")}><Input name="rupees" inputMode="decimal" defaultValue={rupees ?? ""} /></Field>}
    </FormDialog>
  );
}

export function ManualDueDialog({ taskId, current }: { taskId: string; current: string }) {
  return (
    <FormDialog trigger="Set due date" triggerVariant="ghost" title="Set due date" description="For types whose due date is not computed from the master. Record where the date comes from." action={manualDueDateAction.bind(null, taskId)} submitLabel="Set">
      {(err) => (
        <>
          <Field label="Due date" error={err("date")}><Input type="date" name="date" defaultValue={current} required /></Field>
          <Field label="Source / reason" error={err("reason")}><Input name="reason" required placeholder="e.g. Notice dated 01-Oct-2026, AGM date" /></Field>
        </>
      )}
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
export function ReviewDecision({ taskId, reviewId }: { taskId: string; reviewId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog trigger="Approve" triggerVariant="default" title="Approve" description="All points must be cleared. The task moves to the next stage." action={approveReviewAction.bind(null, taskId, reviewId)} submitLabel="Approve">
        {() => <Field label="Note (optional)"><Textarea name="note" /></Field>}
      </FormDialog>
      <FormDialog trigger="Return with points" title="Return with review points" description="One point per line. Each becomes a separate item the maker responds to." action={returnReviewAction.bind(null, taskId, reviewId)} submitLabel="Return">
        {(err) => <Field label="Review points" error={err("points")}><Textarea name="points" required className="min-h-32" /></Field>}
      </FormDialog>
    </div>
  );
}

export function RespondPointDialog({ taskId, pointId, current }: { taskId: string; pointId: string; current: string }) {
  return (
    <FormDialog trigger={current ? "Edit response" : "Respond"} triggerVariant="ghost" title="Respond to point" action={respondPointAction.bind(null, taskId, pointId)}>
      {() => <Field label="Response"><Textarea name="response" defaultValue={current} required /></Field>}
    </FormDialog>
  );
}

export function ClearPointButton({ taskId, pointId }: { taskId: string; pointId: string }) {
  return <ActButton action={() => clearPointAction(taskId, pointId)} variant="ghost">Clear</ActButton>;
}

export function RaisePointDialog({ taskId }: { taskId: string }) {
  return (
    <FormDialog trigger="Raise point" triggerVariant="ghost" title="Raise a review point" action={raisePointAction.bind(null, taskId)} submitLabel="Raise">
      {(err) => <Field label="Point" error={err("text")}><Textarea name="text" required /></Field>}
    </FormDialog>
  );
}

export function SignOffDialog({ taskId, level }: { taskId: string; level: "PARTNER" | "EQR" }) {
  const label = level === "EQR" ? "Record EQR" : "Partner sign-off";
  return (
    <FormDialog trigger={label} triggerVariant={level === "PARTNER" ? "default" : "secondary"} title={label}
      description={level === "EQR" ? "The EQR Partner must differ from the signing Partner." : "Where the report needs a UDIN, an \"Awaiting UDIN\" row opens in the UDIN register."}
      action={signOffAction.bind(null, taskId, level)} submitLabel="Sign off">
      {() => <Field label="Note (optional)"><Textarea name="note" /></Field>}
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Checklist and pending from client
// ---------------------------------------------------------------------------
export function AddChecklistItemDialog({ taskId }: { taskId: string }) {
  return (
    <FormDialog trigger="Add item" triggerVariant="ghost" title="Add checklist item" action={addChecklistItemAction.bind(null, taskId)} submitLabel="Add">
      {(err) => <Field label="Item" error={err("label")}><Input name="label" required placeholder="e.g. Bank statement Apr–Sep" /></Field>}
    </FormDialog>
  );
}

export function MarkAllRequestedButton({ taskId }: { taskId: string }) {
  return <ActButton action={() => markAllRequestedAction(taskId)} variant="ghost">Mark all requested</ActButton>;
}

export function SetPendingDialog({ taskId, items }: { taskId: string; items: { id: string; label: string; status: string }[] }) {
  const open = items.filter((i) => i.status === "NOT_REQUESTED" || i.status === "REQUESTED");
  return (
    <FormDialog trigger="Pending from client" title="Mark pending from client" description="The clock on client waiting starts today. When every chosen item is received, work resumes on its own." action={setPendingAction.bind(null, taskId)} submitLabel="Mark pending">
      {(err) => (
        <>
          <Field label="What is pending" error={err("what")}><Input name="what" required minLength={3} placeholder="e.g. Purchase register and bank statements" /></Field>
          {open.length ? (
            <fieldset className="space-y-1">
              <legend className="mb-1 text-xs font-medium">Checklist items waited on</legend>
              {open.map((i) => <Checkbox key={i.id} name="itemIds" value={i.id} defaultChecked={i.status === "REQUESTED"} label={i.label} className="flex" />)}
            </fieldset>
          ) : <p className="text-xs text-muted">No open checklist items. Add items to have the task resume automatically when they arrive.</p>}
        </>
      )}
    </FormDialog>
  );
}

export function ClearPendingDialog({ taskId }: { taskId: string }) {
  return (
    <FormDialog trigger="Resume work" title="Clear pending from client" action={clearPendingAction.bind(null, taskId)} submitLabel="Resume">
      {(err) => <Field label="Reason" error={err("reason")}><Input name="reason" required placeholder="e.g. Received on call; proceeding with estimates" /></Field>}
    </FormDialog>
  );
}
