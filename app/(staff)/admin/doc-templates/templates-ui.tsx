"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import type { ActionResult } from "@/lib/action";
import { createTemplateAction, updateMetaAction, saveDraftAction, approveAction, retireAction, previewAction } from "./actions";

type Opt = { value: string; label: string };

export function NewTemplateDialog({ categories }: { categories: Opt[] }) {
  return (
    <FormDialog trigger="New template" triggerVariant="default" title="New template" description="Starts as a draft. A Partner approves it before anyone can generate documents from it." action={createTemplateAction} submitLabel="Create">
      {(err) => (
        <>
          <Field label="Code *" error={err("code")} hint="Capitals and _, e.g. CERTIFICATE_STOCK. Engagement letters: ENGAGEMENT_LETTER_<SERVICE_LINE>"><Input name="code" required className="font-mono uppercase" maxLength={60} /></Field>
          <Field label="Name *" error={err("name")}><Input name="name" required maxLength={120} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category *" error={err("category")}><Select name="category" required>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
            <Field label="Output"><Select name="outputFormat" defaultValue="PDF"><option value="PDF">PDF</option><option value="DOCX">Word</option><option value="TEXT">Text</option></Select></Field>
          </div>
        </>
      )}
    </FormDialog>
  );
}

export function MetaForm({ templateId, name, outputFormat, active }: { templateId: string; name: string; outputFormat: string; active: boolean }) {
  return (
    <ActionForm action={updateMetaAction.bind(null, templateId)} submitLabel="Save">
      {(err) => (
        <>
          <Field label="Name" error={err("name")}><Input name="name" defaultValue={name} required maxLength={120} /></Field>
          <Field label="Default output"><Select name="outputFormat" defaultValue={outputFormat}><option value="PDF">PDF</option><option value="DOCX">Word</option><option value="TEXT">Text</option></Select></Field>
          <Checkbox name="active" defaultChecked={active} label="Active (offered for generation)" />
        </>
      )}
    </ActionForm>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return { pending, msg, run };
}

export function VersionButtons({ templateId, versionId, status, canApprove }: { templateId: string; versionId: string; status: string; canApprove: boolean }) {
  const { pending, msg, run } = useRun();
  if (!canApprove || status === "RETIRED") return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {status === "DRAFT" ? <Button size="sm" disabled={pending} onClick={() => run(() => approveAction(templateId, versionId))}>Approve</Button> : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => retireAction(templateId, versionId))}>Retire</Button>
      {msg && !msg.ok ? <span className="text-xs text-red-600">{msg.text}</span> : null}
    </span>
  );
}

type FieldGroup = { group: string; needs: string; fields: { key: string; label: string }[] };
type Pickers = { clients: Opt[]; engagements: (Opt & { clientId: string })[]; employees: Opt[] };

/**
 * Editor: draft body with click-to-insert merge fields, save as draft, and a live preview merged with a
 * chosen client / engagement / employee (missing fields are listed).
 */
export function TemplateEditor({ templateId, initialBody, isDraft, fieldGroups, pickers, isHr, canEdit }: {
  templateId: string; initialBody: string; isDraft: boolean; fieldGroups: FieldGroup[]; pickers: Pickers; isHr: boolean; canEdit: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { pending, msg, run } = useRun();
  const [clientId, setClientId] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const [userId, setUserId] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ text: string; missing: string[] } | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const extraFields = useMemo(() => [...new Set([...body.matchAll(/\{\{\s*extra\.([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!))], [body]);
  const engs = pickers.engagements.filter((e) => e.clientId === clientId);

  const insert = (key: string) => {
    const el = ref.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length; });
  };
  const doPreview = () => startPreview(async () => {
    const r = await previewAction({ templateId, body, clientId: clientId || undefined, engagementId: engagementId || undefined, userId: userId || undefined, extra });
    if (r.ok && r.data) { setPreview(r.data); setPreviewErr(null); } else if (!r.ok) setPreviewErr(r.error);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <Field label={isDraft ? "Draft body" : "Body (saving starts a new draft version)"} hint="Plain text. A line starting with '# ' is a heading. Merge fields look like {{client.name}}.">
          <Textarea ref={ref} value={body} onChange={(e) => setBody(e.target.value)} rows={22} className="font-mono text-xs" readOnly={!canEdit} />
        </Field>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={pending || body === initialBody} onClick={() => run(() => saveDraftAction(templateId, body))}>{pending ? "Saving…" : "Save draft"}</Button>
            {msg ? <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-line bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold">Preview</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {isHr ? (
              <Field label="Employee"><Select value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">—</option>{pickers.employees.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
            ) : (
              <>
                <Field label="Client"><Select value={clientId} onChange={(e) => { setClientId(e.target.value); setEngagementId(""); }}><option value="">—</option>{pickers.clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
                <Field label="Engagement"><Select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} disabled={!clientId}><option value="">—</option>{engs.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
              </>
            )}
          </div>
          {extraFields.length ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {extraFields.map((f) => <Field key={f} label={`extra.${f}`}><Input value={extra[f] ?? ""} onChange={(e) => setExtra({ ...extra, [f]: e.target.value })} /></Field>)}
            </div>
          ) : null}
          <div className="mt-3"><Button variant="secondary" size="sm" disabled={previewing} onClick={doPreview}>{previewing ? "Merging…" : "Preview"}</Button></div>
          {previewErr ? <Alert tone="error" className="mt-2">{previewErr}</Alert> : null}
          {preview ? (
            <div className="mt-3 space-y-2">
              {preview.missing.length ? <Alert tone="warn">No value for: {preview.missing.join(", ")}. They show as [[field]].</Alert> : <Alert tone="success">Every merge field has a value.</Alert>}
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded border border-line bg-gray-50 p-3 text-xs">{preview.text}</pre>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-3">
        <h3 className="text-sm font-semibold">Merge fields</h3>
        <p className="text-xs text-muted">Click to insert at the cursor.</p>
        {fieldGroups.map((g) => (
          <div key={g.group}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{g.group} <span className="normal-case">({g.needs})</span></p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {g.fields.map((f) => (
                <li key={f.key}>
                  {g.group === "extra" ? <span className="text-xs text-muted">{f.label}</span> : (
                    <button type="button" disabled={!canEdit} onClick={() => insert(f.key)} title={f.label} className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[11px] hover:bg-gray-50 disabled:opacity-60">{f.key}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}

/** HR letters: generate for an employee and download (POST to the generate route). */
export function EmployeeGenerateForm({ code, employees, extraFields }: { code: string; employees: Opt[]; extraFields: string[] }) {
  return (
    <form method="post" action="/api/doc-templates/generate" className="space-y-3">
      <input type="hidden" name="code" value={code} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee *"><Select name="userId" required defaultValue=""><option value="" disabled>Choose…</option>{employees.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</Select></Field>
        <Field label="Format"><Select name="format" defaultValue="PDF"><option value="PDF">PDF</option><option value="DOCX">Word</option></Select></Field>
      </div>
      {extraFields.map((f) => <Field key={f} label={f}><Input name={`extra_${f}`} /></Field>)}
      <Button type="submit" variant="secondary">Generate and download</Button>
    </form>
  );
}
