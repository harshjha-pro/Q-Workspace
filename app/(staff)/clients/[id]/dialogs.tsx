"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Checkbox, Textarea } from "@/components/ui/input";
import { CLIENT_FLAGS, CLIENT_STATUSES, GST_FREQUENCIES, type ClientFlag } from "@/server/domain/enums";
import { FLAG_INFO } from "@/server/domain/flags";
import { todayIst } from "@/server/lib/dates";
import {
  setFlagsAction, setStatusAction, addGstinAction, updateGstinAction, addDirectorAction, ceaseDirectorAction, saveContactAction, addPtAction,
} from "../actions";

/** Action buttons on the client detail page (each opens a dialog; the server re-checks permission). */
export function ClientDialogs({
  clientId, status, canFlags, company, directorsAllowed, flags, ptStates,
}: {
  clientId: string; status: string; canFlags: boolean; company: boolean; directorsAllowed: boolean;
  flags: Record<string, boolean>; ptStates: { code: string; name: string }[];
}) {
  const today = todayIst();
  return (
    <div className="flex flex-wrap gap-2">
      {canFlags ? (
        <FormDialog trigger="Change flags" title="Change applicability flags" description="Tasks are created or stopped from the effective date (no back-filling)." action={setFlagsAction.bind(null, clientId)} submitLabel="Save flags">
          {(err) => (
            <>
              <div className="grid gap-2">
                {CLIENT_FLAGS.filter((f) => f !== "dpt3Applicable" || company).map((f: ClientFlag) => (
                  <div key={f}>
                    <input type="hidden" name="flagKeys" value={f} />
                    <Checkbox name={`flag_${f}`} defaultChecked={flags[f]} disabled={f === "statutoryAuditApplicable" && company}
                      label={<span><span className="font-medium">{FLAG_INFO[f].label}</span> <span className="text-xs text-muted">{FLAG_INFO[f].appliesWhen}</span></span>} />
                    {f === "statutoryAuditApplicable" && company ? <input type="hidden" name={`flag_${f}`} value="true" /> : null}
                  </div>
                ))}
              </div>
              <Field label="Effective from *" error={err("effectiveDate")}><Input type="date" name="effectiveDate" defaultValue={today} required /></Field>
              <Field label="Reason *" error={err("reason")}><Input name="reason" placeholder="e.g. Started paying contractors" required /></Field>
            </>
          )}
        </FormDialog>
      ) : null}
      <FormDialog trigger="Change status" title="Change client status" description="Dormant does not stop live obligations; turn off the relevant flag for that (Rules Spec 7.4)." action={setStatusAction.bind(null, clientId)}>
        {(err) => (
          <>
            <Field label="Status"><Select name="status" defaultValue={status}>{CLIENT_STATUSES.filter((s) => s !== "DISCONTINUED_CLOSED").map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></Field>
            <Field label="Effective from *" error={err("effectiveDate")}><Input type="date" name="effectiveDate" defaultValue={today} required /></Field>
            <Field label="Reason *" error={err("reason")}><Input name="reason" required /></Field>
          </>
        )}
      </FormDialog>
      {canFlags ? (
        <FormDialog trigger="Add GSTIN" title="Add GSTIN" action={addGstinAction.bind(null, clientId)}>
          {(err) => (
            <>
              <Field label="GSTIN *" error={err("gstin")} hint="State and PAN are checked against the GSTIN."><Input name="gstin" className="uppercase font-mono" maxLength={15} required /></Field>
              <Field label="Trade name"><Input name="tradeName" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Frequency"><Select name="frequency">{GST_FREQUENCIES.map((f) => <option key={f} value={f}>{f.toLowerCase()}</option>)}</Select></Field>
                <Field label="Effective from" error={err("frequencyEffectiveFrom")}><Input type="date" name="frequencyEffectiveFrom" defaultValue={today} /></Field>
              </div>
              <Checkbox name="iffOpted" label="IFF opted (QRMP only)" />
              <Checkbox name="annualReturnApplicable" label="GSTR-9 applies" />
              <Checkbox name="gstr9cApplicable" label="GSTR-9C applies" />
              <Field label="Registration date"><Input type="date" name="registrationDate" /></Field>
            </>
          )}
        </FormDialog>
      ) : null}
      {directorsAllowed ? (
        <FormDialog trigger="Add director" title="Add director / designated partner" description="An existing DIN is linked, not duplicated." action={addDirectorAction.bind(null, clientId)}>
          {(err) => (
            <>
              <Field label="DIN *" error={err("din")}><Input name="din" inputMode="numeric" maxLength={8} required /></Field>
              <Field label="Name *" error={err("name")}><Input name="name" required /></Field>
              <Field label="PAN" error={err("pan")}><Input name="pan" className="uppercase" maxLength={10} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email" error={err("email")}><Input name="email" type="email" /></Field>
                <Field label="Mobile"><Input name="mobile" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Designation"><Select name="designation"><option value="DIRECTOR">Director</option><option value="MANAGING_DIRECTOR">Managing director</option><option value="WHOLE_TIME_DIRECTOR">Whole-time director</option><option value="DESIGNATED_PARTNER">Designated partner</option></Select></Field>
                <Field label="Appointed on"><Input type="date" name="appointedOn" /></Field>
              </div>
            </>
          )}
        </FormDialog>
      ) : null}
      <FormDialog trigger="Add contact" title="Add contact" action={saveContactAction.bind(null, clientId, undefined)}>
        {(err) => (
          <>
            <Field label="Name *" error={err("name")}><Input name="name" required /></Field>
            <Field label="Role"><Input name="role" placeholder="Promoter, accountant, CFO…" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Email" error={err("email")}><Input name="email" type="email" /></Field>
              <Field label="Phone"><Input name="phone" /></Field>
              <Field label="WhatsApp"><Input name="whatsapp" /></Field>
              <Field label="Preferred channel"><Select name="preferredChannel"><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone</option></Select></Field>
              <Field label="Birthday"><Input type="date" name="birthday" /></Field>
            </div>
            <Checkbox name="isPrimary" label="Primary contact" />
            <Checkbox name="isBilling" label="Billing contact" />
            <Field label="Notes"><Textarea name="notes" /></Field>
          </>
        )}
      </FormDialog>
      {canFlags && ptStates.length ? (
        <FormDialog trigger="Add PT registration" title="Add Professional Tax registration" description="Only states that levy Professional Tax are listed." action={addPtAction.bind(null, clientId)}>
          {(err) => (
            <>
              <Field label="State *" error={err("stateCode")}><Select name="stateCode">{ptStates.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select></Field>
              <Field label="Kind"><Select name="kind"><option value="EMPLOYER">Employer (return / payment)</option><option value="ENROLMENT">Enrolment</option></Select></Field>
              <Field label="Registration no."><Input name="registrationNo" /></Field>
              <Field label="Effective from *" error={err("effectiveFrom")}><Input type="date" name="effectiveFrom" defaultValue={today} required /></Field>
            </>
          )}
        </FormDialog>
      ) : null}
    </div>
  );
}

export function GstinEditDialog({ clientId, gstin }: { clientId: string; gstin: { id: string; gstin: string; frequency: string; iffOpted: boolean; annualReturnApplicable: boolean; gstr9cApplicable: boolean; status: string } }) {
  return (
    <FormDialog trigger="Edit" triggerVariant="ghost" title={`Edit ${gstin.gstin}`} description="A frequency change needs the date GSTN allowed it from." action={updateGstinAction.bind(null, clientId, gstin.id)}>
      {(err) => (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Frequency"><Select name="frequency" defaultValue={gstin.frequency}>{GST_FREQUENCIES.map((f) => <option key={f} value={f}>{f.toLowerCase()}</option>)}</Select></Field>
            <Field label="Frequency effective from" error={err("frequencyEffectiveFrom")}><Input type="date" name="frequencyEffectiveFrom" /></Field>
          </div>
          <Checkbox name="iffOpted" defaultChecked={gstin.iffOpted} label="IFF opted" />
          <Checkbox name="annualReturnApplicable" defaultChecked={gstin.annualReturnApplicable} label="GSTR-9 applies" />
          <Checkbox name="gstr9cApplicable" defaultChecked={gstin.gstr9cApplicable} label="GSTR-9C applies" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Status"><Select name="status" defaultValue={gstin.status}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option></Select></Field>
            <Field label="Cancellation date" error={err("cancellationDate")}><Input type="date" name="cancellationDate" /></Field>
          </div>
          <Field label="Reason *" error={err("reason")}><Input name="reason" required /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function DirectorCeaseDialog({ clientId, directorId, name }: { clientId: string; directorId: string; name: string }) {
  return (
    <FormDialog trigger="Cease" triggerVariant="ghost" title={`Cease ${name}`} action={ceaseDirectorAction.bind(null, clientId, directorId)} danger submitLabel="Record cessation">
      {(err) => <Field label="Ceased on *" error={err("_")}><Input type="date" name="ceasedOn" required /></Field>}
    </FormDialog>
  );
}
