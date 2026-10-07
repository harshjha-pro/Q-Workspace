"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { raiseTicketAction } from "./actions";
import { CATEGORY_LABELS, HR_TOPIC_LABELS } from "./labels";

function CategoryFields({ err }: { err: (f: string) => string | undefined }) {
  const [category, setCategory] = useState("HOW_DO_I");
  return (
    <>
      <Field label="Category *" error={err("category")}>
        <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      {category === "HR_QUERY" ? (
        <Field label="About *" error={err("hrTopic")} hint="HR queries go to HR Admin only">
          <Select name="hrTopic" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {Object.entries(HR_TOPIC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      ) : null}
    </>
  );
}

export function RaiseTicketDialog() {
  return (
    <FormDialog trigger="Raise a ticket" triggerVariant="default" title="Raise a helpdesk ticket" description="For app problems, how-to questions, data corrections, access and HR queries." action={raiseTicketAction} submitLabel="Raise ticket">
      {(err) => (
        <>
          <CategoryFields err={err} />
          <Field label="Subject *" error={err("subject")}><Input name="subject" required maxLength={160} /></Field>
          <Field label="Description *" error={err("description")}><Textarea name="description" required rows={5} placeholder="What happened, what you expected, and where in the app." /></Field>
          <Field label="Screenshot (optional)" error={err("screenshot")} hint="PNG, JPG or PDF, up to 5 MB"><Input type="file" name="screenshot" accept=".png,.jpg,.jpeg,.pdf" /></Field>
        </>
      )}
    </FormDialog>
  );
}
