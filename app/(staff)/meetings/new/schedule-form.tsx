"use client";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { scheduleMeetingAction } from "../actions";

type Opt = { id: string; name: string };

function Checks({ name, options, checked = [] }: { name: string; options: Opt[]; checked?: string[] }) {
  if (!options.length) return <p className="text-xs text-muted">None available.</p>;
  return (
    <div className="grid max-h-48 gap-1 overflow-auto rounded-md border border-line p-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} value={o.id} defaultChecked={checked.includes(o.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
          <span className="truncate">{o.name}</span>
        </label>
      ))}
    </div>
  );
}

export function ScheduleForm({ clientId, today, people, contacts, engagements, me }: { clientId: string; today: string; people: Opt[]; contacts: Opt[]; engagements: Opt[]; me: string }) {
  return (
    <ActionForm action={scheduleMeetingAction} submitLabel="Schedule">
      {(err) => (
        <>
          <input type="hidden" name="clientId" value={clientId} />
          <Field label="Title *" error={err("title")}><Input name="title" required maxLength={160} placeholder="e.g. Quarterly GST review" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date *" error={err("scheduledAt")}><Input type="date" name="date" required defaultValue={today} /></Field>
            <Field label="Time (IST) *"><Input type="time" name="time" required defaultValue="11:00" step={900} /></Field>
            <Field label="Duration" error={err("durationMinutes")}>
              <Select name="durationMinutes" defaultValue="60">{[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
            </Field>
          </div>
          <Field label="Location" error={err("location")}><Input name="location" placeholder="Office, client site or video call" /></Field>
          <Field label="Engagement" error={err("engagementId")}>
            <Select name="engagementId" defaultValue=""><option value="">None</option>{engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
          </Field>
          <Field label="Agenda" error={err("agenda")}><Textarea name="agenda" rows={4} /></Field>
          <div className="space-y-1"><p className="text-sm font-medium">Our attendees</p><Checks name="userIds" options={people} checked={[me]} />{err("userIds") ? <p className="text-xs text-red-700">{err("userIds")}</p> : null}</div>
          <div className="space-y-1"><p className="text-sm font-medium">Client attendees</p><Checks name="contactIds" options={contacts} />{err("contactIds") ? <p className="text-xs text-red-700">{err("contactIds")}</p> : null}</div>
        </>
      )}
    </ActionForm>
  );
}
