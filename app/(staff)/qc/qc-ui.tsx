"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action";
import {
  startChecklistAction, answerItemAction, completeChecklistAction, assignEqrAction, declareAction, createInspectionAction, addFindingAction, closeFindingAction, closeInspectionAction, buildPackAction,
} from "./actions";

type Opt = { id: string; name: string };

export function ActButton({ label, act, variant = "secondary" }: { label: string; act: () => Promise<ActionResult>; variant?: "default" | "secondary" | "ghost" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant={variant} disabled={pending} onClick={() => start(async () => { const r = await act(); setErr(r.ok ? null : r.error); if (r.ok) router.refresh(); })}>{pending ? "Working…" : label}</Button>
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function StartChecklistButton({ engagementId }: { engagementId: string }) {
  return <ActButton label="Start SQC 1 checklist" variant="default" act={() => startChecklistAction(engagementId)} />;
}

export function CompleteChecklistButton({ checklistId, reopen }: { checklistId: string; reopen: boolean }) {
  return <ActButton label={reopen ? "Reopen checklist" : "Mark checklist complete"} variant={reopen ? "ghost" : "default"} act={() => completeChecklistAction(checklistId, reopen)} />;
}

/** One checklist line: answer and note, saved per item. */
export function ChecklistItemForm({ item, disabled }: { item: { id: string; label: string; response: string; note: string }; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (f: FormData) => start(async () => {
    const r = await answerItemAction(item.id, { ok: true }, f);
    setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.fieldErrors?.note ?? r.error });
    if (r.ok) router.refresh();
  });
  return (
    <li className="py-3">
      <p className="text-sm">{item.label}</p>
      <form action={save} className="mt-2 flex flex-wrap items-start gap-2">
        <Select name="response" defaultValue={item.response} disabled={disabled} aria-label="Answer" className="w-28">
          <option value="">—</option><option value="YES">Yes</option><option value="NO">No</option><option value="NA">N/A</option>
        </Select>
        <Input name="note" defaultValue={item.note} disabled={disabled} placeholder="Note / reference to working paper" aria-label="Note" className="min-w-0 flex-1 basis-48" />
        {disabled ? null : <Button type="submit" size="sm" variant="secondary" disabled={pending}>Save</Button>}
        {msg ? <span className={`text-xs ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span> : null}
      </form>
    </li>
  );
}

export function AssignEqrDialog({ engagementId, candidates, current }: { engagementId: string; candidates: Opt[]; current?: string }) {
  return (
    <FormDialog trigger={current ? "Change EQR reviewer" : "Name EQR reviewer"} title="EQR reviewer" description="A Partner other than the engagement partner reviews the file before the report is signed." action={assignEqrAction.bind(null, engagementId)} submitLabel="Save">
      {(err) => (
        <Field label="Partner *" error={err("reviewerId")}>
          <Select name="reviewerId" required defaultValue={current ?? ""}><option value="" disabled>Choose…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
      )}
    </FormDialog>
  );
}

export function DeclareDialog({ engagementId, label, existing }: { engagementId: string; label: string; existing?: { hasConflict: boolean; note: string } | null }) {
  return (
    <FormDialog trigger={existing ? "Update" : "Declare"} triggerVariant={existing ? "ghost" : "default"} title="Independence declaration" description={`${label}. You confirm for yourself only; each team member declares separately.`} action={declareAction.bind(null, engagementId)} submitLabel="Record declaration">
      {(err) => (
        <>
          <p className="text-sm">I confirm that I am independent of this client and its related entities, and that I have no financial, family, business or other relationship that threatens my objectivity on this engagement, except as noted below.</p>
          <Checkbox name="hasConflict" defaultChecked={existing?.hasConflict} label="I have a relationship or threat to declare" />
          <Field label="Details" error={err("note")} hint="Required if you tick the box above"><Textarea name="note" defaultValue={existing?.note} rows={3} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function NewInspectionDialog({ defaultFrom, defaultTo, defaultSize }: { defaultFrom: string; defaultTo: string; defaultSize: number }) {
  return (
    <FormDialog trigger="New inspection" triggerVariant="default" title="New file inspection" description="A random sample of engagements closed in the period is picked for inspection." action={createInspectionAction} submitLabel="Create and sample">
      {(err) => (
        <>
          <Field label="Name *" error={err("name")}><Input name="name" required defaultValue="Periodic file inspection" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Closed from *" error={err("periodFrom")}><Input type="date" name="periodFrom" required defaultValue={defaultFrom} /></Field>
            <Field label="Closed to *" error={err("periodTo")}><Input type="date" name="periodTo" required defaultValue={defaultTo} /></Field>
          </div>
          <Field label="Sample size" error={err("sampleSize")}><Input type="number" name="sampleSize" min={1} max={100} defaultValue={defaultSize} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function AddFindingDialog({ inspectionId, samples, people }: { inspectionId: string; samples: Opt[]; people: Opt[] }) {
  return (
    <FormDialog trigger="Add finding" title="Record a finding" description="Give the corrective action an owner and a due date; the owner is notified." action={addFindingAction.bind(null, inspectionId)} submitLabel="Record">
      {(err) => (
        <>
          <Field label="Engagement" error={err("engagementId")}><Select name="engagementId" defaultValue=""><option value="">Firm-wide</option>{samples.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Finding *" error={err("finding")}><Textarea name="finding" required rows={3} /></Field>
          <Field label="Severity"><Select name="severity" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></Select></Field>
          <Field label="Corrective action" error={err("correctiveAction")}><Textarea name="correctiveAction" rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owner" error={err("ownerId")}><Select name="ownerId" defaultValue=""><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Due date" error={err("dueDate")}><Input type="date" name="dueDate" /></Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function CloseFindingDialog({ findingId }: { findingId: string }) {
  return (
    <FormDialog trigger="Close" triggerVariant="ghost" title="Close corrective action" action={closeFindingAction.bind(null, findingId)} submitLabel="Close">
      {(err) => <Field label="What was done" error={err("note")}><Input name="note" /></Field>}
    </FormDialog>
  );
}

export function CloseInspectionButton({ inspectionId }: { inspectionId: string }) {
  return <ActButton label="Close inspection" variant="ghost" act={() => closeInspectionAction(inspectionId)} />;
}

export function PeerReviewForms({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <a href={`/api/qc/peer-review?from=${from}&to=${to}`} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-4 text-sm font-medium hover:bg-gray-50">Download Excel</a>
        <ActionForm action={buildPackAction} submitLabel="Build zip with documents" className="flex flex-col gap-2">
          {() => (
            <>
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
            </>
          )}
        </ActionForm>
      </div>
      <Alert tone="info">Lists engagements with a UDIN or Partner sign-off in the period, or closed in it, with UDINs, reports (tagged report / signed) and review evidence.</Alert>
    </div>
  );
}
