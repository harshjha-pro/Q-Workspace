"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { fnfAction, instituteAction, letterAction, startExitAction, updateDatesAction } from "./actions";

type Option = { id: string; name: string };

export function StartExitDialog({ people, today }: { people: Option[]; today: string }) {
  return (
    <FormDialog trigger="Record resignation" triggerVariant="default" title="Record resignation" description="Notice period defaults to the firm's setting for the person's role." action={startExitAction} submitLabel="Start exit">
      {(err) => (
        <>
          <Field label="Person *" error={err("userId")}><Select name="userId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Resigned on *" error={err("resignationDate")}><Input type="date" name="resignationDate" defaultValue={today} required /></Field>
            <Field label="Notice days" error={err("noticeDays")} hint="Blank = by role"><Input type="number" min={0} name="noticeDays" /></Field>
            <Field label="Last working day" error={err("lastWorkingDate")} hint="Blank = after notice"><Input type="date" name="lastWorkingDate" /></Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function DatesDialog({ id, lwd, noticeDays }: { id: string; lwd: string; noticeDays: number }) {
  return (
    <FormDialog trigger="Edit dates" title="Notice and last working day" action={updateDatesAction.bind(null, id)} submitLabel="Save">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Notice days" error={err("noticeDays")}><Input type="number" min={0} name="noticeDays" defaultValue={noticeDays} required /></Field>
          <Field label="Last working day" error={err("lastWorkingDate")}><Input type="date" name="lastWorkingDate" defaultValue={lwd} required /></Field>
        </div>
      )}
    </FormDialog>
  );
}

export function FnfDialog({ id, encash }: { id: string; encash: boolean }) {
  return (
    <FormDialog trigger="Compute F&F" triggerVariant="default" title="Full and final settlement" description="Monthly gross is typed from the salary structure (Payroll). Per-day pay = gross ÷ days in the month of the last working day." action={fnfAction.bind(null, id)} submitLabel="Compute and save">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Monthly gross (₹) *" error={err("monthlyGrossPaise")}><Input name="monthlyGross" inputMode="decimal" required /></Field>
            <Field label="Unpaid salary days" error={err("unpaidDays")}><Input type="number" step="0.5" min={0} name="unpaidDays" defaultValue={0} /></Field>
            <Field label="Leave to encash (days)" error={err("leaveEncashDays")} hint={encash ? "Policy allows encashment" : "No leave policy allows encashment: ignored"}><Input type="number" step="0.5" min={0} name="leaveEncashDays" defaultValue={0} /></Field>
            <Field label="Asset recovery (₹)" error={err("assetRecoveryPaise")}><Input name="assetRecovery" inputMode="decimal" /></Field>
            <Field label="Advances to recover (₹)" error={err("advancesPaise")}><Input name="advances" inputMode="decimal" /></Field>
            <Field label="Other earnings (₹)" error={err("otherEarningsPaise")}><Input name="otherEarnings" inputMode="decimal" /></Field>
            <Field label="Other deductions (₹)" error={err("otherDeductionsPaise")}><Input name="otherDeductions" inputMode="decimal" /></Field>
          </div>
          <Checkbox name="waiveNoticeRecovery" label="Waive notice-period shortfall recovery" />
          <Field label="Notes" error={err("notes")}><Textarea name="notes" rows={2} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function ExitLetterDialog({ id, kind, label }: { id: string; kind: "RELIEVING" | "EXPERIENCE"; label: string }) {
  return (
    <FormDialog trigger={label} title={label} action={letterAction.bind(null, id)} submitLabel="Generate">
      {(err) => (
        <>
          <input type="hidden" name="kind" value={kind} />
          <Field label="Position held" error={err("position")} hint="Blank = current designation"><Input name="position" /></Field>
          <Checkbox name="allowMissing" label="Generate with gaps" />
          {err("extra") ? <p className="text-xs text-red-700">Blank: {err("extra")}</p> : null}
        </>
      )}
    </FormDialog>
  );
}

export function InstituteDialog({ id, today }: { id: string; today: string }) {
  return (
    <FormDialog trigger="Institute paperwork" title="Completion / termination with the institute" action={instituteAction.bind(null, id)} submitLabel="Record">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Outcome" error={err("outcome")}><Select name="outcome"><option value="COMPLETED">Completed</option><option value="TERMINATED">Terminated</option><option value="TRANSFERRED">Transferred</option></Select></Field>
            <Field label="Date" error={err("date")}><Input type="date" name="date" defaultValue={today} required /></Field>
          </div>
          <Field label="What was filed *" error={err("note")}><Textarea name="note" required placeholder="e.g. Form 109 filed online, acknowledgment no…" /></Field>
        </>
      )}
    </FormDialog>
  );
}
