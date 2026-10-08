"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Select } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

type Action = (prev: ActionResult, f: FormData) => Promise<ActionResult>;

export function LinkDialog({ action, items, suggestedId, trigger }: { action: Action; items: { id: string; label: string }[]; suggestedId?: string; trigger: string }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={suggestedId ? "default" : "secondary"} title="Link to a requested item" description="The item becomes Received, pending your confirmation on the task, and the file is attached to that task." action={action} submitLabel="Link">
      {(err) => (
        <Field label="Requested item" error={err("checklistItemId")}>
          <Select name="checklistItemId" defaultValue={suggestedId ?? items[0]?.id} required>{items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select>
        </Field>
      )}
    </FormDialog>
  );
}
