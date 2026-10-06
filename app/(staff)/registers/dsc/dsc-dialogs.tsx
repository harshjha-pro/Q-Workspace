"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Label, FieldError } from "@/components/ui/input";
import { CUSTODY_LABELS, DSC_TYPES, DSC_TYPE_LABELS, HOLDER_TYPES, HOLDER_TYPE_LABELS } from "./labels";
import { createDscAction, updateDscAction, recordMovementAction } from "./actions";

type Option = { id: string; name: string };
export type DscCurrent = {
  id: string; holderName: string; holderType: string; dscClass: string; dscType: string; issuer: string; tokenSerial: string;
  issueDate: string; expiryDate: string; notes: string; clientIds: string[];
};

/** Checkbox list with a filter box: a DSC is often used for several group companies. */
function ClientChecklist({ clients, selected, error }: { clients: Option[]; selected: string[]; error?: string }) {
  const [q, setQ] = useState("");
  const shown = clients.filter((c) => selected.includes(c.id) || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <Label>Clients using this DSC *</Label>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find client…" aria-label="Find client" className="mb-1" />
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line p-2">
        {shown.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="clientIds" value={c.id} defaultChecked={selected.includes(c.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
            {c.name}
          </label>
        ))}
        {shown.length === 0 ? <p className="text-xs text-muted">No match.</p> : null}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function CustodyFields({ people, err }: { people: Option[]; err: (f: string) => string | undefined }) {
  const [custody, setCustody] = useState("OFFICE");
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Field label="Custody" error={err("custody")}>
        <Select name="custody" value={custody} onChange={(e) => setCustody(e.target.value)}>{Object.entries(CUSTODY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Location" error={err("location")}><Input name="location" placeholder="e.g. Cabinet 2, drawer B" /></Field>
      {custody === "STAFF" ? (
        <Field label="Held by *" error={err("custodianUserId")}>
          <Select name="custodianUserId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
      ) : null}
    </div>
  );
}

export function DscFormDialog({ clients, people, current }: { clients: Option[]; people: Option[]; current?: DscCurrent }) {
  const editing = !!current;
  return (
    <FormDialog
      trigger={editing ? "Edit" : "Add DSC"}
      triggerVariant={editing ? "ghost" : "default"}
      title={editing ? "Edit DSC" : "Add DSC"}
      description="Never store a DSC PIN or password here."
      action={editing ? updateDscAction.bind(null, current.id) : createDscAction}
      submitLabel={editing ? "Save" : "Add DSC"}
    >
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Holder name *" error={err("holderName")}><Input name="holderName" defaultValue={current?.holderName} required /></Field>
            <Field label="Holder is" error={err("holderType")}>
              <Select name="holderType" defaultValue={current?.holderType ?? "DIRECTOR"}>{HOLDER_TYPES.map((t) => <option key={t} value={t}>{HOLDER_TYPE_LABELS[t]}</option>)}</Select>
            </Field>
            <Field label="Class" error={err("dscClass")}>
              <Select name="dscClass" defaultValue={current?.dscClass ?? "CLASS_3"}><option value="CLASS_3">Class 3</option><option value="DGFT">DGFT</option></Select>
            </Field>
            <Field label="Type" error={err("dscType")}>
              <Select name="dscType" defaultValue={current?.dscType ?? "SIGNING"}>{DSC_TYPES.map((t) => <option key={t} value={t}>{DSC_TYPE_LABELS[t]}</option>)}</Select>
            </Field>
            <Field label="Issuer (CA)" error={err("issuer")}><Input name="issuer" defaultValue={current?.issuer} placeholder="e.g. eMudhra" /></Field>
            <Field label="Token serial" error={err("tokenSerial")}><Input name="tokenSerial" defaultValue={current?.tokenSerial} /></Field>
            <Field label="Issued on" error={err("issueDate")}><Input type="date" name="issueDate" defaultValue={current?.issueDate} /></Field>
            <Field label="Expires on *" error={err("expiryDate")}><Input type="date" name="expiryDate" defaultValue={current?.expiryDate} required /></Field>
          </div>
          {!editing ? <CustodyFields people={people} err={err} /> : null}
          <ClientChecklist clients={clients} selected={current?.clientIds ?? []} error={err("clientIds")} />
          <Field label="Notes" error={err("notes")} hint="No PINs or passwords."><Textarea name="notes" defaultValue={current?.notes} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function MoveDialog({ dscId, holder, people, linkedClients }: { dscId: string; holder: string; people: Option[]; linkedClients: Option[] }) {
  const [to, setTo] = useState("OFFICE");
  return (
    <FormDialog trigger="Move" title={`Record movement: ${holder}`} description="Every hand-over between office, client and staff is logged." action={recordMovementAction.bind(null, dscId)} submitLabel="Record">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Now with" error={err("toCustody")}>
              <Select name="toCustody" value={to} onChange={(e) => setTo(e.target.value)}>{Object.entries(CUSTODY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <Field label="Location" error={err("location")}><Input name="location" placeholder="e.g. Cabinet 2 / client office" /></Field>
            {to === "STAFF" ? (
              <Field label="Taken by *" error={err("userId")}>
                <Select name="userId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
            ) : null}
            {to === "CLIENT" ? (
              <Field label="Client" error={err("clientId")}>
                <Select name="clientId" defaultValue=""><option value="">—</option>{linkedClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
            ) : null}
          </div>
          <Field label="Note" error={err("note")} hint="No PINs or passwords."><Input name="note" placeholder="e.g. For ROC filing" /></Field>
        </>
      )}
    </FormDialog>
  );
}
