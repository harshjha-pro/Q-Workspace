"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { recordFirmObligationAction } from "./actions";

export function RecordObligationDialog({ types, people }: { types: { code: string; name: string; appliesWhen: string }[]; people: { id: string; name: string }[] }) {
  return (
    <FormDialog trigger="Add firm obligation" triggerVariant="default" title="Add a firm obligation" description="Type the due date exactly as it appears on the certificate, policy, licence or Institute announcement." action={recordFirmObligationAction} submitLabel="Add">
      {(err) => (
        <>
          <Field label="Obligation *" error={err("typeCode")}>
            <Select name="typeCode" required defaultValue=""><option value="" disabled>Choose…</option>{types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select>
          </Field>
          <Field label="For *" error={err("periodLabel")} hint="Year, member's name, office or policy number — e.g. 2026-27, or Arvind Mehta 2026-27"><Input name="periodLabel" required maxLength={80} /></Field>
          <Field label="Due date *" error={err("dueDate")}><Input type="date" name="dueDate" required /></Field>
          <Field label="Source of the date" error={err("note")}><Input name="note" maxLength={300} placeholder="e.g. Policy schedule, renewal date" /></Field>
          <Field label="Owner" error={err("ownerId")}>
            <Select name="ownerId" defaultValue=""><option value="">Nobody yet</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
        </>
      )}
    </FormDialog>
  );
}
