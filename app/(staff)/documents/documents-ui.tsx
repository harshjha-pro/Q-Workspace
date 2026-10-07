"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionForm, FormDialog } from "@/components/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action";
import {
  uploadAction, newVersionAction, checkOutAction, checkInAction, forceReleaseAction, updateDocumentAction, archiveDocumentAction, auditSectionAction, generateAction,
} from "./actions";

export type Opt = { value: string; label: string };

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.zip,.csv,.txt,.json,.xml";

export function UploadDialog({ ctx, kinds, levels, sections, defaultPeriod, tags }: {
  ctx: { clientId: string; engagementId?: string | null; periodKey?: string | null };
  kinds: Opt[]; levels: Opt[]; sections?: Opt[]; defaultPeriod?: string; tags: string[];
}) {
  return (
    <FormDialog trigger="Upload" triggerVariant="default" title="Upload a document" description="PDF, images, Word, Excel, CSV, text, JSON, XML or zip. The file is checked and stored on this computer." action={uploadAction.bind(null, ctx)} submitLabel="Upload">
      {(err) => (
        <>
          <Field label="File *" error={err("file")}><Input type="file" name="file" required accept={ACCEPT} className="py-1.5" /></Field>
          <Field label="Name" hint="Leave blank to use the file name"><Input name="name" maxLength={200} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind"><Select name="kind" defaultValue="OTHER">{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
            <Field label="Confidentiality" error={err("confidentiality")}><Select name="confidentiality" defaultValue="NORMAL">{levels.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
          </div>
          {ctx.engagementId ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Period" error={err("periodKey")} hint="Folder, e.g. FY2026-27"><Input name="periodKey" defaultValue={ctx.periodKey ?? defaultPeriod} maxLength={31} /></Field>
              {sections?.length ? (
                <Field label="Audit file section" error={err("auditSectionCode")}>
                  <Select name="auditSectionCode" defaultValue=""><option value="">None</option>{sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
                </Field>
              ) : null}
            </div>
          ) : null}
          <Field label="Tags" hint={`Comma separated, e.g. ${tags.slice(0, 4).join(", ")}`}><Input name="tags" list="dms-tags" /></Field>
          <datalist id="dms-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
        </>
      )}
    </FormDialog>
  );
}

export type GenTemplate = { code: string; name: string; category: string; outputFormat: string; version: number; extraFields: string[] };

/** Generate a document from an approved template for this client / engagement; it is filed here. */
export function GenerateDialog({ ctx, templates, categoryLabels }: { ctx: { clientId: string; engagementId?: string | null }; templates: GenTemplate[]; categoryLabels: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(templates[0]?.code ?? "");
  const t = templates.find((x) => x.code === code);
  const router = useRouter();
  const action = async (prev: ActionResult<{ documentId: string | null; missing: string[] }>, f: FormData) => {
    const r = await generateAction(ctx, prev, f);
    if (r.ok && r.data?.documentId && !r.data.missing.length) {
      setOpen(false);
      router.push(`/documents/${r.data.documentId}`);
    }
    return r;
  };
  const cats = [...new Set(templates.map((x) => x.category))];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary" disabled={!templates.length} title={templates.length ? undefined : "No approved templates yet"}>Generate document</Button></DialogTrigger>
      {open ? (
        <DialogContent title="Generate document" description="Uses the Partner-approved version of the template, merged with this client's details, and files the result here.">
          <ActionForm action={action as (p: ActionResult, f: FormData) => Promise<ActionResult>} submitLabel="Generate and file">
            {(err) => (
              <>
                <Field label="Template *" error={err("code")}>
                  <Select name="code" value={code} onChange={(e) => setCode(e.target.value)}>
                    {cats.map((c) => (
                      <optgroup key={c} label={categoryLabels[c] ?? c}>
                        {templates.filter((x) => x.category === c).map((x) => <option key={x.code} value={x.code}>{x.name} (v{x.version})</option>)}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Format"><Select name="format" key={code} defaultValue={t?.outputFormat === "DOCX" ? "DOCX" : "PDF"}><option value="PDF">PDF</option><option value="DOCX">Word (.docx)</option></Select></Field>
                  <Field label="File name"><Input name="fileName" placeholder={t?.name} maxLength={150} /></Field>
                </div>
                {t?.extraFields.length ? <p className="text-xs text-muted">Fill in the details this template asks for. Anything left blank shows as [[extra.field]] in the document.</p> : null}
                {t?.extraFields.map((f) => (
                  <Field key={`${code}-${f}`} label={f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}>
                    {/submissions|agenda|business|scope|feeTable|approach|text|enclosures|Summary/i.test(f) ? <Textarea name={`extra_${f}`} rows={3} /> : <Input name={`extra_${f}`} />}
                  </Field>
                ))}
                <Field label="Tags"><Input name="tags" defaultValue="draft" /></Field>
              </>
            )}
          </ActionForm>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return { pending, msg, run };
}

export function CheckOutControls({ docId, canCheckOut, canCheckIn, holder }: { docId: string; canCheckOut: boolean; canCheckIn: boolean; holder: string | null }) {
  const { pending, msg, run } = useAct();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {holder ? <Badge tone="amber">Checked out by {holder}</Badge> : <Badge tone="green">Available</Badge>}
        {canCheckOut ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => checkOutAction(docId))}>Check out</Button> : null}
        {canCheckIn ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => checkInAction(docId))}>Check in without changes</Button> : null}
      </div>
      {msg ? <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
    </div>
  );
}

export function NewVersionDialog({ docId, checkIn }: { docId: string; checkIn: boolean }) {
  return (
    <FormDialog trigger={checkIn ? "Check in new version" : "Upload new version"} triggerVariant="default" title={checkIn ? "Check in a new version" : "Upload a new version"} description="The previous versions stay in the history." action={newVersionAction.bind(null, docId)} submitLabel="Save version">
      {(err) => (
        <>
          <Field label="File *" error={err("file")}><Input type="file" name="file" required accept={ACCEPT} className="py-1.5" /></Field>
          <Field label="What changed"><Input name="note" maxLength={500} placeholder="e.g. Updated after review points" /></Field>
          {checkIn ? <input type="hidden" name="checkIn" value="true" /> : null}
        </>
      )}
    </FormDialog>
  );
}

export function ForceReleaseDialog({ docId, holder }: { docId: string; holder: string }) {
  return (
    <FormDialog trigger="Force release" triggerVariant="ghost" title="Force-release check-out" description={`Release ${holder}'s check-out. Any changes they have not checked in stay with them.`} action={forceReleaseAction.bind(null, docId)} submitLabel="Release" danger>
      {(err) => <Field label="Reason *" error={err("reason")}><Input name="reason" required placeholder="e.g. On leave; file needed for review" /></Field>}
    </FormDialog>
  );
}

export function EditDocumentForm({ docId, doc, kinds, levels, sections, tags, canCurate, canShare }: {
  docId: string;
  doc: { name: string; kind: string; tags: string; confidentiality: string; auditSectionCode: string; sharedWithClient: boolean };
  kinds: Opt[]; levels: Opt[]; sections?: Opt[]; tags: string[]; canCurate: boolean; canShare: boolean;
}) {
  return (
    <ActionForm action={updateDocumentAction.bind(null, docId)} submitLabel="Save details">
      {(err) => (
        <>
          <Field label="Name" error={err("name")}><Input name="name" defaultValue={doc.name} required maxLength={200} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind"><Select name="kind" defaultValue={doc.kind}>{[...kinds, ...(kinds.some((k) => k.value === doc.kind) ? [] : [{ value: doc.kind, label: doc.kind }])].map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
            {canCurate ? (
              <Field label="Confidentiality" error={err("confidentiality")}><Select name="confidentiality" defaultValue={doc.confidentiality}>{levels.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
            ) : null}
          </div>
          {sections?.length ? (
            <Field label="Audit file section"><Select name="auditSectionCode" defaultValue={doc.auditSectionCode}><option value="">None</option>{sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
          ) : null}
          <Field label="Tags" hint="Comma separated"><Input name="tags" defaultValue={doc.tags} list="dms-tags-edit" /></Field>
          <datalist id="dms-tags-edit">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          {canShare ? (
            <>
              <input type="hidden" name="sharedWithClientField" value="1" />
              <Checkbox name="sharedWithClient" defaultChecked={doc.sharedWithClient} label="Visible to the client on the portal" />
            </>
          ) : null}
        </>
      )}
    </ActionForm>
  );
}

export function ArchiveDialog({ docId }: { docId: string }) {
  const router = useRouter();
  return (
    <FormDialog trigger="Archive" triggerVariant="ghost" title="Archive document" description="It leaves lists and search. Versions are kept for the retention period." action={async (p, f) => { const r = await archiveDocumentAction(docId, p, f); if (r.ok) router.push("/documents"); return r; }} submitLabel="Archive" danger>
      {(err) => <Field label="Reason *" error={err("reason")}><Input name="reason" required /></Field>}
    </FormDialog>
  );
}

export function AuditSectionRow({ s, canEdit }: { s: { id: string; name: string; required: boolean; complete: boolean; documentCount: number }; canEdit: boolean }) {
  const { pending, msg, run } = useAct();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <span className={s.required ? "font-medium" : "text-muted line-through"}>{s.name}</span>
        <span className="ml-2 text-xs text-muted">{s.documentCount} document{s.documentCount === 1 ? "" : "s"}</span>
        {msg && !msg.ok ? <span className="ml-2 text-xs text-red-600">{msg.text}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        {!s.required ? <Badge>Not required</Badge> : s.complete ? <Badge tone="green">Complete</Badge> : <Badge tone="amber">Open</Badge>}
        {canEdit ? (
          <>
            {s.required ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => auditSectionAction(s.id, { complete: !s.complete }))}>{s.complete ? "Reopen" : "Mark complete"}</Button> : null}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => auditSectionAction(s.id, { required: !s.required }))}>{s.required ? "Not required" : "Required"}</Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export function CompletenessBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Audit file ${percent}% complete`}>
      <div className="h-2 w-40 max-w-full overflow-hidden rounded bg-gray-100">
        <div className={percent >= 100 ? "h-full bg-green-600" : percent >= 60 ? "h-full bg-amber-500" : "h-full bg-red-500"} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-sm font-medium">{percent}%</span>
    </div>
  );
}

export function DocLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/documents/${id}`} className="font-medium text-brand hover:underline">{name}</Link>;
}
