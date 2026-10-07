"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { addCpeAction } from "./actions";

export function AddCpeDialog({ today }: { today: string }) {
  return (
    <FormDialog trigger="Log CPE" triggerVariant="default" title="Log CPE hours" action={addCpeAction} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Topic *" error={err("topic")}><Input name="topic" required /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={today} max={today} required /></Field>
            <Field label="Hours *" error={err("minutes")}><Input type="number" step="0.25" min={0.25} name="hours" required /></Field>
            <Field label="Provider" error={err("provider")}><Input name="provider" placeholder="e.g. ICAI Jaipur Branch" /></Field>
          </div>
          <Checkbox name="structured" defaultChecked label="Structured learning (seminar, course, e-learning with certificate)" />
          <Field label="Certificate (optional)" error={err("certificate")}><Input type="file" name="certificate" className="h-auto py-1.5" accept=".pdf,.jpg,.jpeg,.png" /></Field>
        </>
      )}
    </FormDialog>
  );
}
