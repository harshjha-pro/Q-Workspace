"use client";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionButton } from "../../work/action-button";
import { assignAction, faqAction, replyAction, statusAction } from "../actions";
import { SERVICE_LINE_LABELS } from "../../knowledge/labels";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export function ReplyForm({ id, handler }: { id: string; handler: boolean }) {
  return (
    <ActionForm action={replyAction.bind(null, id)} submitLabel="Send">
      {(err) => (
        <>
          <Field label="Reply" error={err("body")}><Textarea name="body" required rows={4} /></Field>
          {handler ? <Checkbox name="internal" label="Internal note (not visible to the person who raised it)" /> : null}
        </>
      )}
    </ActionForm>
  );
}

export function StatusButtons({ id, status, handler, raiser }: { id: string; status: Status; handler: boolean; raiser: boolean }) {
  const btn = (to: Status, label: string, variant: "default" | "secondary" = "secondary") => <ActionButton key={to} variant={variant} action={statusAction.bind(null, id, to)}>{label}</ActionButton>;
  const out: React.ReactNode[] = [];
  if (handler) {
    if (status === "OPEN") out.push(btn("IN_PROGRESS", "Start work"));
    if (status === "OPEN" || status === "IN_PROGRESS") out.push(btn("RESOLVED", "Mark resolved", "default"));
    if (status === "RESOLVED") out.push(btn("CLOSED", "Close"));
  } else if (raiser && status === "RESOLVED") out.push(btn("CLOSED", "Close — it is sorted", "default"));
  if ((handler || raiser) && (status === "RESOLVED" || status === "CLOSED")) out.push(btn("OPEN", "Reopen"));
  return out.length ? <div className="flex flex-wrap gap-2">{out}</div> : null;
}

export function AssignForm({ id, current, handlers }: { id: string; current: string; handlers: { id: string; name: string }[] }) {
  return (
    <FormDialog trigger="Assign" title="Assign ticket" action={assignAction.bind(null, id)} submitLabel="Save">
      {(err) => (
        <Field label="Assignee" error={err("assigneeId")}>
          <Select name="assigneeId" defaultValue={current}>
            <option value="">Nobody</option>
            {handlers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </Field>
      )}
    </FormDialog>
  );
}

export function FaqDialog({ id, subject, answer }: { id: string; subject: string; answer: string }) {
  return (
    <FormDialog trigger="Convert to FAQ" title="Convert to FAQ" description="Creates a published FAQ in the knowledge base, tagged FAQ. Remove personal details first." action={faqAction.bind(null, id)} submitLabel="Create FAQ">
      {(err) => (
        <>
          <Field label="Question *" error={err("title")}><Input name="title" required defaultValue={subject.replace(/^\[[^\]]+\]\s*/, "")} /></Field>
          <Field label="Answer *" error={err("body")}><Textarea name="body" required rows={6} defaultValue={answer} /></Field>
          <Field label="Service line" error={err("serviceLine")}>
            <Select name="serviceLine" defaultValue=""><option value="">Firm-wide</option>{Object.entries(SERVICE_LINE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
        </>
      )}
    </FormDialog>
  );
}
