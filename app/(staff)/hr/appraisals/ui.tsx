"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog, ActionForm } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { addGoalAction, addSkillAction, attendanceAction, createCycleAction, createTrainingAction, managerReviewAction, moderateAction, selfReviewAction, setSkillAction } from "./actions";

type Goal = { id: string; title: string; selfComment: string; managerComment: string; status: string };
const RATINGS: [number, string][] = [[1, "1 · Needs improvement"], [2, "2 · Developing"], [3, "3 · Meets expectations"], [4, "4 · Exceeds expectations"], [5, "5 · Outstanding"]];

export function NewCycleDialog({ today }: { today: string }) {
  return (
    <FormDialog trigger="Start a cycle" triggerVariant="default" title="New appraisal cycle" description="Creates a review for every active person (Partners excluded) with their reporting manager." action={createCycleAction} submitLabel="Start">
      {(err) => (
        <>
          <Field label="Name *" error={err("name")}><Input name="name" required placeholder="e.g. Annual review FY 2026-27" /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Kind" error={err("kind")}><Select name="kind" defaultValue="ANNUAL"><option value="ANNUAL">Annual</option><option value="HALF_YEARLY">Half-yearly</option></Select></Field>
            <Field label="Period from *" error={err("startDate")}><Input type="date" name="startDate" defaultValue={today} required /></Field>
            <Field label="Period to *" error={err("endDate")}><Input type="date" name="endDate" required /></Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function GoalDialog({ reviewId }: { reviewId: string }) {
  return (
    <FormDialog trigger="Add goal" title="Add goal" action={addGoalAction.bind(null, reviewId)} submitLabel="Add">
      {(err) => (
        <>
          <Field label="Goal *" error={err("title")}><Input name="title" required /></Field>
          <Field label="How it will be judged" error={err("description")}><Textarea name="description" /></Field>
          <Field label="Weight %" error={err("weightPct")}><Input type="number" name="weightPct" min={0} max={100} defaultValue={0} /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function SelfReviewForm({ reviewId, goals }: { reviewId: string; goals: Goal[] }) {
  return (
    <ActionForm action={selfReviewAction.bind(null, reviewId)} submitLabel="Submit self-review">
      {(err) => (
        <>
          {goals.map((g) => (
            <div key={g.id} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
              <Field label={`Goal: ${g.title}`}><Textarea name={`goal:${g.id}`} defaultValue={g.selfComment} rows={2} /></Field>
              <Field label="Status"><Select name={`status:${g.id}`} defaultValue={g.status}><option value="OPEN">In progress</option><option value="MET">Met</option><option value="PARTLY_MET">Partly met</option><option value="NOT_MET">Not met</option></Select></Field>
            </div>
          ))}
          <Field label="Overall self-review *" error={err("selfReview")}><Textarea name="selfReview" rows={5} required /></Field>
        </>
      )}
    </ActionForm>
  );
}

export function ManagerReviewForm({ reviewId, goals }: { reviewId: string; goals: Goal[] }) {
  return (
    <ActionForm action={managerReviewAction.bind(null, reviewId)} submitLabel="Submit manager review">
      {(err) => (
        <>
          {goals.map((g) => <Field key={g.id} label={`Goal: ${g.title}`}><Textarea name={`goal:${g.id}`} defaultValue={g.managerComment} rows={2} /></Field>)}
          <Field label="Review *" error={err("managerReview")}><Textarea name="managerReview" rows={5} required /></Field>
          <Field label="Rating *" error={err("managerRating")}><Select name="managerRating" defaultValue="3">{RATINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </>
      )}
    </ActionForm>
  );
}

export function ModerateForm({ reviewId, managerRating }: { reviewId: string; managerRating: number | null }) {
  return (
    <ActionForm action={moderateAction.bind(null, reviewId)} submitLabel="Moderate and finalise">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Moderated rating *" error={err("moderatedRating")}><Select name="moderatedRating" defaultValue={String(managerRating ?? 3)}>{RATINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Final rating *" error={err("finalRating")}><Select name="finalRating" defaultValue={String(managerRating ?? 3)}>{RATINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Increment recommended (%)" error={err("incrementRecommendationBp")}><Input type="number" step="0.5" min={0} max={100} name="incrementPct" /></Field>
        </div>
      )}
    </ActionForm>
  );
}

export function TrainingDialog({ today }: { today: string }) {
  return (
    <FormDialog trigger="Add session" triggerVariant="default" title="Internal training session" action={createTrainingAction} submitLabel="Add">
      {(err) => (
        <>
          <Field label="Title *" error={err("title")}><Input name="title" required /></Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Date *" error={err("date")}><Input type="date" name="date" defaultValue={today} required /></Field>
            <Field label="Hours *" error={err("minutes")}><Input type="number" step="0.25" min={0.25} name="hours" defaultValue={2} required /></Field>
            <Field label="Trainer" error={err("trainer")}><Input name="trainer" /></Field>
          </div>
          <Checkbox name="cpeEligible" label="Counts as structured CPE for qualified members" />
        </>
      )}
    </FormDialog>
  );
}

export function AttendanceDialog({ sessionId, people, attended }: { sessionId: string; people: { id: string; name: string }[]; attended: string[] }) {
  return (
    <FormDialog trigger="Attendance" title="Who attended?" description="CPE-eligible sessions are added to qualified members' CPE logs." action={attendanceAction.bind(null, sessionId)} submitLabel="Save">
      {() => (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-line p-2">
          {people.map((p) => <Checkbox key={p.id} name="userIds" value={p.id} defaultChecked={attended.includes(p.id)} label={p.name} className="flex" />)}
        </div>
      )}
    </FormDialog>
  );
}

export function AddSkillDialog({ lines }: { lines: [string, string][] }) {
  return (
    <FormDialog trigger="Add skill" title="Add skill" action={addSkillAction} submitLabel="Add">
      {(err) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Skill *" error={err("name")}><Input name="name" required /></Field>
          <Field label="Service line" error={err("serviceLine")}><Select name="serviceLine">{lines.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
      )}
    </FormDialog>
  );
}

/** Inline level picker (0–4) for one person × skill. */
export function SkillLevel({ userId, skillId, level, editable, label }: { userId: string; skillId: string; level: number; editable: boolean; label: string }) {
  const router = useRouter();
  const [v, setV] = useState(level);
  const [pending, start] = useTransition();
  if (!editable) return <span className="text-sm">{level || "—"}</span>;
  return (
    <select aria-label={label} value={v} disabled={pending} className="h-8 rounded border border-line bg-white px-1 text-sm"
      onChange={(e) => {
        const n = Number(e.target.value);
        setV(n);
        start(async () => {
          const r = await setSkillAction(userId, skillId, n);
          if (!r.ok) setV(level);
          router.refresh();
        });
      }}>
      {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n || "—"}</option>)}
    </select>
  );
}
