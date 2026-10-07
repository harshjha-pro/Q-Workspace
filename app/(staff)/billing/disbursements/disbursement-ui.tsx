"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { createDisbursementAction, updateDisbursementAction } from "../actions";

const KINDS: [string, string][] = [["GOVT_FEE", "Government fee"], ["ROC_FEE", "ROC fee"], ["CHALLAN", "Challan"], ["STAMP_DUTY", "Stamp duty"], ["TRAVEL", "Travel"], ["OTHER", "Other"]];

function Fields({ err, today, d }: { err: (f: string) => string | undefined; today: string; d?: { date: string; amount: string; kind: string; description: string; paidBy: string } }) {
  return (
    <>
      <Field label="Date paid *" error={err("date")}><Input type="date" name="date" defaultValue={d?.date ?? today} max={today} required /></Field>
      <Field label="Amount (₹) *" error={err("amount") ?? err("amountPaise")}><Input name="amount" inputMode="decimal" defaultValue={d?.amount} required /></Field>
      <Field label="Type" error={err("kind")}><Select name="kind" defaultValue={d?.kind ?? "GOVT_FEE"}>{KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Description *" error={err("description")}><Input name="description" defaultValue={d?.description} placeholder="e.g. MCA fee for AOC-4, SRN …" required /></Field>
      <Field label="Paid by" error={err("paidBy")} hint="FIRM, or the person who paid"><Input name="paidBy" defaultValue={d?.paidBy ?? "FIRM"} /></Field>
    </>
  );
}

export function NewDisbursementDialog({ clients, today }: { clients: { id: string; label: string }[]; today: string }) {
  return (
    <FormDialog trigger="Record disbursement" triggerVariant="default" title="Amount paid on a client's behalf" description="Recovered later through an invoice as a pure-agent reimbursement (no GST)." action={createDisbursementAction} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Client *" error={err("clientId")}><Select name="clientId" required defaultValue=""><option value="" disabled>Pick a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Fields err={err} today={today} />
        </>
      )}
    </FormDialog>
  );
}

export function EditDisbursementDialog({ id, today, d }: { id: string; today: string; d: { date: string; amount: string; kind: string; description: string; paidBy: string } }) {
  return (
    <FormDialog trigger="Edit" triggerVariant="ghost" title="Edit disbursement" action={updateDisbursementAction.bind(null, id)} submitLabel="Save">
      {(err) => <Fields err={err} today={today} d={d} />}
    </FormDialog>
  );
}
