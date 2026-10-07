"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

export type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;
export type Option = { id: string; name: string };

/** A button that confirms and runs a server action with no fields. */
export function ConfirmAction({ trigger, title, description, action, submitLabel, variant = "secondary", danger }: { trigger: string; title: string; description?: string; action: Action; submitLabel?: string; variant?: "default" | "secondary" | "ghost" | "danger" | "link"; danger?: boolean }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={variant} title={title} description={description} action={action} submitLabel={submitLabel ?? trigger} danger={danger}>
      {() => null}
    </FormDialog>
  );
}

/** A dialog asking for a reason (dismiss, decline, withdraw). */
export function ReasonAction({ trigger, title, description, action, label = "Reason *", name = "reason", danger }: { trigger: string; title: string; description?: string; action: Action; label?: string; name?: string; danger?: boolean }) {
  return (
    <FormDialog trigger={trigger} triggerVariant="ghost" title={title} description={description} action={action} submitLabel={trigger} danger={danger}>
      {(err) => <Field label={label} error={err(name)}><Textarea name={name} required /></Field>}
    </FormDialog>
  );
}

/** A dialog asking for an amount in rupees (renewal fees). */
export function AmountAction({ trigger, title, description, action, defaultRupees, variant = "secondary" }: { trigger: string; title: string; description?: string; action: Action; defaultRupees: string; variant?: "default" | "secondary" | "ghost" }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={variant} title={title} description={description} action={action} submitLabel={trigger}>
      {(err) => <Field label="Fee (₹) *" error={err("feePaise") ?? err("fee")}><Input name="fee" inputMode="decimal" defaultValue={defaultRupees} required /></Field>}
    </FormDialog>
  );
}

/** Copy-ready text with a Copy button (messages are sent by people, never by the app). */
export function CopyText({ text, rows = 6 }: { text: string; rows?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Textarea readOnly value={text} rows={rows} className="font-mono text-xs" />
      <Button type="button" size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** Multi-select as a wrap of checkboxes (works on phones, unlike <select multiple>). */
export function CheckList({ name, options, defaults = [] }: { name: string; options: readonly (readonly [string, string])[]; defaults?: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map(([v, l]) => (
        <label key={v} className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={name} value={v} defaultChecked={defaults.includes(v)} className="h-4 w-4 accent-[var(--color-brand)]" /> {l}
        </label>
      ))}
    </div>
  );
}
