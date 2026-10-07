"use client";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { ActionButton } from "../../work/action-button";
import { addActionItemAction, rescheduleAction, saveMinutesAction, setMeetingStatusAction } from "../actions";

export function MinutesForm({ id, notes, held }: { id: string; notes: string; held: boolean }) {
  return (
    <ActionForm action={saveMinutesAction.bind(null, id)} submitLabel="Save minutes">
      {(err) => (
        <>
          <Field label="Notes / minutes" error={err("notes")}><Textarea name="notes" rows={8} defaultValue={notes} placeholder="Decisions, discussion points, documents promised…" /></Field>
          {!held ? <Checkbox name="markHeld" label="Mark the meeting as held" defaultChecked /> : null}
        </>
      )}
    </ActionForm>
  );
}

export function ActionItemDialog({ id, people, today }: { id: string; people: { id: string; name: string }[]; today: string }) {
  return (
    <FormDialog trigger="Add action item" triggerVariant="default" title="Add action item" description="Creates a one-off task for this client, assigned to the owner, with this due date." action={addActionItemAction.bind(null, id)} submitLabel="Add">
      {(err) => (
        <>
          <Field label="Action *" error={err("title")}><Input name="title" required maxLength={200} /></Field>
          <Field label="Owner *" error={err("ownerId")}>
            <Select name="ownerId" required defaultValue=""><option value="" disabled>Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
          <Field label="Due date *" error={err("dueDate")}><Input type="date" name="dueDate" required min={today} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function EditMeetingDialog({ id, v }: { id: string; v: { title: string; date: string; time: string; durationMinutes: number; location: string; agenda: string } }) {
  return (
    <FormDialog trigger="Edit details" title="Edit meeting" action={rescheduleAction.bind(null, id)} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Title *" error={err("title")}><Input name="title" required defaultValue={v.title} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date *" error={err("scheduledAt")}><Input type="date" name="date" required defaultValue={v.date} /></Field>
            <Field label="Time (IST) *"><Input type="time" name="time" required defaultValue={v.time} step={900} /></Field>
            <Field label="Duration (min)" error={err("durationMinutes")}><Input type="number" name="durationMinutes" min={15} max={600} step={15} defaultValue={v.durationMinutes} /></Field>
          </div>
          <Field label="Location" error={err("location")}><Input name="location" defaultValue={v.location} /></Field>
          <Field label="Agenda" error={err("agenda")}><Textarea name="agenda" rows={4} defaultValue={v.agenda} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function StatusButton({ id, to, label, confirm }: { id: string; to: "SCHEDULED" | "HELD" | "CANCELLED"; label: string; confirm?: string }) {
  return <ActionButton action={setMeetingStatusAction.bind(null, id, to)} confirm={confirm} variant={to === "CANCELLED" ? "ghost" : "secondary"}>{label}</ActionButton>;
}
