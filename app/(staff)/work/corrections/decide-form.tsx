"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";
import { decideCorrectionAction } from "../actions";

export function DecideCorrection({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) => start(async () => {
    const r = await decideCorrectionAction(id, approve, note.trim());
    if (r.ok) router.refresh();
    else setErr(r.error);
  });
  return (
    <div className="space-y-2">
      {err ? <Alert tone="error">{err}</Alert> : null}
      <Input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>Approve</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(false)}>Reject</Button>
      </div>
    </div>
  );
}
