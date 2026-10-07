"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { FormDialog } from "@/components/action-form";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

type LinkAction = (prev: ActionResult<{ link: string }>, f: FormData) => Promise<ActionResult<{ link: string }>>;
type Action = (prev: ActionResult, f: FormData) => Promise<ActionResult>;
type ClientOpt = { id: string; code: string; name: string };

/** Shows the one-time link once, with a copy button. It is not stored anywhere readable afterwards. */
function LinkResult({ link, message }: { link: string; message?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      {message ? <Alert tone="success">{message}</Alert> : null}
      <p className="text-sm">Send this link to the person yourself (email or WhatsApp). It works once, and is shown only now.</p>
      <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
      <Button type="button" size="sm" onClick={async () => { await navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</Button>
    </div>
  );
}

function LinkDialog({ trigger, title, triggerVariant = "secondary", action, children, submitLabel }: { trigger: string; title: string; triggerVariant?: "default" | "secondary" | "ghost"; action: LinkAction; children?: (err: (f: string) => string | undefined) => React.ReactNode; submitLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult<{ link: string }>, FormData>(async (p, f) => {
    const r = await action(p, f);
    if (r.ok) router.refresh();
    return r;
  }, { ok: true });
  const err = (f: string) => (!state.ok ? state.fieldErrors?.[f] : undefined);
  const done = state.ok && state.data?.link;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant={triggerVariant}>{trigger}</Button></DialogTrigger>
      {open ? (
        <DialogContent title={title}>
          {done ? <LinkResult link={state.data!.link} message={state.message} /> : (
            <form action={formAction} className="space-y-3">
              {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
              {children?.(err)}
              <Button type="submit" disabled={pending}>{pending ? "Working…" : submitLabel}</Button>
            </form>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function InviteDialog({ action, clients }: { action: LinkAction; clients: ClientOpt[] }) {
  return (
    <LinkDialog trigger="Invite portal user" title="Invite a client user" triggerVariant="default" action={action} submitLabel="Create invite link">
      {(err) => (
        <>
          <Field label="Client *" error={err("clientId")}><Select name="clientId" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)]}</Select></Field>
          <Field label="Name *" error={err("name")}><Input name="name" required /></Field>
          <Field label="Email *" hint="Their sign-in. An email that already has access gets this client added." error={err("email")}><Input name="email" type="email" required /></Field>
          <Field label="Mobile" error={err("mobile")}><Input name="mobile" inputMode="tel" /></Field>
        </>
      )}
    </LinkDialog>
  );
}

export function NewLinkDialog({ action }: { action: LinkAction }) {
  return <LinkDialog trigger="New link" title="New invite / password-reset link" triggerVariant="ghost" action={action} submitLabel="Create link" />;
}

export function AddClientDialog({ action, clients }: { action: Action; clients: ClientOpt[] }) {
  return (
    <FormDialog trigger="Add client" triggerVariant="ghost" title="Give access to another client" description="For a group's accountant or director who handles several entities." action={action} submitLabel="Add">
      {(err) => <Field label="Client" error={err("clientId")}><Select name="clientId" required>{clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}</Select></Field>}
    </FormDialog>
  );
}

export function RemoveClientDialog({ action, clientName, clientId }: { action: Action; clientName: string; clientId: string }) {
  return (
    <FormDialog trigger="Remove" triggerVariant="ghost" danger title={`Remove access to ${clientName}`} description="Takes effect on their next click. If no clients are left the user is deactivated." action={action} submitLabel="Remove access">
      {(err) => (
        <>
          <input type="hidden" name="clientId" value={clientId} />
          <Field label="Reason" error={err("reason")}><Input name="reason" required minLength={3} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function ActiveDialog({ action, active }: { action: Action; active: boolean }) {
  return (
    <FormDialog trigger={active ? "Deactivate" : "Reactivate"} triggerVariant="ghost" danger={active} title={active ? "Deactivate portal user" : "Reactivate portal user"} description={active ? "Signs them out everywhere and voids open links." : "They will need a new link if they have no password."} action={action} submitLabel={active ? "Deactivate" : "Reactivate"}>
      {(err) => <Field label="Reason" error={err("reason")}><Input name="reason" required={active} /></Field>}
    </FormDialog>
  );
}

export function ResetTotpDialog({ action }: { action: Action }) {
  return (
    <FormDialog trigger="Reset 2FA" triggerVariant="ghost" title="Reset two-factor login" description="For a lost phone. They set it up again after signing in." action={action} submitLabel="Reset">
      {() => null}
    </FormDialog>
  );
}
