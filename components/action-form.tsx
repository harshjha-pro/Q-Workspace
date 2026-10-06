"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action. Field errors come back from the service and are shown under
 * the field named in `fieldErrors` via the `errorFor` render prop.
 */
export function ActionForm({
  action, submitLabel = "Save", children, onSuccess, className, danger,
}: {
  action: Action;
  submitLabel?: string;
  children: (errorFor: (field: string) => string | undefined) => React.ReactNode;
  onSuccess?: () => void;
  className?: string;
  danger?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: true });
  useEffect(() => {
    if (state.ok && state.message) {
      router.refresh();
      onSuccess?.();
    }
  }, [state, router, onSuccess]);
  const errorFor = (f: string) => (!state.ok ? state.fieldErrors?.[f] : undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {!state.ok ? <Alert tone="error">{state.error}</Alert> : state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {children(errorFor)}
      <Button type="submit" variant={danger ? "danger" : "default"} disabled={pending}>{pending ? "Working…" : submitLabel}</Button>
    </form>
  );
}

/** A button that opens a dialog containing an ActionForm; closes on success. */
export function FormDialog({
  trigger, title, description, action, submitLabel, children, danger, triggerVariant = "secondary",
}: {
  trigger: string;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  children: (errorFor: (field: string) => string | undefined) => React.ReactNode;
  danger?: boolean;
  triggerVariant?: "default" | "secondary" | "ghost" | "danger" | "link";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant={triggerVariant}>{trigger}</Button></DialogTrigger>
      {open ? (
        <DialogContent title={title} description={description}>
          <ActionForm action={action} submitLabel={submitLabel} onSuccess={() => setOpen(false)} danger={danger}>{children}</ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
