"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { clientInput } from "@/server/domain/schemas/client";
import { CONSTITUTIONS, CONSTITUTION_LABELS, CLIENT_FLAGS, isCompany, type ClientFlag } from "@/server/domain/enums";
import { FLAG_INFO } from "@/server/domain/flags";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClientAction, updateClientAction } from "./actions";

type Opt = { id: string; name: string };
export type ClientFormOptions = { groups: Opt[]; states: { code: string; name: string }[]; partners: Opt[]; managers: Opt[]; teams: Opt[] };
type In = z.input<typeof clientInput>;
type Out = z.output<typeof clientInput>;

export function ClientForm({ options, initial, clientId }: { options: ClientFormOptions; initial?: Partial<In>; clientId?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [flags, setFlags] = useState<Partial<Record<ClientFlag, boolean>>>({});
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(clientInput),
    defaultValues: { constitution: "PRIVATE_COMPANY", booksBy: "CLIENT", kycStatus: "PENDING", preferredChannel: "EMAIL", fyEnd: "03-31", ...initial },
  });
  const { register, handleSubmit, formState, watch, setError } = form;
  const e = formState.errors;
  const constitution = watch("constitution");

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const r = clientId ? await updateClientAction(clientId, values) : await createClientAction({ ...values, flags });
    if (!r.ok) {
      setServerError(r.error);
      for (const [k, msg] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof In, { message: msg });
      return;
    }
    router.push(clientId ? `/clients/${clientId}` : `/clients/${(r.data as { id: string }).id}`);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {serverError ? <Alert tone="error">{serverError}</Alert> : null}
      <Card>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" error={e.name?.message} className="sm:col-span-2"><Input {...register("name")} aria-invalid={!!e.name} /></Field>
          <Field label="Constitution *" error={e.constitution?.message}>
            <Select {...register("constitution")}>{CONSTITUTIONS.map((c) => <option key={c} value={c}>{CONSTITUTION_LABELS[c]}</option>)}</Select>
          </Field>
          <Field label="Group (family / promoter)" error={e.groupId?.message}>
            <Select {...register("groupId")}><option value="">— none —</option>{options.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          </Field>
          <Field label="PAN" error={e.pan?.message}><Input {...register("pan")} className="uppercase" maxLength={10} aria-invalid={!!e.pan} /></Field>
          <Field label="TAN" error={e.tan?.message}><Input {...register("tan")} className="uppercase" maxLength={10} /></Field>
          <Field label={constitution === "LLP" ? "LLPIN" : "CIN"} error={e.cinLlpin?.message}><Input {...register("cinLlpin")} className="uppercase" /></Field>
          <Field label="Udyam number" error={e.udyam?.message}><Input {...register("udyam")} className="uppercase" /></Field>
          <Field label="State" error={e.stateCode?.message}>
            <Select {...register("stateCode")}><option value="">—</option>{options.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select>
          </Field>
          <Field label="Incorporation / birth date" error={e.incorporationDate?.message}><Input type="date" {...register("incorporationDate")} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea {...register("address")} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Responsibility and relationship</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Partner"><Select {...register("partnerId")}><option value="">—</option>{options.partners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Manager"><Select {...register("managerId")}><option value="">—</option>{options.managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Client team"><Select {...register("teamId")}><option value="">—</option>{options.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Books maintained by"><Select {...register("booksBy")}><option value="CLIENT">Client</option><option value="FIRM">Firm</option></Select></Field>
          <Field label="Financial year ends (MM-DD)" error={e.fyEnd?.message}><Input {...register("fyEnd")} /></Field>
          <Field label="Category"><Select {...register("category")}><option value="">—</option><option>A</option><option>B</option><option>C</option></Select></Field>
          <Field label="KYC status"><Select {...register("kycStatus")}><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="COMPLETE">Complete</option></Select></Field>
          <Field label="Preferred channel"><Select {...register("preferredChannel")}><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option><option value="PHONE">Phone</option></Select></Field>
          <Field label="Onboarding date" error={e.onboardingDate?.message}><Input type="date" {...register("onboardingDate")} /></Field>
          <Field label="Lead source"><Input {...register("leadSource")} /></Field>
          <Field label="Tags (comma separated)" className="sm:col-span-2"><Input {...register("tags")} /></Field>
          <div className="sm:col-span-3"><Checkbox label="Public interest entity (EQR may apply)" {...register("publicInterest")} /></div>
        </CardContent>
      </Card>
      {!clientId ? (
        <Card>
          <CardHeader><CardTitle>Applicability flags</CardTitle><span className="text-xs text-muted">They decide which compliance tasks are created. GST flags are set per GSTIN after saving.</span></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {CLIENT_FLAGS.map((f) => {
              const locked = f === "statutoryAuditApplicable" && isCompany(constitution);
              const hidden = f === "dpt3Applicable" && !isCompany(constitution);
              if (hidden) return null;
              return (
                <Checkbox key={f} checked={locked || !!flags[f]} disabled={locked}
                  onChange={(ev) => setFlags((x) => ({ ...x, [f]: ev.target.checked }))}
                  label={<span><span className="font-medium">{FLAG_INFO[f].label}</span> <span className="text-muted">— {FLAG_INFO[f].appliesWhen}{locked ? " (mandatory for companies)" : ""}</span></span>} />
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={formState.isSubmitting}>{formState.isSubmitting ? "Saving…" : clientId ? "Save changes" : "Create client"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
