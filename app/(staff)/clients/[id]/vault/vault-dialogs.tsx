"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { PORTAL_LABELS } from "./labels";
import { addCredentialAction, changePasswordAction, deactivateCredentialAction, grantAccessAction, revokeGrantAction } from "./actions";

type Option = { id: string; name: string };

export function AddCredentialDialog({ clientId, portals, today }: { clientId: string; portals: string[]; today: string }) {
  return (
    <FormDialog trigger="Add credential" triggerVariant="default" title="Add portal credential" description="Stored encrypted. The list never shows the secret; every view is logged." action={addCredentialAction.bind(null, clientId)} submitLabel="Save">
      {(err) => (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Portal *" error={err("portal")}>
              <Select name="portal" defaultValue="INCOME_TAX">{portals.map((p) => <option key={p} value={p}>{PORTAL_LABELS[p] ?? p}</option>)}</Select>
            </Field>
            <Field label="Label" error={err("label")}><Input name="label" placeholder="e.g. GSTIN 27…, Director login" /></Field>
            <Field label="Username / login ID *" error={err("username")}><Input name="username" required autoComplete="off" /></Field>
            <Field label="Password *" error={err("password")}><Input type="password" name="password" required autoComplete="new-password" /></Field>
          </div>
          <Field label="Other details" error={err("extra")} hint="e.g. security question answers. Also encrypted."><Textarea name="extra" autoComplete="off" /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Last changed on" error={err("lastChangedOn")}><Input type="date" name="lastChangedOn" defaultValue={today} max={today} /></Field>
            <Checkbox name="changePeriodically" label="Remind to change periodically" className="self-end pb-2" />
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function ChangePasswordDialog({ clientId, id, name }: { clientId: string; id: string; name: string }) {
  return (
    <FormDialog trigger="Change password" triggerVariant="ghost" title="Change password" description={name} action={changePasswordAction.bind(null, clientId, id)} submitLabel="Update">
      {(err) => (
        <>
          <Field label="New password *" error={err("password")}><Input type="password" name="password" required autoComplete="new-password" /></Field>
          <Field label="New username" error={err("username")} hint="Leave blank to keep the current one"><Input name="username" autoComplete="off" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function DeactivateDialog({ clientId, id, name }: { clientId: string; id: string; name: string }) {
  return (
    <FormDialog trigger="Deactivate" triggerVariant="ghost" title="Deactivate credential" description={`${name} will no longer be listed or viewable. The view log is kept.`} action={deactivateCredentialAction.bind(null, clientId, id)} submitLabel="Deactivate" danger>
      {() => null}
    </FormDialog>
  );
}

export function GrantDialog({ clientId, people, credentials }: { clientId: string; people: Option[]; credentials: Option[] }) {
  return (
    <FormDialog trigger="Grant access" title="Grant access" description="Only Staff and Articles currently assigned to this client can be granted access." action={grantAccessAction.bind(null, clientId)} submitLabel="Grant">
      {(err) => (
        <>
          <Field label="Person *" error={err("userId")}>
            <Select name="userId" required defaultValue=""><option value="" disabled>Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
          <Field label="Access to" error={err("credentialId")}>
            <Select name="credentialId" defaultValue=""><option value="">All of this client&apos;s credentials</option>{credentials.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function RevokeGrantDialog({ clientId, grantId, who }: { clientId: string; grantId: string; who: string }) {
  return (
    <FormDialog trigger="Revoke" triggerVariant="ghost" title="Revoke access" description={`${who} will no longer be able to view these credentials.`} action={revokeGrantAction.bind(null, clientId, grantId)} submitLabel="Revoke" danger>
      {(err) => <Field label="Reason" error={err("reason")}><Input name="reason" placeholder="e.g. Moved off this client" /></Field>}
    </FormDialog>
  );
}
