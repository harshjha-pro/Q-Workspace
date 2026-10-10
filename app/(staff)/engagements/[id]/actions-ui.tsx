"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ENGAGEMENT_STATUSES, FEE_BASES, FEE_BASIS_LABELS } from "@/server/domain/enums";
import { updateEngagementAction, assignAction, endAssignmentAction } from "../actions";

type Current = { name: string; status: string; budgetHours: number; endDate: string; eqrRequired: boolean; feeBasis: string; fee: number; rate: number; chargeable: boolean };

export function EngagementActions({ id, current, people, canSeeFees, estimate }: { id: string; current: Current; people: { id: string; name: string }[]; canSeeFees: boolean; estimate?: { suggestedHours: number | null; basis: string } | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog trigger="Edit" title="Edit engagement" action={updateEngagementAction.bind(null, id)}>
        {(err) => (
          <>
            <Field label="Name" error={err("name")}><Input name="name" defaultValue={current.name} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Status"><Select name="status" defaultValue={current.status}>{ENGAGEMENT_STATUSES.filter((s) => s !== "ARCHIVED").map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}</Select></Field>
              <Field label="Budget (hours)" error={err("budgetMinutes")}><Input name="budgetHours" defaultValue={current.budgetHours || ""} inputMode="decimal" /></Field>
              <Field label="End date"><Input type="date" name="endDate" defaultValue={current.endDate} /></Field>
            </div>
            {estimate ? <p className="text-xs text-muted">Estimate from past actuals: {estimate.suggestedHours === null ? "none yet" : `${estimate.suggestedHours} hrs`} · {estimate.basis}</p> : null}
            {canSeeFees ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fee basis"><Select name="feeBasis" defaultValue={current.feeBasis}>{FEE_BASES.map((f) => <option key={f} value={f}>{FEE_BASIS_LABELS[f]}</option>)}</Select></Field>
                <Field label="Fee (₹)"><Input name="fee" defaultValue={current.fee || ""} /></Field>
                <Field label="Rate per hour (₹)" error={err("ratePaisePerHour")}><Input name="rate" defaultValue={current.rate || ""} /></Field>
                <Checkbox name="chargeable" defaultChecked={current.chargeable} label="Chargeable" className="self-end" />
              </div>
            ) : null}
            <Checkbox name="eqrRequired" defaultChecked={current.eqrRequired} label="EQR required" />
          </>
        )}
      </FormDialog>
      <FormDialog trigger="Assign person" title="Assign to engagement" description="Articles are never checkers; plain Staff cannot check; EQR is a Partner." action={assignAction.bind(null, id)} submitLabel="Assign">
        {() => (
          <>
            <Field label="Person"><Select name="userId">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Role on engagement"><Select name="role"><option value="MEMBER">Member</option><option value="MAKER">Maker</option><option value="CHECKER">Checker</option><option value="EQR">EQR</option></Select></Field>
          </>
        )}
      </FormDialog>
    </div>
  );
}

export function RemoveAssignment({ engagementId, assignmentId }: { engagementId: string; assignmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await endAssignmentAction(engagementId, assignmentId); router.refresh(); })}>
      Remove
    </Button>
  );
}
