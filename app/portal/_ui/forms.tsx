"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

type Action = (prev: ActionResult, f: FormData) => Promise<ActionResult>;

/** A small inline form for the portal: shows the result in place and refreshes the page on success. */
function useResult(action: Action) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: true });
  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [state, router]);
  const err = (k: string) => (!state.ok ? state.fieldErrors?.[k] : undefined);
  const banner = !state.ok ? <Alert tone="error">{state.error}</Alert> : state.message ? <Alert tone="success">{state.message}</Alert> : null;
  return { formAction, pending, err, banner };
}

export function UploadForm({ action, clientId, checklistItemId, clients }: { action: Action; clientId?: string; checklistItemId?: string; clients?: { id: string; name: string }[] }) {
  const { formAction, pending, err, banner } = useResult(action);
  return (
    <form action={formAction} className="space-y-2">
      {banner}
      {checklistItemId ? <input type="hidden" name="checklistItemId" value={checklistItemId} /> : null}
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : (
        <Field label="For" error={err("clientId")}><Select name="clientId" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      )}
      {!checklistItemId ? <Field label="What is it?" error={err("description")}><Input name="description" required placeholder="e.g. Rent agreement 2026-27" /></Field> : null}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="File" error={err("file")} className="min-w-0 flex-1"><Input type="file" name="file" required className="h-auto py-1.5" /></Field>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
      </div>
    </form>
  );
}

export function ApprovalForm({ approve, reject }: { approve: Action; reject: Action }) {
  const a = useResult(approve);
  const r = useResult(reject);
  const [showReject, setShowReject] = useState(false);
  return (
    <div className="space-y-2">
      {a.banner}
      {r.banner}
      <div className="flex flex-wrap gap-2">
        <form action={a.formAction}><Button type="submit" size="sm" disabled={a.pending}>Approve</Button></form>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowReject((v) => !v)}>Not approved</Button>
      </div>
      {showReject ? (
        <form action={r.formAction} className="space-y-2">
          <Field label="What needs to change?" error={r.err("comment")}><Textarea name="comment" rows={3} required /></Field>
          <Button type="submit" size="sm" variant="secondary" disabled={r.pending}>Send to the firm</Button>
        </form>
      ) : null}
    </div>
  );
}

export function ConfirmButtons({ buttons }: { buttons: { label: string; action: Action; variant?: "default" | "secondary"; confirm?: string }[] }) {
  return <div className="flex flex-wrap gap-2">{buttons.map((b) => <OneButton key={b.label} {...b} />)}</div>;
}

function OneButton({ label, action, variant, confirm }: { label: string; action: Action; variant?: "default" | "secondary"; confirm?: string }) {
  const { formAction, pending, banner } = useResult(action);
  return (
    <form action={formAction} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="space-y-1">
      {banner}
      <Button type="submit" size="sm" variant={variant ?? "default"} disabled={pending}>{label}</Button>
    </form>
  );
}

export function FeedbackForm({ action }: { action: Action }) {
  const { formAction, pending, err, banner } = useResult(action);
  return (
    <form action={formAction} className="space-y-2">
      {banner}
      <fieldset>
        <legend className="mb-1 text-sm">How did we do? (1 = poor, 5 = excellent)</legend>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" value={n} required /> {n}</label>)}
        </div>
        {err("rating") ? <p className="text-xs text-red-700">{err("rating")}</p> : null}
      </fieldset>
      <Field label="Anything to add?" error={err("comment")}><Textarea name="comment" rows={2} /></Field>
      <Button type="submit" size="sm" disabled={pending}>Send</Button>
    </form>
  );
}
