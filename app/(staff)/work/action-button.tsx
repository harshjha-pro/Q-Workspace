"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Button, type ButtonProps } from "@/components/ui/button";

/** One-click server action (delete, copy week, cancel…) with an optional confirm and an inline result line. */
export function ActionButton({
  action, confirm, children, variant = "secondary", size = "sm", className, ...rest
}: {
  action: () => Promise<ActionResult>;
  confirm?: string;
  children: React.ReactNode;
} & Pick<ButtonProps, "variant" | "size" | "className" | "aria-label" | "title">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button" variant={variant} size={size} className={className} disabled={pending} {...rest}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          });
        }}
      >
        {pending ? "Working…" : children}
      </Button>
      {msg ? <span role="status" className={msg.ok ? "text-xs text-green-800" : "text-xs text-red-700"}>{msg.text}</span> : null}
    </span>
  );
}
