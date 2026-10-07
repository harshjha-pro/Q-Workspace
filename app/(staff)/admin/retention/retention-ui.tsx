"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/input";
import { ActionButton } from "../../work/action-button";
import { decidePurgeAction, requestPurgeAction, saveRuleAction } from "./actions";

export function RuleDialog({ recordType, label, v, purgeable }: { recordType: string; label: string; v: { retainYears: number | null; basis: string; source: string; purgeEnabled: boolean }; purgeable: boolean }) {
  return (
    <FormDialog trigger="Set period" title={`Retention: ${label}`} description="Set the period from the firm's policy and the law / ICAI standards in force. Saving marks the rule verified by you." action={saveRuleAction.bind(null, recordType)} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Keep for (years)" error={err("retainYears")} hint="Leave blank to keep for ever"><Input type="number" name="retainYears" min={1} max={100} defaultValue={v.retainYears ?? ""} /></Field>
          <Field label="Basis" error={err("basis")}><Textarea name="basis" rows={2} defaultValue={v.basis} /></Field>
          <Field label="Source" error={err("source")} hint="Standard, section or policy the period comes from"><Input name="source" defaultValue={v.source.startsWith("TODO") ? "" : v.source} /></Field>
          {purgeable ? <Checkbox name="purgeEnabled" label="Allow purge (each purge still needs a Partner's approval)" defaultChecked={v.purgeEnabled} /> : <p className="text-xs text-muted">Purge is not available for this record type yet.</p>}
        </>
      )}
    </FormDialog>
  );
}

export function RequestPurgeButton({ recordType }: { recordType: string }) {
  return <ActionButton action={requestPurgeAction.bind(null, recordType)} confirm="List everything past retention and send it for Partner approval?">Propose purge</ActionButton>;
}

export function DecideDialogs({ id, count, label }: { id: string; count: number; label: string }) {
  return (
    <span className="flex flex-wrap gap-2">
      <FormDialog trigger="Approve & purge" triggerVariant="danger" danger title={`Purge ${count} ${label}`} description="Stored files are deleted permanently; the records stay, marked as purged, and the audit trail is kept. This cannot be undone." action={decidePurgeAction.bind(null, id, true)} submitLabel="Purge now">
        {(err) => (
          <>
            <Field label="Reason / note" error={err("reason")}><Input name="reason" /></Field>
            <Field label="Type PURGE to confirm *" error={err("confirm")}><Input name="confirm" required autoComplete="off" /></Field>
          </>
        )}
      </FormDialog>
      <FormDialog trigger="Reject" triggerVariant="ghost" title="Reject purge request" action={decidePurgeAction.bind(null, id, false)} submitLabel="Reject">
        {(err) => <Field label="Reason" error={err("reason")}><Input name="reason" /></Field>}
      </FormDialog>
    </span>
  );
}
