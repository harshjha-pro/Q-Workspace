"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createTeamAction, addMemberAction, removeMemberAction } from "../actions";

export function NewTeam({ managers }: { managers: { id: string; name: string }[] }) {
  return (
    <FormDialog trigger="New team" triggerVariant="default" title="New client team" action={createTeamAction}>
      {(err) => (
        <>
          <Field label="Team name *" error={err("name")}><Input name="name" required /></Field>
          <Field label="Lead manager"><Select name="leadManagerId"><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        </>
      )}
    </FormDialog>
  );
}

export function TeamControls({ teamId, people }: { teamId: string; people: { id: string; name: string }[] }) {
  return (
    <div className="pt-2">
      <FormDialog trigger="Add member" title="Add member" action={addMemberAction.bind(null, teamId)} submitLabel="Add">
        {() => <Field label="Person"><Select name="userId">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
      </FormDialog>
    </div>
  );
}

export function RemoveMember({ teamId, userId }: { teamId: string; userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Remove from team? Their vault access for this team's clients ends now.") && start(async () => { await removeMemberAction(teamId, userId); router.refresh(); })}>Remove</Button>;
}
