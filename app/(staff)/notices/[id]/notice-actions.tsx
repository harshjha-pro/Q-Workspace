"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DEMAND_LABELS, DEMAND_STATUSES, NOTICE_STATUS_LABELS } from "../labels";
import { updateNoticeAction, addHearingAction } from "../actions";

type Option = { id: string; name: string };
type Current = { status: string; outcome: string; demandStatus: string; demand: string; responseDueDate: string; assigneeId: string; reviewerId: string; summary: string };

export function NoticeActions({ id, closed, statuses, people, today, current }: { id: string; closed: boolean; statuses: string[]; people: Option[]; today: string; current: Current }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog trigger="Update notice" title="Update notice" description="Closing a notice needs the outcome recorded." action={updateNoticeAction.bind(null, id)}>
        {(err) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Status" error={err("status")}>
                <Select name="status" defaultValue={current.status}>{statuses.map((s) => <option key={s} value={s}>{NOTICE_STATUS_LABELS[s] ?? s}</option>)}</Select>
              </Field>
              <Field label="Response due" error={err("responseDueDate")} hint="Also moves the response task's due date"><Input type="date" name="responseDueDate" defaultValue={current.responseDueDate} /></Field>
              <Field label="Assignee" error={err("assigneeId")}>
                <Select name="assigneeId" defaultValue={current.assigneeId}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
              <Field label="Reviewer" error={err("reviewerId")}>
                <Select name="reviewerId" defaultValue={current.reviewerId}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
              <Field label="Demand (₹)" error={err("demandRupees")}><Input name="demand" inputMode="decimal" defaultValue={current.demand} /></Field>
              <Field label="Demand status" error={err("demandStatus")}>
                <Select name="demandStatus" defaultValue={current.demandStatus}>{DEMAND_STATUSES.map((s) => <option key={s} value={s}>{DEMAND_LABELS[s]}</option>)}</Select>
              </Field>
            </div>
            <Field label="Outcome" error={err("outcome")} hint="Required to close, e.g. order u/s 143(3) accepting returned income"><Textarea name="outcome" defaultValue={current.outcome} /></Field>
            <Field label="Summary" error={err("summary")}><Textarea name="summary" defaultValue={current.summary} /></Field>
          </>
        )}
      </FormDialog>
      {!closed ? (
        <FormDialog trigger="Add hearing / adjournment" title="Add hearing or adjournment" description="The notice moves to Hearing status." action={addHearingAction.bind(null, id)} submitLabel="Add">
          {(err) => (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={today} required /></Field>
                <Field label="Kind" error={err("kind")}>
                  <Select name="kind" defaultValue="HEARING"><option value="HEARING">Hearing</option><option value="ADJOURNMENT">Adjournment</option></Select>
                </Field>
              </div>
              <Field label="Notes" error={err("notes")}><Textarea name="notes" placeholder="Who attends, documents to carry" /></Field>
              <Field label="Outcome" error={err("outcome")}><Textarea name="outcome" placeholder="Fill after the hearing, if known" /></Field>
            </>
          )}
        </FormDialog>
      ) : null}
    </div>
  );
}
