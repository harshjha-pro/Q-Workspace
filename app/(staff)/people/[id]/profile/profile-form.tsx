"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveProfileAction } from "../../actions";

type P = Record<string, unknown> | null;

export function ProfileForm({ userId, p, states, hasPan }: { userId: string; p: P; states: { code: string; name: string }[]; hasPan: boolean }) {
  const router = useRouter();
  const v = (k: string) => (p && p[k] != null ? String(p[k]) : "");
  return (
    <ActionForm action={saveProfileAction.bind(null, userId)} submitLabel="Save record" onSuccess={() => router.push(`/people/${userId}`)}>
      {(err) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category"><Select name="employeeCategory" defaultValue={v("employeeCategory") || "STAFF"}><option>PARTNER</option><option>STAFF</option><option>ARTICLE</option><option>ADMIN</option><option>SUPPORT</option></Select></Field>
          <Field label="Joining date" error={err("joiningDate")}><Input type="date" name="joiningDate" defaultValue={v("joiningDate")} /></Field>
          <Field label="Confirmation date" error={err("confirmationDate")}><Input type="date" name="confirmationDate" defaultValue={v("confirmationDate")} /></Field>
          <Field label="Date of birth" error={err("dateOfBirth")}><Input type="date" name="dateOfBirth" defaultValue={v("dateOfBirth")} /></Field>
          <Field label="Gender"><Input name="gender" defaultValue={v("gender")} /></Field>
          <Field label="Work state (for PT)"><Select name="workStateCode" defaultValue={v("workStateCode")}><option value="">—</option>{states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select></Field>
          <Field label="Personal email" error={err("personalEmail")}><Input name="personalEmail" defaultValue={v("personalEmail")} /></Field>
          <Field label="Personal mobile"><Input name="personalMobile" defaultValue={v("personalMobile")} /></Field>
          <Field label="Emergency contact name"><Input name="emergencyName" defaultValue={v("emergencyName")} /></Field>
          <Field label="Emergency phone"><Input name="emergencyPhone" defaultValue={v("emergencyPhone")} /></Field>
          <Field label="UAN"><Input name="uan" defaultValue={v("uan")} /></Field>
          <Field label="ESI number"><Input name="esiNumber" defaultValue={v("esiNumber")} /></Field>
          <Field label="Qualifications"><Input name="qualifications" defaultValue={v("qualifications")} /></Field>
          <Field label="Membership body"><Select name="membershipBody" defaultValue={v("membershipBody")}><option value="">—</option><option>ICAI</option><option>ICSI</option><option>ICMAI</option></Select></Field>
          <Field label="Membership / registration no."><Input name="membershipNo" defaultValue={v("membershipNo")} /></Field>
          <Field label="Address" className="sm:col-span-3"><Textarea name="address" defaultValue={v("address")} /></Field>
          <Field label={`PAN${hasPan ? " (stored — type to replace)" : ""}`} error={err("pan")}><Input name="pan" className="uppercase" autoComplete="off" /></Field>
          <Field label={`Aadhaar${v("aadhaarMasked") ? ` (${v("aadhaarMasked")})` : ""}`} error={err("aadhaar")}><Input name="aadhaar" inputMode="numeric" autoComplete="off" /></Field>
          <Field label="Bank name"><Input name="bankName" autoComplete="off" /></Field>
          <Field label="Bank account no." error={err("bankAccount")}><Input name="bankAccount" inputMode="numeric" autoComplete="off" /></Field>
          <Field label="IFSC" error={err("bankIfsc")}><Input name="bankIfsc" className="uppercase" autoComplete="off" /></Field>
        </div>
      )}
    </ActionForm>
  );
}
