"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { createOneOffAction } from "./actions";

type Opt = { id: string; name: string };

/** Explicit one-off task (catch-up filings, ad-hoc work). Engagements are filtered to the chosen client. */
export function NewTaskDialog({ clients, engagements, people }: { clients: Opt[]; engagements: (Opt & { clientId: string })[]; people: Opt[] }) {
  const [clientId, setClientId] = useState("");
  const forClient = engagements.filter((e) => e.clientId === clientId);
  return (
    <FormDialog trigger="New one-off task" triggerVariant="default" title="New one-off task" description="For catch-up filings and ad-hoc work. Recurring compliance tasks are generated automatically." action={createOneOffAction} submitLabel="Create task">
      {(err) => (
        <>
          <Field label="Client" error={err("clientId")}>
            <Select name="clientId" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="" disabled>Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Engagement (optional)" hint={clientId && forClient.length === 0 ? "No active engagement for this client." : undefined}>
            <Select name="engagementId" defaultValue="" key={clientId} disabled={!clientId}>
              <option value="">None</option>
              {forClient.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <Field label="Title" error={err("title")}><Input name="title" required minLength={3} placeholder="e.g. GSTR-1 Mar 2024 (catch-up)" /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Due date" error={err("dueDate")}><Input type="date" name="dueDate" /></Field>
            <Field label="Assign to" error={err("assigneeId")}>
              <Select name="assigneeId" defaultValue="">
                <option value="">Leave unassigned</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}
