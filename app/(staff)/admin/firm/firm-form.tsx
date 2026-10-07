"use client";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveFirmProfileAction } from "./actions";

type Firm = { name: string; address: string; stateCode: string; gstin: string; pan: string; email: string; phone: string; bankName: string; bankAccount: string; bankIfsc: string; upiId: string; invoiceNote: string };

export function FirmForm({ firm, states }: { firm: Firm; states: { code: string; name: string; gstCode: string }[] }) {
  return (
    <ActionForm action={saveFirmProfileAction} submitLabel="Save firm profile">
      {(err) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Firm name *" error={err("name")} className="sm:col-span-2"><Input name="name" defaultValue={firm.name} required /></Field>
          <Field label="Address" error={err("address")} className="sm:col-span-2" hint="Printed on invoices"><Textarea name="address" defaultValue={firm.address} /></Field>
          <Field label="State *" error={err("stateCode")}>
            <Select name="stateCode" defaultValue={firm.stateCode || "RJ"}>{states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.gstCode})</option>)}</Select>
          </Field>
          <Field label="GSTIN" error={err("gstin")} hint="Must start with the state's GST code"><Input name="gstin" defaultValue={firm.gstin} className="font-mono uppercase" maxLength={15} autoComplete="off" /></Field>
          <Field label="PAN" error={err("pan")}><Input name="pan" defaultValue={firm.pan} className="font-mono uppercase" maxLength={10} autoComplete="off" /></Field>
          <Field label="Email" error={err("email")}><Input type="email" name="email" defaultValue={firm.email} /></Field>
          <Field label="Phone" error={err("phone")}><Input name="phone" defaultValue={firm.phone} /></Field>
          <Field label="Bank name" error={err("bankName")}><Input name="bankName" defaultValue={firm.bankName} /></Field>
          <Field label="Account number" error={err("bankAccount")}><Input name="bankAccount" defaultValue={firm.bankAccount} inputMode="numeric" autoComplete="off" /></Field>
          <Field label="IFSC" error={err("bankIfsc")}><Input name="bankIfsc" defaultValue={firm.bankIfsc} className="font-mono uppercase" maxLength={11} /></Field>
          <Field label="UPI ID" error={err("upiId")} hint="Printed on invoices for payment; no gateway is connected"><Input name="upiId" defaultValue={firm.upiId} /></Field>
          <Field label="Invoice note" error={err("invoiceNote")} className="sm:col-span-2" hint="Printed at the foot of every invoice, e.g. payment terms"><Textarea name="invoiceNote" defaultValue={firm.invoiceNote} maxLength={600} /></Field>
        </div>
      )}
    </ActionForm>
  );
}
