"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ACTIVITY_KINDS } from "../_lib/labels";
import type { Action, Option } from "./common";

export function LogCommunicationDialog({ action, today, engagements }: { action: Action; today: string; engagements: Option[] }) {
  return (
    <FormDialog trigger="Log communication" triggerVariant="default" title="Log communication" description="Call, meeting, email or WhatsApp with the client." action={action} submitLabel="Log">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Kind" error={err("kind")}><Select name="kind" defaultValue="CALL">{ACTIVITY_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={today} max={today} required /></Field>
          </div>
          <Field label="Engagement (if relevant)" error={err("engagementId")}>
            <Select name="engagementId" defaultValue=""><option value="">—</option>{engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
          </Field>
          <Field label="Notes *" error={err("notes")}><Textarea name="notes" required /></Field>
          <Field label="Follow up on" error={err("nextFollowUp")}><Input type="date" name="nextFollowUp" min={today} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function CategoryDialog({ action, category, tags }: { action: Action; category: string | null; tags: string }) {
  return (
    <FormDialog trigger="Category & tags" title="Client category & tags" description="A/B/C by fee size or strategic value; tags separated by commas." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Category" error={err("category")}><Select name="category" defaultValue={category ?? ""}><option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></Select></Field>
          <Field label="Tags" error={err("tags")}><Input name="tags" defaultValue={tags} placeholder="e.g. exporter, startup, family group" /></Field>
        </>
      )}
    </FormDialog>
  );
}
