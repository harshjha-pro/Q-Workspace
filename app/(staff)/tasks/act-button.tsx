"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Button, type ButtonProps } from "@/components/ui/button";

/** One-click server action (no form fields). Shows the service's message if it refuses. */
export function ActButton({ action, children, variant = "secondary", size = "sm", ...rest }: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
} & Pick<ButtonProps, "variant" | "size" | "title" | "className">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button type="button" variant={variant} size={size} disabled={pending} {...rest}
        onClick={() => start(async () => {
          const r = await action();
          setError(r.ok ? null : r.error);
          if (r.ok) router.refresh();
        })}>
        {pending ? "Working…" : children}
      </Button>
      {error ? <span role="alert" className="mt-1 text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
