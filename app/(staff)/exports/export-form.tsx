"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, Alert } from "@/components/ui/card";
import { Field, Input, Select, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type KindOption = { kind: string; label: string; dated: boolean; byClient: boolean };
type Option = { id: string; name: string };

/** Builds /api/export/<kind>?… and lets the browser download it (content-disposition: attachment). */
export function ExportForm({ kinds, clients, people, defaultFrom, defaultTo }: { kinds: KindOption[]; clients: Option[]; people: Option[]; defaultFrom: string; defaultTo: string }) {
  const [kind, setKind] = useState(kinds[0]?.kind ?? "");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [clientId, setClientId] = useState("");
  const [userId, setUserId] = useState("");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [error, setError] = useState<string | null>(null);
  const meta = kinds.find((k) => k.kind === kind);

  if (!kinds.length) return <Alert tone="info">There is nothing you can export with your role.</Alert>;

  const href = () => {
    const q = new URLSearchParams({ format });
    if (meta?.dated) { if (from) q.set("from", from); if (to) q.set("to", to); }
    if (meta?.byClient && clientId) q.set("clientId", clientId);
    if (kind === "entries" && userId) q.set("userId", userId);
    return `/api/export/${encodeURIComponent(kind)}?${q.toString()}`;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (meta?.dated && from && to && from > to) { setError("The From date is after the To date."); return; }
    setError(null);
    window.location.assign(href());
  };

  return (
    <Card className="max-w-xl">
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="What to export">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</Select>
          </Field>
          {meta?.dated ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
          ) : <p className="text-xs text-muted">This register is exported in full (no date range).</p>}
          {meta?.byClient && clients.length ? (
            <Field label="Client (optional)">
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">All clients you can see</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Field>
          ) : null}
          {kind === "entries" && people.length ? (
            <Field label="Person (optional)">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Only mine</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
          ) : null}
          <fieldset>
            <Label>Format</Label>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} className="accent-[var(--color-brand)]" />Excel (.xlsx)</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="format" checked={format === "csv"} onChange={() => setFormat("csv")} className="accent-[var(--color-brand)]" />CSV</label>
            </div>
          </fieldset>
          <Button type="submit"><Download className="h-4 w-4" />Download</Button>
        </form>
      </CardContent>
    </Card>
  );
}
