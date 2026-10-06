import { Badge } from "@/components/ui/badge";
import { TASK_STATUS_TONE } from "@/components/status";
import { cn } from "@/lib/utils";
import { diffDays, formatDate } from "@/server/lib/dates";

/** Practitioner wording for task statuses; colours come from the single map in components/status. */
export const TASK_STATUS_LABELS: Record<string, string> = {
  UPCOMING: "Upcoming", IN_PROGRESS: "In progress", PENDING_FROM_CLIENT: "Pending from client", UNDER_REVIEW: "Under review",
  FILED: "Filed", FILED_LATE: "Filed late", NOT_APPLICABLE: "Not applicable",
};

export const OPEN_STATUSES = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

export function TaskStatusBadge({ status }: { status: string }) {
  return <Badge tone={TASK_STATUS_TONE[status] ?? "neutral"}>{TASK_STATUS_LABELS[status] ?? status}</Badge>;
}

/**
 * Due date with its qualifiers: overdue (open and past due), provisional (rule not final),
 * holiday-shifted (moved by the weekend/holiday policy).
 */
export function DueDate({ date, status, today, provisional, holidayShifted, className }: {
  date: string | null; status: string; today: string; provisional?: boolean; holidayShifted?: boolean; className?: string;
}) {
  if (!date) return <span className={cn("text-muted", className)}>No due date</span>;
  const open = OPEN_STATUSES.includes(status);
  const late = open && date < today;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <span className={cn(late && "font-medium text-st-overdue")}>{formatDate(date)}</span>
      {late ? <span className="text-xs text-st-overdue">({diffDays(date, today)}d overdue)</span> : null}
      {provisional ? <span className="rounded border border-st-risk/40 px-1 text-[11px] text-st-risk" title="Due date is provisional until the rule is confirmed">provisional</span> : null}
      {holidayShifted ? <span className="rounded border border-line px-1 text-[11px] text-muted" title="Moved for a weekend or holiday">holiday-shifted</span> : null}
    </span>
  );
}

/** "Pending from client · 6 days" — the client delay, shown apart from internal delay. */
export function PendingSince({ since, today }: { since: string | null; today: string }) {
  if (!since) return null;
  const days = Math.max(0, diffDays(since, today));
  return <span className="text-xs text-st-pending">Client waiting {days} day{days === 1 ? "" : "s"}</span>;
}
