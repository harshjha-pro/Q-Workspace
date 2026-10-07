"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { FEE_BASES, SERVICE_LINES, rupeesInput } from "../_lib/labels";
import type { Action } from "./common";

export type TemplateDefaults = { serviceLine: string; name: string; scope: string; deliverables: string; timelines: string; feeBasis: string; defaultFeePaise: number; oopTerms: string; active: boolean };

export function TemplateDialog({ action, d }: { action: Action; d?: TemplateDefaults }) {
  return (
    <FormDialog trigger={d ? "Edit" : "New template"} triggerVariant={d ? "ghost" : "default"} title={d ? "Edit service template" : "New service template"} description="Add a line “Estimated effort: 40 hrs” in timelines as the budget fallback when there are no past actuals." action={action} submitLabel="Save">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Name *" error={err("name")}><Input name="name" required defaultValue={d?.name} /></Field>
            <Field label="Service line" error={err("serviceLine")}><Select name="serviceLine" defaultValue={d?.serviceLine ?? "GST"}>{SERVICE_LINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Fee basis" error={err("feeBasis")}><Select name="feeBasis" defaultValue={d?.feeBasis ?? "FIXED"}>{FEE_BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Default fee / hourly rate (₹)" error={err("defaultFeePaise")}><Input name="fee" inputMode="decimal" defaultValue={rupeesInput(d?.defaultFeePaise ?? 0)} /></Field>
          </div>
          <Field label="Scope" error={err("scope")}><Textarea name="scope" rows={3} defaultValue={d?.scope} /></Field>
          <Field label="Deliverables" error={err("deliverables")}><Textarea name="deliverables" rows={2} defaultValue={d?.deliverables} /></Field>
          <Field label="Timelines" error={err("timelines")}><Textarea name="timelines" rows={2} defaultValue={d?.timelines} /></Field>
          <Field label="Out-of-pocket terms" error={err("oopTerms")}><Textarea name="oopTerms" rows={2} defaultValue={d?.oopTerms} /></Field>
          {d ? <Checkbox name="active" label="Active" defaultChecked={d.active} /> : null}
        </>
      )}
    </FormDialog>
  );
}
