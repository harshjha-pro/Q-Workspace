"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

type Action = (prev: ActionResult, f: FormData) => Promise<ActionResult>;

export function RequestApprovalDialog({ action, documents }: { action: Action; documents: { id: string; name: string }[] }) {
  return (
    <FormDialog trigger="Ask client to approve" title="Ask the client to approve" description="The client sees this in the portal with the document. Attaching a document shares it with the client." action={action} submitLabel="Send to portal">
      {(err) => (
        <>
          <Field label="What to approve *" error={err("title")}><Input name="title" required placeholder="Draft GSTR-3B for Sep 2026" /></Field>
          <Field label="Document" error={err("documentId")}>
            <Select name="documentId" defaultValue="">{[<option key="" value="">None</option>, ...documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)]}</Select>
          </Field>
          <Field label="Note to the client" error={err("note")}><Textarea name="note" rows={3} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function WithdrawApprovalButton({ action }: { action: Action }) {
  return (
    <FormDialog trigger="Withdraw" triggerVariant="ghost" danger title="Withdraw this request" description="It disappears from the client's portal." action={action} submitLabel="Withdraw">
      {() => null}
    </FormDialog>
  );
}
