"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { decideLeaveAction, reassignTaskAction } from "./actions";

export type Conflict = { id: string; title: string; client: string; due: string; role: string };

function ReassignRow({ c, people }: { c: Conflict; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="space-y-1.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span><span className="font-medium">{c.client}</span> · {c.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">due {c.due} <Badge>{c.role.toLowerCase()}</Badge></span>
      </div>
      {people.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label={`Reassign ${c.title} to`} value={to} onChange={(e) => setTo(e.target.value)} className="h-8 max-w-56 text-xs">
            <option value="">Reassign to…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button size="sm" variant="secondary" disabled={!to || pending} onClick={() => start(async () => {
            const r = await reassignTaskAction(c.id, to, c.role);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Reassigned." } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })}>{pending ? "Working…" : "Reassign"}</Button>
          {msg ? <span className={msg.ok ? "text-xs text-green-800" : "text-xs text-red-700"}>{msg.text}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Pending leave with the applicant's tasks due during it (spec 11.3), reassign shortcuts and the decision. */
export function LeaveApproval({ id, conflicts, people }: { id: string; conflicts: Conflict[]; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) => {
    if (!approve && !note.trim()) {
      setErr("Give a reason for rejecting.");
      return;
    }
    start(async () => {
      const r = await decideLeaveAction(id, approve, note.trim());
      if (r.ok) router.refresh();
      else setErr(r.error);
    });
  };
  return (
    <div className="space-y-3">
      {conflicts.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-amber-900">{conflicts.length} task{conflicts.length === 1 ? "" : "s"} due during this leave</p>
          <ul className="divide-y divide-line">{conflicts.map((c) => <ReassignRow key={c.id} c={c} people={people} />)}</ul>
        </div>
      ) : (
        <p className="text-sm text-muted">No open tasks fall due during this leave.</p>
      )}
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div>
        <Label htmlFor={`note-${id}`}>Note (required to reject)</Label>
        <Textarea id={`note-${id}`} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>Approve</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(false)}>Reject</Button>
      </div>
    </div>
  );
}
