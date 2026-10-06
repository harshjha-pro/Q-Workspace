"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  addHolidayAction, addLateFeeAction, addRuleVersionAction, createExtensionAction, previewExtensionAction,
  publishExtensionAction, regenerateAction, setHolidayPolicyAction,
} from "./actions";

/** One-click server action (verify, activate, remove) with inline error. */
export function ActButton({ action, label, variant = "secondary", confirm }: { action: () => Promise<ActionResult>; label: string; variant?: "secondary" | "ghost" | "danger" | "default"; confirm?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant={variant} disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setError(r.ok ? null : r.error);
            if (r.ok) router.refresh();
          });
        }}>
        {pending ? "Working…" : label}
      </Button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

const RULE_HINT = `Kinds: DAY_AFTER_PERIOD {day, monthsAfter?}, STATE_GROUP_DAY_AFTER_PERIOD {days:{A:22,B:24}}, MMDD_ON_OR_AFTER_START / MMDD_AFTER_END {mmdd:"10-31"} or {byIndex}, EVENT_OFFSET {eventType, days, provisional}, MANUAL.`;

export function AddRuleDialog({ typeCode, typeName, currentParams }: { typeCode: string; typeName: string; currentParams?: string }) {
  return (
    <FormDialog trigger="New rule version" title={`New rule version — ${typeName}`}
      description="Open tasks for periods on or after the effective date are recomputed. The new version starts Unverified."
      action={addRuleVersionAction.bind(null, typeCode)} submitLabel="Add version">
      {(errorFor) => (
        <>
          <Field label="Rule parameters (JSON)" error={errorFor("paramsJson")} hint={RULE_HINT}>
            <Textarea name="paramsJson" defaultValue={currentParams ?? ""} className="font-mono text-xs" rows={5} required />
          </Field>
          <Field label="Effective from (period start)" error={errorFor("effectiveFrom")}><Input name="effectiveFrom" type="date" required /></Field>
          <Field label="Source" error={errorFor("source")} hint="e.g. CBIC Notification 12/2024-CT"><Input name="source" required /></Field>
          <Field label="Notification / circular ref" error={errorFor("notificationRef")}><Input name="notificationRef" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export const POLICY_LABELS: Record<string, string> = { NONE: "No shift (statutory date)", NEXT_WORKING_DAY: "Next working day", PREV_WORKING_DAY: "Previous working day" };

export function HolidayPolicyDialog({ typeCode, policy }: { typeCode: string; policy: string }) {
  return (
    <FormDialog trigger="Change" triggerVariant="ghost" title="Weekend / holiday policy"
      description="Statutory due dates normally do not move for holidays. Changing this is logged with your reason."
      action={setHolidayPolicyAction.bind(null, typeCode)} submitLabel="Change policy">
      {(errorFor) => (
        <>
          <Field label="Policy" error={errorFor("policy")}>
            <Select name="policy" defaultValue={policy}>
              {Object.entries(POLICY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Reason" error={errorFor("reason")}><Input name="reason" required /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function AddLateFeeDialog({ typeCode, typeName }: { typeCode: string; typeName: string }) {
  return (
    <FormDialog trigger="Add rate" title={`Late fee rate — ${typeName}`} description="Starts Unverified until a Partner checks it." action={addLateFeeAction.bind(null, typeCode)} submitLabel="Add rate">
      {(errorFor) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Per day (₹)" error={errorFor("perDayRupees")}><Input name="perDayRupees" inputMode="decimal" required /></Field>
            <Field label="Maximum (₹)" error={errorFor("maxRupees")} hint="Blank = no cap"><Input name="maxRupees" inputMode="decimal" /></Field>
            <Field label="Interest % per month" error={errorFor("interestPctPerMonth")}><Input name="interestPctPerMonth" inputMode="decimal" defaultValue="0" required /></Field>
            <Field label="Effective from" error={errorFor("effectiveFrom")}><Input name="effectiveFrom" type="date" required /></Field>
          </div>
          <Field label="Source" error={errorFor("source")}><Input name="source" required /></Field>
          <Field label="Note" error={errorFor("note")}><Input name="note" /></Field>
        </>
      )}
    </FormDialog>
  );
}

export function AddHolidayDialog({ states, year }: { states: { code: string; name: string }[]; year: number }) {
  const [kind, setKind] = useState("NATIONAL");
  return (
    <FormDialog trigger="Add holiday" triggerVariant="default" title="Add holiday" action={addHolidayAction} submitLabel="Add">
      {(errorFor) => (
        <>
          <Field label="Date" error={errorFor("date")}><Input name="date" type="date" min={`${year}-01-01`} required /></Field>
          <Field label="Name" error={errorFor("name")}><Input name="name" required /></Field>
          <Field label="Kind" error={errorFor("kind")}>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="NATIONAL">National</option><option value="STATE">State</option><option value="FIRM">Firm</option>
            </Select>
          </Field>
          {kind === "STATE" ? (
            <Field label="State" error={errorFor("stateCode")}>
              <Select name="stateCode" required defaultValue=""><option value="" disabled>Choose…</option>{states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select>
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

export function CreateExtensionDialog({ types, constitutions, gstFrequencies, published }: {
  types: { code: string; name: string }[];
  constitutions: { value: string; label: string }[];
  gstFrequencies: string[];
  published: { id: string; label: string }[];
}) {
  const [mode, setMode] = useState("SPECIFIC");
  return (
    <FormDialog trigger="New extension" triggerVariant="default" title="New due-date extension"
      description="Saved as a draft. You preview the affected tasks and confirm the count before anything moves." action={createExtensionAction} submitLabel="Save draft">
      {(errorFor) => (
        <>
          <fieldset>
            <legend className="mb-1 text-xs font-medium">Compliance types</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {types.map((t) => <Checkbox key={t.code} name="typeCodes" value={t.code} label={<span><span className="font-mono text-xs">{t.code}</span> {t.name}</span>} />)}
            </div>
            {errorFor("typeCodes") ? <p className="mt-1 text-xs text-red-600">{errorFor("typeCodes")}</p> : null}
          </fieldset>
          <Field label="Periods" error={errorFor("periodsMode")}>
            <Select name="periodsMode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="SPECIFIC">Specific periods</option><option value="ALL_OPEN">All open periods</option>
            </Select>
          </Field>
          {mode === "SPECIFIC" ? (
            <Field label="Period keys (comma-separated)" error={errorFor("periodKeys")} hint="As shown on tasks, e.g. 2026-09, FY2025-26"><Input name="periodKeys" required /></Field>
          ) : null}
          <Field label="New due date" error={errorFor("newEffectiveDueDate")}><Input name="newEffectiveDueDate" type="date" required /></Field>
          <Field label="Notification / circular number" error={errorFor("notificationRef")}><Input name="notificationRef" required /></Field>
          <Field label="Reason" error={errorFor("reason")}><Input name="reason" required /></Field>
          <details className="rounded-md border border-line p-2">
            <summary className="cursor-pointer text-xs font-medium">Limit to some clients (optional — default is all clients)</summary>
            <div className="mt-2 space-y-3">
              <fieldset>
                <legend className="mb-1 text-xs font-medium">Constitution</legend>
                <div className="grid grid-cols-2 gap-1">{constitutions.map((c) => <Checkbox key={c.value} name="constitution" value={c.value} label={c.label} />)}</div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-xs font-medium">GST filing frequency</legend>
                <div className="flex flex-wrap gap-3">{gstFrequencies.map((g) => <Checkbox key={g} name="gstFrequency" value={g} label={g} />)}</div>
              </fieldset>
              <Field label="State codes (comma-separated)" hint="e.g. 27, 29"><Input name="state" /></Field>
            </div>
          </details>
          {published.length ? (
            <Field label="Supersedes (optional)" hint="Correcting an earlier published extension">
              <Select name="supersedesId" defaultValue=""><option value="">None</option>{published.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
            </Field>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

/** Rules Spec 5: preview first, then publish only after typing back the affected-task count. */
export function ExtensionPublish({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<{ tasks: number; clients: number; reclassify: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={pending}
        onClick={() => start(async () => {
          const r = await previewExtensionAction(id);
          if (r.ok && r.data) { setPreview(r.data); setError(null); } else if (!r.ok) setError(r.error);
        })}>
        {pending ? "Checking…" : preview ? "Preview again" : "Preview"}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {preview ? (
        <div className="space-y-2 rounded-md border border-line bg-gray-50 p-3">
          <p className="text-sm">
            This will affect <strong>{preview.tasks}</strong> task{preview.tasks === 1 ? "" : "s"} across <strong>{preview.clients}</strong> client{preview.clients === 1 ? "" : "s"}
            {preview.reclassify ? <>; <strong>{preview.reclassify}</strong> filed-late task(s) will be reclassified as Filed</> : null}.
          </p>
          <ActionForm action={publishExtensionAction.bind(null, id)} submitLabel="Publish extension" className="flex flex-wrap items-end gap-2">
            {(errorFor) => (
              <Field label={`Type ${preview.tasks} to confirm`} error={errorFor("confirmedCount")}>
                <Input name="confirmedCount" inputMode="numeric" autoComplete="off" className="w-28" required />
              </Field>
            )}
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}

export function RegenerateAll() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof regenerateAction>> | null>(null);
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={pending}
        onClick={() => {
          if (!window.confirm("Regenerate compliance tasks for every client? This only fills gaps; it never overwrites existing tasks.")) return;
          start(async () => { const r = await regenerateAction(); setResult(r); if (r.ok) router.refresh(); });
        }}>
        {pending ? "Regenerating…" : "Regenerate all"}
      </Button>
      {result ? (
        result.ok && result.data ? (
          <Alert tone="success">
            {result.data.clients !== undefined ? `${result.data.clients} client(s) checked. ` : ""}
            {result.data.created} task(s) created, {result.data.recomputed} recomputed, {result.data.closed} closed.
          </Alert>
        ) : !result.ok ? <Alert tone="error">{result.error}</Alert> : null
      ) : null}
    </div>
  );
}
