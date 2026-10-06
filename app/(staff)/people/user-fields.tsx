"use client";
import { Field, Input, Select, Checkbox } from "@/components/ui/input";
import { ROLE_LABELS, STAFF_ROLES, LOCATIONS, LOCATION_LABELS } from "@/server/domain/enums";

export type UserFieldOptions = { designations: { id: string; name: string }[]; managers: { id: string; name: string }[] };
export type UserFieldValues = { displayName?: string; email?: string | null; mobile?: string | null; role?: string; isSenior?: boolean; designationId?: string | null; reportingManagerId?: string | null; defaultLocation?: string; locationChangeable?: boolean };

/** Shared user fields for create and edit. Default location and whether it can change are admin-controlled (P1-17). */
export function UserFields({ options, v = {}, err }: { options: UserFieldOptions; v?: UserFieldValues; err: (k: string) => string | undefined }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name *" error={err("displayName")}><Input name="displayName" defaultValue={v.displayName} required /></Field>
      <Field label="Role *" error={err("role")}><Select name="role" defaultValue={v.role ?? "STAFF"}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
      <Field label="Email" error={err("email")}><Input name="email" type="email" defaultValue={v.email ?? ""} /></Field>
      <Field label="Mobile" error={err("mobile")}><Input name="mobile" defaultValue={v.mobile ?? ""} /></Field>
      <Field label="Designation"><Select name="designationId" defaultValue={v.designationId ?? ""}><option value="">—</option>{options.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <Field label="Reports to" error={err("reportingManagerId")}><Select name="reportingManagerId" defaultValue={v.reportingManagerId ?? ""}><option value="">—</option>{options.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      <Field label="Default work location"><Select name="defaultLocation" defaultValue={v.defaultLocation ?? "OFFICE"}>{LOCATIONS.map((l) => <option key={l} value={l}>{LOCATION_LABELS[l]}</option>)}</Select></Field>
      <div className="flex flex-col justify-end gap-1">
        <Checkbox name="locationChangeable" defaultChecked={v.locationChangeable ?? true} label="Person may change location on entries" />
        <Checkbox name="isSenior" defaultChecked={v.isSenior ?? false} label="Senior (may review junior work)" />
      </div>
    </div>
  );
}
