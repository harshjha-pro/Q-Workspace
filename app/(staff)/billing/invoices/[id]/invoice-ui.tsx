"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { cancelAction, decideWriteOffAction, eInvoiceAction, issueAction, markReminderSentAction, writeOffAction } from "../../actions";

export function IssueDialog({ id, date, today, retainer }: { id: string; date: string; today: string; retainer: boolean }) {
  return (
    <FormDialog trigger={retainer ? "Approve & issue" : "Issue invoice"} triggerVariant="default" title="Issue invoice" description="The next number of the financial-year series is allocated now. An issued invoice cannot be edited — only cancelled with a reason." action={issueAction.bind(null, id)} submitLabel="Issue">
      {(err) => <Field label="Invoice date *" error={err("date")}><Input type="date" name="date" defaultValue={date > today ? today : date} max={today} required /></Field>}
    </FormDialog>
  );
}

export function CancelDialog({ id, draft }: { id: string; draft: boolean }) {
  return (
    <FormDialog trigger={draft ? "Discard draft" : "Cancel invoice"} triggerVariant="ghost" title={draft ? "Discard draft" : "Cancel invoice"} description={draft ? "The draft is kept in the trail as cancelled; no number is used." : "The number stays used (the series remains gapless). Linked disbursements become unrecovered again."} action={cancelAction.bind(null, id)} submitLabel={draft ? "Discard" : "Cancel invoice"} danger>
      {(err) => <Field label="Reason *" error={err("reason")}><Input name="reason" required placeholder={draft ? "e.g. Duplicate" : "e.g. Raised on wrong client"} /></Field>}
    </FormDialog>
  );
}

export function EInvoiceDialog({ id, irn, ackNo, ackDate }: { id: string; irn: string; ackNo: string; ackDate: string }) {
  return (
    <FormDialog trigger={irn ? "Edit IRN" : "Enter IRN"} title="E-invoice details" description="Copy these from the IRP after generating the e-invoice. The app does not connect to the IRP." action={eInvoiceAction.bind(null, id)} submitLabel="Save">
      {(err) => (
        <>
          <Field label="IRN" error={err("irn")} hint="64 characters"><Input name="irn" defaultValue={irn} className="font-mono text-xs" maxLength={64} autoComplete="off" /></Field>
          <Field label="Ack no." error={err("ackNo")}><Input name="ackNo" defaultValue={ackNo} inputMode="numeric" /></Field>
          <Field label="Ack date" error={err("ackDate")}><Input type="date" name="ackDate" defaultValue={ackDate} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function WriteOffDialog({ id, balance, approver }: { id: string; balance: string; approver: boolean }) {
  return (
    <FormDialog trigger="Write off" triggerVariant="ghost" title="Write off balance" description={approver ? `Balance ${balance}. Approved immediately.` : `Balance ${balance}. A Partner must approve.`} action={writeOffAction.bind(null, id)} submitLabel={approver ? "Write off" : "Request write-off"} danger>
      {(err) => (
        <>
          <Field label="Amount (₹)" error={err("amount") ?? err("amountPaise")} hint="Leave blank for the full balance"><Input name="amount" inputMode="decimal" /></Field>
          <Field label="Reason *" error={err("reason")}><Input name="reason" required /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function DecideWriteOff({ writeOffId, invoiceId }: { writeOffId: string; invoiceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = (approve: boolean) => start(async () => {
    const r = await decideWriteOffAction(writeOffId, invoiceId, approve);
    if (!r.ok) setMsg(r.error);
    else router.refresh();
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button size="sm" onClick={() => go(true)} disabled={pending}>Approve</Button>
      <Button size="sm" variant="ghost" onClick={() => go(false)} disabled={pending}>Reject</Button>
      {msg ? <span className="text-xs text-red-600">{msg}</span> : null}
    </span>
  );
}

/** Copy-ready payment reminder with a "Mark as sent" log (no email/WhatsApp sending, brief §4). */
export function ReminderCopy({ invoiceId, ruleCode, text }: { invoiceId: string; ruleCode: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Reminder</Button></DialogTrigger>
      {open ? (
        <DialogContent title="Payment reminder" description="Copy the text into email or WhatsApp, send it, then mark it as sent.">
          <div className="space-y-3">
            <Textarea readOnly value={text} className="min-h-48 font-mono text-xs" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" type="button" onClick={copy}>{copied ? "Copied" : "Copy text"}</Button>
            </div>
            <ActionForm action={markReminderSentAction.bind(null, invoiceId, ruleCode)} submitLabel="Mark as sent" onSuccess={() => setOpen(false)}>
              {(err) => (
                <>
                  <input type="hidden" name="messageText" value={text} />
                  <Field label="Sent by" error={err("channel")}>
                    <Select name="channel" defaultValue="WHATSAPP"><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option><option value="CALL">Phone call</option><option value="MEETING">Meeting</option></Select>
                  </Field>
                </>
              )}
            </ActionForm>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function Notice({ text, tone = "info" }: { text: string; tone?: "info" | "warn" }) {
  return <Alert tone={tone}>{text}</Alert>;
}
