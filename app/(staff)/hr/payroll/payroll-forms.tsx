"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { createRunAction, proposeStructureAction } from "./actions";

type Act = (prev: ActionResult, f: FormData) => Promise<ActionResult>;

export function CreateRunDialog({ month }: { month: string }) {
  return (
    <FormDialog trigger="New run" triggerVariant="default" title="Create payroll run" description="Attendance is derived and locked into the run; everyone with an approved structure of this kind is included." action={createRunAction} submitLabel="Create">
      {(err) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Month" error={err("month")}><Input type="month" name="month" defaultValue={month} required /></Field>
            <Field label="Kind" error={err("kind")}><Select name="kind" defaultValue="SALARY"><option value="SALARY">Salary</option><option value="STIPEND">Article stipend</option></Select></Field>
          </div>
          <Field label="Notes (optional)"><Textarea name="notes" className="min-h-14" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function SendBackDialog({ action }: { action: Act }) {
  return (
    <FormDialog trigger="Send back to Draft" title="Send back to Draft" action={action} submitLabel="Send back">
      {(err) => <Field label="What needs correcting?" error={err("reason")}><Textarea name="reason" required /></Field>}
    </FormDialog>
  );
}

type AdjLine = { label: string; amount: string };
export function AdjustDialog({ action, name, lopDays, earnings, deductions, note }: { action: Act; name: string; lopDays: string; earnings: AdjLine[]; deductions: AdjLine[]; note: string }) {
  const rows = (prefix: "e" | "d", given: AdjLine[]) => [1, 2, 3].map((i) => (
    <div key={`${prefix}${i}`} className="grid grid-cols-[1fr_7rem] gap-2">
      <Input name={`${prefix}Label${i}`} placeholder={prefix === "e" ? "e.g. Festival bonus" : "e.g. Salary advance"} defaultValue={given[i - 1]?.label ?? ""} aria-label={`${prefix === "e" ? "Earning" : "Deduction"} ${i} label`} />
      <Input name={`${prefix}Amount${i}`} inputMode="decimal" placeholder="₹" defaultValue={given[i - 1]?.amount ?? ""} aria-label={`${prefix === "e" ? "Earning" : "Deduction"} ${i} amount`} />
    </div>
  ));
  return (
    <FormDialog trigger="Adjust" triggerVariant="ghost" title={`Adjust — ${name}`} description="Recomputed at once (PF, ESI, PT and TDS follow). Leave LOP blank to use attendance." action={action} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Loss-of-pay days (override)" error={err("lopOverrideHalfDays")} hint="Halves allowed, e.g. 1.5"><Input name="lopDays" inputMode="decimal" defaultValue={lopDays} /></Field>
          <p className="text-sm font-medium">One-off earnings</p>{rows("e", earnings)}
          <p className="text-sm font-medium">One-off deductions</p>{rows("d", deductions)}
          <Field label="Note"><Textarea name="note" defaultValue={note} className="min-h-14" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function ProposeStructureDialog({ people, today, defaultRegime, preset }: { people: { id: string; name: string }[]; today: string; defaultRegime: string; preset?: { userId: string; label: string } }) {
  return (
    <FormDialog trigger={preset ? "Revise" : "New structure / revision"} triggerVariant={preset ? "ghost" : "default"} title={preset ? `Revise — ${preset.label}` : "Salary structure or revision"} description="Monthly amounts in ₹. Saved as Draft until a Partner approves it." action={proposeStructureAction} submitLabel="Save draft">
      {(err) => (
        <>
          {preset ? <input type="hidden" name="userId" value={preset.userId} /> : (
            <Field label="Person" error={err("userId")}><Select name="userId" required defaultValue="">{[<option key="" value="">Choose…</option>, ...people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)]}</Select></Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Effective from" error={err("effectiveFrom")}><Input type="date" name="effectiveFrom" defaultValue={today} required /></Field>
            <Field label="Kind"><Select name="kind" defaultValue="SALARY"><option value="SALARY">Salary</option><option value="STIPEND">Stipend (article)</option></Select></Field>
            <Field label="Tax regime"><Select name="regime" defaultValue={defaultRegime}><option value="NEW">New</option><option value="OLD">Old</option></Select></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Basic / stipend ₹" error={err("basic")}><Input name="basic" inputMode="decimal" required /></Field>
            <Field label="HRA ₹" error={err("hra")}><Input name="hra" inputMode="decimal" /></Field>
            <Field label="Special allowance ₹" error={err("special")}><Input name="special" inputMode="decimal" /></Field>
            <Field label="Other allowance ₹" error={err("other")}><Input name="other" inputMode="decimal" /></Field>
            <Field label="Variable (monthly) ₹" error={err("variable")}><Input name="variable" inputMode="decimal" /></Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

const RATE_FIELDS: Record<string, [string, string, string?][]> = {
  PF: [["effectiveFrom", "Effective from", "date"], ["employee", "Employee %"], ["employerEpf", "Employer EPF %"], ["employerEps", "Employer EPS %"], ["pfCeiling", "PF wage ceiling ₹"], ["epsCeiling", "EPS/EDLI wage ceiling ₹"], ["admin", "Admin charges %"], ["edli", "EDLI %"]],
  ESI: [["effectiveFrom", "Effective from", "date"], ["employee", "Employee %"], ["employer", "Employer %"], ["ceiling", "Wage ceiling ₹"]],
  PT: [["stateCode", "State code (e.g. MH)"], ["gender", "Gender (ANY, M, F)"], ["from", "Gross from ₹"], ["to", "Gross to ₹ (blank = no limit)"], ["amount", "PT per month ₹"], ["overrideMonth", "Different month (1–12)"], ["overrideAmount", "Amount in that month ₹"], ["effectiveFrom", "Effective from", "date"]],
  SLAB: [["fy", "FY (e.g. FY2026-27)"], ["regime", "Regime (NEW / OLD)"], ["from", "Income from ₹"], ["to", "Income to ₹ (blank = no limit)"], ["rate", "Rate %"]],
  PARAM: [["fy", "FY (e.g. FY2026-27)"], ["regime", "Regime (ANY / NEW / OLD)"], ["key", "Key (e.g. STANDARD_DEDUCTION)"], ["unit", "Unit (PAISE = ₹ amount, BP = %, FLAG)"], ["value", "Value (₹, % or 0/1)"]],
  STIPEND: [["institute", "Institute (ICAI / ICSI)"], ["locationClass", "Location class"], ["year", "Year of training"], ["amount", "Minimum per month ₹"], ["effectiveFrom", "Effective from", "date"]],
};

export function AddRateDialog({ table, title, action }: { table: string; title: string; action: Act }) {
  return (
    <FormDialog trigger="Add row" title={`Add — ${title}`} description="Statutory values are never edited in place: add a row from its effective date. It stays Unverified until a Partner verifies it." action={action} submitLabel="Add">
      {(err) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {(RATE_FIELDS[table] ?? []).map(([name, label, type]) => (
              <Field key={name} label={label} error={err(name) ?? err(`${name}Paise`) ?? err(`${name}Bp`)}><Input name={name} type={type ?? "text"} /></Field>
            ))}
          </div>
          <Field label="Source (notification / circular)" error={err("source")}><Input name="source" required /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function VerifyDeclarationDialog({ action, sections }: { action: Act; sections: { code: string; label: string; declared: string }[] }) {
  return (
    <FormDialog trigger="Verify" title="Verify declaration" description="Enter the amounts supported by proofs (₹ per year). These replace the declared amounts for TDS." action={action} submitLabel="Mark verified">
      {(err) => (
        <>
          {sections.map((s) => <Field key={s.code} label={s.label} hint={`Declared ₹${s.declared}`}><Input name={`v_${s.code}`} inputMode="decimal" defaultValue={s.declared} /></Field>)}
          <Field label="Note to the employee" error={err("note")}><Textarea name="note" className="min-h-14" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function Form16Dialog({ action, label, preset }: { action: Act; label: string; preset: { tan: string; certificateNo: string; citTds: string; quarters: Record<string, { receiptNo: string; amount: string }> } | null }) {
  return (
    <FormDialog trigger={preset ? `Regenerate ${label}` : `Generate ${label}`} title={`${label} — Part A from TRACES`} description="Part B is computed from paid runs and the verified declaration. Type the Part A details from the TRACES download." action={action} submitLabel="Generate">
      {(err) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employer TAN" error={err("employerTan")}><Input name="tan" defaultValue={preset?.tan ?? ""} required /></Field>
            <Field label="Certificate number" error={err("certificateNo")}><Input name="certificateNo" defaultValue={preset?.certificateNo ?? ""} required /></Field>
            <Field label="CIT (TDS) address"><Input name="citTds" defaultValue={preset?.citTds ?? ""} /></Field>
          </div>
          {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
            <div key={q} className="grid grid-cols-[2.5rem_1fr_7rem] items-center gap-2">
              <span className="text-sm">{q}</span>
              <Input name={`r_${q}`} placeholder="Receipt number" defaultValue={preset?.quarters[q]?.receiptNo ?? ""} aria-label={`${q} receipt number`} />
              <Input name={`a_${q}`} placeholder="TDS ₹" inputMode="decimal" defaultValue={preset?.quarters[q]?.amount ?? ""} aria-label={`${q} tax deducted`} />
            </div>
          ))}
        </>
      )}
    </FormDialog>
  );
}
