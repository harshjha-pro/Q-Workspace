"use client";
import { useEffect, useState, useTransition } from "react";
import { Eye, Copy, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealAction } from "./actions";

const SHOW_SECONDS = 30;

/**
 * Shows one decrypted field for 30 seconds, then forgets it. The value lives only in this
 * component's state; every press is a fresh server call, so every view is logged.
 */
export function RevealButton({ credentialId, field, label }: { credentialId: string; field: "USERNAME" | "PASSWORD" | "EXTRA"; label: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (value === null) return;
    const tick = setInterval(() => setLeft((s) => s - 1), 1000);
    const hide = setTimeout(() => { setValue(null); setCopied(false); }, SHOW_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(hide); };
  }, [value]);

  const reveal = () => start(async () => {
    setError(null);
    const r = await revealAction(credentialId, field);
    if (r.ok) { setValue(r.data?.value ?? ""); setLeft(SHOW_SECONDS); } else setError(r.error);
  });

  const copy = async () => {
    if (value === null) return;
    try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setError("Copy failed. Select the text instead."); }
  };

  if (value !== null) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <code className="max-w-56 break-all rounded bg-gray-100 px-1.5 py-0.5 text-xs">{value || "(empty)"}</code>
        <Button size="sm" variant="ghost" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setValue(null); setCopied(false); }} aria-label={`Hide ${label.toLowerCase()}`}><EyeOff className="h-3.5 w-3.5" />{Math.max(left, 0)}s</Button>
      </div>
    );
  }
  return (
    <div>
      <Button size="sm" variant="secondary" onClick={reveal} disabled={pending}><Eye className="h-3.5 w-3.5" />{pending ? "…" : `Show ${label.toLowerCase()}`}</Button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
