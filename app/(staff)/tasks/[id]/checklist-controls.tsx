"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Field, Select, Textarea, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActButton } from "../act-button";
import { logReminderAction, updateChecklistItemAction } from "../actions";

const ITEM_STATUSES = [
  { value: "NOT_REQUESTED", label: "Not requested" },
  { value: "REQUESTED", label: "Requested" },
  { value: "RECEIVED", label: "Received" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
] as const;
type ItemStatus = (typeof ITEM_STATUSES)[number]["value"];

/** Status picker for one checklist item; saves on change. */
export function ChecklistStatus({ taskId, itemId, status, label, disabled }: { taskId: string; itemId: string; status: string; label: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Select aria-label={`Status of ${label}`} className="h-8 w-40 text-xs" value={status} disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value as ItemStatus;
          start(async () => {
            const r = await updateChecklistItemAction(taskId, itemId, { status: next });
            setError(r.ok ? null : r.error);
            router.refresh();
          });
        }}>
        {ITEM_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </Select>
      {error ? <span role="alert" className="mt-1 text-xs text-red-600">{error}</span> : null}
    </span>
  );
}

export function ConfirmUploadButton({ taskId, itemId }: { taskId: string; itemId: string }) {
  return <ActButton action={() => updateChecklistItemAction(taskId, itemId, { confirm: true })}>Confirm upload</ActButton>;
}

const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
];

/**
 * "Copy pending list" + "Mark as sent". Nothing is sent from the app: staff copy the text into
 * WhatsApp / email themselves, then log that they did.
 */
export function PendingMessage({ taskId, text, items, channel, canLog }: { taskId: string; text: string; items: number; channel: string; canLog: boolean }) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState(text);
  const preferred = channel === "PHONE" ? "CALL" : CHANNELS.some((c) => c.value === channel) ? channel : "EMAIL";
  return (
    <div className="space-y-2">
      <Field label={`Message (${items} requested item${items === 1 ? "" : "s"})`} hint="Edit before copying if needed. Items come from checklist rows marked Requested.">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="min-h-48 font-mono text-xs" />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={async () => {
          try {
            await navigator.clipboard.writeText(msg);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy pending list"}
        </Button>
      </div>
      {canLog ? (
        <ActionForm action={logReminderAction.bind(null, taskId)} submitLabel="Mark as sent" className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          {() => (
            <>
              <input type="hidden" name="messageText" value={msg} />
              <Field label="Sent by" className="w-36"><Select name="channel" defaultValue={preferred}>{CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
              <Field label="Note (optional)" className="min-w-40 flex-1"><Input name="note" placeholder="e.g. Sent to accountant Mr. Rao" /></Field>
            </>
          )}
        </ActionForm>
      ) : null}
    </div>
  );
}
