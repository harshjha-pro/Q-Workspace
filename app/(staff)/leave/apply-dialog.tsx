"use client";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { applyLeaveAction } from "./actions";
import { LEAVE_REASON_LABELS, LEAVE_TYPE_LABELS } from "./labels";

export function ApplyLeaveDialog({ today }: { today: string }) {
  return (
    <FormDialog trigger="Apply for leave" triggerVariant="default" title="Apply for leave" description="Sundays, non-working Saturdays and firm holidays are not counted." action={applyLeaveAction} submitLabel="Apply">
      {(err) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Leave type" error={err("leaveType")}>
              <Select name="leaveType" defaultValue="PERSONAL">
                {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Reason" error={err("reason")}>
              <Select name="reason" defaultValue="PERSONAL">
                {Object.entries(LEAVE_REASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="From" error={err("fromDate")}>
              <Input type="date" name="fromDate" defaultValue={today} required />
            </Field>
            <Field label="To" error={err("toDate")} hint="Same as From for a single day">
              <Input type="date" name="toDate" />
            </Field>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
            <Checkbox name="halfDayStart" label="First day is a half day" />
            <Checkbox name="halfDayEnd" label="Last day is a half day" />
          </div>
          <Field label="Note (optional)" error={err("note")}>
            <Textarea name="note" placeholder="Anything your approver should know — e.g. who covers your filings" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
