"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { Action, Option } from "./common";

export function EditLetterDialog({ action, body }: { action: Action; body: string }) {
  return (
    <FormDialog trigger="Edit text" title="Edit letter text" description="Lines starting with “# ” print as headings. [[field]] marks a value that was missing." action={action} submitLabel="Save">
      {(err) => <Field label="Letter" error={err("body")}><Textarea name="body" rows={18} defaultValue={body} className="font-mono text-xs" /></Field>}
    </FormDialog>
  );
}

export function AcceptLetterDialog({ action, types, team, defaults, today, signedCopyOptional }: { action: Action; types: Option[]; team: Option[]; defaults: { engagementType: string; recurrence: string; name: string }; today: string; signedCopyOptional?: boolean }) {
  return (
    <FormDialog
      trigger={signedCopyOptional ? "Set up engagement" : "Upload signed copy"}
      triggerVariant="default"
      title={signedCopyOptional ? "Accepted in the portal — set up the engagement" : "Client accepted — upload the signed letter"}
      description="Creates the client (if new) and the engagement with the proposal's fee, budget and stage template, starts onboarding and marks the lead Won."
      action={action}
      submitLabel="Accept"
    >
      {(err) => (
        <>
          <Field label={signedCopyOptional ? "Signed copy (optional)" : "Signed copy *"} error={err("file")}><Input type="file" name="file" required={!signedCopyOptional} className="h-auto py-1.5" accept=".pdf,.jpg,.jpeg,.png" /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Engagement type (stage template)" error={err("engagementType")}>
              <Select name="engagementType" defaultValue={defaults.engagementType}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            </Field>
            <Field label="Recurrence" error={err("recurrence")}>
              <Select name="recurrence" defaultValue={defaults.recurrence}><option value="RECURRING">Recurring</option><option value="ONE_TIME">One-time</option></Select>
            </Field>
            <Field label="Engagement name" error={err("engagementName")}><Input name="engagementName" defaultValue={defaults.name} /></Field>
            <Field label="Start date" error={err("startDate")}><Input type="date" name="startDate" defaultValue={today} /></Field>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink">Team (optional)</p>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">
              {team.map((t) => (
                <label key={t.id} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" name="memberUserIds" value={t.id} className="h-4 w-4 accent-[var(--color-brand)]" /> {t.name}</label>
              ))}
            </div>
            {err("memberUserIds") ? <p className="mt-1 text-xs text-red-600">{err("memberUserIds")}</p> : null}
          </div>
        </>
      )}
    </FormDialog>
  );
}
