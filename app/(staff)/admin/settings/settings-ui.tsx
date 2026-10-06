"use client";
import { ActionForm } from "@/components/action-form";
import { Input, Checkbox, Field } from "@/components/ui/input";
import { updateSettingAction, resetDemoAction } from "../actions";

export function SettingRow({ k, description, value, isDefault }: { k: string; description: string; value: unknown; isDefault: boolean }) {
  const kind = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : typeof value === "object" ? "object" : "string";
  return (
    <div className="py-3">
      <ActionForm action={updateSettingAction.bind(null, k)} submitLabel="Save" className="flex flex-wrap items-end gap-3">
        {() => (
          <>
            <input type="hidden" name="kind" value={kind} />
            <div className="min-w-60 flex-1">
              <p className="text-sm font-medium">{description}</p>
              <p className="font-mono text-xs text-muted">{k}{isDefault ? " · default" : ""}</p>
            </div>
            {kind === "boolean" ? (
              <Checkbox name="value" defaultChecked={Boolean(value)} label="On" />
            ) : (
              <Input name="value" defaultValue={kind === "object" ? JSON.stringify(value) : String(value)} className="w-40" aria-label={description} />
            )}
          </>
        )}
      </ActionForm>
    </div>
  );
}

export function DemoReset() {
  return (
    <ActionForm action={resetDemoAction} submitLabel="Reset demo data" danger>
      {() => <Field label="Type RESET to confirm"><Input name="confirm" autoComplete="off" className="max-w-40" /></Field>}
    </ActionForm>
  );
}
