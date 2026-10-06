"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { recordInwardAction, moveDocumentAction, markReturnedAction } from "./actions";

type Option = { id: string; name: string };

function CustodianSelect({ people, defaultValue = "" }: { people: Option[]; defaultValue?: string }) {
  return <Select name="custodianUserId" defaultValue={defaultValue}><option value="">Nobody (in office storage)</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>;
}

export function RecordDialog({ clients, people, today }: { clients: Option[]; people: Option[]; today: string }) {
  return (
    <FormDialog trigger="Record document" triggerVariant="default" title="Record inward / outward document" description="Physical documents received from or sent to a client." action={recordInwardAction} submitLabel="Record">
      {(err) => (
        <>
          <Field label="Client *" error={err("clientId")}>
            <Select name="clientId" required defaultValue=""><option value="" disabled>Choose client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Direction" error={err("direction")}>
              <Select name="direction" defaultValue="IN"><option value="IN">In (received)</option><option value="OUT">Out (sent)</option></Select>
            </Field>
            <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={today} max={today} required /></Field>
          </div>
          <Field label="Document *" error={err("documentDesc")}><Input name="documentDesc" required placeholder="e.g. Original sale deed, bank statements Apr–Jun" /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Kept at" error={err("currentLocation")}><Input name="currentLocation" placeholder="e.g. Cabinet 3" /></Field>
            <Field label="Custodian" error={err("custodianUserId")}><CustodianSelect people={people} /></Field>
          </div>
          <Field label="Notes" error={err("notes")}><Textarea name="notes" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function MoveDialog({ id, doc, location, custodianId, people }: { id: string; doc: string; location: string; custodianId: string; people: Option[] }) {
  return (
    <FormDialog trigger="Move" triggerVariant="ghost" title="Move document" description={doc} action={moveDocumentAction.bind(null, id)} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Now kept at" error={err("currentLocation")}><Input name="currentLocation" defaultValue={location} /></Field>
          <Field label="Custodian" error={err("custodianUserId")}><CustodianSelect people={people} defaultValue={custodianId} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function ReturnDialog({ id, doc }: { id: string; doc: string }) {
  return (
    <FormDialog trigger="Returned" triggerVariant="ghost" title="Mark returned" description={`Confirm "${doc}" is back with its owner and no longer held.`} action={markReturnedAction.bind(null, id)} submitLabel="Mark returned">
      {() => null}
    </FormDialog>
  );
}
