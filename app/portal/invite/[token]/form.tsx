"use client";
import { useActionState } from "react";
import Link from "next/link";
import type { ActionResult } from "@/lib/action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";

const err = (s: ActionResult, k: string) => (!s.ok ? s.fieldErrors?.[k] : undefined);

export function SetPasswordForm({ action, email }: { action: (s: ActionResult, f: FormData) => Promise<ActionResult>; email: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: true });
  if (state.ok && state.message) {
    return (
      <div className="space-y-3">
        <Alert tone="success">{state.message}</Alert>
        <Link className="block text-center text-sm font-medium text-brand underline" href="/portal/login">Go to sign in</Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-3">
      {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label="New password" hint="At least 10 characters, with a letter and a number." error={err(state, "password")}><Input name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Repeat password" error={err(state, "confirm")}><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button>
    </form>
  );
}
