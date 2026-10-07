"use client";
import { useState } from "react";
import { FormDialog } from "@/components/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { generateLetterAction, publishPolicyAction } from "./actions";

type Option = { id: string; name: string };
type ExtraField = { key: string; label: string; type?: "date" };

export function LetterDialog({ people, kinds }: { people: Option[]; kinds: { kind: string; label: string; fields: ExtraField[] }[] }) {
  const [kind, setKind] = useState(kinds[0]?.kind ?? "APPOINTMENT");
  const fields = kinds.find((k) => k.kind === kind)?.fields ?? [];
  return (
    <FormDialog trigger="Generate letter" triggerVariant="default" title="Generate HR letter" description="Uses the firm's approved HR_<KIND> template, or the built-in default." action={generateLetterAction} submitLabel="Generate">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Person *" error={err("userId")}><Select name="userId" defaultValue=""><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Letter" error={err("kind")}><Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</Select></Field>
            {fields.map((fl) => <Field key={`${kind}-${fl.key}`} label={fl.label}><Input name={`extra:${fl.key}`} type={fl.type ?? "text"} /></Field>)}
          </div>
          <Checkbox name="allowMissing" label="Generate with gaps (blank fields print as [[field]])" />
          {err("extra") ? <p className="text-xs text-red-700">Blank: {err("extra")}</p> : null}
        </>
      )}
    </FormDialog>
  );
}

export function PolicyDialog({ today, kinds, current }: { today: string; kinds: [string, string][]; current?: { title: string; kind: string; body: string } }) {
  return (
    <FormDialog trigger={current ? "New version" : "Publish policy"} triggerVariant={current ? "secondary" : "default"} title={current ? `New version: ${current.title}` : "Publish policy"} description="Same title and kind as an existing policy creates a new version; everyone is asked to acknowledge it." action={publishPolicyAction} submitLabel="Publish">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Title *" error={err("title")} className="sm:col-span-2"><Input name="title" defaultValue={current?.title} required /></Field>
            <Field label="Kind" error={err("kind")}><Select name="kind" defaultValue={current?.kind ?? "OTHER"}>{kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </div>
          <Field label="Effective from" error={err("effectiveFrom")}><Input type="date" name="effectiveFrom" defaultValue={today} required /></Field>
          <Field label="Policy text *" error={err("body")}><Textarea name="body" rows={10} defaultValue={current?.body} required /></Field>
          <Checkbox name="requiresAck" defaultChecked label="Ask every employee to acknowledge" />
        </>
      )}
    </FormDialog>
  );
}
