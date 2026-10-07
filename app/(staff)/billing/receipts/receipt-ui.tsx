"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormDialog } from "@/components/action-form";
import { formatInr, parseInrToPaise } from "@/server/lib/money";
import { formatDate } from "@/server/lib/dates";
import { allocateAction, openInvoicesAction, recordReceiptAction, reverseReceiptAction } from "../actions";

type OpenInv = { id: string; number: string; date: string; totalPaise: number; outstandingPaise: number };
const MODES = ["NEFT", "UPI", "RTGS", "IMPS", "CHEQUE", "CASH"] as const;

function useOpenInvoices(clientId: string) {
  const [rows, setRows] = useState<OpenInv[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let live = true;
    openInvoicesAction(clientId).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data ?? []);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [clientId]);
  return { rows: clientId ? rows : [], error };
}

/** Allocation inputs: one amount per open invoice; "Fill" settles oldest first. */
function Allocations({ rows, values, onChange, available }: { rows: OpenInv[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; available: number }) {
  const fill = () => {
    let left = available;
    const next: Record<string, string> = {};
    for (const r of rows) {
      const take = Math.min(left, r.outstandingPaise);
      if (take > 0) next[r.id] = (take / 100).toFixed(2);
      left -= take;
    }
    onChange(next);
  };
  if (!rows.length) return <p className="text-sm text-muted">No open invoices for this client — the whole amount is kept as an advance.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><p className="text-sm font-medium">Allocate to invoices</p><Button type="button" size="sm" variant="secondary" onClick={fill}>Fill oldest first</Button></div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_8rem] items-center gap-2 text-sm">
          <span><span className="font-mono">{r.number}</span> · {formatDate(r.date)} · balance {formatInr(r.outstandingPaise)}</span>
          <Input aria-label={`Allocate to ${r.number}`} inputMode="decimal" value={values[r.id] ?? ""} onChange={(e) => onChange({ ...values, [r.id]: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

function toAllocations(values: Record<string, string>) {
  const out: { invoiceId: string; amountPaise: number }[] = [];
  for (const [invoiceId, v] of Object.entries(values)) {
    if (!v.trim()) continue;
    const p = parseInrToPaise(v);
    if (p === null || p < 0) return null;
    if (p > 0) out.push({ invoiceId, amountPaise: p });
  }
  return out;
}

export function RecordReceiptForm({ clients, defaultClientId, today }: { clients: { id: string; label: string }[]; defaultClientId?: string; today: string }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const { rows, error } = useOpenInvoices(clientId);
  const amt = parseInrToPaise(amount || "0") ?? 0;
  const tdsP = parseInrToPaise(tds || "0") ?? 0;
  const allocs = toAllocations(values);
  const allocated = (allocs ?? []).reduce((t, a) => t + a.amountPaise, 0);

  const submit = (f: FormData) => start(async () => {
    if (parseInrToPaise(amount || "0") === null || parseInrToPaise(tds || "0") === null || !allocs) return setMsg({ ok: false, text: "Enter amounts in rupees, e.g. 11800 or 11,800.50." });
    const r = await recordReceiptAction({
      clientId, date: String(f.get("date")), amountPaise: amt, tdsPaise: tdsP, mode: String(f.get("mode")) as (typeof MODES)[number],
      reference: String(f.get("reference") ?? ""), notes: String(f.get("notes") ?? ""), allocations: allocs,
    });
    if (!r.ok) return setMsg({ ok: false, text: r.fieldErrors ? `${r.error} ${Object.values(r.fieldErrors).join(" ")}` : r.error });
    setMsg({ ok: true, text: r.message ?? "Saved." });
    setAmount("");
    setTds("");
    setValues({});
    router.refresh();
  });

  return (
    <Card>
      <CardHeader><CardTitle>Record a receipt</CardTitle><span className="text-xs text-muted">Receipt + TDS deducted by the client = amount settled.</span></CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-3 sm:grid-cols-2">
          {msg ? <Alert tone={msg.ok ? "success" : "error"} className="sm:col-span-2">{msg.text}</Alert> : null}
          {error ? <Alert tone="error" className="sm:col-span-2">{error}</Alert> : null}
          <Field label="Client *" className="sm:col-span-2">
            <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setValues({}); }} required>
              <option value="">Pick a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Date *"><Input type="date" name="date" defaultValue={today} max={today} required /></Field>
          <Field label="Mode *"><Select name="mode" defaultValue="NEFT">{MODES.map((m) => <option key={m} value={m}>{m === "CHEQUE" ? "Cheque" : m === "CASH" ? "Cash" : m}</option>)}</Select></Field>
          <Field label="Amount received (₹) *"><Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></Field>
          <Field label="TDS deducted by client (₹)" hint="From Form 26AS / the client's TDS certificate"><Input value={tds} onChange={(e) => setTds(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Reference" hint="UTR / UPI ref / cheque no. (not needed for cash)" className="sm:col-span-2"><Input name="reference" autoComplete="off" /></Field>
          <div className="sm:col-span-2">{clientId ? <Allocations rows={rows} values={values} onChange={setValues} available={amt + tdsP} /> : null}</div>
          <p className="text-sm sm:col-span-2">Settled {formatInr(amt + tdsP)} · allocated {formatInr(allocated)} · advance {formatInr(Math.max(0, amt + tdsP - allocated))}</p>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" maxLength={500} /></Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={pending || !clientId}>{pending ? "Saving…" : "Record receipt"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AllocateDialog({ receiptId, clientId, available }: { receiptId: string; clientId: string; available: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { rows } = useOpenInvoices(open ? clientId : "");
  const save = () => start(async () => {
    const a = toAllocations(values);
    if (!a || !a.length) return setMsg("Enter at least one amount.");
    const r = await allocateAction(receiptId, a);
    if (!r.ok) return setMsg(r.error);
    setOpen(false);
    router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Allocate</Button></DialogTrigger>
      {open ? (
        <DialogContent title="Allocate advance" description={`Unallocated: ${formatInr(available)}`}>
          <div className="space-y-3">
            {msg ? <Alert tone="error">{msg}</Alert> : null}
            <Allocations rows={rows} values={values} onChange={setValues} available={available} />
            <Button onClick={save} disabled={pending}>{pending ? "Working…" : "Allocate"}</Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function ReverseDialog({ receiptId }: { receiptId: string }) {
  return (
    <FormDialog trigger="Reverse" triggerVariant="ghost" title="Reverse receipt" description="Use for a bounced cheque or a wrong entry. Allocations are removed and the invoices re-open; the receipt stays in the trail." action={reverseReceiptAction.bind(null, receiptId)} submitLabel="Reverse" danger>
      {(err) => <Field label="Reason *" error={err("reason")}><Input name="reason" required placeholder="e.g. Cheque returned unpaid" /></Field>}
    </FormDialog>
  );
}
