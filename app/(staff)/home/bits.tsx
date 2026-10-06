import Link from "next/link";
import { cn } from "@/lib/utils";

/** "Mon 5 Oct" for missing-day chips. */
export function shortDay(d: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
}

/** One snapshot number on Home. Counts and hours as logged — never against a target. */
export function SnapshotCard({ label, value, href, className }: { label: string; value: string | number; href: string; className?: string }) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface p-3 shadow-sm hover:border-brand/40">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn(typeof value === "number" ? "text-2xl" : "text-base", "font-semibold", className)}>{value}</p>
    </Link>
  );
}
