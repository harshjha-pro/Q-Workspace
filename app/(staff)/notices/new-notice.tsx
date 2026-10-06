"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { AUTHORITY_LABELS } from "./labels";
import { createNoticeAction } from "./actions";

type Option = { id: string; name: string };

export function NewNoticeDialog({ authorities, clients, people, today }: { authorities: string[]; clients: Option[]; people: Option[]; today: string }) {
  return (
    <FormDialog trigger="New notice" triggerVariant="default" title="Record a notice" description="A response task is created for the assignee." action={createNoticeAction} submitLabel="Record notice">
      {(err) => (
        <>
          <Field label="Client *" error={err("clientId")}>
            <Select name="clientId" required defaultValue=""><option value="" disabled>Choose client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Authority *" error={err("authority")}>
              <Select name="authority" defaultValue="INCOME_TAX">{authorities.map((a) => <option key={a} value={a}>{AUTHORITY_LABELS[a] ?? a}</option>)}</Select>
            </Field>
            <Field label="Section" error={err("section")}><Input name="section" placeholder="e.g. 143(2), 73" /></Field>
            <Field label="AY / period" error={err("ayOrPeriod")}><Input name="ayOrPeriod" placeholder="e.g. AY 2025-26" /></Field>
            <Field label="Notice type" error={err("noticeType")}><Input name="noticeType" placeholder="e.g. Scrutiny, ASMT-10" /></Field>
          </div>
          <Field label="Reference / DIN" error={err("referenceNo")}><Input name="referenceNo" /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Notice date" error={err("noticeDate")}><Input type="date" name="noticeDate" max={today} /></Field>
            <Field label="Received on *" error={err("receivedDate")}><Input type="date" name="receivedDate" defaultValue={today} max={today} required /></Field>
            <Field label="Response due" error={err("responseDueDate")} hint="Blank = received + 15 days"><Input type="date" name="responseDueDate" /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Assignee" error={err("assigneeId")}>
              <Select name="assigneeId" defaultValue=""><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
            <Field label="Reviewer" error={err("reviewerId")}>
              <Select name="reviewerId" defaultValue=""><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
          </div>
          <Field label="Demand (₹)" error={err("demandRupees")} hint="Leave blank if no demand is raised"><Input name="demand" inputMode="decimal" /></Field>
          <Field label="Summary" error={err("summary")}><Textarea name="summary" placeholder="What the notice asks for" /></Field>
          <Checkbox name="createTask" defaultChecked label="Create a response task" />
        </>
      )}
    </FormDialog>
  );
}
