"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { addCandidateAction, createOpeningAction, moveCandidateAction, offerLetterAction, scheduleInterviewAction, scorecardAction } from "./actions";

type Option = { id: string; name: string };
const STAGE_OPTIONS: [string, string][] = [["SCREENING", "Screening"], ["TEST", "Test"], ["INTERVIEW", "Interview"], ["OFFER", "Offer"], ["JOINED", "Joined"], ["REJECTED", "Rejected"]];
const SCORE_AREAS = ["Technical knowledge", "Communication", "Attitude", "Practical exposure"];

export function NewOpeningDialog({ today, owners }: { today: string; owners: Option[] }) {
  return (
    <FormDialog trigger="New opening" triggerVariant="default" title="New opening" action={createOpeningAction} submitLabel="Create">
      {(err) => (
        <>
          <Field label="Title *" error={err("title")}><Input name="title" required placeholder="e.g. Audit Associate" /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="For" error={err("kind")}><Select name="kind" defaultValue="STAFF"><option value="STAFF">Staff</option><option value="ARTICLE">Article assistant</option></Select></Field>
            <Field label="Opened on" error={err("openedAt")}><Input type="date" name="openedAt" defaultValue={today} required /></Field>
            <Field label="Hiring owner" error={err("ownerId")}><Select name="ownerId" defaultValue=""><option value="">Me</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function AddCandidateDialog({ openingId }: { openingId: string }) {
  return (
    <FormDialog trigger="Add candidate" triggerVariant="default" title="Add candidate" action={addCandidateAction.bind(null, openingId)} submitLabel="Add">
      {(err) => (
        <>
          <Field label="Name *" error={err("name")}><Input name="name" required /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Email" error={err("email")}><Input type="email" name="email" /></Field>
            <Field label="Phone" error={err("phone")}><Input name="phone" inputMode="tel" /></Field>
          </div>
          <Field label="Source" error={err("source")} hint="Referral, job portal, campus, walk-in…"><Input name="source" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function MoveStageDialog({ candidateId, people }: { candidateId: string; people: Option[] }) {
  const [stage, setStage] = useState("SCREENING");
  return (
    <FormDialog trigger="Move stage" title="Move candidate" description="Forward only. Joined needs the login created in People first." action={moveCandidateAction.bind(null, candidateId)} submitLabel="Move">
      {(err) => (
        <>
          <Field label="New stage" error={err("stage")}>
            <Select name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>{STAGE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          {stage === "REJECTED" ? <Field label="Reason *" error={err("reason")}><Textarea name="reason" required /></Field> : null}
          {stage === "JOINED" ? (
            <Field label="Their login *" error={err("joinedUserId")} hint="Not listed? Add the person under People → New person first.">
              <Select name="joinedUserId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

export function ScheduleInterviewDialog({ candidateId, people, today }: { candidateId: string; people: Option[]; today: string }) {
  return (
    <FormDialog trigger="Schedule interview" title="Schedule interview" action={scheduleInterviewAction.bind(null, candidateId)} submitLabel="Schedule">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Interviewer *" error={err("interviewerId")}><Select name="interviewerId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Date *" error={err("scheduledAt")}><Input type="date" name="scheduledAt" defaultValue={today} required /></Field>
        </div>
      )}
    </FormDialog>
  );
}

export function ScorecardDialog({ interviewId, candidateId }: { interviewId: string; candidateId: string }) {
  return (
    <FormDialog trigger="Scorecard" title="Interview scorecard" description="1 = weak, 5 = excellent." action={scorecardAction.bind(null, interviewId, candidateId)} submitLabel="Save">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCORE_AREAS.map((a) => (
              <Field key={a} label={a}><Select name={`score:${a}`} defaultValue=""><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            ))}
          </div>
          <Field label="Recommendation *" error={err("recommendation")}>
            <Select name="recommendation" defaultValue="YES"><option value="STRONG_YES">Strong yes</option><option value="YES">Yes</option><option value="NO">No</option><option value="STRONG_NO">Strong no</option></Select>
          </Field>
          <Field label="Notes" error={err("notes")}><Textarea name="notes" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function OfferLetterDialog({ candidateId, today }: { candidateId: string; today: string }) {
  return (
    <FormDialog trigger="Offer letter" title="Generate offer letter" description="Uses the firm's approved HR_OFFER template, or the built-in default." action={offerLetterAction.bind(null, candidateId)} submitLabel="Generate">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Position *" error={err("position")}><Input name="position" required /></Field>
            <Field label="Compensation *" error={err("ctc")} hint="As it should read, e.g. Rs. 4,20,000 per annum"><Input name="ctc" required /></Field>
            <Field label="Joining date *" error={err("joiningDate")}><Input type="date" name="joiningDate" defaultValue={today} required /></Field>
            <Field label="Accept by *" error={err("acceptBy")}><Input type="date" name="acceptBy" defaultValue={today} required /></Field>
          </div>
          <Checkbox name="allowMissing" label="Generate with gaps (blank fields print as [[field]])" />
          {err("allowMissing") ? <p className="text-xs text-red-700">Blank: {err("allowMissing")}</p> : null}
        </>
      )}
    </FormDialog>
  );
}
