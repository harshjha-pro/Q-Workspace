import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/context";
import { can } from "@/server/permissions/guards";
import { weeklySummary, type Tone } from "@/server/services/analytics/weekly";
import { addDays, formatDate } from "@/server/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Weekly summary" };

/** Status colours carry a word too (never colour alone). */
const TONE: Record<Tone, { label: string; dot: string }> = {
  bad: { label: "Act", dot: "bg-status-critical" },
  warn: { label: "Watch", dot: "bg-status-warning" },
  info: { label: "Note", dot: "bg-viz-1" },
  good: { label: "Good", dot: "bg-status-good" },
};

export default async function WeeklySummaryPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requireStaff();
  if (!can(actor, "analytics.team")) redirect("/denied");
  const d = await weeklySummary(actor, { week: (await searchParams).week });
  const w = d.week;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Weekly summary"
        subtitle={`Week of ${formatDate(w.from)} to ${formatDate(w.to)} and the week ahead · ${d.scope === "firm" ? "whole firm" : "your team"}`}
        actions={
          <nav aria-label="Week" className="flex gap-1.5 text-sm">
            <Link className="rounded-md border border-line bg-white px-2.5 py-1" href={`/analytics/weekly?week=${addDays(w.from, -7)}`}>← Earlier</Link>
            <Link className="rounded-md border border-line bg-white px-2.5 py-1" href="/analytics/weekly">Last week</Link>
            <Link className="rounded-md border border-line bg-white px-2.5 py-1" href={`/analytics/weekly?week=${addDays(w.from, 7)}`}>Later →</Link>
          </nav>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-lg font-semibold text-ink">{d.headline}</p>
          <ul className="divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.key} className="flex items-start gap-3 py-2.5 text-sm">
                <span className="mt-0.5 inline-flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted"><span className={cn("inline-block h-2.5 w-2.5 rounded-full", TONE[i.tone].dot)} />{TONE[i.tone].label}</span>
                <span className="flex-1 text-ink">{i.text}</span>
                {i.link ? <Link href={i.link} className="shrink-0 text-brand hover:underline">Open</Link> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="text-xs text-muted">Each line is a fixed rule over the firm&apos;s own records. Hours are the team&apos;s total effort, never per person. Sent as a notice every Monday at 07:00.</p>
    </div>
  );
}
