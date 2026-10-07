"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

type Act = (prev: ActionResult, f: FormData) => Promise<ActionResult>;
export type PolicyDefaults = { name: string; employeeCategory: string; leaveType: string; quotaDays: number; accrual: string; carryDays: number; encashable: boolean; effectiveFrom: string; source: string };

export function PolicyDialog({ action, trigger, d }: { action: Act; trigger: string; d: PolicyDefaults }) {
  return (
    <FormDialog trigger={trigger} triggerVariant={trigger === "Edit" ? "ghost" : "default"} title="Leave policy" description="Days may be halves (e.g. 7.5). Monthly accrual credits 1/12 of the quota at each month start." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Name" error={err("name")}><Input name="name" defaultValue={d.name} required /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee category"><Select name="employeeCategory" defaultValue={d.employeeCategory}>{["STAFF", "ARTICLE", "PARTNER", "ADMIN", "SUPPORT"].map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</Select></Field>
            <Field label="Leave type"><Select name="leaveType" defaultValue={d.leaveType}><option value="PERSONAL">Personal</option><option value="SICK">Sick</option><option value="EXAM_STUDY">Exam / study</option><option value="OTHER">Other</option></Select></Field>
            <Field label="Days per year" error={err("quotaHalfDays")}><Input name="quotaDays" inputMode="decimal" defaultValue={String(d.quotaDays)} required /></Field>
            <Field label="Accrual"><Select name="accrual" defaultValue={d.accrual}><option value="ANNUAL">Annual (at year start)</option><option value="MONTHLY">Monthly</option></Select></Field>
            <Field label="Carry forward up to (days)" error={err("carryForwardMaxHalfDays")}><Input name="carryDays" inputMode="decimal" defaultValue={String(d.carryDays)} /></Field>
            <Field label="Effective from" error={err("effectiveFrom")}><Input type="date" name="effectiveFrom" defaultValue={d.effectiveFrom} required /></Field>
          </div>
          <Checkbox name="encashable" label="Encashment allowed" defaultChecked={d.encashable} />
          <Field label="Source / note"><Input name="source" defaultValue={d.source} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function AdjustBalanceDialog({ action, label }: { action: Act; label: string }) {
  return (
    <FormDialog trigger="Adjust" triggerVariant="ghost" title={`Adjust balance — ${label}`} action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Days to add (negative to remove)" error={err("delta")}><Input name="days" inputMode="decimal" required /></Field>
          <Field label="Reason" error={err("reason")}><Input name="reason" required /></Field>
        </>
      )}
    </FormDialog>
  );
}
