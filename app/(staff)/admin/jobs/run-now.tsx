"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runJobAction } from "../actions";

export function RunNow({ code }: { code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await runJobAction(code); router.refresh(); })}>{pending ? "Running…" : "Run now"}</Button>;
}
