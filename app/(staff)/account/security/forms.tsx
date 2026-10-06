"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, beginTotpAction, confirmTotpAction } from "./actions";
import type { ActionResult } from "@/lib/action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";

const err = (s: ActionResult, k: string) => (!s.ok ? s.fieldErrors?.[k] : undefined);

export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(changePasswordAction, { ok: true });
  return (
    <form action={action} className="max-w-sm space-y-3">
      {!state.ok ? <Alert tone="error">{state.error}</Alert> : state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label="Current password" error={err(state, "current")}><Input name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" hint="At least 10 characters, with a letter and a number." error={err(state, "next")}><Input name="next" type="password" autoComplete="new-password" required /></Field>
      <Field label="Repeat new password" error={err(state, "confirm")}><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}

export function TotpSetup() {
  const router = useRouter();
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (p, f) => {
    const r = await confirmTotpAction(p, f);
    if (r.ok) router.refresh();
    return r;
  }, { ok: true });

  if (!qr) {
    return (
      <div className="space-y-2">
        {startError ? <Alert tone="error">{startError}</Alert> : null}
        <Button onClick={() => startTransition(async () => {
          const r = await beginTotpAction();
          if (r.ok && r.data) setQr(r.data);
          else if (!r.ok) setStartError(r.error);
        })} disabled={starting}>{starting ? "Preparing…" : "Set up two-factor login"}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy…).</li>
        <li>Scan this QR code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded border border-line" />
      <p className="font-mono text-xs break-all text-muted">Key: {qr.secret}</p>
      <form action={action} className="flex max-w-xs items-end gap-2">
        <Field label="Code" error={!state.ok ? state.error : undefined} className="flex-1">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" required />
        </Field>
        <Button type="submit" disabled={pending}>Confirm</Button>
      </form>
    </div>
  );
}
