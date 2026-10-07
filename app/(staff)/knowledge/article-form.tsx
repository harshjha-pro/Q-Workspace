"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { KIND_LABELS, SERVICE_LINE_LABELS } from "./labels";

type Values = { title: string; body: string; kind: string; serviceLine: string; sourceRef: string; tags: string; published: boolean };
const EMPTY: Values = { title: "", body: "", kind: "SOP", serviceLine: "", sourceRef: "", tags: "", published: true };

export function ArticleDialog({ action, trigger, title, values = EMPTY }: { action: (p: ActionResult, f: FormData) => Promise<ActionResult>; trigger: string; title: string; values?: Values }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={values === EMPTY ? "default" : "secondary"} title={title} description="Summarise statutory changes as firm notes and point to the official circular — do not restate rates or limits here." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Title *" error={err("title")}><Input name="title" required defaultValue={values.title} maxLength={200} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind *" error={err("kind")}>
              <Select name="kind" defaultValue={values.kind}>{Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Field>
            <Field label="Service line" error={err("serviceLine")}>
              <Select name="serviceLine" defaultValue={values.serviceLine}><option value="">All / firm-wide</option>{Object.entries(SERVICE_LINE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Field>
          </div>
          <Field label="Article *" error={err("body")}><Textarea name="body" required rows={10} defaultValue={values.body} /></Field>
          <Field label="Source / reference" error={err("sourceRef")} hint="Circular or notification number and date, as printed on the official document"><Input name="sourceRef" defaultValue={values.sourceRef} maxLength={300} /></Field>
          <Field label="Tags" error={err("tags")} hint="Comma-separated, e.g. GST, ITC"><Input name="tags" defaultValue={values.tags} /></Field>
          <Checkbox name="publish" label="Published (visible to everyone)" defaultChecked={values.published} />
        </>
      )}
    </FormDialog>
  );
}
