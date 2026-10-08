"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormDialog } from "@/components/action-form";

type Action = (prev: ActionResult<{ id: string }>, f: FormData) => Promise<ActionResult<{ id: string }>>;

/** Reply box: text and/or one file. Clears itself after sending. */
export function ReplyForm({ action, disabled }: { action: Action; disabled?: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string }>, FormData>(action, { ok: true });
  useEffect(() => {
    if (state.ok && state.message) {
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);
  if (disabled) return <p className="text-sm text-muted">{disabled}</p>;
  return (
    <form ref={form} action={formAction} className="space-y-2">
      {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Message" error={!state.ok ? state.fieldErrors?.body : undefined}><Textarea name="body" rows={3} /></Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Attach a file (optional)" className="min-w-0 flex-1"><Input type="file" name="file" className="h-auto py-1.5" /></Field>
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
      </div>
    </form>
  );
}

type ClientOpt = { id: string; name: string; engagements: { id: string; name: string }[] };

/** New conversation: client (when more than one), optional engagement, subject, first message. */
export function NewThreadDialog({ action, clients, base }: { action: Action; clients: ClientOpt[]; base: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [state, formAction, pending] = useActionState<ActionResult<{ id: string }>, FormData>(action, { ok: true });
  useEffect(() => {
    if (state.ok && state.data?.id) router.push(`${base}/${state.data.id}`);
  }, [state, router, base]);
  const err = (k: string) => (!state.ok ? state.fieldErrors?.[k] : undefined);
  const engagements = clients.find((c) => c.id === clientId)?.engagements ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={!clients.length}>New conversation</Button></DialogTrigger>
      {open ? (
        <DialogContent title="New conversation">
          <form action={formAction} className="space-y-3">
            {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
            {clients.length > 1 ? (
              <Field label="Client" error={err("clientId")}><Select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            ) : <input type="hidden" name="clientId" value={clientId} />}
            {engagements.length ? (
              <Field label="About (optional)" error={err("engagementId")}><Select name="engagementId" defaultValue="">{[<option key="" value="">General</option>, ...engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)]}</Select></Field>
            ) : null}
            <Field label="Subject" error={err("subject")}><Input name="subject" required /></Field>
            <Field label="Message" error={err("body")}><Textarea name="body" rows={4} required /></Field>
            <Field label="Attach a file (optional)"><Input type="file" name="file" className="h-auto py-1.5" /></Field>
            <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function CloseThreadButton({ closed, action }: { closed: boolean; action: (prev: ActionResult, f: FormData) => Promise<ActionResult> }) {
  return (
    <FormDialog trigger={closed ? "Reopen" : "Close"} title={closed ? "Reopen conversation" : "Close conversation"} description={closed ? "You can reply again." : "Nothing more is needed. The client can still reopen it by writing."} action={action} submitLabel={closed ? "Reopen" : "Close"}>
      {() => null}
    </FormDialog>
  );
}
