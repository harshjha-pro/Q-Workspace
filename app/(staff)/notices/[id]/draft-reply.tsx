"use client";
import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

type Result = ActionResult<{ documentId: string | null; missing: string[] }>;
type Ctx = { templates: { code: string; name: string; approved: boolean }[]; defaultCode: string | null; prefill: Record<string, string> };

/** Draft a reply from the firm's approved template (D-85). Fields start from the register; submissions are yours. */
export function DraftReplyDialog({ action, ctx }: { action: (p: Result, f: FormData) => Promise<Result>; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<Result, FormData>(action, { ok: true });
  const err = (k: string) => (!state.ok ? state.fieldErrors?.[k] : undefined);
  const approved = ctx.templates.filter((t) => t.approved);
  const p = ctx.prefill;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Draft reply</Button></DialogTrigger>
      {open ? (
        <DialogContent title="Draft a reply" description="Merged into the firm's approved reply template and filed as a Word draft with this notice's documents. Review and edit it before it goes out.">
          {state.ok && state.data ? (
            <div className="space-y-2">
              <Alert tone="success">{state.message}</Alert>
              {state.data.missing.length ? <Alert tone="warn">Still blank in the draft: {state.data.missing.join(", ")}. Fill them in Word.</Alert> : null}
              {state.data.documentId ? <a className="text-sm underline" href={`/api/dms/${state.data.documentId}`}>Download the draft</a> : null}
            </div>
          ) : !approved.length ? (
            <Alert tone="warn">No notice-reply template is approved yet. A Partner approves one under Admin → Document templates.</Alert>
          ) : (
            <form action={formAction} className="space-y-3">
              {!state.ok ? <Alert tone="error">{state.error}</Alert> : null}
              <Field label="Template" error={err("code")}><Select name="code" defaultValue={ctx.defaultCode ?? approved[0]!.code}>{approved.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Officer (designation)"><Input name="officerDesignation" defaultValue={p.officerDesignation} placeholder="e.g. Assessment Unit" /></Field>
                <Field label="Office address"><Input name="officeAddress" defaultValue={p.officeAddress} /></Field>
                <Field label="Notice reference"><Input name="noticeReference" defaultValue={p.noticeReference} /></Field>
                <Field label="Notice date"><Input name="noticeDate" defaultValue={p.noticeDate} /></Field>
                <Field label="Period / AY"><Input name="period" defaultValue={p.period} /></Field>
                <Field label="What the notice asks for"><Input name="matterRequested" defaultValue={p.matterRequested} /></Field>
              </div>
              <Field label="Submissions *" hint="Your submissions, in your words." error={err("submissions")}><Textarea name="submissions" rows={6} required /></Field>
              <Field label="Documents enclosed" hint="Pre-filled from the documents on this notice's task."><Textarea name="enclosures" rows={3} defaultValue={p.enclosures} /></Field>
              <Button type="submit" disabled={pending}>{pending ? "Drafting…" : "Create draft"}</Button>
            </form>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
