"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import type { Action } from "./common";

export function DecideConflictDialog({ action }: { action: Action }) {
  return (
    <FormDialog trigger="Record decision" triggerVariant="default" title="Partner's conflict & independence decision" action={action} submitLabel="Record">
      {(err) => (
        <>
          <Field label="Decision" error={err("decision")}>
            <Select name="decision" defaultValue="CLEARED"><option value="CLEARED">Cleared</option><option value="CLEARED_WITH_SAFEGUARDS">Cleared with safeguards</option><option value="DECLINED">Declined</option></Select>
          </Field>
          <Field label="Notes (required for safeguards / decline)" error={err("notes")}><Textarea name="notes" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function ItemDialog({ action, label, done, note }: { action: Action; label: string; done: boolean; note: string }) {
  return (
    <FormDialog trigger={done ? "Update" : "Mark done"} triggerVariant={done ? "ghost" : "secondary"} title="Checklist item" description={label} action={action} submitLabel="Save">
      {(err) => (
        <>
          <Checkbox name="done" label="Done" defaultChecked />
          <Field label="Note" error={err("note")}><Textarea name="note" defaultValue={note} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function AttachDialog({ action, label }: { action: Action; label: string }) {
  return (
    <FormDialog trigger="Attach" triggerVariant="ghost" title="Attach document" description={label} action={action} submitLabel="Upload">
      {(err) => <Field label="File *" error={err("file")}><Input type="file" name="file" required className="h-auto py-1.5" accept=".pdf,.jpg,.jpeg,.png,.docx,.doc" /></Field>}
    </FormDialog>
  );
}
