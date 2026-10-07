"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FEE_BASES, SERVICE_LINES, rupeesInput } from "../_lib/labels";
import type { Action, Option } from "./common";

export function NewProposalDialog({ action, templates, leadId, clientId }: { action: Action; templates: (Option & { line: string })[]; leadId?: string; clientId?: string }) {
  return (
    <FormDialog trigger="New proposal" triggerVariant="default" title="New proposal" description="Built from a service template; budget hours are suggested from past actuals of similar engagements." action={action} submitLabel="Create">
      {(err) => (
        <>
          {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
          {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
          <Field label="Service template *" error={err("serviceTemplateId")}>
            <Select name="serviceTemplateId" required defaultValue=""><option value="" disabled>Choose…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </Field>
          <Field label="Title" hint="Defaults to the template name." error={err("title")}><Input name="title" /></Field>
          <Field label="Valid until" hint="Defaults to the firm's standard validity." error={err("validUntil")}><Input type="date" name="validUntil" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export type ProposalDefaults = {
  title: string; serviceLine: string; scope: string; deliverables: string; timelines: string; feeBasis: string; feePaise: number; ratePaise: number; budgetMinutes: number; oopTerms: string; gstRateBp: number; validUntil: string | null; status: string;
};

export function EditProposalDialog({ action, d }: { action: Action; d: ProposalDefaults }) {
  const versioned = d.status !== "DRAFT";
  return (
    <FormDialog
      trigger={versioned ? "Revise (new version)" : "Edit"}
      title={versioned ? "Revise proposal — creates a new version" : "Edit proposal"}
      description={versioned ? "The current version stays unchanged and is marked superseded; the new version needs approval again." : undefined}
      action={action}
      submitLabel="Save"
    >
      {(err) => (
        <>
          <Field label="Title *" error={err("title")}><Input name="title" defaultValue={d.title} required /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Service line" error={err("serviceLine")}><Select name="serviceLine" defaultValue={d.serviceLine}>{SERVICE_LINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Fee basis" error={err("feeBasis")}><Select name="feeBasis" defaultValue={d.feeBasis}>{FEE_BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Fee (₹) — fixed / retainer" error={err("feePaise")}><Input name="fee" inputMode="decimal" defaultValue={rupeesInput(d.feePaise)} /></Field>
            <Field label="Hourly rate (₹) — time-based" error={err("ratePaise")}><Input name="rate" inputMode="decimal" defaultValue={rupeesInput(d.ratePaise)} /></Field>
            <Field label="Budget hours" error={err("budgetMinutes")}><Input name="budgetHours" inputMode="decimal" defaultValue={String(d.budgetMinutes / 60)} /></Field>
            <Field label="GST rate % (blank = applicable rate)" error={err("gstRateBp")}><Input name="gstRate" inputMode="decimal" defaultValue={d.gstRateBp ? String(d.gstRateBp / 100) : ""} /></Field>
            <Field label="Valid until" error={err("validUntil")}><Input type="date" name="validUntil" defaultValue={d.validUntil ?? ""} /></Field>
          </div>
          <Field label="Scope" error={err("scope")}><Textarea name="scope" rows={4} defaultValue={d.scope} /></Field>
          <Field label="Deliverables" error={err("deliverables")}><Textarea name="deliverables" rows={3} defaultValue={d.deliverables} /></Field>
          <Field label="Timelines" error={err("timelines")}><Textarea name="timelines" rows={3} defaultValue={d.timelines} /></Field>
          <Field label="Out-of-pocket terms" error={err("oopTerms")}><Textarea name="oopTerms" rows={2} defaultValue={d.oopTerms} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function DecideProposalDialog({ action }: { action: Action }) {
  return (
    <FormDialog trigger="Record client decision" triggerVariant="default" title="Client's decision" action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Decision" error={err("decision")}><Select name="decision" defaultValue="ACCEPTED"><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option></Select></Field>
          <Field label="Note" error={err("note")}><Textarea name="note" placeholder="e.g. accepted on call with CFO; or reason for rejection" /></Field>
        </>
      )}
    </FormDialog>
  );
}
