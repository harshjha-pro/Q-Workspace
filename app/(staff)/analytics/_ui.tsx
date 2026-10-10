import Link from "next/link";
import { PERIOD_OPTIONS } from "@/server/services/analytics/common";

/** Period picker as plain links, so every dashboard state is a shareable URL. */
export function PeriodPicker({ base, current, extra = "" }: { base: string; current: string; extra?: string }) {
  return (
    <nav aria-label="Period" className="flex flex-wrap gap-1.5 text-sm">
      {PERIOD_OPTIONS.map(([k, label]) => (
        <Link key={k} href={`${base}?period=${k}${extra}`} aria-current={k === current ? "page" : undefined} className={`rounded-md px-2.5 py-1 ${k === current ? "bg-brand text-white" : "border border-line bg-white"}`}>{label}</Link>
      ))}
    </nav>
  );
}

export const hoursText = (h: number) => `${h.toLocaleString("en-IN", { maximumFractionDigits: 1 })} hrs`;
export const pctText = (p: number | null) => (p === null ? "—" : `${p}%`);
