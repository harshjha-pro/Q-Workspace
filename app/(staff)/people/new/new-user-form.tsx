"use client";
import { useActionState } from "react";
import Link from "next/link";
import { createUserAction } from "../actions";
import type { ActionResult } from "@/lib/action";
import { UserFields, type UserFieldOptions } from "../user-fields";
import { Field, Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";

export function NewUserForm({ options }: { options: UserFieldOptions }) {
  const [state, action, pending] = useActionState<ActionResult<{ id: string; tempPassword: string }>, FormData>(createUserAction, { ok: true });
  if (state.ok && state.data) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <Alert tone="success">Login created.</Alert>
          <p className="text-sm">Temporary password (shown once — share it privately; it must be changed at first login):</p>
          <p className="rounded bg-gray-100 px-3 py-2 font-mono text-lg">{state.data.tempPassword}</p>
          <Link className={buttonVariants()} href={`/people/${state.data.id}`}>Open profile</Link>
        </CardContent>
      </Card>
    );
  }
  const err = (k: string) => (!state.ok ? state.fieldErrors?.[k] : undefined);
  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-3">
          {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
          <Field label="Username *" hint="Lower-case, e.g. ravi.kumar" error={err("username")}><Input name="username" autoCapitalize="none" required /></Field>
          <UserFields options={options} err={err} />
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create login"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
