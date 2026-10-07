"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { addNoteAction, saveRecordAction } from "./actions";

type Option = { id: string; name: string };
export type RecordCurrent = { institute: string; registrationNo: string; principalId: string; startDate: string; expectedEndDate: string; leaveEntitledDays: number; stipendYear: number; notes: string };

export function RecordDialog({ userId, partners, current, trigger }: { userId: string; partners: Option[]; current?: RecordCurrent; trigger: string }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={current ? "secondary" : "default"} title="Articleship registration" description="Leave entitlement follows the institute's regulations: enter the figure for this article's scheme." action={saveRecordAction.bind(null, userId)} submitLabel="Save">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Institute" error={err("institute")}><Select name="institute" defaultValue={current?.institute ?? "ICAI"}><option value="ICAI">ICAI</option><option value="ICSI">ICSI</option></Select></Field>
            <Field label="Registration no. *" error={err("registrationNo")}><Input name="registrationNo" defaultValue={current?.registrationNo} required /></Field>
            <Field label="Principal *" error={err("principalId")}><Select name="principalId" defaultValue={current?.principalId ?? ""}><option value="">Choose…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Stipend year" error={err("stipendYear")}><Select name="stipendYear" defaultValue={String(current?.stipendYear ?? 1)}>{[1, 2, 3].map((n) => <option key={n} value={n}>Year {n}</option>)}</Select></Field>
            <Field label="Start date *" error={err("startDate")}><Input type="date" name="startDate" defaultValue={current?.startDate} required /></Field>
            <Field label="Expected completion *" error={err("expectedEndDate")}><Input type="date" name="expectedEndDate" defaultValue={current?.expectedEndDate} required /></Field>
            <Field label="Leave entitlement (days) *" error={err("leaveEntitledDays")}><Input type="number" min={0} name="leaveEntitledDays" defaultValue={current?.leaveEntitledDays ?? ""} required /></Field>
          </div>
          <Field label="Notes" error={err("notes")}><Textarea name="notes" defaultValue={current?.notes} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function NoteDialog({ recordId, userId, kinds, today }: { recordId: string; userId: string; kinds: [string, string][]; today: string }) {
  return (
    <FormDialog trigger="Add note" title="Articleship note" action={addNoteAction.bind(null, recordId, userId)} submitLabel="Add">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Kind" error={err("kind")}><Select name="kind" defaultValue={kinds[0]?.[0]}>{kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Date" error={err("date")}><Input type="date" name="date" defaultValue={today} required /></Field>
          </div>
          <Field label="Note *" error={err("text")}><Textarea name="text" required /></Field>
        </>
      )}
    </FormDialog>
  );
}
