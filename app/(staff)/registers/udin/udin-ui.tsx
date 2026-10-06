"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/action-form";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatDate } from "@/server/lib/dates";
import { recordUdinAction, revokeUdinAction, reconcileUdinsAction } from "./actions";

export type GeneratedRow = { id: string; client: string; doc: string; signed: string; partner: string; udin: string; generatedOn: string; reconciledOn: string };

export function RecordUdinDialog({ id, doc, signed, today }: { id: string; doc: string; signed: string; today: string }) {
  return (
    <FormDialog trigger="Record UDIN" triggerVariant="default" title="Record UDIN" description={`${doc}, signed ${formatDate(signed)}. Enter the UDIN generated on the ICAI / ICSI portal.`} action={recordUdinAction.bind(null, id)} submitLabel="Record">
      {(err) => (
        <>
          <Field label="UDIN *" error={err("udin")} hint="17–18 letters and digits"><Input name="udin" required autoComplete="off" className="font-mono uppercase" maxLength={18} /></Field>
          <Field label="Generated on *" error={err("generatedOn")}><Input type="date" name="generatedOn" defaultValue={today} min={signed} max={today} required /></Field>
        </>
      )}
    </FormDialog>
  );
}

function RevokeDialog({ id, udin }: { id: string; udin: string }) {
  return (
    <FormDialog trigger="Revoke" triggerVariant="ghost" title="Mark UDIN revoked" description={`Record that ${udin} was revoked on the portal.`} action={revokeUdinAction.bind(null, id)} submitLabel="Mark revoked" danger>
      {(err) => <Field label="Reason *" error={err("reason")}><Input name="reason" required placeholder="e.g. Generated against wrong document" /></Field>}
    </FormDialog>
  );
}

/** Generated UDINs with select-and-reconcile against the portal's list. */
export function GeneratedTable({ rows }: { rows: GeneratedRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const open = rows.filter((r) => !r.reconciledOn).map((r) => r.id);
  const reconcile = () => start(async () => {
    const r = await reconcileUdinsAction(selected);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    if (r.ok) { setSelected([]); router.refresh(); }
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <Button size="sm" variant="secondary" onClick={() => setSelected(selected.length === open.length ? [] : open)} disabled={!open.length}>
          {selected.length && selected.length === open.length ? "Clear selection" : "Select all unreconciled"}
        </Button>
        <Button size="sm" onClick={reconcile} disabled={pending || !selected.length}>{pending ? "Working…" : `Mark ${selected.length || ""} reconciled`}</Button>
        <span className="text-xs text-muted">Tick the UDINs that appear on the portal&apos;s UDIN list.</span>
      </div>
      {msg ? <div className="px-4"><Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert></div> : null}
      <Table>
        <THead><tr><TH className="w-8"><span className="sr-only">Select</span></TH><TH>Client</TH><TH>Document</TH><TH>Signed</TH><TH>Partner</TH><TH>UDIN</TH><TH>Generated</TH><TH>Reconciled</TH><TH /></tr></THead>
        <TBody>
          {rows.length === 0 ? <TR><TD colSpan={9} className="text-muted">No UDINs generated yet.</TD></TR> : null}
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>{r.reconciledOn ? null : <input type="checkbox" aria-label={`Select ${r.udin}`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-[var(--color-brand)]" />}</TD>
              <TD>{r.client}</TD>
              <TD>{r.doc}</TD>
              <TD className="whitespace-nowrap">{formatDate(r.signed)}</TD>
              <TD>{r.partner}</TD>
              <TD className="font-mono">{r.udin}</TD>
              <TD className="whitespace-nowrap">{formatDate(r.generatedOn)}</TD>
              <TD>{r.reconciledOn ? <Badge tone="green">{formatDate(r.reconciledOn)}</Badge> : <Badge>Not yet</Badge>}</TD>
              <TD><RevokeDialog id={r.id} udin={r.udin} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
