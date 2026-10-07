"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createAssetAction, issueAssetAction, returnAssetAction } from "./actions";

type Option = { id: string; name: string };

export function NewAssetDialog() {
  return (
    <FormDialog trigger="Add asset" triggerVariant="default" title="Add asset" action={createAssetAction} submitLabel="Add">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Tag *" error={err("tag")}><Input name="tag" required placeholder="QX-LAP-031" /></Field>
            <Field label="Kind" error={err("kind")}><Select name="kind"><option value="LAPTOP">Laptop</option><option value="PHONE">Phone</option><option value="DONGLE">Internet dongle</option><option value="OTHER">Other</option></Select></Field>
            <Field label="Serial" error={err("serial")}><Input name="serial" /></Field>
            <Field label="Purchased on" error={err("purchaseDate")}><Input type="date" name="purchaseDate" /></Field>
          </div>
          <Field label="Description" error={err("description")}><Textarea name="description" rows={2} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function IssueDialog({ assetId, tag, people, today }: { assetId: string; tag: string; people: Option[]; today: string }) {
  return (
    <FormDialog trigger="Issue" title={`Issue ${tag}`} action={issueAssetAction.bind(null, assetId)} submitLabel="Issue">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="To *" error={err("userId")}><Select name="userId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="On" error={err("issuedAt")}><Input type="date" name="issuedAt" defaultValue={today} required /></Field>
        </div>
      )}
    </FormDialog>
  );
}

export function ReturnDialog({ assetId, tag, today }: { assetId: string; tag: string; today: string }) {
  return (
    <FormDialog trigger="Return" title={`Return ${tag}`} action={returnAssetAction.bind(null, assetId)} submitLabel="Record return">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Condition" error={err("condition")}><Select name="condition" defaultValue="GOOD"><option value="NEW">New</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="DAMAGED">Damaged</option><option value="LOST">Lost</option></Select></Field>
          <Field label="On" error={err("returnedAt")}><Input type="date" name="returnedAt" defaultValue={today} required /></Field>
        </div>
      )}
    </FormDialog>
  );
}
