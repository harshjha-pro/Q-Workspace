"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/action-form";
import { Field, Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { backupNowAction, requestRestoreAction, approveRestoreAction, uploadBackupAction } from "../actions";

export function BackupNow() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <Button disabled={pending} onClick={() => start(async () => { const r = await backupNowAction(); setMsg(r.ok ? r.message ?? "" : r.error); router.refresh(); })}>{pending ? "Backing up…" : "Back up now"}</Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </span>
  );
}

export function UploadBackup() {
  return (
    <FormDialog trigger="Upload a backup" title="Upload a backup file" description="Bring in a backup taken on another computer. It is checked before it can be restored." action={uploadBackupAction} submitLabel="Upload">
      {() => <Field label="Backup (.zip)"><Input type="file" name="file" accept=".zip" required className="h-auto py-1.5" /></Field>}
    </FormDialog>
  );
}

export function RestoreControls({ id, requested, isPartner, canDownload }: { id: string; requested: boolean; isPartner: boolean; canDownload: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {canDownload ? <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/api/backups/${id}`}>Download</a> : null}
      {!requested ? (
        <FormDialog trigger="Request restore" triggerVariant="ghost" title="Request a restore" description="A Partner must approve before anything changes." action={requestRestoreAction.bind(null, id)} submitLabel="Request">
          {(err) => <Field label="Why? *" error={err("note")}><Input name="note" required /></Field>}
        </FormDialog>
      ) : isPartner ? (
        <FormDialog trigger="Approve & restore" triggerVariant="danger" danger title="Approve and restore" description="All current data will be replaced by this backup. The current state is saved first." action={approveRestoreAction.bind(null, id)} submitLabel="Restore now">
          {(err) => <Field label="Type RESTORE to confirm" error={err("confirm")}><Input name="confirm" autoComplete="off" required /></Field>}
        </FormDialog>
      ) : (
        <span className="text-xs text-muted">Waiting for a Partner</span>
      )}
    </div>
  );
}
