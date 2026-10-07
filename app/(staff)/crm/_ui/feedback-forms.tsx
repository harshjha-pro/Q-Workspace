"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Select, Textarea } from "@/components/ui/input";
import type { Action, Option } from "./common";

export function RequestFeedbackDialog({ action, engagements }: { action: Action; engagements: Option[] }) {
  return (
    <FormDialog trigger="Request feedback" triggerVariant="default" title="Request feedback" description="For a completed engagement. Requests are also created automatically when an engagement is closed." action={action} submitLabel="Create request">
      {(err) => (
        <Field label="Engagement *" error={err("engagementId")}>
          <Select name="engagementId" required defaultValue=""><option value="" disabled>Choose…</option>{engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
        </Field>
      )}
    </FormDialog>
  );
}

export function RecordFeedbackDialog({ action }: { action: Action }) {
  return (
    <FormDialog trigger="Record answer" title="Client's feedback" description="Scores at or below the firm's threshold alert the Partner." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Rating (1 = poor, 5 = excellent) *" error={err("rating")}>
            <Select name="rating" required defaultValue="">{["", "5", "4", "3", "2", "1"].map((v) => <option key={v} value={v} disabled={!v}>{v || "Choose…"}</option>)}</Select>
          </Field>
          <Field label="Comment" error={err("comment")}><Textarea name="comment" /></Field>
        </>
      )}
    </FormDialog>
  );
}
