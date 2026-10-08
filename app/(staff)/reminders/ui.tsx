"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { FormDialog } from "@/components/action-form";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";

type Action = (prev: ActionResult, f: FormData) => Promise<ActionResult>;

const CHANNELS = [["WHATSAPP", "WhatsApp"], ["EMAIL", "Email"], ["CALL", "Call"], ["PORTAL", "Portal only"]] as const;

/** Editable text, Copy, channel and "Mark as sent". What is marked is what gets logged and shown in the portal. */
export function SendBox({ text, channel, markSent, skip, readOnly }: { text: string; channel: string; markSent: Action; skip: Action; readOnly?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(markSent, { ok: true });
  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [state, router]);
  return (
    <div className="space-y-2">
      {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <form action={action} className="space-y-2">
        <Textarea name="messageText" rows={Math.min(14, value.split("\n").length + 1)} value={value} onChange={(e) => setValue(e.target.value)} readOnly={readOnly} className="font-mono text-xs" aria-label="Reminder text" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={async () => { await navigator.clipboard?.writeText(value); setCopied(true); }}>{copied ? "Copied" : "Copy text"}</Button>
          {readOnly ? <span className="text-xs text-muted">Read-only: a Partner or the Practice Admin records payment reminders.</span> : (
            <>
              <Select name="channel" defaultValue={CHANNELS.some(([k]) => k === channel) ? channel : "WHATSAPP"} className="w-36" aria-label="Sent by">{CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Mark as sent"}</Button>
            </>
          )}
        </div>
      </form>
      {!readOnly ? (
        <FormDialog trigger="Skip" triggerVariant="ghost" title="Skip this reminder" description="For example: the client called back, or it was handled another way." action={skip} submitLabel="Skip">
          {(err) => <Field label="Reason" error={err("reason")}><Input name="reason" required /></Field>}
        </FormDialog>
      ) : null}
    </div>
  );
}

type Schedule = { name: string; complianceTypeCode: string | null; dayOfMonth: number; monthsCsv: string; messageText: string; escalateAfter: number; active: boolean };

export function ScheduleDialog({ action, d, types }: { action: Action; d?: Schedule; types: { code: string; name: string }[] }) {
  return (
    <FormDialog trigger={d ? "Edit" : "New schedule"} triggerVariant={d ? "ghost" : "default"} title={d ? "Edit reminder schedule" : "New reminder schedule"} description="On this day, every open task of the chosen type with documents still requested gets a reminder on the list. Leave the text empty for the standard wording." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Name" error={err("name")}><Input name="name" required defaultValue={d?.name} /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Compliance type" error={err("complianceTypeCode")}>
              <Select name="complianceTypeCode" defaultValue={d?.complianceTypeCode ?? ""}>{[<option key="" value="">Any</option>, ...types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)]}</Select>
            </Field>
            <Field label="Day of month" hint="1–28" error={err("dayOfMonth")}><Input name="dayOfMonth" type="number" min={1} max={28} required defaultValue={d?.dayOfMonth ?? 3} /></Field>
            <Field label="Escalate after" hint="reminders" error={err("escalateAfter")}><Input name="escalateAfter" type="number" min={1} max={20} defaultValue={d?.escalateAfter ?? 3} /></Field>
          </div>
          <Field label="Months" hint="e.g. 4,7,10,1 — empty means every month" error={err("monthsCsv")}><Input name="monthsCsv" defaultValue={d?.monthsCsv} /></Field>
          <Field label="Own text (optional)" hint="Placeholders: {{contact}} {{client}} {{task}} {{period}} {{items}} {{dueDate}} {{firm}}" error={err("messageText")}><Textarea name="messageText" rows={6} defaultValue={d?.messageText} /></Field>
          {d ? <Checkbox name="active" label="Active" defaultChecked={d.active} /> : null}
        </>
      )}
    </FormDialog>
  );
}
