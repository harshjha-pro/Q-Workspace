"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ACTIVITY_KINDS, CONSTITUTIONS, SERVICE_LINES, SOURCES, STAGES, rupeesInput } from "../_lib/labels";
import { CheckList, type Action, type Option } from "./common";

export type LeadDefaults = {
  name?: string; entityType?: string; contactName?: string; email?: string | null; phone?: string | null; pan?: string | null; gstin?: string | null;
  servicesCsv?: string; estFeePaise?: number; source?: string; referrerClientId?: string | null; referrerName?: string; ownerId?: string | null; nextFollowUp?: string | null; notes?: string;
};

function LeadFields({ err, d, owners, clients, showFee }: { err: (f: string) => string | undefined; d: LeadDefaults; owners: Option[]; clients: Option[]; showFee: boolean }) {
  return (
    <>
      <Field label="Name *" error={err("name")}><Input name="name" required defaultValue={d.name} placeholder="Business or person" /></Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Entity type" error={err("entityType")}>
          <Select name="entityType" defaultValue={d.entityType ?? "OTHER"}>{CONSTITUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Contact person" error={err("contactName")}><Input name="contactName" defaultValue={d.contactName} /></Field>
        <Field label="Email" error={err("email")}><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
        <Field label="Phone" error={err("phone")}><Input name="phone" inputMode="tel" defaultValue={d.phone ?? ""} /></Field>
        <Field label="PAN" error={err("pan")}><Input name="pan" defaultValue={d.pan ?? ""} className="uppercase" maxLength={10} /></Field>
        <Field label="GSTIN" error={err("gstin")}><Input name="gstin" defaultValue={d.gstin ?? ""} className="uppercase" maxLength={15} /></Field>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-ink">Services wanted</p>
        <CheckList name="services" options={SERVICE_LINES} defaults={(d.servicesCsv ?? "").split(",").filter(Boolean)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {showFee ? <Field label="Estimated fee (₹)" error={err("estFeePaise")}><Input name="estFee" inputMode="decimal" defaultValue={rupeesInput(d.estFeePaise ?? 0)} /></Field> : null}
        <Field label="Owner" error={err("ownerId")}>
          <Select name="ownerId" defaultValue={d.ownerId ?? ""}><option value="">Me (if Partner / Manager)</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </Field>
        <Field label="Source" error={err("source")}>
          <Select name="source" defaultValue={d.source ?? "OTHER"}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
        <Field label="Referred by client" error={err("referrerClientId")}>
          <Select name="referrerClientId" defaultValue={d.referrerClientId ?? ""}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="…or referred by (person)" error={err("referrerName")}><Input name="referrerName" defaultValue={d.referrerName} /></Field>
        <Field label="Next follow-up" error={err("nextFollowUp")}><Input type="date" name="nextFollowUp" defaultValue={d.nextFollowUp ?? ""} /></Field>
      </div>
      <Field label="Notes" error={err("notes")}><Textarea name="notes" defaultValue={d.notes} /></Field>
      <Field label="Duplicate override reason" hint="Only needed if a possible duplicate is reported." error={err("overrideReason")}><Input name="overrideReason" /></Field>
    </>
  );
}

export function LeadDialog({ action, owners, clients, showFee, defaults, trigger, title }: { action: Action; owners: Option[]; clients: Option[]; showFee: boolean; defaults?: LeadDefaults; trigger: string; title: string }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={defaults ? "secondary" : "default"} title={title} description="PAN, GSTIN, email and phone are checked against existing leads and clients." action={action} submitLabel="Save">
      {(err) => <LeadFields err={err} d={defaults ?? {}} owners={owners} clients={clients} showFee={showFee} />}
    </FormDialog>
  );
}

export function StageDialog({ action, current }: { action: Action; current: string }) {
  return (
    <FormDialog trigger="Change stage" title="Change stage" description="A new client is won by accepting its engagement letter." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Stage" error={err("stage")}>
            <Select name="stage" defaultValue={current}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </Field>
          <Field label="Lost reason (required for Lost)" error={err("lostReason")}><Input name="lostReason" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function ActivityDialog({ action, today, trigger = "Log activity" }: { action: Action; today: string; trigger?: string }) {
  return (
    <FormDialog trigger={trigger} triggerVariant="default" title="Log activity" description="Call, meeting, email or WhatsApp — and when to follow up next." action={action} submitLabel="Log">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Kind" error={err("kind")}><Select name="kind" defaultValue="CALL">{ACTIVITY_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={today} max={today} required /></Field>
          </div>
          <Field label="What happened *" error={err("notes")}><Textarea name="notes" required /></Field>
          <Field label="Next follow-up" error={err("nextFollowUp")}><Input type="date" name="nextFollowUp" min={today} /></Field>
        </>
      )}
    </FormDialog>
  );
}
