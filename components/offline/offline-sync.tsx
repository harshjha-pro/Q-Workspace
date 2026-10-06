"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listQueued, QUEUE_EVENT, removeQueued, syncQueue, type QueuedEntry } from "./queue";

/**
 * Shows entries waiting on this device and uploads them when the connection returns.
 * Mounted on the Add Work page; harmless when the queue is empty (renders nothing).
 */
export function OfflineSync() {
  const router = useRouter();
  const [rows, setRows] = useState<QueuedEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listQueued().then(setRows).catch(() => setRows([]));
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    const r = await syncQueue();
    setBusy(false);
    if (r.status === "signed-out") setNote("Sign in again to upload the entries saved on this device.");
    else if (r.status === "error") setNote("The server could not take the entries just now. They are still on this device.");
    else if (r.status === "ok") {
      setNote(r.synced ? `${r.synced} entr${r.synced === 1 ? "y" : "ies"} synced.` : null);
      if (r.synced) router.refresh();
    }
    refresh();
  }, [refresh, router]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(QUEUE_EVENT, refresh);
    // Initial state comes from the browser, so read it after mount (and try a sync once).
    queueMicrotask(() => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
      else refresh();
    });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(QUEUE_EVENT, refresh);
    };
  }, [refresh, sync]);

  if (rows.length === 0 && online && !note) return null;
  return (
    <div className="space-y-2">
      {!online ? (
        <Alert tone="warn">
          <span className="inline-flex items-center gap-2"><CloudOff className="h-4 w-4" aria-hidden /> You are offline. Work you save is kept on this device and synced when you are back online.</span>
        </Alert>
      ) : null}
      {note ? <Alert tone="info">{note}</Alert> : null}
      {rows.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{rows.length} entr{rows.length === 1 ? "y" : "ies"} saved on this device — will sync</p>
            <Button size="sm" variant="secondary" onClick={() => void sync()} disabled={busy || !online}>
              <RefreshCw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden /> Sync now
            </Button>
          </div>
          <ul className="mt-2 space-y-1">
            {rows.map((r) => (
              <li key={r.clientUuid} className="flex items-start justify-between gap-2">
                <span>
                  {r.label}
                  {r.lastError ? <span className="block text-xs text-red-700">Not accepted: {r.lastError}</span> : null}
                </span>
                {r.lastError ? (
                  <Button size="sm" variant="ghost" aria-label="Discard this entry" onClick={() => void removeQueued([r.clientUuid])}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
