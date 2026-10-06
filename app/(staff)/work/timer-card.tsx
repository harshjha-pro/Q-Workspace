"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";
import { startTimerAction, stopTimerAction } from "./actions";
import { formatMinutes } from "./format";

export type ActiveTimer = { startedAt: string; label: string } | null;

function elapsedText(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

/** Start/Stop timer (P2-42). Stopping saves a rounded entry dated the day the timer started. */
export function TimerCard({ timer, target, targetLabel }: {
  timer: ActiveTimer;
  target: { clientId: string | null; engagementId: string | null; taskId: string | null } | null;
  targetLabel: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!timer) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [timer]);

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Timer className="h-4 w-4 text-brand" aria-hidden /> Timer</div>
      {msg ? <Alert tone={msg.ok ? "success" : "error"} className="mt-2">{msg.text}</Alert> : null}
      {timer ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm">
            <span className="font-mono text-lg font-semibold tabular-nums" aria-live="off">{now === null ? "…" : elapsedText(now - Date.parse(timer.startedAt))}</span>
            <span className="ml-2 text-muted">{timer.label}</span>
          </p>
          <Input aria-label="What did you work on?" placeholder="What did you work on? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="button" variant="danger" disabled={pending} onClick={() => start(async () => {
            const r = await stopTimerAction(note);
            setMsg(r.ok ? { ok: true, text: `Saved ${formatMinutes(r.data?.minutes ?? 0)}.${r.data?.warnings.length ? ` ${r.data.warnings.join(" ")}` : ""}` } : { ok: false, text: r.error });
            if (r.ok) { setNote(""); router.refresh(); }
          })}>
            <Square className="h-4 w-4" aria-hidden /> {pending ? "Stopping…" : "Stop and save"}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={pending || !target?.engagementId} onClick={() => start(async () => {
            if (!target) return;
            const r = await startTimerAction(target);
            setMsg(r.ok ? null : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })}>
            <Play className="h-4 w-4" aria-hidden /> {pending ? "Starting…" : "Start timer"}
          </Button>
          <span className="text-xs text-muted">{target?.engagementId ? `for ${targetLabel}` : "Choose a client and engagement above to start."}</span>
        </div>
      )}
    </div>
  );
}
