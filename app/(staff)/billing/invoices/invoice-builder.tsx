"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInr, parseInrToPaise } from "@/server/lib/money";
import { formatDate } from "@/server/lib/dates";
import { builderDataAction, saveDraftAction, suggestLinesAction, type BuilderData } from "../actions";

type Line = { key: string; kind: "FEE" | "REIMBURSEMENT"; description: string; sac: string; qty: string; rate: string; engagementId: string | null; disbursementId: string | null };
export type BuilderInitial = {
  id: string; clientId: string; engagementId: string | null; date: string; recipientGstin: string; periodFrom: string; periodTo: string; notes: string;
  lines: { kind: string; description: string; sac: string; quantityMilli: number; ratePaise: number; engagementId: string | null; disbursementId: string | null }[];
};

let seq = 0;
const key = () => `l${++seq}`;
const rupees = (p: number) => (p / 100).toFixed(2).replace(/\.00$/, "");
const qtyStr = (m: number) => String(m / 1000);

export function InvoiceBuilder({ clients, initial, defaultClientId, defaultEngagementId, today }: {
  clients: { id: string; label: string }[];
  initial?: BuilderInitial;
  defaultClientId?: string;
  defaultEngagementId?: string;
  today: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initial?.clientId ?? defaultClientId ?? "");
  const [data, setData] = useState<BuilderData | null>(null);
  const [engagementId, setEngagementId] = useState(initial?.engagementId ?? defaultEngagementId ?? "");
  const [date, setDate] = useState(initial?.date ?? today);
  const [recipientGstin, setRecipientGstin] = useState(initial?.recipientGstin ?? "");
  const [periodFrom, setPeriodFrom] = useState(initial?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(initial?.periodTo ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    (initial?.lines ?? []).map((l) => ({ key: key(), kind: l.kind as Line["kind"], description: l.description, sac: l.sac, qty: qtyStr(l.quantityMilli), rate: rupees(l.ratePaise), engagementId: l.engagementId, disbursementId: l.disbursementId })),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    builderDataAction(clientId).then((r) => {
      if (!live) return;
      if (r.ok && r.data) {
        setData(r.data);
        setError(null);
      } else if (!r.ok) setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [clientId]);

  const changeClient = (id: string) => {
    setClientId(id);
    setEngagementId("");
    setRecipientGstin("");
    setLines([]);
    setData(null);
  };
  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const remove = (k: string) => setLines((ls) => ls.filter((l) => l.key !== k));
  const addManual = (kind: Line["kind"]) => setLines((ls) => [...ls, { key: key(), kind, description: "", sac: "", qty: "1", rate: "", engagementId: engagementId || null, disbursementId: null }]);
  const toggleDisb = (d: BuilderData["disbursements"][number]) =>
    setLines((ls) => (ls.some((l) => l.disbursementId === d.id) ? ls.filter((l) => l.disbursementId !== d.id) : [...ls, { key: key(), kind: "REIMBURSEMENT", description: `${d.description} (paid ${formatDate(d.date)})`, sac: "", qty: "1", rate: rupees(d.amountPaise), engagementId: null, disbursementId: d.id }]));
  const suggest = () => start(async () => {
    if (!engagementId) return setError("Pick an engagement first.");
    const r = await suggestLinesAction(engagementId, periodFrom, periodTo);
    if (!r.ok) return setError(r.error);
    if (!r.data?.length) return setError("Nothing to bill for this engagement and period (no fee or chargeable hours).");
    setError(null);
    setLines((ls) => [...ls, ...r.data!.map((l) => ({ key: key(), kind: l.kind, description: l.description, sac: l.sac ?? "", qty: qtyStr(l.quantityMilli ?? 1000), rate: rupees(l.ratePaise), engagementId: l.engagementId ?? null, disbursementId: null }))]);
  });

  const amountOf = (l: Line) => {
    const q = Number(l.qty);
    const r = parseInrToPaise(l.rate);
    return Number.isFinite(q) && r !== null ? Math.round(q * r) : 0;
  };
  const feeTotal = lines.filter((l) => l.kind === "FEE").reduce((t, l) => t + amountOf(l), 0);
  const reimbTotal = lines.filter((l) => l.kind === "REIMBURSEMENT").reduce((t, l) => t + amountOf(l), 0);

  const save = () => start(async () => {
    setFieldErrors({});
    const bad = lines.find((l) => !Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0 || parseInrToPaise(l.rate) === null);
    if (bad) return setError("Every line needs a quantity above zero and a rate in rupees.");
    const payload = {
      clientId, engagementId: engagementId || null, date, recipientGstin: recipientGstin || null, periodFrom: periodFrom || null, periodTo: periodTo || null, notes,
      lines: lines.map((l) => ({ kind: l.kind, description: l.description, sac: l.sac || undefined, quantityMilli: Math.round(Number(l.qty) * 1000), ratePaise: parseInrToPaise(l.rate)!, engagementId: l.engagementId, disbursementId: l.disbursementId })),
    };
    const r = await saveDraftAction(initial?.id ?? null, payload);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      return;
    }
    router.push(`/billing/invoices/${r.data!.id}`);
  });

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {Object.keys(fieldErrors).length ? <Alert tone="error">{Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v}`).join(" · ")}</Alert> : null}
      <Card>
        <CardHeader><CardTitle>Bill to</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Client *" className="sm:col-span-2">
            <Select value={clientId} onChange={(e) => changeClient(e.target.value)} disabled={!!initial}>
              <option value="">Pick a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Engagement">
            <Select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} disabled={!data}>
              <option value="">— none —</option>
              {data?.engagements.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </Select>
          </Field>
          <Field label="Recipient GSTIN" hint={data && !data.gstins.length ? "Client is unregistered: place of supply is its state" : "Sets the place of supply"}>
            <Select value={recipientGstin} onChange={(e) => setRecipientGstin(e.target.value)} disabled={!data?.gstins.length}>
              <option value="">{data?.gstins.length ? "Default (home-state GSTIN)" : "Unregistered"}</option>
              {data?.gstins.map((g) => <option key={g.gstin} value={g.gstin}>{g.gstin} ({g.stateCode})</option>)}
            </Select>
          </Field>
          <Field label="Invoice date *" hint="Final date is set when the invoice is issued"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Period from"><Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} /></Field>
            <Field label="Period to"><Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} /></Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" type="button" onClick={suggest} disabled={!engagementId || pending}>Add engagement fee</Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => addManual("FEE")} disabled={!clientId}>Add fee line</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => addManual("REIMBURSEMENT")} disabled={!clientId}>Add reimbursement</Button>
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.length === 0 ? <p className="text-sm text-muted">No lines yet. Time-based engagements bill chargeable hours logged in the period × the engagement rate.</p> : null}
          {lines.map((l) => (
            <div key={l.key} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-12">
              <div className="text-xs font-medium text-muted sm:col-span-12">{l.kind === "FEE" ? "Professional fee (GST applies)" : "Reimbursement — pure agent, no GST"}</div>
              <Field label="Description" className="sm:col-span-6"><Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} /></Field>
              {l.kind === "FEE" ? <Field label="SAC" className="sm:col-span-2" hint="Blank = default"><Input value={l.sac} onChange={(e) => update(l.key, { sac: e.target.value })} inputMode="numeric" /></Field> : <div className="hidden sm:col-span-2 sm:block" />}
              <Field label={l.kind === "FEE" ? "Qty / hours" : "Qty"} className="sm:col-span-1"><Input value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} inputMode="decimal" disabled={!!l.disbursementId} /></Field>
              <Field label="Rate (₹)" className="sm:col-span-2"><Input value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} inputMode="decimal" disabled={!!l.disbursementId} /></Field>
              <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                <span className="text-sm tabular-nums">{formatInr(amountOf(l))}</span>
                <Button size="sm" variant="ghost" type="button" onClick={() => remove(l.key)} aria-label="Remove line">Remove</Button>
              </div>
            </div>
          ))}
          {data?.disbursements.length ? (
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-2 text-sm font-medium">Unrecovered disbursements for this client</p>
              <div className="space-y-1">
                {data.disbursements.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={lines.some((l) => l.disbursementId === d.id)} onChange={() => toggleDisb(d)} />
                    <span>{formatDate(d.date)} · {d.description} · {formatInr(d.amountPaise)}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Fees (taxable)</span><span className="tabular-nums">{formatInr(feeTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Reimbursements</span><span className="tabular-nums">{formatInr(reimbTotal)}</span></div>
            <p className="text-xs text-muted">GST (CGST + SGST or IGST by place of supply) is worked out when you save.</p>
          </div>
          <Field label="Note (internal)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
          <Button type="button" onClick={save} disabled={pending || !clientId || !lines.length}>{pending ? "Saving…" : "Save draft"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
