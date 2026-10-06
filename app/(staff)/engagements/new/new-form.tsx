"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createEngagementAction } from "../actions";
import type { ActionResult } from "@/lib/action";
import { Field, Input, Select, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent } from "@/components/ui/card";
import { SERVICE_LINES, SERVICE_LINE_LABELS, FEE_BASES, FEE_BASIS_LABELS } from "@/server/domain/enums";
import { todayIst } from "@/server/lib/dates";

export function NewEngagementForm({ clients, templates, defaultClientId }: {
  clients: { id: string; label: string }[];
  templates: { code: string; name: string; stages: string[] }[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult<{ id: string }>, FormData>(createEngagementAction, { ok: true });
  const [type, setType] = useState(templates[0]?.code ?? "OTHER");
  const [feeBasis, setFeeBasis] = useState<string>("FIXED");
  useEffect(() => {
    if (state.ok && state.data?.id) router.push(`/engagements/${state.data.id}`);
  }, [state, router]);
  const err = (k: string) => (!state.ok ? state.fieldErrors?.[k] : undefined);
  const stages = templates.find((t) => t.code === type)?.stages ?? [];
  return (
    <Card>
      <CardContent>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          {!state.ok ? <Alert tone="error" className="sm:col-span-2">{state.error}</Alert> : null}
          <Field label="Client *" error={err("clientId")} className="sm:col-span-2">
            <Select name="clientId" defaultValue={defaultClientId} required>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
          </Field>
          <Field label="Engagement name *" error={err("name")} className="sm:col-span-2"><Input name="name" placeholder="e.g. Statutory audit FY 2026-27" required /></Field>
          <Field label="Service line"><Select name="serviceLine">{SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABELS[s]}</option>)}</Select></Field>
          <Field label="Engagement type (stage template)">
            <Select name="engagementType" value={type} onChange={(e) => setType(e.target.value)}>{templates.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select>
          </Field>
          <p className="text-xs text-muted sm:col-span-2">Stages: {stages.join(" → ")}</p>
          <Field label="Recurrence"><Select name="recurrence"><option value="ONE_TIME">One-time</option><option value="RECURRING">Recurring</option></Select></Field>
          <Field label="Fee basis"><Select name="feeBasis" value={feeBasis} onChange={(e) => setFeeBasis(e.target.value)}>{FEE_BASES.map((f) => <option key={f} value={f}>{FEE_BASIS_LABELS[f]}</option>)}</Select></Field>
          {feeBasis === "TIME" ? (
            <Field label="Rate per hour (₹) *" error={err("ratePaisePerHour")}><Input name="rate" inputMode="decimal" /></Field>
          ) : (
            <Field label="Fee (₹)" error={err("feePaise")}><Input name="fee" inputMode="decimal" /></Field>
          )}
          <Field label="Budget (hours)" hint="Quarter-hour steps, e.g. 12.5" error={err("budgetMinutes")}><Input name="budgetHours" inputMode="decimal" /></Field>
          <Field label="Start date"><Input type="date" name="startDate" defaultValue={todayIst()} /></Field>
          <Field label="End date"><Input type="date" name="endDate" /></Field>
          <div className="space-y-1 sm:col-span-2">
            <Checkbox name="chargeable" defaultChecked label="Chargeable" />
            <Checkbox name="eqrRequired" label="Engagement quality review (EQR) required" />
          </div>
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create engagement"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
