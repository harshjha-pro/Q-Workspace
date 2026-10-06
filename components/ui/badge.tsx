import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-gray-100 text-gray-700",
  brand: "bg-brand-50 text-brand",
  green: "bg-green-50 text-green-800",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-800",
  blue: "bg-blue-50 text-blue-800",
} as const;
export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
