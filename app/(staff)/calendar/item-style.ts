import type { CalendarItem } from "@/server/services/calendar/service";

const OPEN = ["UPCOMING", "IN_PROGRESS", "PENDING_FROM_CLIENT", "UNDER_REVIEW"];

/**
 * Same status colours as every other list (decisions D-24): the --color-st-* tokens. Class names are
 * spelled out in full so Tailwind picks them up.
 */
const TASK_STYLE: Record<string, string> = {
  UPCOMING: "border-st-upcoming",
  IN_PROGRESS: "border-st-progress",
  PENDING_FROM_CLIENT: "border-st-pending",
  UNDER_REVIEW: "border-st-review",
  FILED: "border-st-filed",
  FILED_LATE: "border-st-late",
  NOT_APPLICABLE: "border-st-na",
};

const KIND_STYLE: Record<CalendarItem["kind"], string> = {
  TASK: "border-st-upcoming",
  HEARING: "border-st-overdue",
  NOTICE: "border-st-risk",
  LEAVE: "border-st-na",
  HOLIDAY: "border-st-na",
};

export const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming", IN_PROGRESS: "In progress", PENDING_FROM_CLIENT: "Pending from client", UNDER_REVIEW: "Under review",
  FILED: "Filed", FILED_LATE: "Filed late", NOT_APPLICABLE: "Not applicable", OVERDUE: "Overdue",
};

/** Open tasks past their date show as overdue, like the task list. */
export function itemTone(item: CalendarItem, today: string): string {
  if (item.kind === "TASK") {
    if (item.status && OPEN.includes(item.status) && item.date < today) return "border-st-overdue";
    return TASK_STYLE[item.status ?? ""] ?? KIND_STYLE.TASK;
  }
  return KIND_STYLE[item.kind];
}

export function itemLabel(item: CalendarItem, today: string): string {
  if (item.kind !== "TASK") return item.kind.charAt(0) + item.kind.slice(1).toLowerCase();
  if (item.status && OPEN.includes(item.status) && item.date < today) return STATUS_LABEL.OVERDUE!;
  return STATUS_LABEL[item.status ?? ""] ?? "Task";
}

export const LEGEND: { label: string; className: string }[] = [
  { label: "Upcoming", className: "bg-st-upcoming" },
  { label: "In progress", className: "bg-st-progress" },
  { label: "Pending from client", className: "bg-st-pending" },
  { label: "Under review", className: "bg-st-review" },
  { label: "Filed", className: "bg-st-filed" },
  { label: "Filed late", className: "bg-st-late" },
  { label: "Overdue / hearing", className: "bg-st-overdue" },
  { label: "Notice reply", className: "bg-st-risk" },
  { label: "Leave", className: "bg-st-na" },
];
