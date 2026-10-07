"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Select, Textarea } from "@/components/ui/input";
import { giveApplauseAction } from "./actions";

export function GiveApplauseDialog({ people, badges }: { people: { id: string; name: string }[]; badges: { code: string; name: string; description: string }[] }) {
  return (
    <FormDialog trigger="Send applause" triggerVariant="default" title="Send applause" description="Applause is shared with the person and kept in their appraisal file. It cannot be edited or withdrawn later." action={giveApplauseAction} submitLabel="Send">
      {(err) => (
        <>
          <Field label="Colleague *" error={err("toUserId")}>
            <Select name="toUserId" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Badge *" error={err("badgeCode")}>
            <Select name="badgeCode" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {badges.map((b) => <option key={b.code} value={b.code}>{b.name} — {b.description}</option>)}
            </Select>
          </Field>
          <Field label="What did they do? *" error={err("message")}>
            <Textarea name="message" required rows={4} maxLength={1000} placeholder="Be specific — it helps at appraisal time." />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
