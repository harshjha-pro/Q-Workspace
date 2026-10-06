"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/action-form";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { UserFields, type UserFieldOptions, type UserFieldValues } from "../user-fields";
import { updateUserAction, resetPasswordAction, resetTotpAction, deactivateAction, reactivateAction } from "../actions";

export function PersonAdminActions({ id, active, options, values }: { id: string; active: boolean; options: UserFieldOptions; values: UserFieldValues }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; temp?: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string; data?: unknown }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: r.message ?? "Done.", temp: (r.data as { tempPassword?: string } | undefined)?.tempPassword } : { tone: "error", text: r.error ?? "Failed" });
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <FormDialog trigger="Edit" title="Edit person" action={updateUserAction.bind(null, id)}>{(err) => <UserFields options={options} v={values} err={err} />}</FormDialog>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => confirm("Reset this person's password? They will be signed out.") && run(() => resetPasswordAction(id))}>Reset password</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => confirm("Reset two-factor login? They will set it up again.") && run(() => resetTotpAction(id))}>Reset 2FA</Button>
        {active ? (
          <FormDialog trigger="Deactivate (offboard)" triggerVariant="danger" danger title="Deactivate and revoke access" description="Signs them out everywhere, ends team memberships, vault grants and portal threads. History stays attributed." action={deactivateAction.bind(null, id)} submitLabel="Deactivate">
            {(err) => <Field label="Reason *" error={err("reason")}><Input name="reason" required placeholder="e.g. Resigned — last working day 31-Oct" /></Field>}
          </FormDialog>
        ) : (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => reactivateAction(id))}>Reactivate</Button>
        )}
      </div>
      {msg ? (
        <Alert tone={msg.tone}>
          {msg.text}
          {msg.temp ? <span className="ml-2">Temporary password (shown once): <span className="font-mono font-semibold">{msg.temp}</span></span> : null}
        </Alert>
      ) : null}
    </div>
  );
}
