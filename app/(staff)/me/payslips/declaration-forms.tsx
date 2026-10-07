"use client";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

type Act = (prev: ActionResult, f: FormData) => Promise<ActionResult>;
type Section = { code: string; label: string; oldOnly: boolean; value: string };

export function DeclarationForm({ action, regime, metro, sections, locked }: { action: Act; regime: string; metro: boolean; sections: Section[]; locked: boolean }) {
  if (locked) return null;
  return (
    <ActionForm action={action} submitLabel="Save">
      {(err) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tax regime for this year" error={err("regime")}><Select name="regime" defaultValue={regime}><option value="NEW">New regime (default)</option><option value="OLD">Old regime (deductions below apply)</option></Select></Field>
            <Field label="When saved"><Select name="intent" defaultValue="submit"><option value="submit">Submit to HR</option><option value="draft">Keep as draft</option></Select></Field>
          </div>
          <Checkbox name="metro" label="I live in a metro city (Delhi, Mumbai, Kolkata, Chennai) — for HRA" defaultChecked={metro} />
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map((s) => (
              <Field key={s.code} label={`${s.label}${s.oldOnly ? " (old regime)" : ""}`} error={err(`items.${s.code}`)} hint="₹ for the whole year">
                <Input name={`i_${s.code}`} inputMode="decimal" defaultValue={s.value} />
              </Field>
            ))}
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function ProofDialog({ action, sections }: { action: Act; sections: { code: string; label: string }[] }) {
  return (
    <FormDialog trigger="Upload proof" title="Upload a proof" description="PDF or image of the receipt / certificate. HR verifies the amount." action={action} submitLabel="Upload">
      {(err) => (
        <>
          <Field label="Section" error={err("section")}><Select name="section" defaultValue={sections[0]?.code}>{sections.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</Select></Field>
          <Field label="Amount ₹" error={err("amount")}><Input name="amount" inputMode="decimal" required /></Field>
          <Field label="File" error={err("file")}><Input type="file" name="file" required className="h-auto py-1.5" accept=".pdf,.jpg,.jpeg,.png" /></Field>
        </>
      )}
    </FormDialog>
  );
}
