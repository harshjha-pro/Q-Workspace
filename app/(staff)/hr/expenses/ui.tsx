"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { addRateAction, createClaimAction, decideClaimAction } from "./actions";

type Option = { id: string; name: string };
export type Prefill = { date: string; clientId: string | null; workEntryId: string; label: string };

export function ClaimDialog({ today, clients, prefill, rates, trigger = "New claim" }: { today: string; clients: Option[]; prefill?: Prefill; rates: Record<string, number>; trigger?: string }) {
  const [kind, setKind] = useState(prefill ? "CONVEYANCE" : "OTHER");
  const [mode, setMode] = useState("TWO_WHEELER");
  const [recoverable, setRecoverable] = useState(false);
  const rate = rates[mode];
  return (
    <FormDialog trigger={trigger} triggerVariant={prefill ? "secondary" : "default"} title={prefill ? `Conveyance: ${prefill.label}` : "New expense claim"} description="Your Manager approves it. Attach a receipt where you have one." action={createClaimAction} submitLabel="Submit">
      {(err) => (
        <>
          {prefill ? <input type="hidden" name="workEntryId" value={prefill.workEntryId} /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Kind" error={err("kind")}><Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="CONVEYANCE">Conveyance</option><option value="TRAVEL">Travel</option><option value="OTHER">Other</option></Select></Field>
            <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={prefill?.date ?? today} max={today} required /></Field>
          </div>
          {kind === "CONVEYANCE" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Mode" error={err("mode")}><Select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="TWO_WHEELER">Two-wheeler (per km)</option><option value="FOUR_WHEELER">Car (per km)</option><option value="PER_VISIT">Per visit</option></Select></Field>
              {mode === "PER_VISIT" ? <Field label="Visits" error={err("visits")}><Input type="number" name="visits" min={1} defaultValue={1} /></Field> : <Field label="Distance (km)" error={err("distanceKm")}><Input type="number" name="distanceKm" min={0} /></Field>}
            </div>
          ) : null}
          <Field label={kind === "CONVEYANCE" && rate ? "Amount (₹) — leave blank to use the rate" : "Amount (₹) *"} error={err("amountPaise")} hint={kind === "CONVEYANCE" ? (rate ? `Firm rate: ₹${rate / 100} ${mode === "PER_VISIT" ? "per visit" : "per km"}` : "No firm rate is set: type the amount.") : undefined}>
            <Input name="amount" inputMode="decimal" />
          </Field>
          <Field label="Client" error={err("clientId")}><Select name="clientId" defaultValue={prefill?.clientId ?? ""}><option value="">— none / internal —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Checkbox name="clientRecoverable" checked={recoverable} onChange={(e) => setRecoverable(e.target.checked)} label="Recover from the client (goes to the disbursements register on approval)" />
          <Field label="Description" error={err("description")}><Textarea name="description" rows={2} /></Field>
          <Field label="Receipt" error={err("receipt")}><Input type="file" name="receipt" className="h-auto py-1.5" accept=".pdf,.jpg,.jpeg,.png" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function DecideDialog({ claimId, label }: { claimId: string; label: string }) {
  return (
    <FormDialog trigger="Decide" title={`Claim: ${label}`} action={decideClaimAction.bind(null, claimId)} submitLabel="Record decision">
      {(err) => (
        <>
          <Field label="Decision" error={err("decision")}><Select name="decision" defaultValue="approve"><option value="approve">Approve</option><option value="reject">Reject</option></Select></Field>
          <Field label="Note (required to reject)" error={err("note")}><Textarea name="note" rows={2} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function RateDialog({ today }: { today: string }) {
  return (
    <FormDialog trigger="Add rate" title="Conveyance rate" description="Firm policy (Q-21). Without a rate, claimants type the amount." action={addRateAction} submitLabel="Save">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Mode" error={err("mode")}><Select name="mode"><option value="TWO_WHEELER">Two-wheeler (per km)</option><option value="FOUR_WHEELER">Car (per km)</option><option value="PER_VISIT">Per visit</option></Select></Field>
          <Field label="Rate (₹) *" error={err("ratePaise")}><Input name="rate" inputMode="decimal" required /></Field>
          <Field label="From *" error={err("effectiveFrom")}><Input type="date" name="effectiveFrom" defaultValue={today} required /></Field>
        </div>
      )}
    </FormDialog>
  );
}
