"use client";
import { ActionForm } from "@/components/action-form";
import { buildMisAction } from "../actions";

export function BuildMisForm({ defaultMonth }: { defaultMonth: string }) {
  return (
    <ActionForm action={buildMisAction} submitLabel="Build now" className="flex flex-wrap items-end gap-2">
      {(errorFor) => (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Month</span>
          <input type="month" name="month" defaultValue={defaultMonth} required className="h-9 rounded-md border border-line bg-white px-2" />
          {errorFor("month") ? <span className="text-xs text-red-700">{errorFor("month")}</span> : null}
        </label>
      )}
    </ActionForm>
  );
}
