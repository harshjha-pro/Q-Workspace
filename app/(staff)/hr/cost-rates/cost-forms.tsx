"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

export function CostRateDialog({ action, name, today }: { action: (p: ActionResult, f: FormData) => Promise<ActionResult>; name: string; today: string }) {
  return (
    <FormDialog trigger="Set rate" title={`Cost per hour — ${name}`} description="Internal cost used for realization (Q-22). The previous rate ends the day before." action={action} submitLabel="Save">
      {(err) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="₹ per hour" error={err("ratePaisePerHour")}><Input name="rate" inputMode="decimal" required /></Field>
          <Field label="Effective from" error={err("effectiveFrom")}><Input type="date" name="effectiveFrom" defaultValue={today} required /></Field>
        </div>
      )}
    </FormDialog>
  );
}
