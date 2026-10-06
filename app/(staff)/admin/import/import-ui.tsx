"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateImportAction, applyImportAction } from "../actions";
import type { ActionResult } from "@/lib/action";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";

export function ImportUpload({ kinds }: { kinds: { kind: string; title: string }[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult<{ jobId: string }>, FormData>(validateImportAction, { ok: true });
  useEffect(() => {
    if (state.ok && state.data?.jobId) router.push(`/admin/import?job=${state.data.jobId}`);
  }, [state, router]);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {!state.ok ? <Alert tone="error" className="w-full">{state.error}</Alert> : null}
      <Field label="What are you importing?"><Select name="kind">{kinds.map((k) => <option key={k.kind} value={k.kind}>{k.title}</option>)}</Select></Field>
      <Field label="Filled template (.xlsx)"><Input type="file" name="file" accept=".xlsx" required className="h-auto py-1.5" /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Upload and check"}</Button>
    </form>
  );
}

export function ApplyImport({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<{ created: number; notes: string[]; tempPasswords?: { username: string; tempPassword: string }[] }> | null>(null);
  return (
    <div className="space-y-2">
      <Button disabled={pending || Boolean(result?.ok)} onClick={() => start(async () => { const r = await applyImportAction(jobId); setResult(r); router.refresh(); })}>
        {pending ? "Applying…" : "Apply import"}
      </Button>
      {result && !result.ok ? <Alert tone="error">{result.error}</Alert> : null}
      {result?.ok ? (
        <Alert tone="success">
          {result.message} {result.data?.notes.join(" ")}
          {result.data?.tempPasswords?.length ? (
            <div className="mt-2">
              <p className="font-medium">Temporary passwords — shown once, copy them now:</p>
              {result.data.tempPasswords.map((t) => <p key={t.username} className="font-mono text-xs">{t.username}: {t.tempPassword}</p>)}
            </div>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
