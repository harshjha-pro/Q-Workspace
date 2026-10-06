"use client";
import { FormDialog } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { uploadEmployeeDocAction } from "./actions";

export function UploadEmployeeDoc({ userId }: { userId: string }) {
  return (
    <FormDialog trigger="Upload" title="Upload document" description="PDF, JPG, PNG, Word or Excel; up to 25 MB." action={uploadEmployeeDocAction.bind(null, userId)} submitLabel="Upload">
      {(err) => (
        <>
          <Field label="Kind"><Select name="kind"><option value="KYC">KYC (PAN, Aadhaar, address)</option><option value="CERTIFICATE">Certificate</option><option value="OFFER">Offer / appointment</option><option value="OTHER">Other</option></Select></Field>
          <Field label="File *" error={err("file")}><Input type="file" name="file" required className="h-auto py-1.5" accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.xlsx,.xls" /></Field>
        </>
      )}
    </FormDialog>
  );
}
